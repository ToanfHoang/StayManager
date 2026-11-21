import { useState } from 'react';
import { Check, Search, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import type { Contract, Room, Tenant } from '../../api/types';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useForm } from '../../hooks/useForm';
import { useToast } from '../../context/ToastContext';
import { contractSchema } from '../../lib/schemas';
import { addDaysStr, addYearsStr, formatMoney, todayStr } from '../../lib/format';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { DatePicker, Field, FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';
import { TenantForm } from '../tenants/TenantForm';

export const DEFAULT_TERMS = `1. Bên thuê thanh toán tiền phòng và các chi phí phát sinh đúng hạn hằng tháng.
2. Bên thuê giữ gìn tài sản, không tự ý sửa chữa, cải tạo phòng khi chưa được bên cho thuê đồng ý.
3. Bên thuê chấp hành quy định về an ninh trật tự, phòng cháy chữa cháy và đăng ký tạm trú theo quy định.
4. Bên nào muốn chấm dứt hợp đồng trước hạn phải báo trước ít nhất 30 ngày.
5. Tiền cọc được hoàn trả khi kết thúc hợp đồng sau khi trừ các khoản còn nợ và chi phí hư hỏng (nếu có).`;

/** Chọn nhiều người thuê (chỉ người đang không thuê phòng khác) */
function TenantPicker({ selected, onChange, primaryId, onPrimary, max, error }: { selected: Tenant[]; onChange: (t: Tenant[]) => void; primaryId?: number; onPrimary: (id: number) => void; max: number; error?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [creating, setCreating] = useState(false);
  const { data, loading } = useApi<Tenant[]>('/tenants', { q: dq, pageSize: 8 });
  const toggle = (t: Tenant) => {
    if (selected.some((s) => s.id === t.id)) onChange(selected.filter((s) => s.id !== t.id));
    else if (selected.length < max) onChange([...selected, t]);
  };
  return (
    <Field label={`Người thuê (tối đa ${max} người)`} required error={error} className="sm:col-span-2">
      {() => (
        <div className="rounded-lg border border-gray-300">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3">
              {selected.map((t) => (
                <span key={t.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${primaryId === t.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {t.fullName}
                  <button type="button" onClick={() => onPrimary(t.id)} className="text-xs underline opacity-80" title="Đặt làm người đại diện">{primaryId === t.id ? 'đại diện' : 'chọn đại diện'}</button>
                  <button type="button" onClick={() => toggle(t)} className="opacity-70 hover:opacity-100" aria-label="Bỏ chọn">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-gray-200 px-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người thuê theo tên / SĐT…" className="h-10 flex-1 border-0 text-sm focus:outline-none focus:ring-0" />
            <Button size="sm" variant="ghost" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Tạo mới</Button>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {loading && !data ? <li className="px-3 py-3 text-sm text-gray-500">Đang tải…</li> : !data?.length ? <li className="px-3 py-3 text-sm text-gray-500">Không tìm thấy người thuê</li> : data.map((t) => {
              const busy = !!t.currentContract;
              const checked = selected.some((s) => s.id === t.id);
              return (
                <li key={t.id}>
                  <button type="button" disabled={busy} onClick={() => toggle(t)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <span><span className="font-medium text-gray-900">{t.fullName}</span> <span className="text-gray-500">· {t.phone}</span>{busy && <span className="ml-1 text-xs text-amber-600">(đang thuê P.{t.currentContract!.room.roomNumber})</span>}</span>
                    {checked && <Check className="h-4 w-4 text-primary-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {creating && <TenantForm onClose={() => setCreating(false)} onSaved={(t) => { if (selected.length < max) onChange([...selected, t]); }} />}
        </div>
      )}
    </Field>
  );
}

export function ContractForm({ defaultRoom, onClose, onSaved }: { defaultRoom?: Room | null; onClose: () => void; onSaved: (c: Contract) => void }) {
  const toast = useToast();
  const { data: rooms } = useApi<Room[]>(defaultRoom ? null : '/rooms', { status: 'AVAILABLE', pageSize: 200 });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [primaryId, setPrimaryId] = useState<number>();
  const start = todayStr();
  const f = useForm(
    {
      roomId: defaultRoom ? String(defaultRoom.id) : '',
      tenantIds: [] as number[],
      contractNumber: '',
      startDate: start,
      endDate: addDaysStr(addYearsStr(start, 1), -1),
      rentPrice: defaultRoom?.price ?? ('' as number | ''),
      deposit: defaultRoom?.price ?? ('' as number | ''),
      paymentDueDay: 5,
      terms: DEFAULT_TERMS,
      notes: '',
    } as Record<string, unknown>,
    contractSchema,
  );
  const v = f.values as Record<string, string | number>;
  const room = defaultRoom ?? rooms?.find((r) => String(r.id) === String(v.roomId));

  const setTenantList = (list: Tenant[]) => {
    setTenants(list);
    f.set('tenantIds', list.map((t) => t.id));
    if (!list.some((t) => t.id === primaryId)) setPrimaryId(list[0]?.id);
  };

  const save = () =>
    f.submit(async (values) => {
      const res = await api.post<Contract>('/contracts', { ...values, primaryTenantId: primaryId });
      toast.success(`Đã tạo hợp đồng ${res.data.contractNumber}`);
      onSaved(res.data);
      onClose();
    });

  return (
    <Modal open onClose={onClose} size="lg" title="Tạo hợp đồng thuê" description={room ? `Phòng ${room.roomNumber} · ${room.property.name}` : undefined} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Tạo hợp đồng</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!defaultRoom && (
          <Select
            label="Phòng (còn trống)"
            required
            value={v.roomId}
            onChange={(e) => {
              f.set('roomId', e.target.value);
              const r = rooms?.find((x) => String(x.id) === e.target.value);
              if (r) { f.set('rentPrice', r.price); f.set('deposit', r.price); }
            }}
            options={(rooms ?? []).map((r) => ({ value: r.id, label: `P.${r.roomNumber} · ${r.property.name} · ${formatMoney(r.price)}` }))}
            placeholder={rooms && !rooms.length ? 'Không có phòng trống' : '— Chọn phòng —'}
            error={f.errors.roomId}
            wrapperClassName="sm:col-span-2"
          />
        )}
        <TenantPicker selected={tenants} onChange={setTenantList} primaryId={primaryId} onPrimary={setPrimaryId} max={room?.maxOccupancy ?? 10} error={f.errors.tenantIds} />
        <DatePicker label="Ngày bắt đầu" required value={String(v.startDate)} onChange={(x) => f.set('startDate', x)} error={f.errors.startDate} />
        <DatePicker label="Ngày kết thúc" required value={String(v.endDate)} min={String(v.startDate)} onChange={(x) => f.set('endDate', x)} error={f.errors.endDate} />
        <MoneyInput label="Giá thuê / tháng" required value={v.rentPrice} onChange={(x) => f.set('rentPrice', x)} error={f.errors.rentPrice} />
        <MoneyInput label="Tiền đặt cọc" value={v.deposit} onChange={(x) => f.set('deposit', x)} error={f.errors.deposit} />
        <FormInput label="Hạn thanh toán (ngày trong tháng)" type="number" min={1} max={28} required value={v.paymentDueDay} onChange={(e) => f.set('paymentDueDay', e.target.value)} error={f.errors.paymentDueDay} hint="Hóa đơn tháng M phải trả trước ngày này của tháng M+1" />
        <FormInput label="Số hợp đồng" value={v.contractNumber} onChange={(e) => f.set('contractNumber', e.target.value)} error={f.errors.contractNumber} hint="Để trống để hệ thống tự sinh" />
        <Textarea label="Điều khoản" rows={6} value={v.terms} onChange={(e) => f.set('terms', e.target.value)} wrapperClassName="sm:col-span-2" />
        <Textarea label="Ghi chú" rows={2} value={v.notes} onChange={(e) => f.set('notes', e.target.value)} wrapperClassName="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
