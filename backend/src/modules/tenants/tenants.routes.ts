import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, Tenant } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, conflict, created, ok } from '../../lib/http';
import { pageMeta, paging, sortParam, zId, zOptDate, zOptId, zOptStr, zPhone, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertTenant, maskIdNumber, ownerForCreate, tenantScope, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';

export const tenantsRouter = Router();

const tenantSchema = z.object({
  fullName: zStr(120),
  phone: zPhone,
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().email().max(191).nullable().optional()),
  idNumber: z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v ?? null), z.string().regex(/^[0-9A-Za-z]{6,20}$/, 'Số CCCD/CMND không hợp lệ').nullable()),
  dateOfBirth: zOptDate,
  gender: z.preprocess((v) => (v === '' ? null : v), z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional()),
  permanentAddress: zOptStr(255),
  notes: zOptStr(5000),
  ownerId: zOptId,
});

const mask = (u: AuthUser, t: Tenant) => ({ ...t, idNumber: maskIdNumber(u, t.idNumber) });

const currentContractInclude = {
  contracts: {
    where: { leftAt: null, contract: { status: 'ACTIVE' as const } },
    take: 1,
    include: { contract: { select: { id: true, contractNumber: true, endDate: true, room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } } } } },
  },
};

tenantsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = req.query.status;
    const activeLink: Prisma.ContractTenantWhereInput = { leftAt: null, contract: { status: 'ACTIVE' } };
    const where: Prisma.TenantWhereInput = {
      ...tenantScope(u),
      ...(q ? { OR: [{ fullName: { contains: q } }, { phone: { contains: q } }] } : {}),
      ...(status === 'current' ? { contracts: { some: activeLink } } : status === 'previous' ? { contracts: { some: {}, none: activeLink } } : status === 'none' ? { contracts: { none: {} } } : {}),
      ...(req.query.propertyId ? { contracts: { some: { ...activeLink, contract: { status: 'ACTIVE', room: { propertyId: zId.parse(req.query.propertyId) } } } } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.tenant.findMany({ where, skip, take, orderBy: sortParam(req.query, ['fullName', 'createdAt'] as const, 'createdAt'), include: currentContractInclude }),
      prisma.tenant.count({ where }),
    ]);
    const data = items.map(({ contracts, ...t }) => ({ ...mask(u, t as Tenant), currentContract: contracts[0]?.contract ?? null }));
    return ok(res, data, pageMeta(page, pageSize, total));
  }),
);

tenantsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const t = await assertTenant(u, zId.parse(req.params.id));
    const history = await prisma.contractTenant.findMany({
      where: { tenantId: t.id },
      orderBy: { joinedAt: 'desc' },
      include: { contract: { include: { room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } } } } },
    });
    return ok(res, { ...mask(u, t), history });
  }),
);

async function checkDuplicateId(ownerId: number, idNumber: string | null, excludeId?: number) {
  if (!idNumber) return;
  const dup = await prisma.tenant.findFirst({ where: { ownerId, idNumber, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  if (dup) throw conflict(`Số CCCD đã thuộc về người thuê "${dup.fullName}"`);
}

tenantsRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { ownerId, ...body } = tenantSchema.parse(req.body);
    const owner = await ownerForCreate(u, ownerId);
    await checkDuplicateId(owner, body.idNumber);
    const t = await prisma.tenant.create({ data: { ...body, ownerId: owner } });
    await audit(u, 'CREATE', 'tenant', t.id, null, { fullName: t.fullName, phone: t.phone }, prisma, owner);
    return created(res, mask(u, t));
  }),
);

tenantsRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertTenant(u, zId.parse(req.params.id));
    const { ownerId: _ignored, ...body } = tenantSchema.parse(req.body);
    // Nhân viên chỉ thấy CCCD đã che: nếu gửi lại giá trị đã che thì giữ nguyên
    if (u.role === 'STAFF' && body.idNumber && body.idNumber.includes('*')) body.idNumber = old.idNumber;
    if (u.role === 'STAFF' && body.idNumber === null && old.idNumber) body.idNumber = old.idNumber;
    await checkDuplicateId(old.ownerId, body.idNumber, old.id);
    const t = await prisma.tenant.update({ where: { id: old.id }, data: body });
    await audit(u, 'UPDATE', 'tenant', t.id, { fullName: old.fullName, phone: old.phone }, { fullName: t.fullName, phone: t.phone }, prisma, old.ownerId);
    return ok(res, mask(u, t));
  }),
);

tenantsRouter.delete(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const t = await assertTenant(u, zId.parse(req.params.id));
    const used = await prisma.contractTenant.count({ where: { tenantId: t.id } });
    if (used > 0) throw conflict('Người thuê đã có hợp đồng nên không thể xóa (cần giữ lịch sử thuê).');
    await prisma.tenant.delete({ where: { id: t.id } });
    await audit(u, 'DELETE', 'tenant', t.id, { fullName: t.fullName }, null, prisma, t.ownerId);
    return ok(res, { deleted: true });
  }),
);
