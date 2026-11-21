import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { addDays, dateStr, periodOf, periodRange, periodsBetween, today } from '../../lib/dates';
import { propertyScope, type AuthUser } from '../../lib/scope';
import { OUTSTANDING, round, withComputed } from '../invoices/invoices.service';

export function propWhere(u: AuthUser, propertyId?: number): Prisma.PropertyWhereInput {
  return { ...propertyScope(u), ...(propertyId ? { id: propertyId } : {}) };
}

export interface MonthRow {
  period: string;
  revenue: number;
  otherIncome: number;
  expense: number;
  net: number;
  invoiced: number;
  collectedOfInvoiced: number;
  electricityUsage: number;
  waterUsage: number;
}

/** Số liệu theo tháng: tiền thu thực tế (theo ngày thanh toán), thu khác, chi, lãi ròng, tiêu thụ điện nước */
export async function monthlySeries(u: AuthUser, from: string, to: string, propertyId?: number): Promise<MonthRow[]> {
  const periods = periodsBetween(from, to);
  const start = periodRange(from).start;
  const end = periodRange(to).end;
  const pw = propWhere(u, propertyId);
  const [payments, entries, invoices, readings] = await Promise.all([
    prisma.payment.findMany({ where: { voidedAt: null, paymentDate: { gte: start, lte: end }, invoice: { room: { property: pw } } }, select: { amount: true, paymentDate: true } }),
    prisma.expense.findMany({ where: { property: pw, entryDate: { gte: start, lte: end } }, select: { type: true, amount: true, entryDate: true } }),
    prisma.invoice.findMany({ where: { status: { not: 'CANCELLED' }, period: { in: periods }, room: { property: pw } }, select: { period: true, totalAmount: true, paidAmount: true } }),
    prisma.meterReading.findMany({ where: { period: { in: periods }, room: { property: pw } }, select: { period: true, electricityPrev: true, electricityCurr: true, waterPrev: true, waterCurr: true } }),
  ]);
  const map = new Map<string, MonthRow>(periods.map((p) => [p, { period: p, revenue: 0, otherIncome: 0, expense: 0, net: 0, invoiced: 0, collectedOfInvoiced: 0, electricityUsage: 0, waterUsage: 0 }]));
  for (const p of payments) { const r = map.get(periodOf(p.paymentDate)); if (r) r.revenue += Number(p.amount); }
  for (const e of entries) { const r = map.get(periodOf(e.entryDate)); if (r) { if (e.type === 'INCOME') r.otherIncome += Number(e.amount); else r.expense += Number(e.amount); } }
  for (const i of invoices) { const r = map.get(i.period); if (r) { r.invoiced += Number(i.totalAmount); r.collectedOfInvoiced += Number(i.paidAmount); } }
  for (const m of readings) {
    const r = map.get(m.period);
    if (r) { r.electricityUsage += Number(m.electricityCurr) - Number(m.electricityPrev); r.waterUsage += Number(m.waterCurr) - Number(m.waterPrev); }
  }
  return [...map.values()].map((r) => ({
    ...r,
    revenue: round(r.revenue), otherIncome: round(r.otherIncome), expense: round(r.expense), invoiced: round(r.invoiced),
    collectedOfInvoiced: round(r.collectedOfInvoiced), electricityUsage: round(r.electricityUsage), waterUsage: round(r.waterUsage),
    net: round(r.revenue + r.otherIncome - r.expense),
  }));
}

export async function occupancy(u: AuthUser, propertyId?: number) {
  const pw = propWhere(u, propertyId);
  const [groups, props] = await Promise.all([
    prisma.room.groupBy({ by: ['propertyId', 'status'], where: { property: pw }, _count: { _all: true } }),
    prisma.property.findMany({ where: pw, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const byProperty = props.map((p) => {
    const g = groups.filter((x) => x.propertyId === p.id);
    const count = (s: string) => g.filter((x) => x.status === s).reduce((a, x) => a + x._count._all, 0);
    const total = g.reduce((a, x) => a + x._count._all, 0);
    const occupied = count('OCCUPIED');
    return { propertyId: p.id, propertyName: p.name, total, occupied, available: count('AVAILABLE'), maintenance: count('MAINTENANCE'), rate: total ? round((occupied / total) * 100) : 0 };
  });
  const total = byProperty.reduce((a, x) => a + x.total, 0);
  const occupied = byProperty.reduce((a, x) => a + x.occupied, 0);
  return {
    total, occupied,
    available: byProperty.reduce((a, x) => a + x.available, 0),
    maintenance: byProperty.reduce((a, x) => a + x.maintenance, 0),
    rate: total ? round((occupied / total) * 100) : 0,
    byProperty,
  };
}

export async function outstandingInvoices(u: AuthUser, propertyId?: number, take?: number) {
  const items = await prisma.invoice.findMany({
    where: { status: { in: OUTSTANDING }, room: { property: propWhere(u, propertyId) } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take,
    include: {
      room: { select: { id: true, roomNumber: true, property: { select: { id: true, name: true } } } },
      contract: { select: { tenants: { where: { isPrimary: true }, take: 1, select: { tenant: { select: { fullName: true, phone: true } } } } } },
    },
  });
  return items.map(withComputed);
}

export async function contractExpiration(u: AuthUser, propertyId?: number) {
  const t = today();
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE', room: { property: propWhere(u, propertyId) } },
    orderBy: { endDate: 'asc' },
    include: { room: { select: { id: true, roomNumber: true, property: { select: { name: true } } } }, tenants: { where: { isPrimary: true }, take: 1, include: { tenant: { select: { fullName: true, phone: true } } } } },
  });
  const buckets = { expired: 0, within30: 0, within60: 0, within90: 0, later: 0 };
  for (const c of contracts) {
    if (c.endDate < t) buckets.expired++;
    else if (c.endDate <= addDays(t, 30)) buckets.within30++;
    else if (c.endDate <= addDays(t, 60)) buckets.within60++;
    else if (c.endDate <= addDays(t, 90)) buckets.within90++;
    else buckets.later++;
  }
  const upcoming = contracts
    .filter((c) => c.endDate <= addDays(t, 90))
    .map((c) => ({ id: c.id, contractNumber: c.contractNumber, endDate: dateStr(c.endDate), daysLeft: Math.round((c.endDate.getTime() - t.getTime()) / 86400000), room: c.room, tenant: c.tenants[0]?.tenant ?? null }));
  return { buckets, upcoming };
}
