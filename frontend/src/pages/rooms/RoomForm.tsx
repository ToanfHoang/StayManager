import { api } from '../../api/client';
import type { Room } from '../../api/types';
import { useForm } from '../../hooks/useForm';
import { useToast } from '../../context/ToastContext';
import { roomSchema } from '../../lib/schemas';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';
import { useProperties } from '../../components/ui/Filters';

export function RoomForm({ room, defaultPropertyId, onClose, onSaved }: { room?: Room | null; defaultPropertyId?: string; onClose: () => void; onSaved: (r: Room) => void }) {
  const toast = useToast();
  const { options } = useProperties();
  const f = useForm(
    {
      propertyId: String(room?.propertyId ?? defaultPropertyId ?? ''),
      roomNumber: room?.roomNumber ?? '',
      floor: room?.floor ?? 1,
      area: room?.area ?? '',
      price: room?.price ?? ('' as number | ''),
      maxOccupancy: room?.maxOccupancy ?? 2,
      description: room?.description ?? '',
      status: room?.status ?? 'AVAILABLE',
    } as Record<string, unknown>,
    roomSchema,
  );
  const v = f.values as Record<string, string | number>;
  const occupied = room?.status === 'OCCUPIED';

  const save = () =>
    f.submit(async (values) => {
      const body = { ...values, status: occupied ? undefined : values.status };
      const res = room ? await api.put<Room>(`/rooms/${room.id}`, body) : await api.post<Room>('/rooms', body);
      toast.success(room ? 'Đã cập nhật phòng' : 'Đã thêm phòng');
      onSaved(res.data);
      onClose();
    });

  return (
    <Modal open onClose={onClose} size="lg" title={room ? `Sửa phòng ${room.roomNumber}` : 'Thêm phòng'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Select label="Khu trọ" required value={v.propertyId} onChange={(e) => f.set('propertyId', e.target.value)} options={options} placeholder="— Chọn khu trọ —" error={f.errors.propertyId} disabled={occupied} hint={occupied ? 'Phòng đang thuê không thể chuyển khu' : undefined} />
        <FormInput label="Số phòng" required value={v.roomNumber} onChange={(e) => f.set('roomNumber', e.target.value)} error={f.errors.roomNumber} placeholder="VD: 101, A2…" />
        <FormInput label="Tầng" type="number" min={0} required value={v.floor} onChange={(e) => f.set('floor', e.target.value)} error={f.errors.floor} />
        <FormInput label="Diện tích" type="number" min={0} step="0.1" suffix="m²" value={v.area} onChange={(e) => f.set('area', e.target.value)} error={f.errors.area} />
        <MoneyInput label="Giá thuê / tháng" required value={v.price} onChange={(x) => f.set('price', x)} error={f.errors.price} />
        <FormInput label="Số người tối đa" type="number" min={1} required value={v.maxOccupancy} onChange={(e) => f.set('maxOccupancy', e.target.value)} error={f.errors.maxOccupancy} />
        {occupied ? (
          <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700 sm:col-span-2">Phòng đang có hợp đồng hiệu lực – trạng thái sẽ tự chuyển về “Còn trống” khi kết thúc hợp đồng.</p>
        ) : (
          <Select label="Trạng thái" value={v.status} onChange={(e) => f.set('status', e.target.value)} options={[{ value: 'AVAILABLE', label: 'Còn trống' }, { value: 'MAINTENANCE', label: 'Bảo trì' }]} hint="Trạng thái “Đang thuê” được đặt tự động khi tạo hợp đồng" />
        )}
        <Textarea label="Mô tả / tiện nghi" value={v.description} onChange={(e) => f.set('description', e.target.value)} wrapperClassName="sm:col-span-2" placeholder="VD: Có gác lửng, máy lạnh, WC riêng…" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
