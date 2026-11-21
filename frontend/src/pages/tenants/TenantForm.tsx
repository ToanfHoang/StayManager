import { api } from '../../api/client';
import type { Tenant } from '../../api/types';
import { useForm } from '../../hooks/useForm';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tenantSchema } from '../../lib/schemas';
import { dateInput, todayStr } from '../../lib/format';
import { GENDER, options } from '../../lib/labels';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { DatePicker, FormInput, Select, Textarea } from '../../components/ui/FormInput';
import { OwnerSelect } from '../../components/shared/OwnerSelect';

export function TenantForm({ tenant, onClose, onSaved }: { tenant?: Tenant | null; onClose: () => void; onSaved: (t: Tenant) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const f = useForm(
    {
      fullName: tenant?.fullName ?? '',
      phone: tenant?.phone ?? '',
      email: tenant?.email ?? '',
      idNumber: tenant?.idNumber ?? '',
      dateOfBirth: dateInput(tenant?.dateOfBirth),
      gender: tenant?.gender ?? '',
      permanentAddress: tenant?.permanentAddress ?? '',
      notes: tenant?.notes ?? '',
      ownerId: '',
    } as Record<string, unknown>,
    tenantSchema,
  );
  const v = f.values as Record<string, string>;

  const save = () =>
    f.submit(async (values) => {
      const res = tenant ? await api.put<Tenant>(`/tenants/${tenant.id}`, values) : await api.post<Tenant>('/tenants', values);
      toast.success(tenant ? 'Đã cập nhật người thuê' : 'Đã thêm người thuê');
      onSaved(res.data);
      onClose();
    });

  return (
    <Modal open onClose={onClose} size="lg" title={tenant ? 'Sửa thông tin người thuê' : 'Thêm người thuê'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!tenant && <OwnerSelect value={v.ownerId} onChange={(x) => f.set('ownerId', x)} error={f.errors.ownerId} />}
        <FormInput label="Họ và tên" required value={v.fullName} onChange={(e) => f.set('fullName', e.target.value)} error={f.errors.fullName} wrapperClassName="sm:col-span-2" />
        <FormInput label="Số điện thoại" type="tel" required value={v.phone} onChange={(e) => f.set('phone', e.target.value)} error={f.errors.phone} />
        <FormInput label="Email" type="email" value={v.email} onChange={(e) => f.set('email', e.target.value)} error={f.errors.email} />
        <FormInput
          label="Số CCCD / CMND"
          value={v.idNumber}
          onChange={(e) => f.set('idNumber', e.target.value)}
          error={f.errors.idNumber}
          disabled={user?.role === 'STAFF' && !!tenant?.idNumber}
          hint={user?.role === 'STAFF' && tenant?.idNumber ? 'Nhân viên không được xem/sửa CCCD đầy đủ' : undefined}
        />
        <DatePicker label="Ngày sinh" value={v.dateOfBirth} max={todayStr()} onChange={(x) => f.set('dateOfBirth', x)} error={f.errors.dateOfBirth} />
        <Select label="Giới tính" value={v.gender} onChange={(e) => f.set('gender', e.target.value)} options={options(GENDER)} placeholder="— Chọn —" />
        <FormInput label="Địa chỉ thường trú" value={v.permanentAddress} onChange={(e) => f.set('permanentAddress', e.target.value)} />
        <Textarea label="Ghi chú" value={v.notes} onChange={(e) => f.set('notes', e.target.value)} wrapperClassName="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
