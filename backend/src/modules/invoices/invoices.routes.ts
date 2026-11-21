import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, ok } from '../../lib/http';
import { pageMeta, paging, sortParam, zDate, zId, zOptStr, zPeriod } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { assertInvoice, assertProperty, invoiceScope, maskIdNumber, roomScope } from '../../lib/scope';
import { buildZaloMessage } from './zalo';
import { audit } from '../../lib/audit';
import { periodRange } from '../../lib/dates';
import { waterSplitInfo, generateForRoom, lockInvoice, replaceItems, statusFilter, withComputed, type GenerateResult } from './invoices.service';

export const invoicesRouter = Router();

const listInclude = {
  room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } },
  contract: { select: { id: true, contractNumber: true, tenants: { where: { isPrimary: true }, take: 1, select: { tenant: { select: { id: true, fullName: true, phone: true } } } } } },
} satisfies Prisma.InvoiceInclude;

invoicesRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.InvoiceWhereInput = { ...invoiceScope(u), ...statusFilter(q.status) };
    if (q.period) where.period = zPeriod.parse(q.period);
    if (q.roomId) where.roomId = zId.parse(q.roomId);
    if (q.zalo === 'unsent') where.zaloSentAt = null;
    if (q.zalo === 'sent') where.zaloSentAt = { not: null };
    if (q.propertyId) where.room = { ...roomScope(u), propertyId: zId.parse(q.propertyId) };
    if (q.q?.trim()) {
      const s = q.q.trim();
      where.OR = [{ invoiceNumber: { contains: s } }, { room: { roomNumber: { contains: s } } }, { contract: { tenants: { some: { tenant: { fullName: { contains: s } } } } } }];
    }
    const [items, total, sums] = await Promise.all([
      prisma.invoice.findMany({ where, skip, take, orderBy: [sortParam(q, ['period', 'dueDate', 'totalAmount', 'createdAt'] as const, 'period'), { id: 'desc' }], include: listInclude }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where: { ...where, status: where.status ?? { not: 'CANCELLED' } }, _sum: { totalAmount: true, paidAmount: true } }),
    ]);
    const totalAmount = Number(sums._sum.totalAmount ?? 0);
    const paidAmount = Number(sums._sum.paidAmount ?? 0);
    return ok(res, items.map(withComputed), { ...pageMeta(page, pageSize, total), summary: { totalAmount, paidAmount, balance: totalAmount - paidAmount } });
  }),
);

/** Xem trước cách chia tiền nước theo đầu người của 1 khu trọ trong kỳ */
invoicesRouter.get(
  '/water-split-preview',
  ah(async (req, res) => {
    const u = me(req);
    const prop = await assertProperty(u, zId.parse(req.query.propertyId));
    const period = zPeriod.parse(req.query.period);
    return ok(res, { waterMode: prop.waterMode, ...(await waterSplitInfo(prisma, prop.id, period)) });
  }),
);

invoicesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertInvoice(u, zId.parse(req.params.id));
    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { fullName: true } } } },
        room: { select: { id: true, roomNumber: true, floor: true, property: { select: { id: true, name: true, address: true, contactName: true, contactPhone: true } } } },
        contract: { select: { id: true, contractNumber: true, tenants: { where: { leftAt: null }, orderBy: { isPrimary: 'desc' }, include: { tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } } } } } },
      },
    });
    const reading = await prisma.meterReading.findUnique({ where: { roomId_period: { roomId: inv.roomId, period: inv.period } } });
    const contract = { ...inv.contract, tenants: inv.contract.tenants.map((t) => ({ ...t, tenant: { ...t.tenant, idNumber: maskIdNumber(u, t.tenant.idNumber) } })) };
    return ok(res, { ...withComputed(inv), contract, reading });
  }),
);

/** Tạo hóa đơn hàng loạt cho các phòng đang có hợp đồng */
invoicesRouter.post(
  '/generate',
  ah(async (req, res) => {
    const u = me(req);
    const body = z
      .object({ period: zPeriod, propertyId: zId.optional(), roomIds: z.array(zId).max(500).optional(), waterTotal: z.coerce.number().min(0, 'Tiền nước không được âm').max(1e10).optional() })
      .parse(req.body);
    if (body.waterTotal !== undefined && !body.propertyId) throw badRequest('Vui lòng chọn khu trọ khi nhập tổng tiền nước');
    const { end } = periodRange(body.period);
    const rooms = await prisma.room.findMany({
      where: {
        ...roomScope(u),
        ...(body.propertyId ? { propertyId: body.propertyId } : {}),
        ...(body.roomIds?.length ? { id: { in: body.roomIds } } : {}),
        contracts: { some: { status: 'ACTIVE', startDate: { lte: end } } },
      },
      include: { property: { select: { name: true, ownerId: true, waterMode: true } } },
      orderBy: [{ propertyId: 'asc' }, { roomNumber: 'asc' }],
    });
    if (!rooms.length) throw badRequest('Không có phòng nào đang có hợp đồng hiệu lực trong kỳ này');

    // Tiền nước chia đầu người (chỉ áp dụng cho khu trọ tính nước kiểu SPLIT_PER_PERSON)
    let waterPerPerson: number | undefined;
    let waterSplit: { total: number; totalPeople: number; perPerson: number } | null = null;
    if (body.waterTotal !== undefined && body.propertyId) {
      const prop = await assertProperty(u, body.propertyId);
      if (prop.waterMode !== 'SPLIT_PER_PERSON') throw badRequest('Khu trọ này tính tiền nước theo đồng hồ, không cần nhập tổng tiền nước');
      const info = await waterSplitInfo(prisma, prop.id, body.period);
      if (!info.totalPeople) throw badRequest('Khu trọ chưa có người ở để chia tiền nước');
      waterPerPerson = Math.round(body.waterTotal / info.totalPeople);
      waterSplit = { total: body.waterTotal, totalPeople: info.totalPeople, perPerson: waterPerPerson };
    }

    const result: GenerateResult & { waterSplit?: typeof waterSplit } = { created: [], skipped: [], waterSplit };
    for (const room of rooms) {
      try {
        const { invoice } = await prisma.$transaction((tx) => generateForRoom(tx, room.id, body.period, { waterPerPerson }));
        result.created.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, roomId: room.id, roomNumber: room.roomNumber, total: Number(invoice.totalAmount) });
        await audit(u, 'GENERATE', 'invoice', invoice.id, null, { period: body.period, total: invoice.totalAmount }, prisma, room.property.ownerId);
      } catch (e) {
        const reason = (e as { code?: string }).code === 'P2002' ? 'Đã có hóa đơn cho kỳ này' : e instanceof Error ? e.message : 'Lỗi không xác định';
        result.skipped.push({ roomId: room.id, roomNumber: room.roomNumber, propertyName: room.property.name, reason });
      }
    }
    return ok(res, result);
  }),
);

const itemSchema = z.object({
  type: z.enum(['RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PARKING', 'CLEANING', 'OTHER']),
  description: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().min(0, 'Số lượng không được âm').max(1e9),
  unitPrice: z.coerce.number().min(0, 'Đơn giá không được âm').max(1e12),
});

/** Sửa các khoản trước khi thanh toán */
invoicesRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertInvoice(u, zId.parse(req.params.id));
    const body = z.object({ items: z.array(itemSchema).min(1, 'Hóa đơn phải có ít nhất 1 khoản').max(50), dueDate: zDate, note: zOptStr(255) }).parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, base.id);
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: base.id }, include: { items: true } });
      if (inv.status === 'CANCELLED') throw conflict('Hóa đơn đã bị hủy');
      if (Number(inv.paidAmount) > 0) throw conflict('Hóa đơn đã có thanh toán nên không thể sửa khoản. Hãy hủy phiếu thu trước.');
      if (body.dueDate < inv.issueDate) throw badRequest('Hạn thanh toán không được trước ngày lập hóa đơn');
      await tx.invoice.update({ where: { id: inv.id }, data: { dueDate: body.dueDate, note: body.note } });
      const result = await replaceItems(tx, inv.id, body.items);
      await audit(u, 'UPDATE_ITEMS', 'invoice', inv.id, { total: inv.totalAmount, items: inv.items }, { total: result.totalAmount, items: body.items }, tx, base.room.property.ownerId);
      return result;
    });
    return ok(res, withComputed(updated));
  }),
);

/** Hủy hóa đơn (không xóa – giữ lịch sử). Kỳ đó có thể lập lại hóa đơn mới. */
invoicesRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertInvoice(u, zId.parse(req.params.id));
    const body = z.object({ reason: z.string().trim().min(3, 'Vui lòng nhập lý do hủy').max(255) }).parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, base.id);
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: base.id } });
      if (inv.status === 'CANCELLED') throw conflict('Hóa đơn đã được hủy trước đó');
      if (Number(inv.paidAmount) > 0) throw conflict('Hóa đơn đã có thanh toán. Hãy hủy các phiếu thu trước khi hủy hóa đơn.');
      const r = await tx.invoice.update({ where: { id: inv.id }, data: { status: 'CANCELLED', periodKey: null, cancelledAt: new Date(), cancelReason: body.reason } });
      await audit(u, 'CANCEL', 'invoice', inv.id, { status: inv.status }, { status: 'CANCELLED', reason: body.reason }, tx, base.room.property.ownerId);
      return r;
    });
    return ok(res, withComputed(updated));
  }),
);

/** Nội dung tin nhắn Zalo + mã QR cho 1 hóa đơn */
invoicesRouter.get(
  '/:id/zalo-message',
  ah(async (req, res) => {
    const inv = await assertInvoice(me(req), zId.parse(req.params.id));
    if (inv.status === 'CANCELLED') throw conflict('Hóa đơn đã bị hủy');
    return ok(res, await buildZaloMessage(inv.id));
  }),
);

/** Đánh dấu đã gửi (hoặc bỏ đánh dấu) hóa đơn qua Zalo */
invoicesRouter.post(
  '/:id/zalo-sent',
  ah(async (req, res) => {
    const u = me(req);
    const inv = await assertInvoice(u, zId.parse(req.params.id));
    const { sent } = z.object({ sent: z.boolean().default(true) }).parse(req.body ?? {});
    const r = await prisma.invoice.update({ where: { id: inv.id }, data: { zaloSentAt: sent ? new Date() : null } });
    await audit(u, sent ? 'ZALO_SENT' : 'ZALO_UNSENT', 'invoice', inv.id, null, null, prisma, inv.room.property.ownerId);
    return ok(res, { zaloSentAt: r.zaloSentAt });
  }),
);
