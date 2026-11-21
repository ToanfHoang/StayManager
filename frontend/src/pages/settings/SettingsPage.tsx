import { useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { AuditLog, Category, User } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useForm } from '../../hooks/useForm';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { userSchema } from '../../lib/schemas';
import { formatDateTime } from '../../lib/format';
import { AUDIT_ACTION, ENTRY_TYPE, ROLE } from '../../lib/labels';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FormInput, Select } from '../../components/ui/FormInput';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { BankAccountsTab } from './BankAccountsTab';
import { HunonicTab } from './HunonicTab';
import { BackupTab } from './BackupTab';
import { useSearchParams } from 'react-router-dom';

function ProfileTab() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ fullName: user?.fullName ?? '', phone: user?.phone ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState<'' | 'profile' | 'pw'>('');

  const saveProfile = async () => {
    setSaving('profile');
    try {
      await api.put('/auth/profile', profile);
      await refresh();
      toast.success('Đã cập nhật hồ sơ');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving('');
    }
  };
  const changePw = async () => {
    if (pw.newPassword.length < 8) return toast.error('Mật khẩu mới tối thiểu 8 ký tự');
    if (pw.newPassword !== pw.confirm) return toast.error('Xác nhận mật khẩu không khớp');
    setSaving('pw');
    try {
      await api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Đã đổi mật khẩu');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Hồ sơ cá nhân" subtitle={`${user?.email} · ${user ? ROLE[user.role].label : ''}`} />
        <div className="space-y-4">
          <FormInput label="Họ tên" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} />
          <FormInput label="Số điện thoại" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <Button loading={saving === 'profile'} onClick={saveProfile}>Lưu hồ sơ</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Đổi mật khẩu" />
        <div className="space-y-4">
          <FormInput label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <FormInput label="Mật khẩu mới" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} hint="Tối thiểu 8 ký tự" />
          <FormInput label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <Button icon={<KeyRound className="h-4 w-4" />} loading={saving === 'pw'} onClick={changePw}>Đổi mật khẩu</Button>
        </div>
      </Card>
    </div>
  );
}

function UserForm({ item, onClose, onSaved }: { item: User | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const { data: landlords } = useApi<User[]>(isAdmin ? '/users' : null, { role: 'LANDLORD', pageSize: 200 });
  const f = useForm({ fullName: item?.fullName ?? '', email: item?.email ?? '', phone: item?.phone ?? '', password: '', role: item?.role ?? (isAdmin ? 'LANDLORD' : 'STAFF'), landlordId: String(item?.landlordId ?? ''), isActive: item?.isActive ?? true } as Record<string, unknown>, item ? undefined : userSchema);
  const v = f.values as Record<string, string | boolean>;
  const save = () =>
    f.submit(async (values) => {
      if (item) await api.put(`/users/${item.id}`, { fullName: values.fullName, phone: values.phone, isActive: values.isActive, password: values.password || undefined });
      else await api.post('/users', values);
      toast.success('Đã lưu tài khoản');
      onSaved();
      onClose();
    });
  return (
    <Modal open onClose={onClose} title={item ? 'Sửa tài khoản' : isAdmin ? 'Tạo tài khoản' : 'Thêm nhân viên'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput label="Họ tên" required value={String(v.fullName)} onChange={(e) => f.set('fullName', e.target.value)} error={f.errors.fullName} wrapperClassName="sm:col-span-2" />
        <FormInput label="Email đăng nhập" type="email" required disabled={!!item} value={String(v.email)} onChange={(e) => f.set('email', e.target.value)} error={f.errors.email} />
        <FormInput label="Số điện thoại" value={String(v.phone)} onChange={(e) => f.set('phone', e.target.value)} />
        <FormInput label={item ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'} type="password" autoComplete="new-password" required={!item} value={String(v.password)} onChange={(e) => f.set('password', e.target.value)} error={f.errors.password} hint="Tối thiểu 8 ký tự" wrapperClassName="sm:col-span-2" />
        {isAdmin && !item && <Select label="Vai trò" value={String(v.role)} onChange={(e) => f.set('role', e.target.value)} options={[{ value: 'LANDLORD', label: 'Chủ trọ' }, { value: 'STAFF', label: 'Nhân viên' }, { value: 'ADMIN', label: 'Quản trị viên' }]} />}
        {isAdmin && !item && v.role === 'STAFF' && <Select label="Thuộc chủ trọ" required value={String(v.landlordId)} onChange={(e) => f.set('landlordId', e.target.value)} options={(landlords ?? []).map((l) => ({ value: l.id, label: l.fullName }))} placeholder="— Chọn —" error={f.errors.landlordId} />}
        {item && item.id !== user?.id && (
          <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" checked={!!v.isActive} onChange={(e) => f.set('isActive', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Tài khoản đang hoạt động</label>
        )}
      </div>
    </Modal>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | null | 'new'>(null);
  const { data, meta, loading, error, reload } = useApi<User[]>('/users', { page, pageSize: 20 });
  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <CardHeader
          title={user?.role === 'ADMIN' ? 'Tài khoản hệ thống' : 'Nhân viên quản lý'}
          subtitle={user?.role === 'ADMIN' ? 'Chủ trọ, nhân viên và quản trị viên' : 'Nhân viên xem và thao tác trên dữ liệu khu trọ của bạn (không xem được CCCD đầy đủ, không xóa dữ liệu)'}
          action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>{user?.role === 'ADMIN' ? 'Tạo tài khoản' : 'Thêm nhân viên'}</Button>}
        />
      </div>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(u) => u.id}
        empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có tài khoản nào.</p>}
        columns={[
          { key: 'name', header: 'Họ tên', render: (u) => <><span className="font-medium text-gray-900">{u.fullName}</span><span className="block text-xs text-gray-500">{u.email}</span></> },
          { key: 'role', header: 'Vai trò', render: (u) => <StatusBadge map={ROLE} value={u.role} /> },
          { key: 'landlord', header: 'Thuộc chủ trọ', render: (u) => u.landlord?.fullName ?? '—', hideOnMobile: true },
          { key: 'created', header: 'Ngày tạo', render: (u) => formatDateTime(u.createdAt), hideOnMobile: true },
          { key: 'active', header: 'Trạng thái', render: (u) => (u.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="red">Đã khóa</Badge>) },
          { key: 'act', header: '', align: 'right', render: (u) => <IconButton label="Sửa" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></IconButton> },
        ]}
      />
      <Pagination meta={meta} onChange={setPage} />
      {editing && <UserForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </Card>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Category[]>('/expense-categories');
  const [form, setForm] = useState<{ id?: number; name: string; type: 'INCOME' | 'EXPENSE' } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form?.name.trim()) return toast.error('Nhập tên danh mục');
    setSaving(true);
    try {
      if (form.id) await api.put(`/expense-categories/${form.id}`, form);
      else await api.post('/expense-categories', form);
      toast.success('Đã lưu danh mục');
      setForm(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card padded={false}>
      <div className="p-5 pb-0"><CardHeader title="Danh mục thu chi" subtitle="Danh mục mặc định của hệ thống không thể sửa/xóa" action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ name: '', type: 'EXPENSE' })}>Thêm danh mục</Button>} /></div>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(c) => c.id}
        columns={[
          { key: 'name', header: 'Tên', render: (c) => <span className="font-medium text-gray-900">{c.name}</span> },
          { key: 'type', header: 'Loại', render: (c) => <StatusBadge map={ENTRY_TYPE} value={c.type} /> },
          { key: 'sys', header: 'Nguồn', render: (c) => (c.isSystem ? <Badge>Mặc định</Badge> : <Badge tone="indigo">Tự tạo</Badge>) },
          { key: 'usage', header: 'Số khoản', align: 'right', render: (c) => c.usage },
          {
            key: 'act', header: '', align: 'right', render: (c) => !c.isSystem && (
              <div className="flex justify-end gap-1">
                <IconButton label="Sửa" onClick={() => setForm({ id: c.id, name: c.name, type: c.type })}><Pencil className="h-4 w-4" /></IconButton>
                {c.usage === 0 && <IconButton label="Xóa" onClick={() => setDeleting(c)} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton>}
              </div>
            ),
          },
        ]}
      />
      {form && (
        <Modal open onClose={() => setForm(null)} size="sm" title={form.id ? 'Sửa danh mục' : 'Thêm danh mục'} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Hủy</Button><Button loading={saving} onClick={save}>Lưu</Button></>}>
          <div className="space-y-4">
            <FormInput label="Tên danh mục" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Loại" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'INCOME' | 'EXPENSE' })} options={[{ value: 'EXPENSE', label: 'Chi' }, { value: 'INCOME', label: 'Thu' }]} />
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Xóa danh mục"
        message={<>Xóa danh mục “{deleting?.name}”?</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/expense-categories/${deleting!.id}`);
            toast.success('Đã xóa');
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Card>
  );
}

const ENTITY: Record<string, string> = {
  property: 'Khu trọ', room: 'Phòng', tenant: 'Người thuê', contract: 'Hợp đồng', invoice: 'Hóa đơn', payment: 'Thanh toán',
  meter_reading: 'Chỉ số điện nước', expense: 'Thu chi', maintenance: 'Sửa chữa', service: 'Dịch vụ', user: 'Tài khoản',
};

function AuditTab() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const { data, meta, loading, error, reload } = useApi<AuditLog[]>('/audit-logs', { page, entity, pageSize: 25 });
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div><h3 className="text-base font-semibold text-gray-900">Nhật ký hoạt động</h3><p className="text-sm text-gray-500">Lịch sử thay đổi dữ liệu quan trọng</p></div>
        <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))} placeholder="Tất cả đối tượng" wrapperClassName="w-56" />
      </div>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(l) => l.id}
        empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có hoạt động.</p>}
        columns={[
          { key: 'time', header: 'Thời gian', render: (l) => formatDateTime(l.createdAt) },
          { key: 'user', header: 'Người thực hiện', render: (l) => l.user?.fullName ?? 'Hệ thống' },
          { key: 'action', header: 'Hành động', render: (l) => AUDIT_ACTION[l.action] ?? l.action },
          { key: 'entity', header: 'Đối tượng', render: (l) => `${ENTITY[l.entity] ?? l.entity}${l.entityId ? ` #${l.entityId}` : ''}` },
        ]}
      />
      <Pagination meta={meta} onChange={setPage} />
    </Card>
  );
}

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'LANDLORD');
  const tabs = [
    { key: 'profile', label: 'Tài khoản' },
    ...(manager ? [{ key: 'users', label: hasRole('ADMIN') ? 'Người dùng' : 'Nhân viên' }, { key: 'bank', label: 'Tài khoản ngân hàng' }, { key: 'hunonic', label: 'Công tơ Hunonic' }, { key: 'categories', label: 'Danh mục thu chi' }, { key: 'backup', label: 'Sao lưu dữ liệu' }, { key: 'audit', label: 'Nhật ký' }] : [{ key: 'bank', label: 'Tài khoản ngân hàng' }, { key: 'hunonic', label: 'Công tơ Hunonic' }]),
  ];
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'profile');
  return (
    <>
      <PageHeader title="Cài đặt" description="Tài khoản, nhân viên, danh mục, sao lưu và nhật ký hệ thống" />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'users' && manager && <UsersTab />}
      {tab === 'bank' && <BankAccountsTab />}
      {tab === 'hunonic' && <HunonicTab />}
      {tab === 'categories' && manager && <CategoriesTab />}
      {tab === 'backup' && manager && <BackupTab />}
      {tab === 'audit' && manager && <AuditTab />}
    </>
  );
}
