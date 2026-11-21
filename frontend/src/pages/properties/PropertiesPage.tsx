import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Phone, Plus, Zap, Droplets } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import type { Property } from '../../api/types';
import { PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SearchBar } from '../../components/ui/Filters';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { formatMoney } from '../../lib/format';
import { PropertyForm } from './PropertyForm';

export default function PropertiesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'LANDLORD');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useApi<Property[]>('/properties', { q: dq, pageSize: 200 });

  return (
    <>
      <PageHeader
        title="Quản lý khu trọ"
        description="Danh sách khu trọ, đơn giá điện nước và dịch vụ theo từng khu"
        actions={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Thêm khu trọ</Button>}
      />
      <div className="mb-4"><SearchBar value={q} onChange={setQ} placeholder="Tìm theo tên hoặc địa chỉ…" /></div>
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white">
          <EmptyState icon={<Building2 className="h-6 w-6" />} title={dq ? 'Không tìm thấy khu trọ phù hợp' : 'Chưa có khu trọ nào'} description="Hãy thêm khu trọ đầu tiên để bắt đầu quản lý phòng và người thuê." action={canEdit && !dq && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Thêm khu trọ</Button>} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => {
            const s = p.stats ?? { total: 0, occupied: 0, available: 0, maintenance: 0 };
            const rate = s.total ? Math.round((s.occupied / s.total) * 100) : 0;
            return (
              <Link key={p.id} to={`/khu-tro/${p.id}`} className="group rounded-xl border border-gray-200 bg-white p-5 shadow-card transition hover:border-primary-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><Building2 className="h-5 w-5" /></div>
                  <span className="text-xs text-gray-500">{p.floors} tầng</span>
                </div>
                <h3 className="mt-3 font-semibold text-gray-900 group-hover:text-primary-700">{p.name}</h3>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-500"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{p.address}</p>
                {p.contactPhone && <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><Phone className="h-4 w-4" />{p.contactName ? `${p.contactName} · ` : ''}{p.contactPhone}</p>}
                {p.owner && hasRole('ADMIN') && <p className="mt-1 text-xs text-gray-400">Chủ trọ: {p.owner.fullName}</p>}
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-500"><span>{s.occupied}/{s.total} phòng đang thuê</span><span className="font-medium text-gray-700">{rate}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary-500" style={{ width: `${rate}%` }} /></div>
                </div>
                <div className="mt-4 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-500" />{formatMoney(p.electricityPrice)}/kWh</span>
                  <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5 text-sky-500" />{p.waterMode === 'SPLIT_PER_PERSON' ? 'Nước chia đầu người' : `${formatMoney(p.waterPrice)}/m³`}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <PropertyForm open onClose={() => setCreating(false)} onSaved={() => reload()} />}
    </>
  );
}
