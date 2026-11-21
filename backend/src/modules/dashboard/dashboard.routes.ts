import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { ah, ok } from '../../lib/http';
import { zId } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { addDays, addMonths, currentPeriod, today } from '../../lib/dates';
import { withComputed } from '../invoices/invoices.service';
import { contractExpiration, monthlySeries, occupancy, outstandingInvoices, propWhere } from '../reports/reports.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const propertyId = req.query.propertyId ? zId.parse(req.query.propertyId) : undefined;
    const pw = propWhere(u, propertyId);
    const period = currentPeriod();

    const [propertyCount, occ, series, outstanding, expiring, recentPayments, recentMaintenance, pendingMaintenance] = await Promise.all([
      prisma.property.count({ where: pw }),
      occupancy(u, propertyId),
      monthlySeries(u, addMonths(period, -11), period, propertyId),
      outstandingInvoices(u, propertyId),
      prisma.contract.findMany({
        where: { status: 'ACTIVE', endDate: { lte: addDays(today(), 30) }, room: { property: pw } },
        orderBy: { endDate: 'asc' },
        take: 6,
        include: { room: { select: { id: true, roomNumber: true, property: { select: { name: true } } } }, tenants: { where: { isPrimary: true }, take: 1, include: { tenant: { select: { fullName: true, phone: true } } } } },
      }),
      prisma.payment.findMany({
        where: { voidedAt: null, invoice: { room: { property: pw } } },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        take: 6,
        include: { invoice: { select: { id: true, invoiceNumber: true, period: true, room: { select: { roomNumber: true, property: { select: { name: true } } } } } } },
      }),
      prisma.maintenanceRequest.findMany({ where: { room: { property: pw } }, orderBy: [{ requestDate: 'desc' }, { id: 'desc' }], take: 6, include: { room: { select: { id: true, roomNumber: true, property: { select: { name: true } } } } } }),
      prisma.maintenanceRequest.count({ where: { room: { property: pw }, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    ]);
    const [upcoming] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { gte: today(), lte: addDays(today(), 7) }, room: { property: pw } },
        orderBy: { dueDate: 'asc' },
        take: 8,
        include: { room: { select: { roomNumber: true, property: { select: { name: true } } } }, contract: { select: { tenants: { where: { isPrimary: true }, take: 1, select: { tenant: { select: { fullName: true } } } } } } },
      }),
    ]);

    const thisMonth = series[series.length - 1];
    const outstandingAmount = outstanding.reduce((a, i) => a + i.balance, 0);
    const overdue = outstanding.filter((i) => i.displayStatus === 'OVERDUE');

    return ok(res, {
      period,
      stats: {
        properties: propertyCount,
        rooms: occ.total,
        occupied: occ.occupied,
        available: occ.available,
        maintenance: occ.maintenance,
        occupancyRate: occ.rate,
        monthlyRevenue: thisMonth.revenue + thisMonth.otherIncome,
        monthlyExpense: thisMonth.expense,
        monthlyNet: thisMonth.net,
        outstandingCount: outstanding.length,
        outstandingAmount,
        overdueCount: overdue.length,
        pendingMaintenance,
      },
      upcomingDeadlines: upcoming.map(withComputed),
      charts: { monthly: series, occupancy: occ },
      expiringContracts: expiring,
      unpaidInvoices: outstanding.slice(0, 6),
      recentPayments,
      recentMaintenance,
    });
  }),
);

export { contractExpiration };
