import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileSignature, Plus } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import type { Contract } from '../../api/types';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { daysUntil, formatDate, formatMoney } from '../../lib/format';
import { CONTRACT_STATUS, options } from '../../lib/labels';
import { ContractForm } from './ContractForm';

export function ExpiryHint({ c }: { c: Contract }) {
  if (c.status !== 'ACTIVE') return null;
  const d = daysUntil(c.endDate);
  if (d < 0) return <span className="block text-xs font-medium text-red-600">Đã quá hạn {-d} ngày</span>;
  if (d <= 30) return <span className="block text-xs font-medium text-amber-600">Còn {d} ngày</span>;
  return null;
}

export default function ContractsPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const expiringDays = params.get('expiringDays') ?? '';
  const { data, meta, loading, error, reload } = useApi<Contract[]>('/contracts', { q: dq, status, propertyId, expiringDays, page, pageSize: 20 });

  return (
    <>
      <PageHeader title="Hợp đồng" description="Quản lý hợp đồng thuê, gia hạn và chấm dứt" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Tạo hợp đồng</Button>} />
      <Card padded={false}>
        <FilterBar>
          <SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Số HĐ, tên người thuê, số phòng…" />
          <FilterDropdown value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Tất cả trạng thái" options={options(CONTRACT_STATUS)} />
          <PropertyFilter value={propertyId} onChange={(v) => { setPropertyId(v); setPage(1); }} />
          <FilterDropdown
            value={expiringDays}
            onChange={(v) => { const n = new URLSearchParams(params); if (v) n.set('expiringDays', v); else n.delete('expiringDays'); setParams(n, { replace: true }); setPage(1); }}
            allLabel="Mọi thời hạn"
            options={[{ value: '30', label: 'Hết hạn trong 30 ngày' }, { value: '60', label: 'Hết hạn trong 60 ngày' }, { value: '90', label: 'Hết hạn trong 90 ngày' }]}
          />
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(c) => c.id}
          onRowClick={(c) => nav(`/hop-dong/${c.id}`)}
          empty={<EmptyState icon={<FileSignature className="h-6 w-6" />} title="Chưa có hợp đồng" description="Tạo hợp đồng để gán người thuê vào phòng." />}
          columns={[
            { key: 'no', header: 'Số hợp đồng', render: (c) => <span className="font-medium text-gray-900">{c.contractNumber}</span> },
            { key: 'room', header: 'Phòng', render: (c) => <>P.{c.room?.roomNumber} <span className="block text-xs text-gray-500">{c.room?.property.name}</span></> },
            { key: 'tenants', header: 'Người thuê', render: (c) => <>{c.tenants?.[0]?.tenant.fullName}{(c.tenants?.length ?? 0) > 1 && <span className="text-gray-400"> +{c.tenants!.length - 1}</span>}</> },
            { key: 'time', header: 'Thời hạn', render: (c) => <>{formatDate(c.startDate)} → {formatDate(c.endDate)}<ExpiryHint c={c} /></>, hideOnMobile: true },
            { key: 'rent', header: 'Giá thuê', align: 'right', render: (c) => formatMoney(c.rentPrice), hideOnMobile: true },
            { key: 'status', header: 'Trạng thái', render: (c) => <StatusBadge map={CONTRACT_STATUS} value={c.status} /> },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
      {creating && <ContractForm onClose={() => setCreating(false)} onSaved={(c) => nav(`/hop-dong/${c.id}`)} />}
    </>
  );
}
