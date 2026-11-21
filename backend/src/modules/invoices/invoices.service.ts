import crypto from 'crypto';
import { Prisma, PrismaClient, type InvoiceItemType, type InvoiceStatus, type WaterMode } from '@prisma/client';
import { lockRow, type Tx } from '../../lib/prisma';
import { addMonths, dayOfPeriod, periodRange, today } from '../../lib/dates';

export const round = (n: number) => Math.round(n * 100) / 100;

export const lockInvoice = (tx: Tx, id: number) => lockRow(tx, "invoices", id);

/** Các trạng thái còn nợ */
export const OUTSTANDING: InvoiceStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'];

/** Trạng thái hiển thị: luôn suy ra OVERDUE từ hạn thanh toán (giờ Việt Nam), kể cả khi scheduler chưa chạy */
export function effectiveStatus(inv: { status: InvoiceStatus; dueDate: Date; totalAmount: Prisma.Decimal | number; paidAmount: Prisma.Decimal | number }): InvoiceStatus {
  if (OUTSTANDING.includes(inv.status) && Number(inv.totalAmount) - Number(inv.paidAmount) > 0) {
    if (inv.dueDate < today()) return 'OVERDUE';
    if (inv.status === 'OVERDUE') return Number(inv.paidAmount) > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
  }
  return inv.status;
}

export function withComputed<T extends { status: InvoiceStatus; dueDate: Date; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>(inv: T) {
  return { ...inv, balance: round(Number(inv.totalAmount) - Number(inv.paidAmount)), displayStatus: effectiveStatus(inv) };
}

/** Điều kiện lọc theo trạng thái hiển thị (bao gồm OVERDUE) */
export function statusFilter(status: string | undefined): Prisma.InvoiceWhereInput {
  const t = today();
  switch (status) {
    case 'OVERDUE':
      return { status: { in: OUTSTANDING }, dueDate: { lt: t } };
    case 'UNPAID':
    case 'PARTIALLY_PAID':
      return { status: { in: [status, 'OVERDUE'] }, dueDate: { gte: t }, ...(status === 'UNPAID' ? { paidAmount: 0 } : { paidAmount: { gt: 0 } }) };
    case 'OUTSTANDING':
      return { status: { in: OUTSTANDING } };
    case 'PAID':
    case 'CANCELLED':
      return { status };
    default:
      return {};
  }
}

/** Trạng thái theo số tiền và hạn thanh toán: còn nợ + quá hạn ⇒ OVERDUE */
export function statusFromAmounts(total: number, paid: number, dueDate?: Date): InvoiceStatus {
  if (paid + 0.005 >= total && total > 0) return 'PAID';
  if (dueDate && dueDate < today()) return 'OVERDUE';
  if (paid <= 0) return 'UNPAID';
  return 'PARTIALLY_PAID';
}

/** Nội dung chuyển khoản duy nhất: STAY-P{phòng}-INV{yyyymm}-{4 ký tự ngẫu nhiên} */
export function buildPaymentReference(roomNumber: string, period: string) {
  const room = roomNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'X';
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `STAY-P${room}-INV${period.replace('-', '')}-${rand}`;
}

/** Chuẩn hóa để so khớp nội dung CK (ngân hàng có thể bỏ dấu gạch, đổi chữ hoa/thường) */
export const normalizeReference = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Bảo đảm hóa đơn có mã tham chiếu thanh toán (tạo cho hóa đơn cũ nếu chưa có) */
export async function ensurePaymentReference(db: Tx | PrismaClient, invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { room: true } });
  if (inv.paymentReference) return inv.paymentReference;
  for (let i = 0; i < 5; i++) {
    const ref = buildPaymentReference(inv.room.roomNumber, inv.period);
    try {
      const r = await db.invoice.updateMany({ where: { id: invoiceId, paymentReference: null }, data: { paymentReference: ref } });
      if (r.count === 0) return (await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).paymentReference!;
      return ref;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  throw new Error('Không tạo được mã thanh toán duy nhất');
}

export interface ItemInput {
  type: InvoiceItemType;
  description: string;
  quantity: number;
  unitPrice: number;
}

export const itemAmount = (i: ItemInput) => round(i.quantity * i.unitPrice);

/** Ghi lại toàn bộ khoản và tính lại tổng tiền (quy tắc: tổng = Σ chi tiết) */
export async function replaceItems(tx: Tx, invoiceId: number, items: ItemInput[]) {
  await tx.invoiceItem.deleteMany({ where: { invoiceId } });
  await tx.invoiceItem.createMany({
    data: items.map((i, idx) => ({ invoiceId, type: i.type, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, amount: itemAmount(i), sortOrder: idx })),
  });
  return recomputeTotal(tx, invoiceId);
}

export async function recomputeTotal(tx: Tx, invoiceId: number) {
  const sum = await tx.invoiceItem.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  const total = round(Number(sum._sum.amount ?? 0));
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  return tx.invoice.update({ where: { id: invoiceId }, data: { totalAmount: total, status: inv.status === 'CANCELLED' ? 'CANCELLED' : statusFromAmounts(total, Number(inv.paidAmount), inv.dueDate) } });
}

/** Tính lại số đã trả từ các phiếu thu chưa hủy */
export async function recomputePaid(tx: Tx, invoiceId: number) {
  const sum = await tx.payment.aggregate({ where: { invoiceId, voidedAt: null }, _sum: { amount: true } });
  const paid = round(Number(sum._sum.amount ?? 0));
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  return tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, status: inv.status === 'CANCELLED' ? 'CANCELLED' : statusFromAmounts(Number(inv.totalAmount), paid, inv.dueDate) } });
}

/** Khoản điện (và nước nếu khu trọ tính nước theo đồng hồ) từ chỉ số của kỳ */
export function readingItems(r: { electricityPrev: Prisma.Decimal; electricityCurr: Prisma.Decimal; electricityPrice: Prisma.Decimal; waterPrev: Prisma.Decimal; waterCurr: Prisma.Decimal; waterPrice: Prisma.Decimal }, waterMode: WaterMode = 'METER'): ItemInput[] {
  const e = round(Number(r.electricityCurr) - Number(r.electricityPrev));
  const items: ItemInput[] = [{ type: 'ELECTRICITY', description: `Tiền điện (${Number(r.electricityPrev)} → ${Number(r.electricityCurr)})`, quantity: e, unitPrice: Number(r.electricityPrice) }];
  if (waterMode === 'METER') {
    const w = round(Number(r.waterCurr) - Number(r.waterPrev));
    items.push({ type: 'WATER', description: `Tiền nước (${Number(r.waterPrev)} → ${Number(r.waterCurr)})`, quantity: w, unitPrice: Number(r.waterPrice) });
  }
  return items;
}

/** Chia tiền nước cả dãy theo đầu người: số người = tổng người đang ở các phòng có hợp đồng hiệu lực của khu trọ */
export async function waterSplitInfo(db: Tx | PrismaClient, propertyId: number, period: string) {
  const { end } = periodRange(period);
  const contracts = await db.contract.findMany({
    where: { status: 'ACTIVE', startDate: { lte: end }, room: { propertyId } },
    include: { room: { select: { id: true, roomNumber: true } }, tenants: { where: { leftAt: null }, select: { tenantId: true } } },
    orderBy: { room: { roomNumber: 'asc' } },
  });
  const rooms = contracts.map((c) => ({ roomId: c.room.id, roomNumber: c.room.roomNumber, people: Math.max(1, c.tenants.length) }));
  return { rooms, totalPeople: rooms.reduce((a, r) => a + r.people, 0) };
}

/** Cập nhật khoản điện/nước của hóa đơn khi chỉ số thay đổi (chỉ khi chưa có thanh toán) */
export async function syncInvoiceWithReading(tx: Tx, roomId: number, period: string, reading: Parameters<typeof readingItems>[0]) {
  const inv = await tx.invoice.findFirst({ where: { roomId, periodKey: period } });
  if (!inv) return null;
  await lockInvoice(tx, inv.id);
  const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  if (Number(fresh.paidAmount) > 0) return 'LOCKED' as const;
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId }, include: { property: { select: { waterMode: true } } } });
  const newMeter = readingItems(reading, room.property.waterMode);
  const items: ItemInput[] = fresh.items.map((i) => {
    const repl = newMeter.find((m) => m.type === i.type && (i.type === 'ELECTRICITY' || i.type === 'WATER'));
    return repl ?? { type: i.type, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) };
  });
  for (const m of newMeter) if (!items.some((i) => i.type === m.type)) items.push(m);
  await replaceItems(tx, fresh.id, items);
  return fresh.id;
}

export interface GenerateResult {
  created: { invoiceId: number; invoiceNumber: string; roomId: number; roomNumber: string; total: number }[];
  skipped: { roomId: number; roomNumber: string; propertyName: string; reason: string }[];
}

/** Tạo hóa đơn cho 1 phòng trong 1 kỳ. Ném Error(lý do) nếu không thể tạo */
export async function generateForRoom(tx: Tx, roomId: number, period: string, opts: { waterPerPerson?: number } = {}) {
  await lockRow(tx, "rooms", roomId);
  const { start, end } = periodRange(period);
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId }, include: { property: { include: { services: { where: { isActive: true }, orderBy: { id: 'asc' } } } } } });

  const existing = await tx.invoice.findFirst({ where: { roomId, periodKey: period } });
  if (existing) throw new Error(`Đã có hóa đơn ${existing.invoiceNumber} cho kỳ này`);

  const contract = await tx.contract.findFirst({
    where: { roomId, status: 'ACTIVE', startDate: { lte: end } },
    include: { tenants: { where: { leftAt: null }, include: { tenant: true } } },
  });
  if (!contract) throw new Error('Phòng không có hợp đồng hiệu lực trong kỳ');

  const reading = await tx.meterReading.findUnique({ where: { roomId_period: { roomId, period } } });
  if (!reading) throw new Error(room.property.waterMode === 'METER' ? 'Chưa nhập chỉ số điện nước của kỳ' : 'Chưa nhập chỉ số điện của kỳ');
  if (room.property.waterMode === 'SPLIT_PER_PERSON' && opts.waterPerPerson === undefined) throw new Error('Chưa nhập tổng tiền nước của khu trọ');

  const people = Math.max(1, contract.tenants.length);
  const items: ItemInput[] = [{ type: 'RENT', description: `Tiền phòng tháng ${period.slice(5)}/${period.slice(0, 4)}`, quantity: 1, unitPrice: Number(contract.rentPrice) }, ...readingItems(reading, room.property.waterMode)];
  if (room.property.waterMode === 'SPLIT_PER_PERSON') {
    items.push({ type: 'WATER', description: `Tiền nước (chia đầu người: ${people} người)`, quantity: people, unitPrice: opts.waterPerPerson! });
  }
  for (const s of room.property.services) {
    items.push({
      type: s.type,
      description: s.unit === 'PER_PERSON' ? `${s.name} (${people} người)` : s.name,
      quantity: s.unit === 'PER_PERSON' ? people : 1,
      unitPrice: Number(s.price),
    });
  }

  const dueDate = dayOfPeriod(addMonths(period, 1), contract.paymentDueDay);
  const invoiceNumber = `HD${period.replace('-', '')}-${String(room.id).padStart(5, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const inv = await tx.invoice.create({
    data: {
      paymentReference: buildPaymentReference(room.roomNumber, period),
      invoiceNumber,
      roomId,
      contractId: contract.id,
      period,
      periodKey: period,
      issueDate: today() > start ? today() : start,
      dueDate,
      totalAmount: 0,
    },
  });
  const updated = await replaceItems(tx, inv.id, items);
  return { invoice: updated, room };
}
