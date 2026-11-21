import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../../api/types';
import { Select } from '../ui/FormInput';

/** Chỉ hiển thị với ADMIN: chọn chủ trọ sở hữu dữ liệu mới tạo */
export function OwnerSelect({ value, onChange, error }: { value: string | number; onChange: (v: string) => void; error?: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data } = useApi<User[]>(isAdmin ? '/users' : null, { role: 'LANDLORD', pageSize: 200 });
  if (!isAdmin) return null;
  return (
    <Select
      label="Chủ trọ"
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="— Chọn chủ trọ —"
      options={(data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.email})` }))}
      error={error}
      wrapperClassName="sm:col-span-2"
    />
  );
}
