import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Invoice, MonthRow, Occupancy } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DatePicker } from '../../components/ui/FormInput';
import { PropertyFilter } from '../../components/ui/Filters';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConsumptionChart, IncomeExpenseChart, OccupancyChart } from '../../components/charts/Charts';
import { addMonths, currentPeriod, formatDate, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS } from '../../lib/labels';

interface Report {
  range: { from: string; to: string };
  totals: { revenue: number; otherIncome: number; expense: number; net: number; invoiced: number; electricityUsage: number; waterUsage: number; outstanding: number };
  monthly: MonthRow[];
  occupancy: Occupancy;
  outstanding: Invoice[];
  contracts: {
    buckets: { expired: number; within30: number; within60: number; within90: number; later: number };
    upcoming: { id: number; contractNumber: string; endDate: string; daysLeft: number; room: { id: number; roomNumber: string; property: { name: string } }; tenant: { fullName: string; phone: string } | null }[];
  };
}

const th = 'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500';
const td = 'px-4 py-2.5';

export default function ReportsPage() {
  const toast = useToast();
  const [to, setTo] = useState(currentPeriod());
  const [from, setFrom] = useState(addMonths(currentPeriod(), -11));
  const [propertyId, setPropertyId] = useState('');
  const [exporting, setExporting] = useState(false);
  const { data, loading, error, reload } = useApi<Report>('/reports', { from, to, propertyId });

  const exportExcel = async () => {
    setExporting(true);
    try {
      await api.download('/reports/export', { from, to, propertyId, format: 'xlsx' }, `bao-cao-staymanager-${from}-${to}.xlsx`);
      toast.success('Đã xuất file Excel');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Báo cáo thống kê"
        description="Doanh thu, chi phí, lợi nhuận, công nợ, tỷ lệ lấp đầy và tiêu thụ điện nước"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>In / PDF</Button>
            <Button icon={<FileSpreadsheet className="h-4 w-4" />} loading={exporting} onClick={exportExcel}>Xuất Excel</Button>
          </div>
        }
      />
      <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-sm text-gray-600">Từ kỳ</span>
        <DatePicker type="month" value={from} max={to} onChange={(v) => v && setFrom(v)} aria-label="Từ kỳ" wrapperClassName="sm:w-44" />
        <span className="text-sm text-gray-600">đến</span>
        <DatePicker type="month" value={to} min={from} onChange={(v) => v && setTo(v)} aria-label="Đến kỳ" wrapperClassName="sm:w-44" />
        <PropertyFilter value={propertyId} onChange={setPropertyId} />
      </div>

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data && (
        <div className="space-y-6">
          <p className="hidden text-sm text-gray-600 print:block">Kỳ báo cáo: {formatPeriod(data.range.from)} – {formatPeriod(data.range.to)}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Tổng thu" value={formatMoney(data.totals.revenue + data.totals.otherIncome)} accent="green" hint={`Tiền thuê ${formatMoney(data.totals.revenue)}`} />
            <StatCard label="Tổng chi" value={formatMoney(data.totals.expense)} accent="red" />
            <StatCard label="Lợi nhuận ròng" value={formatMoney(data.totals.net)} accent="indigo" />
            <StatCard label="Công nợ hiện tại" value={formatMoney(data.totals.outstanding)} accent="amber" hint={`${data.outstanding.length} hóa đơn`} />
          </div>

          <Card>
            <CardHeader title="Doanh thu, chi phí và lợi nhuận theo tháng" />
            <IncomeExpenseChart data={data.monthly} />
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50"><tr><th className={`${th} text-left`}>Kỳ</th><th className={`${th} text-right`}>Hóa đơn phát hành</th><th className={`${th} text-right`}>Tiền thuê đã thu</th><th className={`${th} text-right`}>Thu khác</th><th className={`${th} text-right`}>Chi phí</th><th className={`${th} text-right`}>Lợi nhuận</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.monthly.map((m) => (
                    <tr key={m.period}>
                      <td className={td}>{formatPeriod(m.period)}</td>
                      <td className={`${td} text-right`}>{formatMoney(m.invoiced)}</td>
                      <td className={`${td} text-right`}>{formatMoney(m.revenue)}</td>
                      <td className={`${td} text-right`}>{formatMoney(m.otherIncome)}</td>
                      <td className={`${td} text-right text-red-600`}>{formatMoney(m.expense)}</td>
                      <td className={`${td} text-right font-medium ${m.net < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatMoney(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr><td className={td}>Tổng</td><td className={`${td} text-right`}>{formatMoney(data.totals.invoiced)}</td><td className={`${td} text-right`}>{formatMoney(data.totals.revenue)}</td><td className={`${td} text-right`}>{formatMoney(data.totals.otherIncome)}</td><td className={`${td} text-right`}>{formatMoney(data.totals.expense)}</td><td className={`${td} text-right`}>{formatMoney(data.totals.net)}</td></tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Tỷ lệ lấp đầy hiện tại" />
              <OccupancyChart data={data.occupancy} />
            </Card>
            <Card className="lg:col-span-2" padded={false}>
              <div className="p-5 pb-0"><CardHeader title="Lấp đầy theo khu trọ" /></div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50"><tr><th className={`${th} text-left`}>Khu trọ</th><th className={`${th} text-right`}>Tổng</th><th className={`${th} text-right`}>Đang thuê</th><th className={`${th} text-right`}>Trống</th><th className={`${th} text-right`}>Bảo trì</th><th className={`${th} text-right`}>Tỷ lệ</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.occupancy.byProperty.map((p) => (
                      <tr key={p.propertyId}><td className={td}>{p.propertyName}</td><td className={`${td} text-right`}>{p.total}</td><td className={`${td} text-right`}>{p.occupied}</td><td className={`${td} text-right`}>{p.available}</td><td className={`${td} text-right`}>{p.maintenance}</td><td className={`${td} text-right font-medium`}>{formatNumber(p.rate, 1)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Tiêu thụ điện nước" subtitle={`Tổng: ${formatNumber(data.totals.electricityUsage)} kWh điện · ${formatNumber(data.totals.waterUsage)} m³ nước`} />
            <ConsumptionChart data={data.monthly} />
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Công nợ chưa thu" subtitle={`Tổng ${formatMoney(data.totals.outstanding)}`} /></div>
            {!data.outstanding.length ? <p className="px-5 pb-6 text-sm text-gray-500">Không có công nợ.</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50"><tr><th className={`${th} text-left`}>Phòng</th><th className={`${th} text-left`}>Người thuê</th><th className={`${th} text-left`}>Kỳ</th><th className={`${th} text-left`}>Hạn</th><th className={`${th} text-right`}>Còn nợ</th><th className={`${th} text-left`}>Trạng thái</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.outstanding.map((i) => (
                      <tr key={i.id}>
                        <td className={td}><Link to={`/hoa-don/${i.id}`} className="link">P.{i.room.roomNumber}</Link> <span className="text-xs text-gray-500">{i.room.property.name}</span></td>
                        <td className={td}>{i.contract.tenants[0]?.tenant.fullName ?? '—'}</td>
                        <td className={td}>{formatPeriod(i.period)}</td>
                        <td className={td}>{formatDate(i.dueDate)}</td>
                        <td className={`${td} text-right font-medium text-red-600`}>{formatMoney(i.balance)}</td>
                        <td className={td}><StatusBadge map={INVOICE_STATUS} value={i.displayStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Thống kê hết hạn hợp đồng" subtitle="Các hợp đồng đang hiệu lực" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ['Đã quá hạn', data.contracts.buckets.expired, 'text-red-600'],
                ['≤ 30 ngày', data.contracts.buckets.within30, 'text-amber-600'],
                ['31–60 ngày', data.contracts.buckets.within60, 'text-sky-600'],
                ['61–90 ngày', data.contracts.buckets.within90, 'text-gray-700'],
                ['> 90 ngày', data.contracts.buckets.later, 'text-emerald-600'],
              ].map(([l, n, c]) => (
                <div key={l as string} className="rounded-lg bg-gray-50 p-3 text-center"><p className="text-xs text-gray-500">{l}</p><p className={`mt-1 text-xl font-semibold ${c}`}>{n}</p></div>
              ))}
            </div>
            {data.contracts.upcoming.length > 0 && (
              <ul className="mt-4 divide-y divide-gray-100 text-sm">
                {data.contracts.upcoming.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 py-2">
                    <Link to={`/hop-dong/${c.id}`} className="link">{c.contractNumber} · P.{c.room.roomNumber} · {c.tenant?.fullName}</Link>
                    <span className={c.daysLeft < 0 ? 'text-red-600' : 'text-gray-600'}>{formatDate(c.endDate)} ({c.daysLeft < 0 ? `quá ${-c.daysLeft} ngày` : `còn ${c.daysLeft} ngày`})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
