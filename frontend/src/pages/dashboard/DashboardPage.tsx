import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Building2, Clock, CalendarClock, DoorOpen, Percent, Receipt, TrendingDown, TrendingUp, Users, Wrench } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import type { Contract, ContractTenant, Invoice, MaintenanceRequest, MonthRow, Occupancy, Payment } from '../../api/types';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PropertyFilter } from '../../components/ui/Filters';
import { IncomeExpenseChart, OccupancyChart, RevenueChart } from '../../components/charts/Charts';
import { daysUntil, formatDate, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS, MAINTENANCE_STATUS, PAYMENT_METHOD, PRIORITY } from '../../lib/labels';

interface DashboardData {
  period: string;
  stats: {
    properties: number; rooms: number; occupied: number; available: number; maintenance: number; occupancyRate: number;
    monthlyRevenue: number; monthlyExpense: number; monthlyNet: number; outstandingCount: number; outstandingAmount: number; overdueCount: number; pendingMaintenance: number;
  };
  charts: { monthly: MonthRow[]; occupancy: Occupancy };
  expiringContracts: (Contract & { tenants: ContractTenant[] })[];
  unpaidInvoices: Invoice[];
  upcomingDeadlines: Invoice[];
  recentPayments: Payment[];
  recentMaintenance: MaintenanceRequest[];
}

function ListEmpty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-gray-500">{text}</p>;
}

export default function DashboardPage() {
  const [propertyId, setPropertyId] = useState('');
  const { data, loading, error, reload } = useApi<DashboardData>('/dashboard', { propertyId });

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={data ? `Số liệu tháng ${formatPeriod(data.period)} · cập nhật theo thời gian thực` : 'Tình hình kinh doanh nhà trọ của bạn'}
        actions={<PropertyFilter value={propertyId} onChange={setPropertyId} />}
      />
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Khu trọ" value={data.stats.properties} icon={<Building2 className="h-5 w-5" />} hint={`${data.stats.rooms} phòng`} />
            <StatCard label="Tổng số phòng" value={data.stats.rooms} icon={<DoorOpen className="h-5 w-5" />} accent="sky" hint={`${data.stats.maintenance} phòng bảo trì`} />
            <StatCard label="Đang thuê" value={data.stats.occupied} icon={<Users className="h-5 w-5" />} accent="indigo" />
            <StatCard label="Còn trống" value={data.stats.available} icon={<DoorOpen className="h-5 w-5" />} accent="green" />
            <StatCard label="Tỷ lệ lấp đầy" value={`${formatNumber(data.stats.occupancyRate, 1)}%`} icon={<Percent className="h-5 w-5" />} accent="sky" />
            <StatCard label="Doanh thu tháng này" value={formatMoney(data.stats.monthlyRevenue)} icon={<TrendingUp className="h-5 w-5" />} accent="green" hint={`Lợi nhuận: ${formatMoney(data.stats.monthlyNet)}`} />
            <StatCard label="Hóa đơn chưa thu" value={data.stats.outstandingCount} icon={<Receipt className="h-5 w-5" />} accent={data.stats.overdueCount ? 'red' : 'amber'} hint={`${formatMoney(data.stats.outstandingAmount)} · ${data.stats.overdueCount} quá hạn`} />
            <StatCard label="Chi phí tháng này" value={formatMoney(data.stats.monthlyExpense)} icon={<TrendingDown className="h-5 w-5" />} accent="red" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Doanh thu theo tháng" subtitle="Tiền thực thu từ hóa đơn, 12 tháng gần nhất" />
              <RevenueChart data={data.charts.monthly} />
            </Card>
            <Card>
              <CardHeader title="Tình trạng phòng" subtitle={`${data.stats.rooms} phòng`} />
              <OccupancyChart data={data.charts.occupancy} />
            </Card>
          </div>

          <Card>
            <CardHeader title="Thu và chi" subtitle="So sánh tổng thu, tổng chi và lợi nhuận ròng" />
            <IncomeExpenseChart data={data.charts.monthly} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" />Hóa đơn chưa thanh toán</span>} action={<Link to="/hoa-don?status=OUTSTANDING" className="link text-sm">Xem tất cả</Link>} />
              {data.unpaidInvoices.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.unpaidInvoices.map((i) => (
                    <li key={i.id}>
                      <Link to={`/hoa-don/${i.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">Phòng {i.room.roomNumber} · {i.room.property.name}</p>
                          <p className="truncate text-xs text-gray-500">{i.contract.tenants[0]?.tenant.fullName ?? '—'} · Kỳ {formatPeriod(i.period)} · Hạn {formatDate(i.dueDate)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-gray-900">{formatMoney(i.balance)}</p>
                          <StatusBadge map={INVOICE_STATUS} value={i.displayStatus} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <ListEmpty text="Không có hóa đơn nào còn nợ 🎉" />}
            </Card>

            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Clock className="h-4 w-4 text-sky-500" />Sắp đến hạn thanh toán (7 ngày)</span>} subtitle="Nhắc người thuê qua Zalo ở mục Gửi tiền phòng" />
              {data.upcomingDeadlines.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.upcomingDeadlines.map((i) => (
                    <li key={i.id}>
                      <Link to={`/hoa-don/${i.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">Phòng {i.room.roomNumber} · {i.contract.tenants[0]?.tenant.fullName ?? '—'}</p>
                          <p className="text-xs text-gray-500">Kỳ {formatPeriod(i.period)} · hạn {formatDate(i.dueDate)} ({daysUntil(i.dueDate) === 0 ? 'hôm nay' : `còn ${daysUntil(i.dueDate)} ngày`})</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-gray-900">{formatMoney(i.balance)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <ListEmpty text="Không có hóa đơn nào đến hạn trong 7 ngày tới" />}
            </Card>

            <Card>
              <CardHeader title="Thanh toán gần đây" action={<Link to="/thanh-toan" className="link text-sm">Xem tất cả</Link>} />
              {data.recentPayments.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">Phòng {p.invoice?.room.roomNumber} · {p.invoice?.room.property.name}</p>
                        <p className="text-xs text-gray-500">{formatDate(p.paymentDate)} · {PAYMENT_METHOD[p.method].label}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-emerald-600">+{formatMoney(p.amount)}</p>
                    </li>
                  ))}
                </ul>
              ) : <ListEmpty text="Chưa có thanh toán nào" />}
            </Card>

            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary-500" />Hợp đồng sắp hết hạn (30 ngày)</span>} action={<Link to="/hop-dong?expiringDays=30" className="link text-sm">Xem tất cả</Link>} />
              {data.expiringContracts.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.expiringContracts.map((c) => {
                    const d = daysUntil(c.endDate);
                    return (
                      <li key={c.id}>
                        <Link to={`/hop-dong/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">Phòng {c.room?.roomNumber} · {c.tenants[0]?.tenant.fullName}</p>
                            <p className="text-xs text-gray-500">{c.contractNumber} · hết hạn {formatDate(c.endDate)}</p>
                          </div>
                          <span className={`shrink-0 text-sm font-medium ${d < 0 ? 'text-red-600' : d <= 7 ? 'text-amber-600' : 'text-gray-600'}`}>{d < 0 ? `Quá ${-d} ngày` : `Còn ${d} ngày`}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : <ListEmpty text="Không có hợp đồng nào sắp hết hạn" />}
            </Card>

            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Wrench className="h-4 w-4 text-gray-500" />Yêu cầu sửa chữa gần đây</span>} subtitle={`${data.stats.pendingMaintenance} yêu cầu đang chờ / đang xử lý`} action={<Link to="/sua-chua" className="link text-sm">Xem tất cả</Link>} />
              {data.recentMaintenance.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.recentMaintenance.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{m.title}</p>
                        <p className="text-xs text-gray-500">Phòng {m.room.roomNumber} · {formatDate(m.requestDate)} · Ưu tiên {PRIORITY[m.priority].label.toLowerCase()}</p>
                      </div>
                      <StatusBadge map={MAINTENANCE_STATUS} value={m.status} />
                    </li>
                  ))}
                </ul>
              ) : <ListEmpty text="Chưa có yêu cầu sửa chữa" />}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
