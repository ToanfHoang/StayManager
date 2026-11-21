import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zDate, zId, zOptId, zOptMoney, zOptStr, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertRoom, ownerIdOf, roomScope, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { today } from '../../lib/dates';

export const maintenanceRouter = Router();

const include = {
  room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } },
  assignedTo: { select: { id: true, fullName: true } },
  expense: { select: { id: true, amount: true } },
} satisfies Prisma.MaintenanceRequestInclude;

const schema = z.object({
  roomId: zId,
  title: zStr(150),
  description: zOptStr(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  requestDate: zDate,
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  estimatedCost: zOptMoney,
  actualCost: zOptMoney,
  assignedToId: z.preprocess((v) => (v === '' || v === null ? undefined : v), zOptId),
  reportedBy: zOptStr(120),
  /** Khi hoàn thành: tự tạo khoản chi "Sửa chữa" với chi phí thực tế */
  createExpense: z.boolean().optional(),
});

async function checkAssignee(u: AuthUser, assignedToId: number | undefined, ownerId: number) {
  if (!assignedToId) return null;
  const user = await prisma.user.findFirst({ where: { id: assignedToId, isActive: true, OR: [{ id: ownerId }, { landlordId: ownerId }] } });
  if (!user) throw badRequest('Người được giao không hợp lệ');
  void u;
  return user.id;
}

maintenanceRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.MaintenanceRequestWhereInput = { room: roomScope(u) };
    if (q.status && ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(q.status)) where.status = q.status as Prisma.MaintenanceRequestWhereInput['status'];
    if (q.priority && ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(q.priority)) where.priority = q.priority as Prisma.MaintenanceRequestWhereInput['priority'];
    if (q.propertyId) where.room = { ...roomScope(u), propertyId: zId.parse(q.propertyId) };
    if (q.roomId) where.roomId = zId.parse(q.roomId);
    if (q.assignedToId) where.assignedToId = zId.parse(q.assignedToId);
    if (q.q?.trim()) where.OR = [{ title: { contains: q.q.trim() } }, { room: { roomNumber: { contains: q.q.trim() } } }];
    const [items, total, counts] = await Promise.all([
      prisma.maintenanceRequest.findMany({ where, skip, take, orderBy: [{ requestDate: 'desc' }, { id: 'desc' }], include }),
      prisma.maintenanceRequest.count({ where }),
      prisma.maintenanceRequest.groupBy({ by: ['status'], where: { room: roomScope(u) }, _count: { _all: true } }),
    ]);
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
    return ok(res, items, { ...pageMeta(page, pageSize, total), summary: byStatus });
  }),
);

maintenanceRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const m = await prisma.maintenanceRequest.findFirst({ where: { id: zId.parse(req.params.id), room: roomScope(u) }, include });
    if (!m) throw notFound('Không tìm thấy yêu cầu sửa chữa');
    return ok(res, m);
  }),
);

async function maybeCreateExpense(tx: Prisma.TransactionClient, u: AuthUser, m: { id: number; title: string; actualCost: Prisma.Decimal | null; completedAt: Date | null }, propertyId: number) {
  const existing = await tx.expense.findUnique({ where: { maintenanceRequestId: m.id } });
  if (existing) return existing;
  if (!m.actualCost || Number(m.actualCost) <= 0) throw badRequest('Vui lòng nhập chi phí thực tế để tạo khoản chi');
  let cat = await tx.expenseCategory.findFirst({ where: { type: 'EXPENSE', name: 'Sửa chữa', ownerId: null } });
  if (!cat) cat = await tx.expenseCategory.create({ data: { type: 'EXPENSE', name: 'Sửa chữa' } });
  return tx.expense.create({
    data: { propertyId, categoryId: cat.id, type: 'EXPENSE', amount: m.actualCost, entryDate: m.completedAt ?? today(), description: `Sửa chữa: ${m.title}`, maintenanceRequestId: m.id, createdById: u.id },
  });
}

maintenanceRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { createExpense, ...body } = schema.parse(req.body);
    const room = await assertRoom(u, body.roomId);
    const assignedToId = await checkAssignee(u, body.assignedToId, room.property.ownerId);
    const m = await prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceRequest.create({ data: { ...body, assignedToId, completedAt: body.status === 'COMPLETED' ? today() : null } });
      if (createExpense && r.status === 'COMPLETED') await maybeCreateExpense(tx, u, r, room.propertyId);
      await audit(u, 'CREATE', 'maintenance', r.id, null, r, tx, room.property.ownerId);
      return r;
    });
    return created(res, m);
  }),
);

maintenanceRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const old = await prisma.maintenanceRequest.findFirst({ where: { id: zId.parse(req.params.id), room: roomScope(u) }, include: { room: { include: { property: true } } } });
    if (!old) throw notFound('Không tìm thấy yêu cầu sửa chữa');
    const { createExpense, ...body } = schema.parse(req.body);
    if (body.roomId !== old.roomId) await assertRoom(u, body.roomId);
    const assignedToId = await checkAssignee(u, body.assignedToId, old.room.property.ownerId);
    const completedAt = body.status === 'COMPLETED' ? old.completedAt ?? today() : null;
    const m = await prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceRequest.update({ where: { id: old.id }, data: { ...body, assignedToId: assignedToId ?? null, completedAt } });
      if (createExpense && r.status === 'COMPLETED') await maybeCreateExpense(tx, u, r, old.room.propertyId);
      await audit(u, 'UPDATE', 'maintenance', r.id, old, r, tx, old.room.property.ownerId);
      return r;
    });
    return ok(res, m);
  }),
);

maintenanceRouter.delete(
  '/:id',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const old = await prisma.maintenanceRequest.findFirst({ where: { id: zId.parse(req.params.id), room: roomScope(u) }, include: { expense: true, room: { include: { property: true } } } });
    if (!old) throw notFound('Không tìm thấy yêu cầu sửa chữa');
    if (old.expense) throw conflict('Yêu cầu đã phát sinh khoản chi nên không thể xóa. Hãy chuyển sang "Đã hủy" nếu cần.');
    await prisma.maintenanceRequest.delete({ where: { id: old.id } });
    await audit(u, 'DELETE', 'maintenance', old.id, old, null, prisma, ownerIdOf(u) ?? old.room.property.ownerId);
    return ok(res, { deleted: true });
  }),
);
