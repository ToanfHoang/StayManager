import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Printer } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import type { Payment } from '../../api/types';
import { Card, PageHeader } from '../../components/ui/Card';
import { IconButton } from '../../components/ui/Button';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { DatePicker } from '../../components/ui/FormInput';
import { EmptyState } from '../../components/ui/States';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMoney, formatPeriod } from '../../lib/format';
import { options, PAYMENT_METHOD } from '../../lib/labels';

export default function PaymentsPage() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [method, setMethod] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi<Payment[]>('/payments', { q: dq, method, propertyId, from, to, includeVoided: includeVoided ? 'true' : '', page, pageSize: 20 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Lịch sử thanh toán" description={meta?.summary ? <>Tổng đã thu theo bộ lọc: <b className="text-emerald-600">{formatMoney(meta.summary.totalAmount)}</b></> : 'Tất cả phiếu thu tiền'} />
      <Card padded={false}>
        <FilterBar>
          <SearchBar value={q} onChange={reset(setQ)} placeholder="Số phiếu, số HĐ, phòng, mã GD…" />
          <FilterDropdown value={method} onChange={reset(setMethod)} allLabel="Mọi hình thức" options={options(PAYMENT_METHOD)} />
          <PropertyFilter value={propertyId} onChange={reset(setPropertyId)} />
          <DatePicker value={from} onChange={reset(setFrom)} aria-label="Từ ngày" wrapperClassName="w-full sm:w-40" />
          <DatePicker value={to} onChange={reset(setTo)} aria-label="Đến ngày" wrapperClassName="w-full sm:w-40" />
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={includeVoided} onChange={(e) => reset(setIncludeVoided)(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Hiện phiếu đã hủy</label>
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={<CreditCard className="h-6 w-6" />} title="Chưa có thanh toán" />}
          columns={[
            { key: 'no', header: 'Số phiếu', render: (p) => <span className={`font-medium ${p.voidedAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{p.receiptNumber}</span> },
            { key: 'date', header: 'Ngày', render: (p) => formatDate(p.paymentDate) },
            { key: 'inv', header: 'Hóa đơn', render: (p) => <Link to={`/hoa-don/${p.invoiceId}`} className="link">P.{p.invoice?.room.roomNumber} · kỳ {formatPeriod(p.invoice?.period)}</Link> },
            { key: 'tenant', header: 'Người nộp', render: (p) => p.invoice?.contract?.tenants[0]?.tenant.fullName ?? '—', hideOnMobile: true },
            { key: 'method', header: 'Hình thức', render: (p) => <StatusBadge map={PAYMENT_METHOD} value={p.method} />, hideOnMobile: true },
            { key: 'by', header: 'Người thu', render: (p) => p.createdBy?.fullName ?? '—', hideOnMobile: true },
            { key: 'amount', header: 'Số tiền', align: 'right', render: (p) => (p.voidedAt ? <Badge>Đã hủy</Badge> : <span className="font-semibold text-emerald-600">{formatMoney(p.amount)}</span>) },
            { key: 'act', header: '', align: 'right', render: (p) => !p.voidedAt && <IconButton label="In phiếu thu" onClick={() => window.open(`/in/phieu-thu/${p.id}`, '_blank')}><Printer className="h-4 w-4" /></IconButton> },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
    </>
  );
}
