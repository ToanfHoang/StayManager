import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, Pencil, Printer, UserMinus, UserPlus, XCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Contract, Tenant } from '../../api/types';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { DataTable } from '../../components/ui/DataTable';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { DatePicker, FormInput, MoneyInput, Textarea } from '../../components/ui/FormInput';
import { SearchBar } from '../../components/ui/Filters';
import { addYearsStr, dateInput, formatDate, formatMoney, formatPeriod, todayStr } from '../../lib/format';
import { CONTRACT_STATUS, INVOICE_STATUS } from '../../lib/labels';
import { ExpiryHint } from './ContractsPage';

type Dialog = null | 'edit' | 'renew' | 'terminate' | 'addTenant';

export default function ContractDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: c, loading, error, reload } = useApi<Contract>(`/contracts/${id}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [removeTenant, setRemoveTenant] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const candidates = useApi<Tenant[]>(dialog === 'addTenant' ? '/tenants' : null, { q: dq, pageSize: 8 });

  if (loading && !c) return <LoadingState />;
  if (error || !c) return <ErrorState message={error ?? 'Không tìm thấy hợp đồng'} onRetry={reload} />;
  const active = c.status === 'ACTIVE';
  const currentTenants = c.tenants?.filter((t) => !t.leftAt) ?? [];
  const outstanding = (c.invoices ?? []).filter((i) => i.status === 'UNPAID' || i.status === 'PARTIALLY_PAID').reduce((a, i) => a + i.totalAmount - i.paidAmount, 0);

  const open = (d: Dialog) => {
    if (d === 'edit') setForm({ rentPrice: c.rentPrice, deposit: c.deposit, paymentDueDay: c.paymentDueDay, endDate: dateInput(c.endDate), terms: c.terms ?? '', notes: c.notes ?? '' });
    if (d === 'renew') setForm({ newEndDate: addYearsStr(dateInput(c.endDate), 1), rentPrice: c.rentPrice, note: '' });
    if (d === 'terminate') setForm({ endDate: todayStr(), reason: '' });
    setDialog(d);
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(msg);
      setDialog(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const footer = (onSave: () => void, text = 'Lưu', danger = false) => (
    <><Button variant="secondary" onClick={() => setDialog(null)}>Hủy</Button><Button variant={danger ? 'danger' : 'primary'} loading={saving} onClick={onSave}>{text}</Button></>
  );

  return (
    <>
      <PageHeader
        title={`Hợp đồng ${c.contractNumber}`}
        description={<span className="flex flex-wrap items-center gap-2">Phòng <Link to={`/phong/${c.room?.id}`} className="link">{c.room?.roomNumber}</Link> · {c.room?.property.name} <StatusBadge map={CONTRACT_STATUS} value={c.status} /></span>}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/in/hop-dong/${c.id}`, '_blank')}>In / PDF</Button>
            {active && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => open('edit')}>Sửa</Button>}
            {active && <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => open('renew')}>Gia hạn</Button>}
            {active && <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => open('terminate')}>Kết thúc</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Thông tin hợp đồng" />
          <InfoRow label="Ngày bắt đầu">{formatDate(c.startDate)}</InfoRow>
          <InfoRow label="Ngày kết thúc"><>{formatDate(c.endDate)}<ExpiryHint c={c} /></></InfoRow>
          {c.endedAt && <InfoRow label="Ngày kết thúc thực tế">{formatDate(c.endedAt)}</InfoRow>}
          {c.endReason && <InfoRow label="Lý do kết thúc">{c.endReason}</InfoRow>}
          <InfoRow label="Giá thuê">{formatMoney(c.rentPrice)}/tháng</InfoRow>
          <InfoRow label="Tiền cọc">{formatMoney(c.deposit)}</InfoRow>
          <InfoRow label="Hạn thanh toán">Ngày {c.paymentDueDay} hằng tháng</InfoRow>
          <InfoRow label="Công nợ hiện tại"><span className={outstanding ? 'text-red-600' : ''}>{formatMoney(outstanding)}</span></InfoRow>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Người thuê" subtitle={`${currentTenants.length}/${c.room?.maxOccupancy ?? '?'} người đang ở`} action={active && <Button size="sm" variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => { setQ(''); setDialog('addTenant'); }}>Thêm người</Button>} />
            </div>
            <DataTable
              rows={c.tenants ?? []}
              rowKey={(t) => t.tenantId}
              columns={[
                { key: 'name', header: 'Họ tên', render: (t) => <Link to={`/nguoi-thue/${t.tenantId}`} className="font-medium text-gray-900 hover:text-primary-700">{t.tenant.fullName}</Link> },
                { key: 'phone', header: 'Điện thoại', render: (t) => t.tenant.phone },
                { key: 'id', header: 'CCCD', render: (t) => t.tenant.idNumber ?? '—', hideOnMobile: true },
                { key: 'time', header: 'Thời gian ở', render: (t) => `${formatDate(t.joinedAt)} → ${t.leftAt ? formatDate(t.leftAt) : 'nay'}`, hideOnMobile: true },
                { key: 'role', header: '', render: (t) => (t.isPrimary ? <Badge tone="indigo">Đại diện</Badge> : t.leftAt ? <Badge>Đã rời</Badge> : null) },
                { key: 'act', header: '', align: 'right', render: (t) => active && !t.leftAt && currentTenants.length > 1 && <IconButton label="Rời phòng" onClick={() => setRemoveTenant(t.tenantId)} className="hover:text-red-600"><UserMinus className="h-4 w-4" /></IconButton> },
              ]}
            />
          </Card>
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Hóa đơn theo hợp đồng" /></div>
            <DataTable
              rows={c.invoices ?? []}
              rowKey={(i) => i.id}
              onRowClick={(i) => nav(`/hoa-don/${i.id}`)}
              empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có hóa đơn.</p>}
              columns={[
                { key: 'no', header: 'Số hóa đơn', render: (i) => i.invoiceNumber, hideOnMobile: true },
                { key: 'p', header: 'Kỳ', render: (i) => formatPeriod(i.period) },
                { key: 't', header: 'Tổng tiền', align: 'right', render: (i) => formatMoney(i.totalAmount) },
                { key: 'b', header: 'Còn nợ', align: 'right', render: (i) => (i.status === 'CANCELLED' ? '—' : formatMoney(i.totalAmount - i.paidAmount)) },
                { key: 's', header: 'Trạng thái', render: (i) => <StatusBadge map={INVOICE_STATUS} value={i.status} /> },
              ]}
            />
          </Card>
          {(c.terms || c.notes) && (
            <Card>
              {c.terms && <><CardHeader title="Điều khoản" /><p className="whitespace-pre-line text-sm text-gray-700">{c.terms}</p></>}
              {c.notes && <><h4 className="mb-2 mt-5 text-sm font-semibold text-gray-900">Ghi chú</h4><p className="whitespace-pre-line text-sm text-gray-600">{c.notes}</p></>}
            </Card>
          )}
        </div>
      </div>

      <Modal open={dialog === 'edit'} onClose={() => setDialog(null)} title="Sửa hợp đồng" size="lg" footer={footer(() => run(() => api.put(`/contracts/${c.id}`, form), 'Đã cập nhật hợp đồng'))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Giá thuê / tháng" value={form.rentPrice} onChange={(x) => setForm({ ...form, rentPrice: x })} />
          <MoneyInput label="Tiền cọc" value={form.deposit} onChange={(x) => setForm({ ...form, deposit: x })} />
          <FormInput label="Hạn thanh toán (ngày)" type="number" min={1} max={28} value={form.paymentDueDay ?? ''} onChange={(e) => setForm({ ...form, paymentDueDay: e.target.value })} />
          <DatePicker label="Ngày kết thúc" value={String(form.endDate ?? '')} onChange={(x) => setForm({ ...form, endDate: x })} />
          <Textarea label="Điều khoản" rows={6} value={String(form.terms ?? '')} onChange={(e) => setForm({ ...form, terms: e.target.value })} wrapperClassName="sm:col-span-2" />
          <Textarea label="Ghi chú" value={String(form.notes ?? '')} onChange={(e) => setForm({ ...form, notes: e.target.value })} wrapperClassName="sm:col-span-2" />
        </div>
      </Modal>

      <Modal open={dialog === 'renew'} onClose={() => setDialog(null)} title="Gia hạn hợp đồng" size="sm" description={`Hết hạn hiện tại: ${formatDate(c.endDate)}`} footer={footer(() => run(() => api.post(`/contracts/${c.id}/renew`, form), 'Đã gia hạn hợp đồng'), 'Gia hạn')}>
        <div className="space-y-4">
          <DatePicker label="Ngày hết hạn mới" required value={String(form.newEndDate ?? '')} min={dateInput(c.endDate)} onChange={(x) => setForm({ ...form, newEndDate: x })} />
          <MoneyInput label="Giá thuê mới" value={form.rentPrice} onChange={(x) => setForm({ ...form, rentPrice: x })} hint="Áp dụng cho các hóa đơn lập sau khi gia hạn" />
          <Textarea label="Ghi chú" rows={2} value={String(form.note ?? '')} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </Modal>

      <Modal open={dialog === 'terminate'} onClose={() => setDialog(null)} title="Kết thúc hợp đồng" size="sm" footer={footer(() => run(() => api.post(`/contracts/${c.id}/terminate`, form), 'Đã kết thúc hợp đồng – phòng chuyển về trạng thái trống'), 'Kết thúc hợp đồng', true)}>
        <div className="space-y-4">
          {outstanding > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Hợp đồng còn nợ <b>{formatMoney(outstanding)}</b>. Hãy lập hóa đơn tháng cuối và thu đủ trước khi kết thúc (nếu cần).</p>}
          <DatePicker label="Ngày kết thúc" required value={String(form.endDate ?? '')} onChange={(x) => setForm({ ...form, endDate: x })} hint="Trước ngày hết hạn → “Chấm dứt”; từ ngày hết hạn trở đi → “Hết hạn”" />
          <Textarea label="Lý do" rows={2} value={String(form.reason ?? '')} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>

      <Modal open={dialog === 'addTenant'} onClose={() => setDialog(null)} title="Thêm người vào hợp đồng" size="md">
        <SearchBar value={q} onChange={setQ} placeholder="Tìm người thuê…" className="sm:w-full" />
        <ul className="mt-3 divide-y divide-gray-100">
          {(candidates.data ?? []).map((t) => {
            const busy = !!t.currentContract;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-sm"><span className="font-medium text-gray-900">{t.fullName}</span> <span className="text-gray-500">· {t.phone}</span>{busy && <span className="block text-xs text-amber-600">Đang thuê P.{t.currentContract!.room.roomNumber}</span>}</span>
                <Button size="sm" disabled={busy || saving} onClick={() => run(() => api.post(`/contracts/${c.id}/tenants`, { tenantId: t.id }), `Đã thêm ${t.fullName}`)}>Thêm</Button>
              </li>
            );
          })}
          {!candidates.loading && !candidates.data?.length && <li className="py-6 text-center text-sm text-gray-500">Không tìm thấy. Hãy tạo hồ sơ ở mục Người thuê.</li>}
        </ul>
      </Modal>

      <ConfirmDialog
        open={removeTenant !== null}
        onClose={() => setRemoveTenant(null)}
        title="Người thuê rời phòng"
        message="Người này sẽ được ghi nhận rời phòng từ hôm nay. Hợp đồng vẫn tiếp tục với những người còn lại."
        confirmText="Xác nhận"
        onConfirm={async () => {
          try {
            await api.del(`/contracts/${c.id}/tenants/${removeTenant}`);
            toast.success('Đã cập nhật');
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
