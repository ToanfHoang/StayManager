import { useState } from 'react';
import { Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { BankAccount } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BANKS } from '../../lib/banks';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { DataTable } from '../../components/ui/DataTable';
import { FormInput, Select } from '../../components/ui/FormInput';
import { useProperties } from '../../components/ui/Filters';
import { Badge } from '../../components/ui/StatusBadge';
import { OwnerSelect } from '../../components/shared/OwnerSelect';

function BankForm({ item, onClose, onSaved }: { item: BankAccount | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { options } = useProperties();
  const known = BANKS.some((b) => b.bin === item?.bankCode);
  const [v, setV] = useState({
    bankPreset: item ? (known ? item.bankCode : 'OTHER') : '',
    bankCode: item?.bankCode ?? '',
    bankName: item?.bankName ?? '',
    accountNumber: item?.accountNumber ?? '',
    accountHolder: item?.accountHolder ?? '',
    branch: item?.branch ?? '',
    propertyId: String(item?.propertyId ?? ''),
    qrEnabled: item?.qrEnabled ?? true,
    isActive: item?.isActive ?? true,
    landlordId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const pickBank = (bin: string) => {
    const b = BANKS.find((x) => x.bin === bin);
    setV({ ...v, bankPreset: bin, bankCode: b ? b.bin : '', bankName: b ? b.name : '' });
  };
  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^\d{6}$/.test(v.bankCode)) e.bankCode = 'Mã BIN gồm 6 chữ số';
    if (!v.bankName.trim()) e.bankName = 'Nhập tên ngân hàng';
    if (!/^[0-9A-Za-z]{4,19}$/.test(v.accountNumber.trim())) e.accountNumber = 'Số tài khoản 4–19 ký tự chữ/số';
    if (v.accountHolder.trim().length < 2) e.accountHolder = 'Nhập tên chủ tài khoản';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...v, accountNumber: v.accountNumber.trim(), propertyId: v.propertyId || null, landlordId: v.landlordId || undefined };
      if (item) await api.put(`/bank-accounts/${item.id}`, body);
      else await api.post('/bank-accounts', body);
      toast.success('Đã lưu tài khoản ngân hàng');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={item ? 'Sửa tài khoản nhận tiền' : 'Thêm tài khoản nhận tiền'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={saving} onClick={save}>Lưu</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!item && <OwnerSelect value={v.landlordId} onChange={(x) => setV({ ...v, landlordId: x })} />}
        <Select label="Ngân hàng" required value={v.bankPreset} onChange={(e) => pickBank(e.target.value)} options={[...BANKS.map((b) => ({ value: b.bin, label: `${b.name} – ${b.bin}` })), { value: 'OTHER', label: 'Ngân hàng khác (nhập mã BIN)' }]} placeholder="— Chọn ngân hàng —" wrapperClassName="sm:col-span-2" />
        {v.bankPreset === 'OTHER' && (
          <>
            <FormInput label="Mã BIN (6 số)" required value={v.bankCode} onChange={(e) => setV({ ...v, bankCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} error={errors.bankCode} hint="Tra cứu mã BIN trên trang VietQR / NAPAS" />
            <FormInput label="Tên ngân hàng" required value={v.bankName} onChange={(e) => setV({ ...v, bankName: e.target.value })} error={errors.bankName} />
          </>
        )}
        {errors.bankCode && v.bankPreset !== 'OTHER' && <p className="text-xs text-red-600 sm:col-span-2">{errors.bankCode}</p>}
        <FormInput label="Số tài khoản" required inputMode="numeric" value={v.accountNumber} onChange={(e) => setV({ ...v, accountNumber: e.target.value })} error={errors.accountNumber} />
        <FormInput label="Chủ tài khoản" required value={v.accountHolder} onChange={(e) => setV({ ...v, accountHolder: e.target.value })} error={errors.accountHolder} hint="Tự chuyển thành chữ in hoa không dấu theo chuẩn ngân hàng" />
        <FormInput label="Chi nhánh" value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })} />
        <Select label="Áp dụng cho" value={v.propertyId} onChange={(e) => setV({ ...v, propertyId: e.target.value })} options={options} placeholder="Mặc định – mọi khu trọ" />
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={v.qrEnabled} onChange={(e) => setV({ ...v, qrEnabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Tạo mã VietQR cho người thuê</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Đang sử dụng</label>
      </div>
    </Modal>
  );
}

export function BankAccountsTab() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'LANDLORD');
  const { data, loading, error, reload } = useApi<BankAccount[]>('/bank-accounts');
  const [editing, setEditing] = useState<BankAccount | null | 'new'>(null);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);
  const [preview, setPreview] = useState<{ acc: BankAccount; url: string } | null>(null);

  const showQr = async (acc: BankAccount) => {
    try {
      const r = await api.get<{ qrDataUrl: string }>(`/bank-accounts/${acc.id}/qr-preview`);
      setPreview({ acc, url: r.data.qrDataUrl });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <CardHeader
          title="Tài khoản ngân hàng nhận tiền"
          subtitle="Dùng để tạo mã VietQR (đúng số tiền + nội dung chuyển khoản riêng cho từng hóa đơn) trên Cổng người thuê. Tài khoản riêng của khu trọ được ưu tiên hơn tài khoản mặc định."
          action={canEdit && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Thêm tài khoản</Button>}
        />
      </div>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(a) => a.id}
        empty={<p className="px-5 pb-6 text-sm text-gray-500">Chưa có tài khoản nào. Người thuê sẽ chỉ thấy hướng dẫn thanh toán tiền mặt / liên hệ chủ trọ cho đến khi bạn thêm tài khoản.</p>}
        columns={[
          { key: 'bank', header: 'Ngân hàng', render: (a) => <><span className="font-medium text-gray-900">{a.bankName}</span><span className="block text-xs text-gray-500">BIN {a.bankCode}{a.branch ? ` · ${a.branch}` : ''}</span></> },
          { key: 'acc', header: 'Số tài khoản', render: (a) => <><span className="font-mono">{a.accountNumber}</span><span className="block text-xs text-gray-500">{a.accountHolder}</span></> },
          { key: 'scope', header: 'Áp dụng', render: (a) => a.property?.name ?? <Badge tone="indigo">Mặc định</Badge> },
          { key: 'st', header: 'Trạng thái', render: (a) => <div className="flex flex-wrap gap-1">{a.isActive ? <Badge tone="green">Đang dùng</Badge> : <Badge>Tạm tắt</Badge>}{a.qrEnabled && <Badge tone="blue">VietQR</Badge>}</div> },
          {
            key: 'act', header: '', align: 'right', render: (a) => (
              <div className="flex justify-end gap-1">
                <IconButton label="Xem QR thử" onClick={() => showQr(a)}><QrCode className="h-4 w-4" /></IconButton>
                {canEdit && <IconButton label="Sửa" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></IconButton>}
                {canEdit && <IconButton label="Xóa" onClick={() => setDeleting(a)} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton>}
              </div>
            ),
          },
        ]}
      />
      {editing && <BankForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {preview && (
        <Modal open onClose={() => setPreview(null)} size="sm" title="Mã VietQR thử" description="Quét bằng app ngân hàng để kiểm tra đúng tên chủ tài khoản. KHÔNG cần chuyển tiền.">
          <img src={preview.url} alt="VietQR" className="mx-auto h-64 w-64" />
          <p className="mt-3 text-center text-sm text-gray-600">{preview.acc.bankName} · {preview.acc.accountNumber}<br />{preview.acc.accountHolder}</p>
        </Modal>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Xóa tài khoản ngân hàng"
        message={<>Xóa tài khoản {deleting?.bankName} · {deleting?.accountNumber}? Người thuê sẽ không còn thấy mã QR của tài khoản này.</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/bank-accounts/${deleting!.id}`);
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
