import { useState } from 'react';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { MaintenanceRequest, Room } from '../../api/types';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useForm } from '../../hooks/useForm';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { maintenanceSchema } from '../../lib/schemas';
import { dateInput, formatDate, formatMoney, todayStr } from '../../lib/format';
import { MAINTENANCE_STATUS, options, PRIORITY } from '../../lib/labels';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar } from '../../components/ui/Filters';
import { DatePicker, FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';

function MaintenanceForm({ item, onClose, onSaved }: { item?: MaintenanceRequest | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: rooms } = useApi<Room[]>('/rooms', { pageSize: 200 });
  const { data: assignees } = useApi<{ id: number; fullName: string }[]>('/users/assignees');
  const f = useForm(
    {
      roomId: String(item?.roomId ?? ''),
      title: item?.title ?? '',
      description: item?.description ?? '',
      priority: item?.priority ?? 'MEDIUM',
      requestDate: dateInput(item?.requestDate) || todayStr(),
      status: item?.status ?? 'PENDING',
      estimatedCost: item?.estimatedCost ?? '',
      actualCost: item?.actualCost ?? '',
      assignedToId: String(item?.assignedToId ?? ''),
      reportedBy: item?.reportedBy ?? '',
      createExpense: !item?.expense,
    } as Record<string, unknown>,
    maintenanceSchema,
  );
  const v = f.values as Record<string, string | number | boolean>;
  const completed = v.status === 'COMPLETED';

  const save = () =>
    f.submit(async (values) => {
      const body = { ...values, createExpense: completed && !item?.expense ? values.createExpense : false };
      if (item) await api.put(`/maintenance-requests/${item.id}`, body);
      else await api.post('/maintenance-requests', body);
      toast.success('Đã lưu yêu cầu sửa chữa');
      onSaved();
      onClose();
    });

  return (
    <Modal open onClose={onClose} size="lg" title={item ? 'Cập nhật yêu cầu sửa chữa' : 'Tạo yêu cầu sửa chữa'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Select label="Phòng" required value={String(v.roomId)} onChange={(e) => f.set('roomId', e.target.value)} options={(rooms ?? []).map((r) => ({ value: r.id, label: `P.${r.roomNumber} · ${r.property.name}` }))} placeholder="— Chọn phòng —" error={f.errors.roomId} />
        <FormInput label="Người báo" value={String(v.reportedBy)} onChange={(e) => f.set('reportedBy', e.target.value)} placeholder="VD: Người thuê phòng 101" />
        <FormInput label="Tiêu đề" required value={String(v.title)} onChange={(e) => f.set('title', e.target.value)} error={f.errors.title} wrapperClassName="sm:col-span-2" placeholder="VD: Vòi nước nhà tắm bị rò" />
        <Textarea label="Mô tả" value={String(v.description)} onChange={(e) => f.set('description', e.target.value)} wrapperClassName="sm:col-span-2" />
        <Select label="Mức ưu tiên" value={String(v.priority)} onChange={(e) => f.set('priority', e.target.value)} options={options(PRIORITY)} />
        <DatePicker label="Ngày yêu cầu" required value={String(v.requestDate)} onChange={(x) => f.set('requestDate', x)} error={f.errors.requestDate} />
        <Select label="Trạng thái" value={String(v.status)} onChange={(e) => f.set('status', e.target.value)} options={options(MAINTENANCE_STATUS)} />
        <Select label="Giao cho" value={String(v.assignedToId)} onChange={(e) => f.set('assignedToId', e.target.value)} options={(assignees ?? []).map((u) => ({ value: u.id, label: u.fullName }))} placeholder="— Chưa giao —" />
        <MoneyInput label="Chi phí dự kiến" value={v.estimatedCost as number} onChange={(x) => f.set('estimatedCost', x)} />
        <MoneyInput label="Chi phí thực tế" value={v.actualCost as number} onChange={(x) => f.set('actualCost', x)} required={completed && !!v.createExpense && !item?.expense} />
        {completed && !item?.expense && (
          <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
            <input type="checkbox" checked={!!v.createExpense} onChange={(e) => f.set('createExpense', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
            Tự động ghi khoản chi “Sửa chữa” với chi phí thực tế vào sổ thu chi
          </label>
        )}
        {item?.expense && <p className="text-sm text-emerald-700 sm:col-span-2">Đã ghi khoản chi {formatMoney(item.expense.amount)} vào sổ thu chi.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function MaintenancePage() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MaintenanceRequest | null | 'new'>(null);
  const [deleting, setDeleting] = useState<MaintenanceRequest | null>(null);
  const { data, meta, loading, error, reload } = useApi<MaintenanceRequest[]>('/maintenance-requests', { status, priority, propertyId, q: dq, page, pageSize: 20 });
  const counts = meta?.summary ?? {};
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const tabs = [{ value: '', label: 'Tất cả', n: Object.values(counts).reduce((a, b) => a + b, 0) }, ...options(MAINTENANCE_STATUS).map((o) => ({ ...o, n: counts[o.value] ?? 0 }))];

  return (
    <>
      <PageHeader title="Yêu cầu sửa chữa" description="Tiếp nhận, phân công và theo dõi chi phí sửa chữa, bảo trì" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Tạo yêu cầu</Button>} />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => reset(setStatus)(t.value)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${status === t.value ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}>
            {t.label} <span className="ml-1 text-xs text-gray-400">{t.n}</span>
          </button>
        ))}
      </div>
      <Card padded={false}>
        <FilterBar>
          <SearchBar value={q} onChange={reset(setQ)} placeholder="Tiêu đề, số phòng…" />
          <FilterDropdown value={priority} onChange={reset(setPriority)} allLabel="Mọi mức ưu tiên" options={options(PRIORITY)} />
          <PropertyFilter value={propertyId} onChange={reset(setPropertyId)} />
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(m) => m.id}
          onRowClick={(m) => setEditing(m)}
          empty={<EmptyState icon={<Wrench className="h-6 w-6" />} title="Không có yêu cầu sửa chữa" />}
          columns={[
            { key: 'title', header: 'Yêu cầu', render: (m) => <><span className="font-medium text-gray-900">{m.title}</span>{m.reportedBy && <span className="block text-xs text-gray-500">Báo bởi: {m.reportedBy}</span>}</> },
            { key: 'room', header: 'Phòng', render: (m) => <>P.{m.room.roomNumber}<span className="block text-xs text-gray-500">{m.room.property.name}</span></> },
            { key: 'priority', header: 'Ưu tiên', render: (m) => <StatusBadge map={PRIORITY} value={m.priority} /> },
            { key: 'date', header: 'Ngày yêu cầu', render: (m) => formatDate(m.requestDate), hideOnMobile: true },
            { key: 'assigned', header: 'Giao cho', render: (m) => m.assignedTo?.fullName ?? '—', hideOnMobile: true },
            { key: 'cost', header: 'Chi phí', align: 'right', render: (m) => (m.actualCost != null ? formatMoney(m.actualCost) : m.estimatedCost != null ? <span className="text-gray-400">~{formatMoney(m.estimatedCost)}</span> : '—'), hideOnMobile: true },
            { key: 'status', header: 'Trạng thái', render: (m) => <StatusBadge map={MAINTENANCE_STATUS} value={m.status} /> },
            {
              key: 'act', header: '', align: 'right', render: (m) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Sửa" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></IconButton>
                  {hasRole('ADMIN', 'LANDLORD') && !m.expense && <IconButton label="Xóa" onClick={() => setDeleting(m)} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton>}
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
      {editing && <MaintenanceForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Xóa yêu cầu sửa chữa"
        message={<>Xóa yêu cầu “{deleting?.title}”?</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/maintenance-requests/${deleting!.id}`);
            toast.success('Đã xóa');
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}
