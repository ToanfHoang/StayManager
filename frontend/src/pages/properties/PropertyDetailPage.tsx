import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Property, Service } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { Badge } from '../../components/ui/StatusBadge';
import { DataTable } from '../../components/ui/DataTable';
import { FormInput, MoneyInput, Select } from '../../components/ui/FormInput';
import { formatDateTime, formatMoney } from '../../lib/format';
import { options, SERVICE_TYPE, SERVICE_UNIT } from '../../lib/labels';
import { PropertyForm } from './PropertyForm';

function ServiceForm({ propertyId, service, onClose, onSaved }: { propertyId: number; service: Service | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: service?.name ?? '', type: service?.type ?? 'INTERNET', unit: service?.unit ?? 'PER_ROOM', price: service?.price ?? ('' as number | ''), isActive: service?.isActive ?? true });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!v.name.trim() || v.price === '') return toast.error('Vui lòng nhập tên dịch vụ và đơn giá');
    setSaving(true);
    try {
      if (service) await api.put(`/services/${service.id}`, v);
      else await api.post(`/properties/${propertyId}/services`, v);
      toast.success('Đã lưu dịch vụ');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={service ? 'Sửa dịch vụ' : 'Thêm dịch vụ'} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={saving} onClick={save}>Lưu</Button></>}>
      <div className="space-y-4">
        <FormInput label="Tên dịch vụ" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="VD: Internet cáp quang" />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Loại" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as Service['type'] })} options={options(SERVICE_TYPE)} />
          <Select label="Cách tính" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as Service['unit'] })} options={options(SERVICE_UNIT)} />
        </div>
        <MoneyInput label="Đơn giá / tháng" required value={v.price} onChange={(x) => setV({ ...v, price: x })} />
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Đang áp dụng (tự thêm vào hóa đơn)</label>
      </div>
    </Modal>
  );
}

export default function PropertyDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'LANDLORD');
  const { data: p, loading, error, reload } = useApi<Property>(`/properties/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [service, setService] = useState<Service | null | 'new'>(null);
  const [removeService, setRemoveService] = useState<Service | null>(null);

  if (loading && !p) return <LoadingState />;
  if (error || !p) return <ErrorState message={error ?? 'Không tìm thấy'} onRetry={reload} />;
  const s = p.stats!;

  return (
    <>
      <PageHeader
        title={p.name}
        description={p.address}
        actions={
          <>
            <Link to={`/phong?propertyId=${p.id}`}><Button variant="secondary" icon={<DoorOpen className="h-4 w-4" />}>Xem phòng</Button></Link>
            {canEdit && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Sửa</Button>}
            {canEdit && <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>Xóa</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Thông tin khu trọ" />
          <InfoRow label="Số tầng">{p.floors}</InfoRow>
          <InfoRow label="Người liên hệ">{p.contactName || '—'}</InfoRow>
          <InfoRow label="SĐT liên hệ">{p.contactPhone || '—'}</InfoRow>
          <InfoRow label="Giá điện">{formatMoney(p.electricityPrice)}/kWh</InfoRow>
          <InfoRow label="Tiền nước">{p.waterMode === 'SPLIT_PER_PERSON' ? 'Chia tổng tiền nước theo đầu người' : `${formatMoney(p.waterPrice)}/m³`}</InfoRow>
          {p.owner && <InfoRow label="Chủ trọ">{p.owner.fullName}</InfoRow>}
          <InfoRow label="Ngày tạo">{formatDateTime(p.createdAt)}</InfoRow>
          {p.description && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{p.description}</p>}
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Tổng phòng', s.total, 'text-gray-900'],
              ['Đang thuê', s.occupied, 'text-primary-600'],
              ['Còn trống', s.available, 'text-emerald-600'],
              ['Bảo trì', s.maintenance, 'text-amber-600'],
            ].map(([l, n, c]) => (
              <Card key={l as string} className="text-center"><p className="text-sm text-gray-500">{l}</p><p className={`mt-1 text-2xl font-semibold ${c}`}>{n}</p></Card>
            ))}
          </div>
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Dịch vụ & phí cố định" subtitle="Tự động thêm vào hóa đơn hằng tháng của mọi phòng trong khu" action={canEdit && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setService('new')}>Thêm dịch vụ</Button>} />
            </div>
            <DataTable
              rows={p.services ?? []}
              rowKey={(r) => r.id}
              empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có dịch vụ. Ví dụ: Internet, gửi xe, vệ sinh…</p>}
              columns={[
                { key: 'name', header: 'Dịch vụ', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
                { key: 'type', header: 'Loại', render: (r) => SERVICE_TYPE[r.type], hideOnMobile: true },
                { key: 'unit', header: 'Cách tính', render: (r) => SERVICE_UNIT[r.unit] },
                { key: 'price', header: 'Đơn giá', align: 'right', render: (r) => formatMoney(r.price) },
                { key: 'active', header: 'Trạng thái', render: (r) => (r.isActive ? <Badge tone="green">Áp dụng</Badge> : <Badge>Tạm ngưng</Badge>) },
                {
                  key: 'act', header: '', align: 'right', render: (r) => canEdit && (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Sửa" onClick={() => setService(r)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Xóa" onClick={() => setRemoveService(r)} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      {editing && <PropertyForm open property={p} onClose={() => setEditing(false)} onSaved={() => reload()} />}
      {service && <ServiceForm propertyId={p.id} service={service === 'new' ? null : service} onClose={() => setService(null)} onSaved={reload} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Xóa khu trọ"
        message={<>Bạn chắc chắn muốn xóa <b>{p.name}</b>? Chỉ xóa được khi khu trọ không còn phòng và chưa có khoản thu chi.</>}
        confirmText="Xóa khu trọ"
        onConfirm={async () => {
          try {
            await api.del(`/properties/${p.id}`);
            toast.success('Đã xóa khu trọ');
            nav('/khu-tro');
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={!!removeService}
        onClose={() => setRemoveService(null)}
        title="Xóa dịch vụ"
        message={<>Xóa dịch vụ <b>{removeService?.name}</b>? Hóa đơn đã lập không bị ảnh hưởng.</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/services/${removeService!.id}`);
            toast.success('Đã xóa dịch vụ');
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
