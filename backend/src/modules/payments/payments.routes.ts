import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zDate, zId, zOptStr } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { assertInvoice, invoiceScope, roomScope } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { today } from '../../lib/dates';
import { lockInvoice, recomputePaid, withComputed } from '../invoices/invoices.service';
import { recordPaymentTx } from './payments.service';

export const paymentsRouter = Router();

const include = {
  invoice: {
    select: {
      id: true, invoiceNumber: true, period: true, totalAmount: true, paidAmount: true, status: true, dueDate: true,
      room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true, address: true, contactPhone: true } } } },
      contract: { select: { tenants: { where: { isPrimary: true }, take: 1, select: { tenant: { select: { fullName: true, phone: true } } } } } },
    },
  },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentInclude;

paymentsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.PaymentWhereInput = { invoice: invoiceScope(u) };
    if (q.invoiceId) where.invoiceId = zId.parse(q.invoiceId);
    if (q.method && ['CASH', 'BANK_TRANSFER', 'OTHER'].includes(q.method)) where.method = q.method as Prisma.PaymentWhereInput['method'];
    if (q.propertyId) where.invoice = { room: { ...roomScope(u), propertyId: zId.parse(q.propertyId) } };
    if (q.from || q.to) where.paymentDate = { ...(q.from ? { gte: zDate.parse(q.from) } : {}), ...(q.to ? { lte: zDate.parse(q.to) } : {}) };
    if (q.includeVoided !== 'true') where.voidedAt = null;
    if (q.q?.trim()) {
      const s = q.q.trim();
      where.OR = [{ receiptNumber: { contains: s } }, { reference: { contains: s } }, { invoice: { invoiceNumber: { contains: s } } }, { invoice: { room: { roomNumber: { contains: s } } } }];
    }
    const [items, total, sum] = await Promise.all([
      prisma.payment.findMany({ where, skip, take, orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }], include }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } }),
    ]);
    return ok(res, items, { ...pageMeta(page, pageSize, total), summary: { totalAmount: Number(sum._sum.amount ?? 0) } });
  }),
);

paymentsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const p = await prisma.payment.findFirst({ where: { id: zId.parse(req.params.id), invoice: invoiceScope(u) }, include });
    if (!p) throw notFound('Không tìm thấy phiếu thu');
    return ok(res, p);
  }),
);

const paymentSchema = z.object({
  invoiceId: zId,
  amount: z.coerce.number({ invalid_type_error: 'Số tiền không hợp lệ' }).positive('Số tiền phải lớn hơn 0').max(1e12),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'OTHER']),
  paymentDate: zDate,
  reference: zOptStr(100),
  note: zOptStr(255),
});

/** Ghi nhận thanh toán – nguyên tử, khóa hóa đơn, không cho trả vượt số còn nợ */
paymentsRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = paymentSchema.parse(req.body);
    const base = await assertInvoice(u, body.invoiceId);
    if (body.paymentDate > today()) throw badRequest('Ngày thanh toán không được ở tương lai');
    if (body.method === 'BANK_TRANSFER' && !body.reference) throw badRequest('Vui lòng nhập mã giao dịch / nội dung chuyển khoản');

    const result = await prisma.$transaction(async (tx) => {
      const r = await recordPaymentTx(tx, u, { ...body, source: 'MANUAL' }, base.room.property.ownerId);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: r.payment.id }, include });
      return { payment, invoice: r.invoice };
    });
    return created(res, result);
  }),
);

/** Hủy phiếu thu (không xóa). Số đã trả của hóa đơn được tính lại. */
paymentsRouter.post(
  '/:id/void',
  ah(async (req, res) => {
    const u = me(req);
    const body = z.object({ reason: z.string().trim().min(3, 'Vui lòng nhập lý do hủy').max(255) }).parse(req.body);
    const p = await prisma.payment.findFirst({ where: { id: zId.parse(req.params.id), invoice: invoiceScope(u) }, include: { invoice: { include: { room: { include: { property: true } } } } } });
    if (!p) throw notFound('Không tìm thấy phiếu thu');
    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, p.invoiceId);
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
      if (fresh.voidedAt) throw conflict('Phiếu thu đã được hủy trước đó');
      const payment = await tx.payment.update({ where: { id: p.id }, data: { voidedAt: new Date(), voidReason: body.reason } });
      const invoice = await recomputePaid(tx, p.invoiceId);
      await audit(u, 'VOID', 'payment', p.id, { amount: p.amount }, { reason: body.reason }, tx, p.invoice.room.property.ownerId);
      return { payment, invoice: withComputed(invoice) };
    });
    return ok(res, result);
  }),
);
