import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DoorOpen, ImageIcon, Plus, Ruler, User, Users } from 'lucide-react';
import { useApi, useDebounce } from '../../hooks/useApi';
import type { Room } from '../../api/types';
import { PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Pagination } from '../../components/ui/DataTable';
import { formatMoney } from '../../lib/format';
import { options, ROOM_STATUS } from '../../lib/labels';
import { RoomForm } from './RoomForm';

const border: Record<string, string> = { AVAILABLE: 'border-t-emerald-500', OCCUPIED: 'border-t-primary-500', MAINTENANCE: 'border-t-amber-500' };

export default function RoomsPage() {
  const [params, setParams] = useSearchParams();
  const propertyId = params.get('propertyId') ?? '';
  const status = params.get('status') ?? '';
  const floor = params.get('floor') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [creating, setCreating] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, meta, loading, error, reload } = useApi<Room[]>('/rooms', { propertyId, status, floor, q: dq, page, pageSize: 24 });

  return (
    <>
      <PageHeader title="Quản lý phòng" description="Theo dõi tình trạng và người thuê của từng phòng" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Thêm phòng</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <SearchBar value={q} onChange={setQ} placeholder="Tìm số phòng…" />
        <PropertyFilter value={propertyId} onChange={(v) => setParam('propertyId', v)} />
        <FilterDropdown value={floor} onChange={(v) => setParam('floor', v)} allLabel="Tất cả tầng" options={Array.from({ length: 20 }, (_, i) => ({ value: i, label: i === 0 ? 'Tầng trệt' : `Tầng ${i}` }))} />
        <FilterDropdown value={status} onChange={(v) => setParam('status', v)} allLabel="Tất cả trạng thái" options={options(ROOM_STATUS)} />
      </div>

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white">
          <EmptyState icon={<DoorOpen className="h-6 w-6" />} title="Không có phòng nào" description={propertyId || status || floor || dq ? 'Thử thay đổi bộ lọc.' : 'Thêm phòng đầu tiên cho khu trọ của bạn.'} action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Thêm phòng</Button>} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.map((r) => {
              const tenants = r.activeContract?.tenants ?? [];
              return (
                <Link key={r.id} to={`/phong/${r.id}`} className={`group flex flex-col overflow-hidden rounded-xl border border-t-4 border-gray-200 bg-white shadow-card transition hover:shadow-md ${border[r.status]}`}>
                  <div className="relative h-28 bg-gray-100">
                    {r.images[0] ? <img src={r.images[0].url} alt={`Phòng ${r.roomNumber}`} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-gray-300"><ImageIcon className="h-8 w-8" /></div>}
                    <div className="absolute right-2 top-2"><StatusBadge map={ROOM_STATUS} value={r.status} /></div>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-700">P.{r.roomNumber}</h3>
                      <span className="text-xs text-gray-500">{r.floor === 0 ? 'Tầng trệt' : `Tầng ${r.floor}`}</span>
                    </div>
                    <p className="truncate text-xs text-gray-500">{r.property.name}</p>
                    <p className="mt-2 text-base font-semibold text-primary-700">{formatMoney(r.price)}<span className="text-xs font-normal text-gray-500">/tháng</span></p>
                    <div className="mt-2 flex gap-3 text-xs text-gray-500">
                      {r.area && <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{r.area} m²</span>}
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{tenants.length}/{r.maxOccupancy} người</span>
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3 text-sm">
                      {tenants.length ? (
                        <p className="flex items-center gap-1.5 truncate text-gray-700"><User className="h-4 w-4 shrink-0 text-gray-400" />{tenants[0].tenant.fullName}{tenants.length > 1 && <span className="text-gray-400"> +{tenants.length - 1}</span>}</p>
                      ) : <p className="text-gray-400">Chưa có người thuê</p>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-white"><Pagination meta={meta} onChange={(p) => setParam('page', String(p))} /></div>
        </>
      )}
      {creating && <RoomForm defaultPropertyId={propertyId} onClose={() => setCreating(false)} onSaved={() => reload()} />}
    </>
  );
}
