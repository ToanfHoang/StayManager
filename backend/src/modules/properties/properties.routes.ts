import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, sortParam, zId, zMoney, zOptId, zOptStr, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertProperty, ownerForCreate, propertyScope } from '../../lib/scope';
import { audit } from '../../lib/audit';

export const propertiesRouter = Router();
export const servicesRouter = Router();

const propertySchema = z.object({
  name: zStr(150),
  address: zStr(255),
  description: zOptStr(5000),
  floors: z.coerce.number().int().min(1).max(100).default(1),
  contactName: zOptStr(120),
  contactPhone: zOptStr(20),
  electricityPrice: zMoney,
  waterPrice: zMoney,
  waterMode: z.enum(['METER', 'SPLIT_PER_PERSON']).default('METER'),
  ownerId: zOptId,
});

const serviceSchema = z.object({
  name: zStr(100),
  type: z.enum(['INTERNET', 'PARKING', 'CLEANING', 'OTHER']),
  unit: z.enum(['PER_ROOM', 'PER_PERSON']).default('PER_ROOM'),
  price: zMoney,
  isActive: z.boolean().default(true),
});

async function roomStats(propertyIds: number[]) {
  const groups = await prisma.room.groupBy({ by: ['propertyId', 'status'], where: { propertyId: { in: propertyIds } }, _count: { _all: true } });
  const map = new Map<number, { total: number; occupied: number; available: number; maintenance: number }>();
  for (const id of propertyIds) map.set(id, { total: 0, occupied: 0, available: 0, maintenance: 0 });
  for (const g of groups) {
    const s = map.get(g.propertyId)!;
    s.total += g._count._all;
    if (g.status === 'OCCUPIED') s.occupied += g._count._all;
    if (g.status === 'AVAILABLE') s.available += g._count._all;
    if (g.status === 'MAINTENANCE') s.maintenance += g._count._all;
  }
  return map;
}

propertiesRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging({ pageSize: 100, ...req.query });
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where: Prisma.PropertyWhereInput = {
      ...propertyScope(u),
      ...(q ? { OR: [{ name: { contains: q } }, { address: { contains: q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.property.findMany({ where, skip, take, orderBy: sortParam(req.query, ['name', 'createdAt'] as const, 'createdAt'), include: { owner: { select: { id: true, fullName: true } } } }),
      prisma.property.count({ where }),
    ]);
    const stats = await roomStats(items.map((p) => p.id));
    return ok(res, items.map((p) => ({ ...p, stats: stats.get(p.id) })), pageMeta(page, pageSize, total));
  }),
);

propertiesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const p = await assertProperty(u, zId.parse(req.params.id));
    const [services, stats, owner] = await Promise.all([
      prisma.service.findMany({ where: { propertyId: p.id }, orderBy: { id: 'asc' } }),
      roomStats([p.id]),
      prisma.user.findUnique({ where: { id: p.ownerId }, select: { id: true, fullName: true } }),
    ]);
    return ok(res, { ...p, owner, services, stats: stats.get(p.id) });
  }),
);

propertiesRouter.post(
  '/',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const { ownerId, ...body } = propertySchema.parse(req.body);
    const owner = await ownerForCreate(u, ownerId);
    const p = await prisma.property.create({ data: { ...body, ownerId: owner } });
    await audit(u, 'CREATE', 'property', p.id, null, p, prisma, owner);
    return created(res, p);
  }),
);

propertiesRouter.put(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertProperty(u, zId.parse(req.params.id));
    const { ownerId: _ignored, ...body } = propertySchema.parse(req.body);
    const p = await prisma.property.update({ where: { id: old.id }, data: body });
    await audit(u, 'UPDATE', 'property', p.id, old, p, prisma, p.ownerId);
    return ok(res, p);
  }),
);

propertiesRouter.delete(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const p = await assertProperty(u, zId.parse(req.params.id));
    const [rooms, expenses] = await Promise.all([prisma.room.count({ where: { propertyId: p.id } }), prisma.expense.count({ where: { propertyId: p.id } })]);
    if (rooms > 0) throw conflict(`Khu trọ còn ${rooms} phòng. Hãy xóa hoặc chuyển các phòng trước khi xóa khu trọ.`);
    if (expenses > 0) throw conflict(`Khu trọ có ${expenses} khoản thu chi đã ghi nhận nên không thể xóa (giữ lịch sử tài chính).`);
    await prisma.property.delete({ where: { id: p.id } });
    await audit(u, 'DELETE', 'property', p.id, p, null, prisma, p.ownerId);
    return ok(res, { deleted: true });
  }),
);

/* ---------- Dịch vụ theo khu trọ ---------- */
propertiesRouter.get(
  '/:id/services',
  ah(async (req, res) => {
    const p = await assertProperty(me(req), zId.parse(req.params.id));
    return ok(res, await prisma.service.findMany({ where: { propertyId: p.id }, orderBy: { id: 'asc' } }));
  }),
);

propertiesRouter.post(
  '/:id/services',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const p = await assertProperty(u, zId.parse(req.params.id));
    const s = await prisma.service.create({ data: { ...serviceSchema.parse(req.body), propertyId: p.id } });
    await audit(u, 'CREATE', 'service', s.id, null, s, prisma, p.ownerId);
    return created(res, s);
  }),
);

async function assertService(req: Parameters<typeof me>[0]) {
  const s = await prisma.service.findFirst({ where: { id: zId.parse(req.params.id), property: propertyScope(me(req)) }, include: { property: true } });
  if (!s) throw notFound('Không tìm thấy dịch vụ');
  return s;
}

servicesRouter.put(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const old = await assertService(req);
    const s = await prisma.service.update({ where: { id: old.id }, data: serviceSchema.parse(req.body) });
    await audit(me(req), 'UPDATE', 'service', s.id, old, s, prisma, old.property.ownerId);
    return ok(res, s);
  }),
);

servicesRouter.delete(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const old = await assertService(req);
    await prisma.service.delete({ where: { id: old.id } });
    await audit(me(req), 'DELETE', 'service', old.id, old, null, prisma, old.property.ownerId);
    return ok(res, { deleted: true });
  }),
);
