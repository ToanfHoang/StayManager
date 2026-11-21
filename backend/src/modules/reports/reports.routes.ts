import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { ah, badRequest, ok } from '../../lib/http';
import { zId, zPeriod } from '../../lib/validation';
import { me } from '../../middleware/auth';
import { addMonths, currentPeriod, dateStr } from '../../lib/dates';
import type { AuthUser } from '../../lib/scope';
import { contractExpiration, monthlySeries, occupancy, outstandingInvoices } from './reports.service';

export const reportsRouter = Router();

function parseRange(query: Record<string, unknown>) {
  const to = query.to ? zPeriod.parse(query.to) : currentPeriod();
  const from = query.from ? zPeriod.parse(query.from) : addMonths(to, -11);
  if (from > to) throw badRequest('Kỳ bắt đầu phải trước kỳ kết thúc');
  if (addMonths(from, 60) < to) throw badRequest('Khoảng thời gian tối đa 60 tháng');
  const propertyId = query.propertyId ? zId.parse(query.propertyId) : undefined;
  return { from, to, propertyId };
}

async function buildReport(u: AuthUser, from: string, to: string, propertyId?: number) {
  const [monthly, occ, outstanding, contracts] = await Promise.all([
    monthlySeries(u, from, to, propertyId),
    occupancy(u, propertyId),
    outstandingInvoices(u, propertyId),
    contractExpiration(u, propertyId),
  ]);
  const totals = monthly.reduce(
    (a, m) => ({ revenue: a.revenue + m.revenue, otherIncome: a.otherIncome + m.otherIncome, expense: a.expense + m.expense, net: a.net + m.net, invoiced: a.invoiced + m.invoiced, electricityUsage: a.electricityUsage + m.electricityUsage, waterUsage: a.waterUsage + m.waterUsage }),
    { revenue: 0, otherIncome: 0, expense: 0, net: 0, invoiced: 0, electricityUsage: 0, waterUsage: 0 },
  );
  return {
    range: { from, to, propertyId: propertyId ?? null },
    totals: { ...totals, outstanding: outstanding.reduce((a, i) => a + i.balance, 0) },
    monthly,
    occupancy: occ,
    outstanding,
    contracts,
  };
}

reportsRouter.get(
  '/',
  ah(async (req, res) => {
    const { from, to, propertyId } = parseRange(req.query);
    return ok(res, await buildReport(me(req), from, to, propertyId));
  }),
);

const fmtPeriod = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;
const fmtDate = (d: string | Date) => (typeof d === 'string' ? d : dateStr(d)).split('-').reverse().join('/');

reportsRouter.get(
  '/export',
  ah(async (req, res) => {
    const { from, to, propertyId } = parseRange(req.query);
    z.enum(['xlsx']).default('xlsx').parse(req.query.format ?? 'xlsx');
    const r = await buildReport(me(req), from, to, propertyId);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StayManager';
    wb.created = new Date();
    const money = '#,##0" đ"';
    const styleHeader = (ws: ExcelJS.Worksheet) => {
      const row = ws.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      row.alignment = { vertical: 'middle' };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    const s1 = wb.addWorksheet('Doanh thu - Chi phí');
    s1.columns = [
      { header: 'Kỳ', key: 'period', width: 10 },
      { header: 'Tiền đã thu', key: 'revenue', width: 18, style: { numFmt: money } },
      { header: 'Thu khác', key: 'otherIncome', width: 16, style: { numFmt: money } },
      { header: 'Chi phí', key: 'expense', width: 16, style: { numFmt: money } },
      { header: 'Lợi nhuận ròng', key: 'net', width: 18, style: { numFmt: money } },
      { header: 'Tổng hóa đơn phát hành', key: 'invoiced', width: 22, style: { numFmt: money } },
      { header: 'Điện tiêu thụ (kWh)', key: 'electricityUsage', width: 18 },
      { header: 'Nước tiêu thụ (m³)', key: 'waterUsage', width: 18 },
    ];
    r.monthly.forEach((m) => s1.addRow({ ...m, period: fmtPeriod(m.period) }));
    const tr = s1.addRow({ period: 'Tổng', ...r.totals });
    tr.font = { bold: true };
    styleHeader(s1);

    const s2 = wb.addWorksheet('Công nợ');
    s2.columns = [
      { header: 'Số hóa đơn', key: 'no', width: 24 },
      { header: 'Khu trọ', key: 'property', width: 22 },
      { header: 'Phòng', key: 'room', width: 10 },
      { header: 'Người thuê', key: 'tenant', width: 22 },
      { header: 'Kỳ', key: 'period', width: 10 },
      { header: 'Hạn thanh toán', key: 'due', width: 15 },
      { header: 'Tổng tiền', key: 'total', width: 16, style: { numFmt: money } },
      { header: 'Đã trả', key: 'paid', width: 16, style: { numFmt: money } },
      { header: 'Còn nợ', key: 'balance', width: 16, style: { numFmt: money } },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];
    const statusVi: Record<string, string> = { UNPAID: 'Chưa thanh toán', PARTIALLY_PAID: 'Thanh toán một phần', OVERDUE: 'Quá hạn' };
    r.outstanding.forEach((i) =>
      s2.addRow({
        no: i.invoiceNumber, property: i.room.property.name, room: i.room.roomNumber, tenant: i.contract.tenants[0]?.tenant.fullName ?? '',
        period: fmtPeriod(i.period), due: fmtDate(i.dueDate), total: Number(i.totalAmount), paid: Number(i.paidAmount), balance: i.balance, status: statusVi[i.displayStatus] ?? i.displayStatus,
      }),
    );
    styleHeader(s2);

    const s3 = wb.addWorksheet('Tỷ lệ lấp đầy');
    s3.columns = [
      { header: 'Khu trọ', key: 'propertyName', width: 26 },
      { header: 'Tổng phòng', key: 'total', width: 12 },
      { header: 'Đang thuê', key: 'occupied', width: 12 },
      { header: 'Trống', key: 'available', width: 10 },
      { header: 'Bảo trì', key: 'maintenance', width: 10 },
      { header: 'Tỷ lệ lấp đầy (%)', key: 'rate', width: 18 },
    ];
    r.occupancy.byProperty.forEach((p) => s3.addRow(p));
    s3.addRow({ propertyName: 'Tổng', total: r.occupancy.total, occupied: r.occupancy.occupied, available: r.occupancy.available, maintenance: r.occupancy.maintenance, rate: r.occupancy.rate }).font = { bold: true };
    styleHeader(s3);

    const s4 = wb.addWorksheet('Hợp đồng sắp hết hạn');
    s4.columns = [
      { header: 'Số hợp đồng', key: 'no', width: 18 },
      { header: 'Khu trọ', key: 'property', width: 22 },
      { header: 'Phòng', key: 'room', width: 10 },
      { header: 'Người thuê chính', key: 'tenant', width: 22 },
      { header: 'Ngày hết hạn', key: 'end', width: 14 },
      { header: 'Còn lại (ngày)', key: 'days', width: 14 },
    ];
    r.contracts.upcoming.forEach((c) => s4.addRow({ no: c.contractNumber, property: c.room.property.name, room: c.room.roomNumber, tenant: c.tenant?.fullName ?? '', end: fmtDate(c.endDate), days: c.daysLeft }));
    styleHeader(s4);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-staymanager-${from}-den-${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);
