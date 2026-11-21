import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileSignature, ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Room } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DataTable } from '../../components/ui/DataTable';
import { ConsumptionChart } from '../../components/charts/Charts';
import { formatDate, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { CONTRACT_STATUS, INVOICE_STATUS, ROOM_STATUS } from '../../lib/labels';
import { RoomForm } from './RoomForm';
import { ContractForm } from '../contracts/ContractForm';

export default function RoomDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const { data: room, loading, error, reload } = useApi<Room>(`/rooms/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renting, setRenting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading && !room) return <LoadingState />;
  if (error || !room) return <ErrorState message={error ?? 'Không tìm thấy phòng'} onRetry={reload} />;

  const active = room.activeContract;
  const readings = [...(room.meterReadings ?? [])].reverse();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('images', f));
    setUploading(true);
    try {
      await api.upload(`/rooms/${room.id}/images`, form);
      toast.success('Đã tải ảnh lên');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = async (imageId: number) => {
    try {
      await api.del(`/rooms/${room.id}/images/${imageId}`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={`Phòng ${room.roomNumber}`}
        description={<span className="flex flex-wrap items-center gap-2"><Link to={`/khu-tro/${room.property.id}`} className="link">{room.property.name}</Link><StatusBadge map={ROOM_STATUS} value={room.status} /></span>}
        actions={
          <>
            {room.status === 'AVAILABLE' && <Button icon={<FileSignature className="h-4 w-4" />} onClick={() => setRenting(true)}>Tạo hợp đồng</Button>}
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Sửa</Button>
            {hasRole('ADMIN', 'LANDLORD') && <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>Xóa</Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Thông tin phòng" />
            <InfoRow label="Giá thuê">{formatMoney(room.price)}/tháng</InfoRow>
            <InfoRow label="Tầng">{room.floor === 0 ? 'Trệt' : room.floor}</InfoRow>
            <InfoRow label="Diện tích">{room.area ? `${room.area} m²` : '—'}</InfoRow>
            <InfoRow label="Số người tối đa">{room.maxOccupancy}</InfoRow>
            <InfoRow label="Giá điện / nước">{formatMoney(room.property.electricityPrice)} · {formatMoney(room.property.waterPrice)}</InfoRow>
            {room.description && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{room.description}</p>}
          </Card>

          <Card>
            <CardHeader title="Người đang thuê" action={active && <Link to={`/hop-dong/${active.id}`} className="link text-sm">{active.contractNumber}</Link>} />
            {active ? (
              <>
                <ul className="space-y-3">
                  {active.tenants.filter((t) => !t.leftAt).map((t) => (
                    <li key={t.tenantId} className="flex items-center justify-between gap-2">
                      <div>
                        <Link to={`/nguoi-thue/${t.tenantId}`} className="font-medium text-gray-900 hover:text-primary-700">{t.tenant.fullName}</Link>
                        <p className="text-xs text-gray-500">{t.tenant.phone}</p>
                      </div>
                      {t.isPrimary && <span className="text-xs font-medium text-primary-600">Đại diện</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-600">Hợp đồng: {formatDate(active.startDate)} → {formatDate(active.endDate)}</div>
              </>
            ) : <p className="text-sm text-gray-500">Phòng chưa có người thuê.</p>}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Hình ảnh"
              subtitle="JPG, PNG, WEBP – tối đa 5MB/ảnh"
              action={<Button size="sm" variant="secondary" loading={uploading} icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Tải ảnh lên</Button>}
            />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} />
            {room.images.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {room.images.map((img) => (
                  <div key={img.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
                    <a href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt="" className="h-full w-full object-cover" /></a>
                    <button onClick={() => removeImage(img.id)} className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-gray-600 opacity-0 shadow transition group-hover:opacity-100 hover:text-red-600" aria-label="Xóa ảnh"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">Chưa có ảnh.</p>}
          </Card>

          <Card>
            <CardHeader title="Tiêu thụ điện nước" subtitle="12 kỳ gần nhất" action={<Link to="/dien-nuoc" className="link text-sm">Nhập chỉ số</Link>} />
            {readings.length ? <ConsumptionChart data={readings} height={220} /> : <p className="text-sm text-gray-500">Chưa có chỉ số điện nước.</p>}
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Lịch sử thuê phòng" /></div>
            <DataTable
              rows={room.contracts ?? []}
              rowKey={(c) => c.id}
              onRowClick={(c) => nav(`/hop-dong/${c.id}`)}
              empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có hợp đồng nào.</p>}
              columns={[
                { key: 'no', header: 'Hợp đồng', render: (c) => <span className="font-medium text-gray-900">{c.contractNumber}</span> },
                { key: 'tenants', header: 'Người thuê', render: (c) => c.tenants.map((t) => t.tenant.fullName).join(', ') },
                { key: 'time', header: 'Thời gian', render: (c) => `${formatDate(c.startDate)} → ${formatDate(c.endedAt ?? c.endDate)}`, hideOnMobile: true },
                { key: 'status', header: 'Trạng thái', render: (c) => <StatusBadge map={CONTRACT_STATUS} value={c.status} /> },
              ]}
            />
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Hóa đơn gần đây" /></div>
            <DataTable
              rows={room.invoices ?? []}
              rowKey={(i) => i.id}
              onRowClick={(i) => nav(`/hoa-don/${i.id}`)}
              empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có hóa đơn.</p>}
              columns={[
                { key: 'period', header: 'Kỳ', render: (i) => formatPeriod(i.period) },
                { key: 'total', header: 'Tổng tiền', align: 'right', render: (i) => formatMoney(i.totalAmount) },
                { key: 'paid', header: 'Đã trả', align: 'right', render: (i) => formatMoney(i.paidAmount), hideOnMobile: true },
                { key: 'status', header: 'Trạng thái', render: (i) => <StatusBadge map={INVOICE_STATUS} value={i.status} /> },
              ]}
            />
          </Card>

          {readings.length > 0 && (
            <Card padded={false}>
              <div className="p-5 pb-0"><CardHeader title="Chỉ số điện nước" /></div>
              <DataTable
                rows={[...readings].reverse()}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'p', header: 'Kỳ', render: (r) => formatPeriod(r.period) },
                  { key: 'e', header: 'Điện', render: (r) => `${formatNumber(r.electricityPrev)} → ${formatNumber(r.electricityCurr)} (${formatNumber(r.electricityUsage)} kWh)` },
                  { key: 'w', header: 'Nước', render: (r) => `${formatNumber(r.waterPrev)} → ${formatNumber(r.waterCurr)} (${formatNumber(r.waterUsage)} m³)` },
                  { key: 'c', header: 'Thành tiền', align: 'right', render: (r) => formatMoney(r.electricityCost + r.waterCost), hideOnMobile: true },
                ]}
              />
            </Card>
          )}
        </div>
      </div>

      {editing && <RoomForm room={room} onClose={() => setEditing(false)} onSaved={() => reload()} />}
      {renting && <ContractForm defaultRoom={room} onClose={() => setRenting(false)} onSaved={(c) => nav(`/hop-dong/${c.id}`)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Xóa phòng"
        message={<>Xóa phòng <b>{room.roomNumber}</b>? Chỉ xóa được phòng chưa từng có hợp đồng, hóa đơn hay chỉ số điện nước.</>}
        confirmText="Xóa phòng"
        onConfirm={async () => {
          try {
            await api.del(`/rooms/${room.id}`);
            toast.success('Đã xóa phòng');
            nav('/phong');
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}
