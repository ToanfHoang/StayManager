import { useState } from 'react';
import { AlertTriangle, Gauge, Plug, RefreshCw, Unplug } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Room } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { FormInput } from '../../components/ui/FormInput';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { Badge } from '../../components/ui/StatusBadge';
import { formatDateTime, formatNumber } from '../../lib/format';

interface Account { connected: boolean; phone?: string; autoImport?: boolean; lastSyncAt?: string | null; lastError?: string | null }
interface Meter {
  deviceId: string; name: string; type: string; homeName: string; roomName: string; online: boolean;
  kwhThisMonth: number | null; kwhPrevMonth: number | null; powerW: number | null;
  room: { id: number; roomNumber: string; property: { name: string } } | null;
}

function MetersTable({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Meter[]>('/hunonic/meters');
  const rooms = useApi<Room[]>('/rooms', { pageSize: 200 });
  const [saving, setSaving] = useState<string | null>(null);

  const assign = async (m: Meter, roomId: string) => {
    setSaving(m.deviceId);
    try {
      if (m.room && String(m.room.id) !== roomId) await api.put(`/hunonic/rooms/${m.room.id}/meter`, { deviceId: null });
      if (roomId) await api.put(`/hunonic/rooms/${roomId}/meter`, { deviceId: m.deviceId, meterName: m.name });
      toast.success(roomId ? `Đã gán ${m.name}` : `Đã bỏ gán ${m.name}`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  if (loading && !data) return <LoadingState label="Đang đọc công tơ từ Hunonic…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <p className="px-5 pb-6 text-sm text-gray-500">Tài khoản Hunonic chưa có công tơ điện nào. Hãy chia sẻ nhà có công tơ sang tài khoản này trong app Hunonic.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 text-left">Công tơ (trong app Hunonic)</th>
            <th className="px-3 py-2.5 text-right">Tháng trước</th>
            <th className="px-3 py-2.5 text-right">Tháng này</th>
            <th className="px-3 py-2.5 text-right">Công suất</th>
            <th className="px-4 py-2.5 text-left">Gán cho phòng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((m) => (
            <tr key={m.deviceId}>
              <td className="px-4 py-2.5">
                <span className="font-medium text-gray-900">{m.name}</span> {m.online ? <Badge tone="green">Online</Badge> : <Badge>Offline</Badge>}
                <span className="block text-xs text-gray-500">{[m.homeName, m.roomName].filter(Boolean).join(' · ')}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-medium">{m.kwhPrevMonth !== null ? `${formatNumber(m.kwhPrevMonth)} kWh` : '—'}</td>
              <td className="px-3 py-2.5 text-right">{m.kwhThisMonth !== null ? `${formatNumber(m.kwhThisMonth)} kWh` : '—'}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{m.powerW !== null ? `${formatNumber(m.powerW, 0)} W` : '—'}</td>
              <td className="px-4 py-2.5">
                <select
                  aria-label={`Gán ${m.name} cho phòng`}
                  disabled={!canEdit || saving === m.deviceId}
                  value={m.room ? String(m.room.id) : ''}
                  onChange={(e) => assign(m, e.target.value)}
                  className="h-9 w-48 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                >
                  <option value="">— Chưa gán —</option>
                  {(rooms.data ?? []).map((r) => <option key={r.id} value={r.id}>P.{r.roomNumber} · {r.property.name}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cài đặt → Công tơ Hunonic */
export function HunonicTab() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('LANDLORD');
  const { data: acc, loading, error, reload } = useApi<Account>('/hunonic/account');
  const [form, setForm] = useState({ phone: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading && !acc) return <LoadingState />;
  if (error || !acc) return <ErrorState message={error ?? ''} onRetry={reload} />;

  const connect = async () => {
    if (!form.phone.trim() || !form.password) return toast.error('Nhập số điện thoại và mật khẩu tài khoản Hunonic');
    setSaving(true);
    try {
      const r = await api.put<{ meters: number }>('/hunonic/account', form);
      toast.success(`Đã kết nối – tìm thấy ${r.data.meters} công tơ`);
      setForm({ phone: '', password: '' });
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const toggleAuto = async () => {
    try {
      await api.patch('/hunonic/account', { autoImport: !acc.autoImport });
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={<span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary-500" />Đọc số điện từ công tơ Hunonic ENTEC</span>} subtitle="App đăng nhập vào tài khoản Hunonic để đọc số kWh tháng này / tháng trước của từng công tơ. Chỉ đọc – không bật/tắt thiết bị." />
          {acc.connected ? (
            <>
              <InfoRow label="Tài khoản Hunonic">{acc.phone}</InfoRow>
              <InfoRow label="Đồng bộ gần nhất">{acc.lastSyncAt ? formatDateTime(acc.lastSyncAt) : '—'}</InfoRow>
              <InfoRow label="Tự lấy số đầu tháng">{acc.autoImport ? 'Bật (ngày 1–5, khu chia nước đầu người)' : 'Tắt'}</InfoRow>
              {acc.lastError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Lỗi gần nhất: {acc.lastError}</p>}
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setRefreshKey((k) => k + 1)}>Đọc lại công tơ</Button>
                  <Button size="sm" variant="secondary" onClick={toggleAuto}>{acc.autoImport ? 'Tắt tự lấy số' : 'Bật tự lấy số'}</Button>
                  <Button size="sm" variant="ghost" icon={<Unplug className="h-4 w-4" />} onClick={() => setDisconnecting(true)}>Ngắt kết nối</Button>
                </div>
              )}
            </>
          ) : canEdit ? (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); connect(); }}>
              <FormInput label="Số điện thoại đăng nhập Hunonic" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <FormInput label="Mật khẩu Hunonic" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Được mã hóa trước khi lưu" />
              <div className="sm:col-span-2"><Button type="submit" icon={<Plug className="h-4 w-4" />} loading={saving}>Kết nối</Button></div>
            </form>
          ) : <p className="text-sm text-gray-500">Chỉ chủ trọ mới kết nối được tài khoản Hunonic.</p>}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Lưu ý quan trọng</span>} />
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>Hunonic <b>không có API chính thức</b>. Kết nối này dựa trên dự án cộng đồng (dò ngược app) – có thể <b>ngừng hoạt động</b> khi Hunonic cập nhật. Khi đó bạn vẫn nhập số điện bằng tay như bình thường.</li>
            <li>Chỉ dùng cho mục đích cá nhân với công tơ của bạn; bạn tự cân nhắc điều khoản sử dụng của Hunonic.</li>
            <li>Nên tạo <b>tài khoản Hunonic phụ</b>, rồi trong app Hunonic dùng tài khoản chính <b>chia sẻ nhà</b> (kèm quyền thiết bị) sang tài khoản phụ – để không bị đăng xuất khỏi app trên điện thoại.</li>
            <li>Công tơ chỉ lưu số <b>tháng này</b> và <b>tháng trước</b>, nên hãy lấy số trước khi sang tháng tiếp theo.</li>
          </ul>
        </Card>
      </div>
      {acc.connected && (
        <Card padded={false}>
          <div className="p-5 pb-3"><h3 className="text-base font-semibold text-gray-900">Công tơ & phòng</h3><p className="text-sm text-gray-500">Gán mỗi công tơ cho đúng phòng để app lấy số điện tự động.</p></div>
          <MetersTable key={refreshKey} canEdit={hasRole('LANDLORD', 'ADMIN')} />
        </Card>
      )}
      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        title="Ngắt kết nối Hunonic"
        message="Thông tin đăng nhập Hunonic sẽ bị xóa khỏi app. Việc gán công tơ cho phòng vẫn được giữ."
        confirmText="Ngắt kết nối"
        onConfirm={async () => {
          try {
            await api.del('/hunonic/account');
            toast.success('Đã ngắt kết nối');
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}
