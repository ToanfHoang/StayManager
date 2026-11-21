import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, ok } from '../../lib/http';
import { pageMeta, paging, zId } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { ownerIdOf } from '../../lib/scope';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const owner = ownerIdOf(u);
    const where: Prisma.AuditLogWhereInput = {
      ...(owner !== null ? { ownerId: owner } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: zId.parse(q.entityId) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    return ok(res, items, pageMeta(page, pageSize, total));
  }),
);
