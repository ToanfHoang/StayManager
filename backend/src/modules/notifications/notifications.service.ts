import type { NotificationType } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { today } from '../../lib/dates';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: number | null;
}

/* ---------- Xác định người nhận ---------- */

/** Chủ trọ + nhân viên đang hoạt động của chủ trọ */
export async function managersOfOwner(ownerId: number, db: Db = prisma) {
  const users = await db.user.findMany({ where: { isActive: true, OR: [{ id: ownerId, role: 'LANDLORD' }, { landlordId: ownerId, role: 'STAFF' }] }, select: { id: true } });
  return users.map((u) => u.id);
}

/* ---------- Gửi thông báo ---------- */

/**
 * Gửi thông báo cho danh sách người dùng.
 * Nếu có dedupeKey: ghi notification_logs (UNIQUE dedupe_key) cùng thông báo trong 1 transaction,
 * trùng khóa ⇒ bỏ qua ⇒ idempotent, an toàn khi scheduler chạy lại / nhiều instance.
 * Trả về số thông báo thực sự được tạo.
 */
export async function notifyUsers(
  userIds: number[],
  input: NotificationInput,
  opts: { dedupeKey?: (userId: number) => string; invoiceId?: number | null; scheduledFor?: Date } = {},
) {
  let created = 0;
  for (const userId of [...new Set(userIds)]) {
    const data = {
      userId,
      type: input.type,
      title: input.title.slice(0, 200),
      message: input.message,
      link: input.link ?? null,
      actionLabel: input.actionLabel ?? null,
      relatedEntityType: input.entityType ?? null,
      relatedEntityId: input.entityId ?? null,
    };
    if (!opts.dedupeKey) {
      await prisma.notification.create({ data });
      created++;
      continue;
    }
    const dedupeKey = opts.dedupeKey(userId).slice(0, 191);
    // Đường nhanh: đã gửi thì bỏ qua (khóa UNIQUE bên dưới vẫn là chốt chặn khi chạy đồng thời)
    if (await prisma.notificationLog.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const log = await tx.notificationLog.create({
          data: { dedupeKey, userId, invoiceId: opts.invoiceId ?? null, notificationType: input.type, scheduledFor: opts.scheduledFor ?? today() },
        });
        const n = await tx.notification.create({ data });
        await tx.notificationLog.update({ where: { id: log.id }, data: { notificationId: n.id } });
      });
      created++;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // đã gửi trước đó
    }
  }
  return created;
}

/** Gửi thông báo nhưng không làm hỏng nghiệp vụ chính nếu lỗi (chỉ ghi log) */
export async function notifySafely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error('[notifications] Gửi thông báo thất bại:', e);
  }
}

/* ---------- Định dạng ---------- */
export const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
export const vnDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
export const vnPeriod = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;
