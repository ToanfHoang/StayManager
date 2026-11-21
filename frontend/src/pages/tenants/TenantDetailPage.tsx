import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Tenant } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { DataTable } from '../../components/ui/DataTable';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatDateTime } from '../../lib/format';
import { CONTRACT_STATUS, GENDER } from '../../lib/labels';
import { TenantForm } from './TenantForm';

export default function TenantDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const { data: t, loading, error, reload } = useApi<Tenant>(`/tenants/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !t) return <LoadingState />;
  if (error || !t) return <ErrorState message={error ?? 'Không tìm thấy'} onRetry={reload} />;
  const current = t.history?.find((h) => !h.leftAt && h.contract.status === 'ACTIVE');

  return (
    <>
      <PageHeader
        title={t.fullName}
        description={current ? <>Đang thuê phòng <Link className="link" to={`/phong/${current.contract.room.id}`}>{current.contract.room.roomNumber}</Link> · {current.contract.room.property.name}</> : 'Hiện không thuê phòng nào'}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Sửa</Button>
            {hasRole('ADMIN', 'LANDLORD') && !t.history?.length && <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>Xóa</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
        <Card>
          <CardHeader title="Thông tin cá nhân" />
          <InfoRow label="Điện thoại"><a className="link" href={`tel:${t.phone}`}>{t.phone}</a></InfoRow>
          <InfoRow label="Email">{t.email || '—'}</InfoRow>
          <InfoRow label="Số CCCD">{t.idNumber || '—'}</InfoRow>
          <InfoRow label="Ngày sinh">{formatDate(t.dateOfBirth)}</InfoRow>
          <InfoRow label="Giới tính">{t.gender ? GENDER[t.gender] : '—'}</InfoRow>
          <InfoRow label="Thường trú">{t.permanentAddress || '—'}</InfoRow>
          <InfoRow label="Ngày tạo hồ sơ">{formatDateTime(t.createdAt)}</InfoRow>
          {t.notes && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{t.notes}</p>}
        </Card>
        </div>
        <Card padded={false} className="lg:col-span-2">
          <div className="p-5 pb-0"><CardHeader title="Lịch sử thuê" subtitle="Các hợp đồng mà người thuê này tham gia" /></div>
          <DataTable
            rows={t.history ?? []}
            rowKey={(h) => h.contractId}
            onRowClick={(h) => nav(`/hop-dong/${h.contractId}`)}
            empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa tham gia hợp đồng nào.</p>}
            columns={[
              { key: 'no', header: 'Hợp đồng', render: (h) => <span className="font-medium text-gray-900">{h.contract.contractNumber}</span> },
              { key: 'room', header: 'Phòng', render: (h) => `P.${h.contract.room.roomNumber} · ${h.contract.room.property.name}` },
              { key: 'time', header: 'Thời gian ở', render: (h) => `${formatDate(h.joinedAt)} → ${h.leftAt ? formatDate(h.leftAt) : 'nay'}` },
              { key: 'role', header: 'Vai trò', render: (h) => (h.isPrimary ? <Badge tone="indigo">Đại diện</Badge> : <Badge>Ở cùng</Badge>), hideOnMobile: true },
              { key: 'status', header: 'Hợp đồng', render: (h) => <StatusBadge map={CONTRACT_STATUS} value={h.contract.status} /> },
            ]}
          />
        </Card>
      </div>
      {editing && <TenantForm tenant={t} onClose={() => setEditing(false)} onSaved={() => reload()} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Xóa người thuê"
        message={<>Xóa hồ sơ <b>{t.fullName}</b>? Thao tác không thể hoàn tác.</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/tenants/${t.id}`);
            toast.success('Đã xóa người thuê');
            nav('/nguoi-thue');
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}
