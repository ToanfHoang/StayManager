import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zDate, zId, zMoney, zOptStr, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertProperty, expenseScope, ownerIdOf, propertyScope, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';

export const expensesRouter = Router();
export const categoriesRouter = Router();

/* ================= Danh mục thu chi ================= */
const categoryScope = (u: AuthUser): Prisma.ExpenseCategoryWhereInput => {
  const owner = ownerIdOf(u);
  return owner === null ? {} : { OR: [{ ownerId: null }, { ownerId: owner }] };
};

categoriesRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const type = req.query.type === 'INCOME' || req.query.type === 'EXPENSE' ? req.query.type : undefined;
    const items = await prisma.expenseCategory.findMany({
      where: { ...categoryScope(u), ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { ownerId: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
    return ok(res, items.map(({ _count, ...c }) => ({ ...c, usage: _count.expenses, isSystem: c.ownerId === null })));
  }),
);

const categorySchema = z.object({ name: zStr(100), type: z.enum(['INCOME', 'EXPENSE']) });

categoriesRouter.post(
  '/',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const body = categorySchema.parse(req.body);
    const ownerId = ownerIdOf(u); // ADMIN tạo danh mục hệ thống (ownerId = null)
    const dup = await prisma.expenseCategory.findFirst({ where: { name: body.name, type: body.type, OR: [{ ownerId: null }, { ownerId }] } });
    if (dup) throw conflict('Danh mục đã tồn tại');
    const c = await prisma.expenseCategory.create({ data: { ...body, ownerId } });
    return created(res, c);
  }),
);

async function assertOwnCategory(u: AuthUser, id: number) {
  const c = await prisma.expenseCategory.findFirst({ where: { id, ...categoryScope(u) } });
  if (!c) throw notFound('Không tìm thấy danh mục');
  if (c.ownerId === null && u.role !== 'ADMIN') throw conflict('Không thể sửa/xóa danh mục mặc định của hệ thống');
  return c;
}

categoriesRouter.put(
  '/:id',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const c = await assertOwnCategory(u, zId.parse(req.params.id));
    const body = categorySchema.parse(req.body);
    if (body.type !== c.type && (await prisma.expense.count({ where: { categoryId: c.id } })) > 0) throw conflict('Danh mục đã được sử dụng nên không thể đổi loại thu/chi');
    return ok(res, await prisma.expenseCategory.update({ where: { id: c.id }, data: body }));
  }),
);

categoriesRouter.delete(
  '/:id',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const c = await assertOwnCategory(u, zId.parse(req.params.id));
    if ((await prisma.expense.count({ where: { categoryId: c.id } })) > 0) throw conflict('Danh mục đang được sử dụng nên không thể xóa');
    await prisma.expenseCategory.delete({ where: { id: c.id } });
    return ok(res, { deleted: true });
  }),
);

/* ================= Khoản thu chi ================= */
const entrySchema = z.object({
  propertyId: zId,
  categoryId: zId,
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: zMoney.refine((v) => v > 0, 'Số tiền phải lớn hơn 0'),
  entryDate: zDate,
  description: zStr(255),
  note: zOptStr(5000),
});

async function validateEntry(u: AuthUser, body: z.infer<typeof entrySchema>) {
  const p = await assertProperty(u, body.propertyId);
  const cat = await prisma.expenseCategory.findFirst({ where: { id: body.categoryId, OR: [{ ownerId: null }, { ownerId: p.ownerId }] } });
  if (!cat) throw badRequest('Danh mục không hợp lệ');
  if (cat.type !== body.type) throw badRequest('Danh mục không khớp loại thu/chi');
  return p;
}

function entryWhere(u: AuthUser, q: Record<string, string | undefined>): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { ...expenseScope(u) };
  if (q.type === 'INCOME' || q.type === 'EXPENSE') where.type = q.type;
  if (q.propertyId) where.propertyId = zId.parse(q.propertyId);
  if (q.categoryId) where.categoryId = zId.parse(q.categoryId);
  if (q.from || q.to) where.entryDate = { ...(q.from ? { gte: zDate.parse(q.from) } : {}), ...(q.to ? { lte: zDate.parse(q.to) } : {}) };
  if (q.q?.trim()) where.description = { contains: q.q.trim() };
  return where;
}

expensesRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const where = entryWhere(u, q);
    const [items, total, sums] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        include: { property: { select: { id: true, name: true } }, category: { select: { id: true, name: true } }, createdBy: { select: { fullName: true } }, maintenanceRequest: { select: { id: true, title: true } } },
      }),
      prisma.expense.count({ where }),
      prisma.expense.groupBy({ by: ['type'], where, _sum: { amount: true } }),
    ]);
    const income = Number(sums.find((s) => s.type === 'INCOME')?._sum.amount ?? 0);
    const expense = Number(sums.find((s) => s.type === 'EXPENSE')?._sum.amount ?? 0);
    return ok(res, items, { ...pageMeta(page, pageSize, total), summary: { income, expense } });
  }),
);

/** Tổng hợp thu chi trong khoảng thời gian: tiền thu từ hóa đơn + thu khác – chi */
expensesRouter.get(
  '/summary',
  ah(async (req, res) => {
    const u = me(req);
    const q = req.query as Record<string, string | undefined>;
    const from = q.from ? zDate.parse(q.from) : undefined;
    const to = q.to ? zDate.parse(q.to) : undefined;
    const propertyId = q.propertyId ? zId.parse(q.propertyId) : undefined;
    const dateRange = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
    const propWhere = { ...propertyScope(u), ...(propertyId ? { id: propertyId } : {}) };
    const [rent, entries] = await Promise.all([
      prisma.payment.aggregate({ where: { voidedAt: null, ...(dateRange ? { paymentDate: dateRange } : {}), invoice: { room: { property: propWhere } } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['type'], where: { property: propWhere, ...(dateRange ? { entryDate: dateRange } : {}) }, _sum: { amount: true } }),
    ]);
    const rentIncome = Number(rent._sum.amount ?? 0);
    const otherIncome = Number(entries.find((e) => e.type === 'INCOME')?._sum.amount ?? 0);
    const expense = Number(entries.find((e) => e.type === 'EXPENSE')?._sum.amount ?? 0);
    return ok(res, { rentIncome, otherIncome, totalIncome: rentIncome + otherIncome, expense, net: rentIncome + otherIncome - expense });
  }),
);

expensesRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = entrySchema.parse(req.body);
    const p = await validateEntry(u, body);
    const e = await prisma.expense.create({ data: { ...body, createdById: u.id } });
    await audit(u, 'CREATE', 'expense', e.id, null, e, prisma, p.ownerId);
    return created(res, e);
  }),
);

async function assertEntry(u: AuthUser, id: number) {
  const e = await prisma.expense.findFirst({ where: { id, ...expenseScope(u) }, include: { property: true } });
  if (!e) throw notFound('Không tìm thấy khoản thu chi');
  return e;
}

expensesRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertEntry(u, zId.parse(req.params.id));
    const body = entrySchema.parse(req.body);
    await validateEntry(u, body);
    const e = await prisma.expense.update({ where: { id: old.id }, data: body });
    await audit(u, 'UPDATE', 'expense', e.id, old, e, prisma, old.property.ownerId);
    return ok(res, e);
  }),
);

expensesRouter.delete(
  '/:id',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertEntry(u, zId.parse(req.params.id));
    await prisma.expense.delete({ where: { id: old.id } });
    await audit(u, 'DELETE', 'expense', old.id, old, null, prisma, old.property.ownerId);
    return ok(res, { deleted: true });
  }),
);
