import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { lockRow, prisma, type Tx } from '../../lib/prisma';
import { ah, badRequest, conflict, created, ok } from '../../lib/http';
import { pageMeta, paging, sortParam, zDate, zId, zMoney, zOptStr } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { addDays, dateStr, today } from '../../lib/dates';
import { assertContract, assertRoom, assertTenant, contractScope, maskIdNumber, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { OUTSTANDING } from '../invoices/invoices.service';

export const contractsRouter = Router();

const lockRoom = (tx: Tx, roomId: number) => lockRow(tx, "rooms", roomId);
const lockContract = (tx: Tx, id: number) => lockRow(tx, "contracts", id);

const detailInclude = {
  room: { select: { id: true, roomNumber: true, floor: true, area: true, maxOccupancy: true, property: { select: { id: true, name: true, address: true, contactName: true, contactPhone: true, ownerId: true } } } },
  tenants: { include: { tenant: true }, orderBy: [{ isPrimary: 'desc' as const }, { joinedAt: 'asc' as const }] },
} satisfies Prisma.ContractInclude;

type ContractWithTenants = Prisma.ContractGetPayload<{ include: typeof detailInclude }>;
const present = (u: AuthUser, c: ContractWithTenants) => ({
  ...c,
  tenants: c.tenants.map((ct) => ({ ...ct, tenant: { ...ct.tenant, idNumber: maskIdNumber(u, ct.tenant.idNumber) } })),
});

contractsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.ContractWhereInput = { ...contractScope(u) };
    if (q.status && ['ACTIVE', 'EXPIRED', 'TERMINATED'].includes(q.status)) where.status = q.status as Prisma.ContractWhereInput['status'];
    if (q.roomId) where.roomId = zId.parse(q.roomId);
    if (q.propertyId) where.room = { ...(where.room as object), propertyId: zId.parse(q.propertyId) };
    if (q.expiringDays) {
      const days = z.coerce.number().int().min(0).max(365).parse(q.expiringDays);
      where.status = 'ACTIVE';
      where.endDate = { lte: addDays(today(), days) };
    }
    if (q.q?.trim()) {
      const s = q.q.trim();
      where.OR = [{ contractNumber: { contains: s } }, { tenants: { some: { tenant: { fullName: { contains: s } } } } }, { room: { roomNumber: { contains: s } } }];
    }
    const [items, total] = await Promise.all([
      prisma.contract.findMany({ where, skip, take, orderBy: sortParam(q, ['startDate', 'endDate', 'createdAt'] as const, 'createdAt'), include: detailInclude }),
      prisma.contract.count({ where }),
    ]);
    return ok(res, items.map((c) => present(u, c)), pageMeta(page, pageSize, total));
  }),
);

contractsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertContract(u, zId.parse(req.params.id));
    const c = await prisma.contract.findUniqueOrThrow({ where: { id: base.id }, include: detailInclude });
    const invoices = await prisma.invoice.findMany({
      where: { contractId: c.id },
      orderBy: { period: 'desc' },
      select: { id: true, invoiceNumber: true, period: true, totalAmount: true, paidAmount: true, status: true, dueDate: true },
    });
    return ok(res, { ...present(u, c), invoices });
  }),
);

const createSchema = z
  .object({
    roomId: zId,
    tenantIds: z.array(zId).min(1, 'Hợp đồng phải có ít nhất 1 người thuê').max(50),
    primaryTenantId: zId.optional(),
    contractNumber: z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v), z.string().max(30).regex(/^[A-Za-z0-9._/-]+$/, 'Số hợp đồng chỉ gồm chữ, số và . _ / -').optional()),
    startDate: zDate,
    endDate: zDate,
    rentPrice: zMoney,
    deposit: zMoney.default(0),
    paymentDueDay: z.coerce.number().int().min(1).max(28).default(5),
    terms: zOptStr(20000),
    notes: zOptStr(5000),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] });

contractsRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = createSchema.parse(req.body);
    const tenantIds = [...new Set(body.tenantIds)];
    const room = await assertRoom(u, body.roomId);
    for (const id of tenantIds) {
      const t = await assertTenant(u, id);
      if (t.ownerId !== room.property.ownerId) throw badRequest(`Người thuê "${t.fullName}" không thuộc chủ trọ của phòng này`);
    }
    if (tenantIds.length > room.maxOccupancy) throw badRequest(`Phòng chỉ cho tối đa ${room.maxOccupancy} người`);
    const primary = body.primaryTenantId && tenantIds.includes(body.primaryTenantId) ? body.primaryTenantId : tenantIds[0];

    const contract = await prisma.$transaction(async (tx) => {
      await lockRoom(tx, room.id);
      const fresh = await tx.room.findUniqueOrThrow({ where: { id: room.id } });
      const active = await tx.contract.findFirst({ where: { roomId: room.id, status: 'ACTIVE' } });
      if (active) throw conflict(`Phòng ${fresh.roomNumber} đang có hợp đồng hiệu lực (${active.contractNumber})`);
      if (fresh.status === 'MAINTENANCE') throw conflict('Phòng đang bảo trì, không thể cho thuê');
      // Một người thuê không thể ở 2 hợp đồng hiệu lực cùng lúc
      const busy = await tx.contractTenant.findFirst({
        where: { tenantId: { in: tenantIds }, leftAt: null, contract: { status: 'ACTIVE' } },
        include: { tenant: true, contract: { include: { room: true } } },
      });
      if (busy) throw conflict(`"${busy.tenant.fullName}" đang thuê phòng ${busy.contract.room.roomNumber} theo hợp đồng ${busy.contract.contractNumber}`);
      if (body.contractNumber && (await tx.contract.findUnique({ where: { contractNumber: body.contractNumber } }))) throw conflict('Số hợp đồng đã tồn tại');

      const c = await tx.contract.create({
        data: {
          contractNumber: body.contractNumber ?? `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          roomId: room.id,
          startDate: body.startDate,
          endDate: body.endDate,
          rentPrice: body.rentPrice,
          deposit: body.deposit,
          paymentDueDay: body.paymentDueDay,
          terms: body.terms,
          notes: body.notes,
          tenants: { create: tenantIds.map((tenantId) => ({ tenantId, isPrimary: tenantId === primary, joinedAt: body.startDate })) },
        },
      });
      const final = body.contractNumber ? c : await tx.contract.update({ where: { id: c.id }, data: { contractNumber: `HD-${dateStr(body.startDate).slice(0, 4)}-${String(c.id).padStart(5, '0')}` } });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
      await audit(u, 'CREATE', 'contract', final.id, null, final, tx, room.property.ownerId);
      return final;
    });
    return created(res, contract);
  }),
);

const updateSchema = z.object({
  rentPrice: zMoney,
  deposit: zMoney,
  paymentDueDay: z.coerce.number().int().min(1).max(28),
  endDate: zDate,
  terms: zOptStr(20000),
  notes: zOptStr(5000),
});

contractsRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertContract(u, zId.parse(req.params.id));
    if (old.status !== 'ACTIVE') throw conflict('Chỉ được sửa hợp đồng đang hiệu lực');
    const body = updateSchema.parse(req.body);
    if (body.endDate <= old.startDate) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu');
    const c = await prisma.contract.update({ where: { id: old.id }, data: body });
    await audit(u, 'UPDATE', 'contract', c.id, old, c, prisma, old.room.property.ownerId);
    return ok(res, c);
  }),
);

contractsRouter.post(
  '/:id/renew',
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertContract(u, zId.parse(req.params.id));
    if (old.status !== 'ACTIVE') throw conflict('Chỉ gia hạn được hợp đồng đang hiệu lực');
    const body = z.object({ newEndDate: zDate, rentPrice: zMoney.optional(), note: zOptStr(500) }).parse(req.body);
    if (body.newEndDate <= old.endDate) throw badRequest('Ngày hết hạn mới phải sau ngày hết hạn hiện tại');
    const noteLine = `[${dateStr(today())}] Gia hạn đến ${dateStr(body.newEndDate)}${body.rentPrice !== undefined ? `, giá thuê ${body.rentPrice}` : ''}${body.note ? ` – ${body.note}` : ''}`;
    const c = await prisma.contract.update({
      where: { id: old.id },
      data: { endDate: body.newEndDate, ...(body.rentPrice !== undefined ? { rentPrice: body.rentPrice } : {}), notes: [old.notes, noteLine].filter(Boolean).join('\n') },
    });
    await audit(u, 'RENEW', 'contract', c.id, { endDate: old.endDate, rentPrice: old.rentPrice }, { endDate: c.endDate, rentPrice: c.rentPrice }, prisma, old.room.property.ownerId);
    return ok(res, c);
  }),
);

contractsRouter.post(
  '/:id/terminate',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertContract(u, zId.parse(req.params.id));
    const body = z.object({ endDate: zDate, reason: zOptStr(255) }).parse(req.body);
    if (body.endDate < base.startDate) throw badRequest('Ngày kết thúc không được trước ngày bắt đầu hợp đồng');
    const result = await prisma.$transaction(async (tx) => {
      await lockContract(tx, base.id);
      const c = await tx.contract.findUniqueOrThrow({ where: { id: base.id } });
      if (c.status !== 'ACTIVE') throw conflict('Hợp đồng đã kết thúc trước đó');
      const status = body.endDate >= c.endDate ? 'EXPIRED' : 'TERMINATED';
      const updated = await tx.contract.update({ where: { id: c.id }, data: { status, endedAt: body.endDate, endReason: body.reason } });
      await tx.contractTenant.updateMany({ where: { contractId: c.id, leftAt: null }, data: { leftAt: body.endDate } });
      await tx.room.update({ where: { id: c.roomId }, data: { status: 'AVAILABLE' } });
      await audit(u, 'TERMINATE', 'contract', c.id, { status: c.status }, { status, endedAt: body.endDate, reason: body.reason }, tx, base.room.property.ownerId);
      return updated;
    });
    const unpaid = await prisma.invoice.aggregate({ where: { contractId: base.id, status: { in: OUTSTANDING } }, _sum: { totalAmount: true, paidAmount: true }, _count: true });
    return ok(res, { ...result, outstanding: { count: unpaid._count, amount: Number(unpaid._sum.totalAmount ?? 0) - Number(unpaid._sum.paidAmount ?? 0) } });
  }),
);

/* ---------- Thành viên hợp đồng ---------- */
contractsRouter.post(
  '/:id/tenants',
  ah(async (req, res) => {
    const u = me(req);
    const c = await assertContract(u, zId.parse(req.params.id));
    const body = z.object({ tenantId: zId, joinedAt: zDate.optional() }).parse(req.body);
    const t = await assertTenant(u, body.tenantId);
    if (t.ownerId !== c.room.property.ownerId) throw badRequest('Người thuê không thuộc chủ trọ của phòng này');
    await prisma.$transaction(async (tx) => {
      await lockContract(tx, c.id);
      const fresh = await tx.contract.findUniqueOrThrow({ where: { id: c.id }, include: { tenants: { where: { leftAt: null } } } });
      if (fresh.status !== 'ACTIVE') throw conflict('Hợp đồng không còn hiệu lực');
      if (fresh.tenants.length >= c.room.maxOccupancy) throw conflict(`Phòng đã đủ ${c.room.maxOccupancy} người`);
      const busy = await tx.contractTenant.findFirst({ where: { tenantId: t.id, leftAt: null, contract: { status: 'ACTIVE' } }, include: { contract: true } });
      if (busy) throw conflict(`"${t.fullName}" đang thuộc hợp đồng ${busy.contract.contractNumber}`);
      const link = await tx.contractTenant.findUnique({ where: { contractId_tenantId: { contractId: c.id, tenantId: t.id } } });
      const joinedAt = body.joinedAt ?? today();
      if (link) await tx.contractTenant.update({ where: { contractId_tenantId: { contractId: c.id, tenantId: t.id } }, data: { leftAt: null, joinedAt } });
      else await tx.contractTenant.create({ data: { contractId: c.id, tenantId: t.id, joinedAt } });
      await audit(u, 'ADD_TENANT', 'contract', c.id, null, { tenantId: t.id, fullName: t.fullName }, tx, c.room.property.ownerId);
    });
    return created(res, { added: true });
  }),
);

contractsRouter.delete(
  '/:id/tenants/:tenantId',
  ah(async (req, res) => {
    const u = me(req);
    const c = await assertContract(u, zId.parse(req.params.id));
    const tenantId = zId.parse(req.params.tenantId);
    await prisma.$transaction(async (tx) => {
      await lockContract(tx, c.id);
      const links = await tx.contractTenant.findMany({ where: { contractId: c.id, leftAt: null } });
      const link = links.find((l) => l.tenantId === tenantId);
      if (!link) throw badRequest('Người thuê không thuộc hợp đồng này');
      if (links.length <= 1) throw conflict('Hợp đồng phải còn ít nhất 1 người thuê. Hãy kết thúc hợp đồng nếu phòng trả.');
      await tx.contractTenant.update({ where: { contractId_tenantId: { contractId: c.id, tenantId } }, data: { leftAt: today(), isPrimary: false } });
      if (link.isPrimary) {
        const next = links.find((l) => l.tenantId !== tenantId)!;
        await tx.contractTenant.update({ where: { contractId_tenantId: { contractId: c.id, tenantId: next.tenantId } }, data: { isPrimary: true } });
      }
      await audit(u, 'REMOVE_TENANT', 'contract', c.id, { tenantId }, null, tx, c.room.property.ownerId);
    });
    return ok(res, { removed: true });
  }),
);
