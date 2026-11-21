import { Router } from 'express';
import { z } from 'zod';
import type { MeterReading, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zId, zOptDate, zOptMoney, zOptStr, zPeriod, zReading } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { addMonths, currentPeriod, today } from '../../lib/dates';
import { assertRoom, roomScope, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { round, syncInvoiceWithReading } from '../invoices/invoices.service';

export const metersRouter = Router();

/** Thêm các trường tính toán: tiêu thụ và thành tiền */
export function computed(r: MeterReading) {
  const electricityUsage = round(Number(r.electricityCurr) - Number(r.electricityPrev));
  const waterUsage = round(Number(r.waterCurr) - Number(r.waterPrev));
  return {
    ...r,
    electricityUsage,
    waterUsage,
    electricityCost: round(electricityUsage * Number(r.electricityPrice)),
    waterCost: round(waterUsage * Number(r.waterPrice)),
  };
}

const readingSchema = z
  .object({
    roomId: zId,
    period: zPeriod,
    electricityPrev: zReading,
    electricityCurr: zReading,
    waterPrev: zReading,
    waterCurr: zReading,
    electricityPrice: zOptMoney.optional(),
    waterPrice: zOptMoney.optional(),
    readingDate: zOptDate.optional(),
    note: zOptStr(255).optional(),
  })
  .refine((v) => v.electricityCurr >= v.electricityPrev, { message: 'Chỉ số điện mới phải ≥ chỉ số cũ', path: ['electricityCurr'] })
  .refine((v) => v.waterCurr >= v.waterPrev, { message: 'Chỉ số nước mới phải ≥ chỉ số cũ', path: ['waterCurr'] });

type ReadingInput = z.infer<typeof readingSchema>;

/** Chỉ số cũ gợi ý = chỉ số mới của kỳ gần nhất trước đó */
async function previousReading(db: Tx | typeof prisma, roomId: number, period: string) {
  return db.meterReading.findFirst({ where: { roomId, period: { lt: period } }, orderBy: { period: 'desc' } });
}

async function saveReading(tx: Tx, u: AuthUser, input: ReadingInput) {
  const room = await assertRoom(u, input.roomId, tx);
  // Khu trọ chia tiền nước theo đầu người: không dùng chỉ số nước
  const splitWater = room.property.waterMode === 'SPLIT_PER_PERSON';
  if (splitWater) input = { ...input, waterPrev: 0, waterCurr: 0 };
  if (input.period > addMonths(currentPeriod(), 1)) throw badRequest('Không thể nhập chỉ số cho kỳ quá xa trong tương lai');
  const existing = await tx.meterReading.findUnique({ where: { roomId_period: { roomId: room.id, period: input.period } } });

  // Không cho chỉ số cũ thấp hơn chỉ số mới của kỳ trước (tránh tiêu thụ bị đếm sai)
  const prev = await previousReading(tx, room.id, input.period);
  if (prev && (input.electricityPrev < Number(prev.electricityCurr) || (!splitWater && input.waterPrev < Number(prev.waterCurr))))
    throw badRequest(`Phòng ${room.roomNumber}: chỉ số cũ không được nhỏ hơn chỉ số mới của kỳ ${prev.period}`);
  const next = await tx.meterReading.findFirst({ where: { roomId: room.id, period: { gt: input.period } }, orderBy: { period: 'asc' } });
  if (next && (input.electricityCurr > Number(next.electricityPrev) || (!splitWater && input.waterCurr > Number(next.waterPrev))))
    throw badRequest(`Phòng ${room.roomNumber}: chỉ số mới vượt quá chỉ số cũ của kỳ ${next.period}`);

  const data = {
    electricityPrev: input.electricityPrev,
    electricityCurr: input.electricityCurr,
    waterPrev: input.waterPrev,
    waterCurr: input.waterCurr,
    electricityPrice: input.electricityPrice ?? (existing ? Number(existing.electricityPrice) : Number(room.property.electricityPrice)),
    waterPrice: input.waterPrice ?? (existing ? Number(existing.waterPrice) : Number(room.property.waterPrice)),
    readingDate: input.readingDate ?? existing?.readingDate ?? today(),
    note: input.note === undefined ? existing?.note ?? null : input.note,
  };

  if (!existing) {
    const r = await tx.meterReading.create({ data: { ...data, roomId: room.id, period: input.period } });
    await audit(u, 'CREATE', 'meter_reading', r.id, null, r, tx, room.property.ownerId);
    return { reading: r, created: true };
  }
  const norm = (o: typeof data | MeterReading) =>
    JSON.stringify([
      Number(o.electricityPrev), Number(o.electricityCurr), Number(o.waterPrev), Number(o.waterCurr),
      Number(o.electricityPrice), Number(o.waterPrice), new Date(o.readingDate).getTime(), o.note ?? null,
    ]);
  if (norm(data) === norm(existing)) return { reading: existing, created: false };
  const r = await tx.meterReading.update({ where: { id: existing.id }, data });
  const sync = await syncInvoiceWithReading(tx, room.id, input.period, r);
  if (sync === 'LOCKED') throw conflict(`Phòng ${room.roomNumber}: hóa đơn kỳ ${input.period} đã có thanh toán nên không thể sửa chỉ số. Hãy hủy phiếu thu trước.`);
  await audit(u, 'UPDATE', 'meter_reading', r.id, existing, r, tx, room.property.ownerId);
  return { reading: r, created: false };
}

metersRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging({ pageSize: 50, ...req.query });
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.MeterReadingWhereInput = { room: roomScope(u) };
    if (q.period) where.period = zPeriod.parse(q.period);
    if (q.roomId) where.roomId = zId.parse(q.roomId);
    if (q.propertyId) where.room = { ...roomScope(u), propertyId: zId.parse(q.propertyId) };
    const [items, total] = await Promise.all([
      prisma.meterReading.findMany({ where, skip, take, orderBy: [{ period: 'desc' }, { roomId: 'asc' }], include: { room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } } } }),
      prisma.meterReading.count({ where }),
    ]);
    return ok(res, items.map((r) => ({ ...computed(r), room: r.room })), pageMeta(page, pageSize, total));
  }),
);

/** Bảng nhập liệu theo kỳ: các phòng đang thuê + phòng đã có chỉ số kỳ này */
metersRouter.get(
  '/sheet',
  ah(async (req, res) => {
    const u = me(req);
    const period = zPeriod.parse(req.query.period ?? currentPeriod());
    const propertyId = req.query.propertyId ? zId.parse(req.query.propertyId) : undefined;
    const rooms = await prisma.room.findMany({
      where: { ...roomScope(u), ...(propertyId ? { propertyId } : {}), OR: [{ status: 'OCCUPIED' }, { meterReadings: { some: { period } } }] },
      orderBy: [{ propertyId: 'asc' }, { floor: 'asc' }, { roomNumber: 'asc' }],
      include: {
        property: { select: { id: true, name: true, electricityPrice: true, waterPrice: true, waterMode: true } },
        meterReadings: { where: { period: { lte: period } }, orderBy: { period: 'desc' }, take: 2 },
        invoices: { where: { periodKey: period }, select: { id: true, invoiceNumber: true, paidAmount: true, status: true } },
      },
    });
    const rows = rooms.map((r) => {
      const current = r.meterReadings.find((m) => m.period === period) ?? null;
      const prev = r.meterReadings.find((m) => m.period < period) ?? null;
      const invoice = r.invoices[0] ?? null;
      return {
        room: { id: r.id, roomNumber: r.roomNumber, floor: r.floor, status: r.status },
        property: r.property,
        reading: current ? computed(current) : null,
        suggestion: { electricityPrev: prev ? Number(prev.electricityCurr) : 0, waterPrev: prev ? Number(prev.waterCurr) : 0, previousPeriod: prev?.period ?? null },
        invoice,
        locked: !!invoice && Number(invoice.paidAmount) > 0,
      };
    });
    return ok(res, { period, rows });
  }),
);

metersRouter.get(
  '/history',
  ah(async (req, res) => {
    const u = me(req);
    const room = await assertRoom(u, zId.parse(req.query.roomId));
    const months = z.coerce.number().int().min(1).max(36).default(12).parse(req.query.months ?? 12);
    const items = await prisma.meterReading.findMany({ where: { roomId: room.id }, orderBy: { period: 'desc' }, take: months });
    return ok(res, items.reverse().map(computed));
  }),
);

metersRouter.get(
  '/:id/audit',
  ah(async (req, res) => {
    const u = me(req);
    const r = await prisma.meterReading.findFirst({ where: { id: zId.parse(req.params.id), room: roomScope(u) } });
    if (!r) throw notFound('Không tìm thấy chỉ số');
    const logs = await prisma.auditLog.findMany({ where: { entity: 'meter_reading', entityId: r.id }, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } } });
    return ok(res, logs);
  }),
);

metersRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = readingSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const exists = await tx.meterReading.findUnique({ where: { roomId_period: { roomId: body.roomId, period: body.period } } });
      if (exists) throw conflict('Phòng đã có chỉ số cho kỳ này, hãy sửa bản ghi hiện có');
      return saveReading(tx, u, body);
    });
    return created(res, computed(result.reading));
  }),
);

metersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const existing = await prisma.meterReading.findFirst({ where: { id: zId.parse(req.params.id), room: roomScope(u) } });
    if (!existing) throw notFound('Không tìm thấy chỉ số');
    const body = readingSchema.parse({ ...req.body, roomId: existing.roomId, period: existing.period });
    const result = await prisma.$transaction((tx) => saveReading(tx, u, body));
    return ok(res, computed(result.reading));
  }),
);

/** Lưu nhiều phòng một lần (cả kỳ) – nguyên tử: lỗi 1 dòng thì không lưu dòng nào */
metersRouter.post(
  '/bulk',
  ah(async (req, res) => {
    const u = me(req);
    const body = z.object({ period: zPeriod, readings: z.array(z.record(z.unknown())).min(1).max(500) }).parse(req.body);
    const inputs = body.readings.map((r, i) => {
      const parsed = readingSchema.safeParse({ ...r, period: body.period });
      if (!parsed.success) throw badRequest(`Dòng ${i + 1}: ${parsed.error.issues[0].message}`, { row: i, field: parsed.error.issues[0].path.join('.') });
      return parsed.data;
    });
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const input of inputs) out.push(await saveReading(tx, u, input));
      return out;
    }, { timeout: 30000 });
    return ok(res, { saved: results.length, created: results.filter((r) => r.created).length });
  }),
);
