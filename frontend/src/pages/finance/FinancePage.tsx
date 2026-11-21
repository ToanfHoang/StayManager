import { useState } from 'react';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Category, Expense } from '../../api/types';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useForm } from '../../hooks/useForm';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { expenseSchema } from '../../lib/schemas';
import { addMonths, currentPeriod, dateInput, formatDate, formatMoney, todayStr } from '../../lib/format';
import { ENTRY_TYPE } from '../../lib/labels';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter, SearchBar, useProperties } from '../../components/ui/Filters';
import { DatePicker, FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';

function ExpenseForm({ entry, defaultType, onClose, onSaved }: { entry?: Expense | null; defaultType: 'INCOME' | 'EXPENSE'; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { options: propertyOptions } = useProperties();
  const { data: categories } = useApi<Category[]>('/expense-categories');
  const f = useForm(
    {
      type: entry?.type ?? defaultType,
      propertyId: String(entry?.propertyId ?? ''),
      categoryId: String(entry?.categoryId ?? ''),
      amount: entry?.amount ?? ('' as number | ''),
      entryDate: dateInput(entry?.entryDate) || todayStr(),
      description: entry?.description ?? '',
      note: entry?.note ?? '',
    } as Record<string, unknown>,
    expenseSchema,
  );
  const v = f.values as Record<string, string | number>;
  const cats = (categories ?? []).filter((c) => c.type === v.type);

  const save = () =>
    f.submit(async (values) => {
      if (entry) await api.put(`/expenses/${entry.id}`, values);
      else await api.post('/expenses', values);
      toast.success('Đã lưu khoản thu chi');
      onSaved();
      onClose();
    });

  return (
    <Modal open onClose={onClose} title={entry ? 'Sửa khoản thu chi' : v.type === 'INCOME' ? 'Thêm khoản thu khác' : 'Thêm khoản chi'} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={f.submitting} onClick={save}>Lưu</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Select label="Loại" value={v.type} onChange={(e) => { f.set('type', e.target.value); f.set('categoryId', ''); }} options={[{ value: 'EXPENSE', label: 'Khoản chi' }, { value: 'INCOME', label: 'Khoản thu khác' }]} />
        <Select label="Danh mục" required value={v.categoryId} onChange={(e) => f.set('categoryId', e.target.value)} options={cats.map((c) => ({ value: c.id, label: c.name }))} placeholder="— Chọn danh mục —" error={f.errors.categoryId} />
        <Select label="Khu trọ" required value={v.propertyId} onChange={(e) => f.set('propertyId', e.target.value)} options={propertyOptions} placeholder="— Chọn khu trọ —" error={f.errors.propertyId} />
        <DatePicker label="Ngày" required value={String(v.entryDate)} onChange={(x) => f.set('entryDate', x)} error={f.errors.entryDate} />
        <MoneyInput label="Số tiền" required value={v.amount} onChange={(x) => f.set('amount', x)} error={f.errors.amount} wrapperClassName="sm:col-span-2" />
        <FormInput label="Nội dung" required value={v.description} onChange={(e) => f.set('description', e.target.value)} error={f.errors.description} wrapperClassName="sm:col-span-2" placeholder="VD: Thay bóng đèn hành lang" />
        <Textarea label="Ghi chú" rows={2} value={v.note} onChange={(e) => f.set('note', e.target.value)} wrapperClassName="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function FinancePage() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [from, setFrom] = useState(`${addMonths(currentPeriod(), -2)}-01`);
  const [to, setTo] = useState(todayStr());
  const [type, setType] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | null | 'INCOME' | 'EXPENSE'>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const range = { from, to, propertyId };
  const summary = useApi<{ rentIncome: number; otherIncome: number; totalIncome: number; expense: number; net: number }>('/expenses/summary', range);
  const { data: categories } = useApi<Category[]>('/expense-categories');
  const { data, meta, loading, error, reload } = useApi<Expense[]>('/expenses', { ...range, type, categoryId, q: dq, page, pageSize: 20 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  const refresh = () => { reload(); summary.reload(); };
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Thu chi"
        description="Tiền thuê thu được (từ hóa đơn) cộng các khoản thu khác, trừ chi phí vận hành"
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('INCOME')}>Khoản thu khác</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('EXPENSE')}>Thêm khoản chi</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tiền thuê đã thu" value={formatMoney(s?.rentIncome)} accent="green" />
        <StatCard label="Thu khác" value={formatMoney(s?.otherIncome)} accent="sky" />
        <StatCard label="Tổng chi" value={formatMoney(s?.expense)} accent="red" />
        <StatCard label="Lợi nhuận ròng" value={<span className={(s?.net ?? 0) < 0 ? 'text-red-600' : ''}>{formatMoney(s?.net)}</span>} accent="indigo" hint={`${formatDate(from)} – ${formatDate(to)}`} />
      </div>
      <Card padded={false}>
        <FilterBar>
          <DatePicker value={from} onChange={reset(setFrom)} aria-label="Từ ngày" wrapperClassName="w-full sm:w-40" />
          <DatePicker value={to} onChange={reset(setTo)} aria-label="Đến ngày" wrapperClassName="w-full sm:w-40" />
          <FilterDropdown value={type} onChange={reset(setType)} allLabel="Thu & chi" options={[{ value: 'EXPENSE', label: 'Khoản chi' }, { value: 'INCOME', label: 'Khoản thu khác' }]} />
          <FilterDropdown value={categoryId} onChange={reset(setCategoryId)} allLabel="Mọi danh mục" options={(categories ?? []).filter((c) => !type || c.type === type).map((c) => ({ value: c.id, label: c.name }))} />
          <PropertyFilter value={propertyId} onChange={reset(setPropertyId)} />
          <SearchBar value={q} onChange={reset(setQ)} placeholder="Tìm nội dung…" />
        </FilterBar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(e) => e.id}
          empty={<EmptyState icon={<Wallet className="h-6 w-6" />} title="Không có khoản thu chi nào" description="Ghi lại chi phí sửa chữa, vệ sinh, điện nước chủ trả… để tính lợi nhuận chính xác." />}
          columns={[
            { key: 'date', header: 'Ngày', render: (e) => formatDate(e.entryDate) },
            { key: 'type', header: 'Loại', render: (e) => <StatusBadge map={ENTRY_TYPE} value={e.type} /> },
            { key: 'desc', header: 'Nội dung', render: (e) => <><span className="font-medium text-gray-900">{e.description}</span><span className="block text-xs text-gray-500">{e.category.name}{e.maintenanceRequest ? ' · từ yêu cầu sửa chữa' : ''}</span></> },
            { key: 'prop', header: 'Khu trọ', render: (e) => e.property.name, hideOnMobile: true },
            { key: 'by', header: 'Người ghi', render: (e) => e.createdBy?.fullName ?? '—', hideOnMobile: true },
            { key: 'amount', header: 'Số tiền', align: 'right', render: (e) => <span className={`font-semibold ${e.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>{e.type === 'INCOME' ? '+' : '−'}{formatMoney(e.amount)}</span> },
            {
              key: 'act', header: '', align: 'right', render: (e) => (
                <div className="flex justify-end gap-1">
                  <IconButton label="Sửa" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></IconButton>
                  {hasRole('ADMIN', 'LANDLORD') && <IconButton label="Xóa" onClick={() => setDeleting(e)} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton>}
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onChange={setPage} />
      </Card>
      {editing && <ExpenseForm entry={typeof editing === 'string' ? null : editing} defaultType={typeof editing === 'string' ? editing : editing.type} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Xóa khoản thu chi"
        message={<>Xóa “{deleting?.description}” ({formatMoney(deleting?.amount)})? Thao tác được ghi vào nhật ký hệ thống.</>}
        confirmText="Xóa"
        onConfirm={async () => {
          try {
            await api.del(`/expenses/${deleting!.id}`);
            toast.success('Đã xóa');
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}
