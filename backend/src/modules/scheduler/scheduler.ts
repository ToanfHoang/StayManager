/**
 * Scheduler thông báo tự động – chạy độc lập ở backend (không phụ thuộc frontend).
 *
 * An toàn & idempotent:
 *  - Mỗi lượt chạy giữ một "khung giờ" trong bảng job_runs (UNIQUE job_name + run_key):
 *    nhiều instance backend cùng chạy thì chỉ 1 instance xử lý khung giờ đó.
 *  - Mỗi thông báo có dedupe_key UNIQUE trong notification_logs (vd UNPAID_SUMMARY:{chủ trọ}:{ngày}:{user}):
 *    chạy lại sau khi khởi động lại / lỗi giữa chừng không bao giờ gửi trùng.
 *  - Khi backend khởi động, chạy bù ngay khung giờ hiện tại (nếu chưa có instance nào chạy).
 */
import cron, { type ScheduledTask } from 'node-cron';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { addDays, TZ, today, todayStr } from '../../lib/dates';
import { OUTSTANDING } from '../invoices/invoices.service';
import { autoImportMeterReadings } from '../hunonic/hunonic.service';
import { managersOfOwner, notifyUsers, vnDate, vnd } from '../notifications/notifications.service';

const JOB = 'notifications';
const DAY = 86400000;
const log = (...a: unknown[]) => console.log(`[scheduler ${new Date().toLocaleString('vi-VN', { timeZone: TZ })}]`, ...a);

/** Khung giờ hiện tại theo giờ Việt Nam, vd 2026-11-17T08 */
export function currentSlot() {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  return `${todayStr()}T${hour}`;
}

const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

/* ---------------- Các bước xử lý ---------------- */

/** 1.3 – Cập nhật trạng thái OVERDUE (và trả về trạng thái cũ nếu hạn được gia hạn) */
async function syncOverdueStatus(t: Date) {
  const marked = await prisma.invoice.updateMany({ where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: t } }, data: { status: 'OVERDUE' } });
  const backUnpaid = await prisma.invoice.updateMany({ where: { status: 'OVERDUE', dueDate: { gte: t }, paidAmount: 0 }, data: { status: 'UNPAID' } });
  const backPartial = await prisma.invoice.updateMany({ where: { status: 'OVERDUE', dueDate: { gte: t }, paidAmount: { gt: 0 } }, data: { status: 'PARTIALLY_PAID' } });
  return { markedOverdue: marked.count, restored: backUnpaid.count + backPartial.count };
}

/** Tổng hợp hóa đơn chưa thu cho chủ trọ – mỗi ngày 1 lần */
async function landlordUnpaidSummary(t: Date) {
  const invoices = await prisma.invoice.findMany({ where: { status: { in: OUTSTANDING } }, include: { room: { select: { property: { select: { ownerId: true } } } } } });
  const byOwner = new Map<number, { count: number; amount: number; overdue: number; dueSoon: number }>();
  const soon = addDays(t, 3);
  for (const inv of invoices) {
    const s = byOwner.get(inv.room.property.ownerId) ?? { count: 0, amount: 0, overdue: 0, dueSoon: 0 };
    s.count++;
    s.amount += Number(inv.totalAmount) - Number(inv.paidAmount);
    if (inv.dueDate < t) s.overdue++;
    else if (inv.dueDate <= soon) s.dueSoon++;
    byOwner.set(inv.room.property.ownerId, s);
  }
  let sent = 0;
  const date = todayStr();
  for (const [ownerId, s] of byOwner) {
    sent += await notifyUsers(
      await managersOfOwner(ownerId),
      {
        type: 'UNPAID_SUMMARY',
        title: `Tổng hợp công nợ ngày ${vnDate(t)}`,
        message: `Hiện có ${s.count} hóa đơn chưa thu đủ, tổng ${vnd(s.amount)}${s.overdue ? `; ${s.overdue} hóa đơn đã quá hạn` : ''}${s.dueSoon ? `; ${s.dueSoon} hóa đơn đến hạn trong 3 ngày tới` : ''}. Bạn có thể nhắc người thuê qua Zalo.`,
        link: '/gui-zalo',
        actionLabel: 'Nhắc qua Zalo',
        entityType: 'invoice_summary',
      },
      { dedupeKey: (uid) => `UNPAID_SUMMARY:${ownerId}:${date}:${uid}` },
    );
  }
  return { unpaidSummaries: sent };
}

/** Nhắc chủ trọ hợp đồng sắp hết hạn (mốc 30, 7, 1 ngày) hoặc đã hết hạn mà chưa xử lý */
async function contractExpiryReminders(t: Date) {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE', endDate: { lte: addDays(t, 30) } },
    include: { room: { include: { property: true } }, tenants: { where: { isPrimary: true }, include: { tenant: true } } },
  });
  let sent = 0;
  for (const c of contracts) {
    const days = daysBetween(c.endDate, t);
    const milestone = days < 0 ? 'EXPIRED' : days <= 1 ? 'D1' : days <= 7 ? 'D7' : 'D30';
    sent += await notifyUsers(
      await managersOfOwner(c.room.property.ownerId),
      {
        type: 'CONTRACT_EXPIRING',
        title: days < 0 ? `Hợp đồng ${c.contractNumber} đã hết hạn` : `Hợp đồng ${c.contractNumber} còn ${days} ngày hết hạn`,
        message: `Phòng ${c.room.roomNumber} (${c.room.property.name}) – ${c.tenants[0]?.tenant.fullName ?? ''}: hợp đồng ${days < 0 ? `đã hết hạn từ ${vnDate(c.endDate)}` : `hết hạn ngày ${vnDate(c.endDate)}`}. Hãy gia hạn hoặc kết thúc hợp đồng.`,
        link: `/hop-dong/${c.id}`,
        actionLabel: 'Xem hợp đồng',
        entityType: 'contract',
        entityId: c.id,
      },
      { dedupeKey: (uid) => `CONTRACT_EXP:${c.id}:${milestone}:${uid}` },
    );
  }
  return { contractReminders: sent };
}

/* ---------------- Điều phối ---------------- */

export async function runNotificationJobs(trigger: 'cron' | 'startup' | 'manual') {
  const runKey = trigger === 'manual' ? `manual-${Date.now()}` : currentSlot();
  let run;
  if (await prisma.jobRun.findUnique({ where: { jobName_runKey: { jobName: JOB, runKey } }, select: { id: true } })) {
    log(`Bỏ qua (${trigger}): khung ${runKey} đã được xử lý`);
    return { skipped: true, runKey };
  }
  try {
    run = await prisma.jobRun.create({ data: { jobName: JOB, runKey, status: 'RUNNING' } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      log(`Bỏ qua (${trigger}): khung ${runKey} đã được xử lý bởi lượt chạy/instance khác`);
      return { skipped: true, runKey };
    }
    throw e;
  }
  const started = Date.now();
  const t = today();
  const stats: Record<string, number> = {};
  try {
    Object.assign(stats, await syncOverdueStatus(t));
    Object.assign(stats, await landlordUnpaidSummary(t));
    Object.assign(stats, await contractExpiryReminders(t));
    Object.assign(stats, await autoImportMeterReadings());
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: 'SUCCESS', stats, finishedAt: new Date() } });
    log(`Hoàn tất (${trigger}, ${runKey}) trong ${Date.now() - started}ms`, stats);
    return { skipped: false, runKey, stats };
  } catch (e) {
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: 'FAILED', stats, error: String((e as Error).stack ?? e).slice(0, 5000), finishedAt: new Date() } }).catch(() => undefined);
    log(`LỖI (${trigger}, ${runKey}):`, e);
    throw e;
  }
}

let task: ScheduledTask | null = null;

export function startScheduler() {
  if (!env.SCHEDULER_ENABLED) {
    log('Đã tắt (SCHEDULER_ENABLED=false)');
    return;
  }
  if (!cron.validate(env.SCHEDULER_CRON)) {
    log(`Biểu thức SCHEDULER_CRON không hợp lệ: ${env.SCHEDULER_CRON}`);
    return;
  }
  task = cron.schedule(env.SCHEDULER_CRON, () => void runNotificationJobs('cron').catch(() => undefined), { timezone: TZ });
  log(`Đã lên lịch "${env.SCHEDULER_CRON}" (${TZ})`);
  // Chạy bù khung giờ hiện tại sau khi khởi động (an toàn nhờ job_runs + dedupe)
  setTimeout(() => void runNotificationJobs('startup').catch(() => undefined), 5000);
}

export function stopScheduler() {
  task?.stop();
}
