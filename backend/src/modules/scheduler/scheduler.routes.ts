import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { ah, ok } from '../../lib/http';
import { pageMeta, paging } from '../../lib/validation';
import { authorize } from '../../middleware/auth';
import { runNotificationJobs } from './scheduler';

/** Quản trị scheduler – chỉ ADMIN */
export const schedulerRouter = Router();
schedulerRouter.use(authorize('ADMIN'));

schedulerRouter.get(
  '/runs',
  ah(async (req, res) => {
    const { page, pageSize, skip, take } = paging(req.query);
    const [items, total] = await Promise.all([prisma.jobRun.findMany({ skip, take, orderBy: { startedAt: 'desc' } }), prisma.jobRun.count()]);
    return ok(res, items, pageMeta(page, pageSize, total));
  }),
);

/** Chạy ngay một lượt (idempotent – không gửi trùng thông báo đã gửi) */
schedulerRouter.post(
  '/run',
  ah(async (_req, res) => ok(res, await runNotificationJobs('manual'))),
);
