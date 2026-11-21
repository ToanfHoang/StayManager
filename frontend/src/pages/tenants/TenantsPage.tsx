import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import type { Tenant } from '../../api/types';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { EmptyState } from '../../components/ui/States';
import { Badge } from '../../components/ui/StatusBadge';
import { formatDate, initials } from '../../lib/format';
import { GENDER } from '../../lib/labels';
import { TenantForm } from './TenantForm';

export default function TenantsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [status, setStatus] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, meta, loading, error, reload } = useApi<Tenant[]>('/tenants', { q: dq, status, propertyId, page, pageSize: 20 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Người thuê" description="Hồ sơ người thuê hiện tại và trước đây" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Thêm người thuê</Button>} />
      <Card padded={false}>
        <FilterBar>
          <SearchBar value={q} onChange={reset(setQ)} placeholder="Tìm theo tên hoặc số điện thoại…" />
          <FilterDropdown value={status} onChange={reset(setStatus)} allLabel="Tất cả" options={[{ value: 'current', label: 'Đang thuê' }, { value: 'previous', label: 'Đã từng thuê' }, { value: 'none', label: 'Chưa có hợp đồng' }]} />
          <PropertyFilter value={propertyId} onChange={reset(setPropertyId)} />
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(t) => t.id}
          onRowClick={(t) => nav(`/nguoi-thue/${t.id}`)}
          empty={<EmptyState icon={<Users className="h-6 w-6" />} title="Chưa có người thuê" description={dq || status ? 'Không có kết quả phù hợp với bộ lọc.' : 'Thêm hồ sơ người thuê để tạo hợp đồng.'} />}
          columns={[
            {
              key: 'name', header: 'Họ tên', render: (t) => (
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{initials(t.fullName)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t.fullName}</p>
                    <p className="text-xs text-gray-500">{t.gender ? GENDER[t.gender] : ''}{t.dateOfBirth ? ` · ${formatDate(t.dateOfBirth)}` : ''}</p>
                  </div>
                </div>
              ),
            },
            { key: 'phone', header: 'Điện thoại', render: (t) => <a href={`tel:${t.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary-700">{t.phone}</a> },
            { key: 'id', header: 'CCCD', render: (t) => t.idNumber ?? '—', hideOnMobile: true },
            {
              key: 'room', header: 'Phòng hiện tại', render: (t) => t.currentContract ? (
                <Link to={`/phong/${t.currentContract.room.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary-700">
                  P.{t.currentContract.room.roomNumber} <span className="text-xs text-gray-500">· {t.currentContract.room.property.name}</span>
                </Link>
              ) : <span className="text-gray-400">—</span>,
            },
            { key: 'status', header: 'Trạng thái', render: (t) => (t.currentContract ? <Badge tone="green">Đang thuê</Badge> : <Badge>Không thuê</Badge>), hideOnMobile: true },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
      {creating && <TenantForm onClose={() => setCreating(false)} onSaved={(t) => nav(`/nguoi-thue/${t.id}`)} />}
    </>
  );
}
