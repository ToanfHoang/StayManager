import { Router } from 'express';
import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zId } from '../../lib/validation';
import { me } from '../../middleware/auth';

export const notificationsRouter = Router();

const TYPES: NotificationType[] = [
  'INVOICE_CREATED', 'PAYMENT_REMINDER', 'INVOICE_OVERDUE', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'PAYMENT_SUBMITTED',
  'MAINTENANCE_REQUEST', 'MAINTENANCE_UPDATE', 'UNPAID_SUMMARY', 'CONTRACT_EXPIRING', 'ANNOUNCEMENT', 'BANK_TX_UNMATCHED', 'PAYMENT_AUTO_MATCHED',
];

/** Mỗi người dùng chỉ thấy thông báo của chính mình */
notificationsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const types = String(req.query.type ?? '').split(',').filter((t): t is NotificationType => TYPES.includes(t as NotificationType));
    const where: Prisma.NotificationWhereInput = {
      userId: u.id,
      ...(types.length ? { type: { in: types } } : {}),
      ...(req.query.unread === 'true' ? { isRead: false } : {}),
    };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: u.id, isRead: false } }),
    ]);
    return ok(res, items, { ...pageMeta(page, pageSize, total), summary: { unread } });
  }),
);

notificationsRouter.get(
  '/unread-count',
  ah(async (req, res) => ok(res, { count: await prisma.notification.count({ where: { userId: me(req).id, isRead: false } }) })),
);

notificationsRouter.post(
  '/read-all',
  ah(async (req, res) => {
    const r = await prisma.notification.updateMany({ where: { userId: me(req).id, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return ok(res, { updated: r.count });
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah(async (req, res) => {
    const r = await prisma.notification.updateMany({ where: { id: zId.parse(req.params.id), userId: me(req).id }, data: { isRead: true, readAt: new Date() } });
    if (!r.count) throw notFound('Không tìm thấy thông báo');
    return ok(res, { read: true });
  }),
);
