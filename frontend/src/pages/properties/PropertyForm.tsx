import { api } from '../../api/client';
import type { Property } from '../../api/types';
import { useForm } from '../../hooks/useForm';
import { useToast } from '../../context/ToastContext';
import { propertySchema } from '../../lib/schemas';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';
import { OwnerSelect } from '../../components/shared/OwnerSelect';

export function PropertyForm({ open, onClose, property, onSaved }: { open: boolean; onClose: () => void; property?: Property | null; onSaved: (p: Property) => void }) {
  const toast = useToast();
  const f = useForm(
    {
      name: property?.name ?? '',
      address: property?.address ?? '',
      description: property?.description ?? '',
      floors: property?.floors ?? 1,
      contactName: property?.contactName ?? '',
      contactPhone: property?.contactPhone ?? '',
      electricityPrice: property?.electricityPrice ?? 3500,
      waterPrice: property?.waterPrice ?? 20000,
      waterMode: property?.waterMode ?? 'METER',
      ownerId: '' as string,
    } as Record<string, unknown>,
    propertySchema,
  );
  const v = f.values as Record<string, string | number>;

  const save = () =>
    f.submit(async (values) => {
      const res = property ? await api.put<Property>(`/properties/${property.id}`, values) : await api.post<Property>('/properties', values);
      toast.success(property ? 'Đã cập nhật khu trọ' : 'Đã tạo khu trọ mới');
      onSaved(res.data);
      onClose();
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={property ? 'Sửa thông tin khu trọ' : 'Thêm khu trọ'}
      footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!property && <OwnerSelect value={v.ownerId} onChange={(x) => f.set('ownerId', x)} error={f.errors.ownerId} />}
        <FormInput label="Tên khu trọ" required value={v.name} onChange={(e) => f.set('name', e.target.value)} error={f.errors.name} placeholder="VD: Nhà trọ Hoa Mai" wrapperClassName="sm:col-span-2" />
        <FormInput label="Địa chỉ" required value={v.address} onChange={(e) => f.set('address', e.target.value)} error={f.errors.address} wrapperClassName="sm:col-span-2" />
        <FormInput label="Số tầng" type="number" min={1} required value={v.floors} onChange={(e) => f.set('floors', e.target.value)} error={f.errors.floors} />
        <div />
        <FormInput label="Người liên hệ" value={v.contactName} onChange={(e) => f.set('contactName', e.target.value)} error={f.errors.contactName} />
        <FormInput label="SĐT liên hệ" type="tel" value={v.contactPhone} onChange={(e) => f.set('contactPhone', e.target.value)} error={f.errors.contactPhone} />
        <MoneyInput label="Giá điện (đ/kWh)" required value={v.electricityPrice} onChange={(x) => f.set('electricityPrice', x)} error={f.errors.electricityPrice} hint="Áp dụng khi nhập chỉ số mới" />
        <Select
          label="Cách tính tiền nước"
          value={v.waterMode}
          onChange={(e) => f.set('waterMode', e.target.value)}
          options={[{ value: 'METER', label: 'Theo đồng hồ nước từng phòng' }, { value: 'SPLIT_PER_PERSON', label: 'Chia tổng tiền nước của dãy theo đầu người' }]}
          hint={v.waterMode === 'SPLIT_PER_PERSON' ? 'Mỗi tháng nhập tổng tiền nước khi lập hóa đơn' : undefined}
        />
        {v.waterMode === 'METER' ? (
          <MoneyInput label="Giá nước (đ/m³)" required value={v.waterPrice} onChange={(x) => f.set('waterPrice', x)} error={f.errors.waterPrice} />
        ) : <div />}
        <Textarea label="Mô tả" value={v.description} onChange={(e) => f.set('description', e.target.value)} wrapperClassName="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
