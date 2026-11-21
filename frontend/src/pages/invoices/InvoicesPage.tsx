import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, FilePlus2, Receipt } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import type { Invoice } from '../../api/types';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { DatePicker } from '../../components/ui/FormInput';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMoney, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS } from '../../lib/labels';
import { GenerateInvoicesModal } from './GenerateInvoicesModal';

const STATUS_OPTIONS = [
  { value: 'OUTSTANDING', label: 'Còn nợ (chưa thu đủ)' },
  { value: 'UNPAID', label: 'Chưa thanh toán (trong hạn)' },
  { value: 'PARTIALLY_PAID', label: 'Thanh toán một phần (trong hạn)' },
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export default function InvoicesPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState(params.get('period') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  const { data, meta, loading, error, reload } = useApi<Invoice[]>('/invoices', { period, status, propertyId, q: dq, page, pageSize: 20 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  const s = meta?.summary;

  return (
    <>
      <PageHeader
        title="Hóa đơn"
        description="Lập hóa đơn hằng tháng, theo dõi thanh toán và công nợ"
        actions={
          <>
            <Link to="/thanh-toan"><Button variant="secondary" icon={<CreditCard className="h-4 w-4" />}>Lịch sử thanh toán</Button></Link>
            <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setGenerating(true)}>Lập hóa đơn tháng</Button>
          </>
        }
      />
      {s && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[['Tổng phát hành', s.totalAmount, 'text-gray-900'], ['Đã thu', s.paidAmount, 'text-emerald-600'], ['Còn phải thu', s.balance, 'text-red-600']].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-card">
              <p className="text-xs text-gray-500 sm:text-sm">{l}</p>
              <p className={`mt-0.5 truncate text-base font-semibold sm:text-xl ${c}`}>{formatMoney(v as number)}</p>
            </div>
          ))}
        </div>
      )}
      <Card padded={false}>
        <FilterBar>
          <SearchBar value={q} onChange={reset(setQ)} placeholder="Số HĐ, phòng, tên người thuê…" />
          <DatePicker type="month" value={period} onChange={reset(setPeriod)} aria-label="Kỳ" wrapperClassName="w-full sm:w-44" />
          <FilterDropdown value={status} onChange={reset(setStatus)} allLabel="Tất cả trạng thái" options={STATUS_OPTIONS} />
          <PropertyFilter value={propertyId} onChange={reset(setPropertyId)} />
          {(period || status || propertyId || q) && <Button variant="ghost" size="sm" onClick={() => { setPeriod(''); setStatus(''); setPropertyId(''); setQ(''); setPage(1); }}>Xóa lọc</Button>}
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(i) => i.id}
          onRowClick={(i) => nav(`/hoa-don/${i.id}`)}
          empty={<EmptyState icon={<Receipt className="h-6 w-6" />} title="Chưa có hóa đơn" description="Nhập chỉ số điện nước rồi bấm “Lập hóa đơn tháng”." />}
          columns={[
            { key: 'no', header: 'Số hóa đơn', render: (i) => <span className="font-medium text-gray-900">{i.invoiceNumber}</span>, hideOnMobile: true },
            { key: 'room', header: 'Phòng', render: (i) => <>P.{i.room.roomNumber}<span className="block text-xs text-gray-500">{i.room.property.name}</span></> },
            { key: 'tenant', header: 'Người thuê', render: (i) => i.contract.tenants[0]?.tenant.fullName ?? '—', hideOnMobile: true },
            { key: 'period', header: 'Kỳ', render: (i) => formatPeriod(i.period) },
            { key: 'due', header: 'Hạn TT', render: (i) => formatDate(i.dueDate), hideOnMobile: true },
            { key: 'total', header: 'Tổng tiền', align: 'right', render: (i) => formatMoney(i.totalAmount) },
            { key: 'balance', header: 'Còn nợ', align: 'right', render: (i) => (i.status === 'CANCELLED' ? '—' : <span className={i.balance > 0 ? 'font-medium text-red-600' : 'text-gray-500'}>{formatMoney(i.balance)}</span>) },
            { key: 'status', header: 'Trạng thái', render: (i) => <StatusBadge map={INVOICE_STATUS} value={i.displayStatus} /> },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
      {generating && <GenerateInvoicesModal onClose={() => setGenerating(false)} onDone={reload} />}
    </>
  );
}
