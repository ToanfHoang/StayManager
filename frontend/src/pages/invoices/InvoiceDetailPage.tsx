import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, Banknote, MessageCircle, Pencil, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import { ZaloSendModal } from '../../components/zalo/ZaloSendModal';
import { api, errorMessage } from '../../api/client';
import type { Invoice, InvoiceItem, Payment } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, InfoRow, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { Badge, StatusBadge } from '../../components/ui/StatusBadge';
import { DatePicker, FormInput } from '../../components/ui/FormInput';
import { dateInput, formatDate, formatDateTime, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS, ITEM_TYPE, PAYMENT_METHOD } from '../../lib/labels';
import { PaymentForm } from './PaymentForm';

const cell = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data: inv, loading, error, reload } = useApi<Invoice>(`/invoices/${id}`);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [zalo, setZalo] = useState(false);

  if (loading && !inv) return <LoadingState />;
  if (error || !inv) return <ErrorState message={error ?? 'Không tìm thấy hóa đơn'} onRetry={reload} />;

  const cancelled = inv.status === 'CANCELLED';
  const hasPayments = inv.paidAmount > 0;
  const canEdit = !cancelled && !hasPayments;
  const primary = inv.contract.tenants[0]?.tenant;

  const startEdit = () => {
    setItems((inv.items ?? []).map(({ type, description, quantity, unitPrice }) => ({ type, description, quantity, unitPrice })));
    setDueDate(dateInput(inv.dueDate));
    setNote(inv.note ?? '');
    setEditing(true);
  };
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const editTotal = items.reduce((a, i) => a + Math.round(Number(i.quantity || 0) * Number(i.unitPrice || 0) * 100) / 100, 0);

  const saveItems = async () => {
    if (!items.length) return toast.error('Hóa đơn phải có ít nhất 1 khoản');
    if (items.some((i) => !i.description.trim() || Number(i.quantity) < 0 || Number(i.unitPrice) < 0)) return toast.error('Vui lòng kiểm tra nội dung, số lượng và đơn giá (không được âm)');
    setSaving(true);
    try {
      await api.put(`/invoices/${inv.id}`, { items: items.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })), dueDate, note });
      toast.success('Đã cập nhật hóa đơn');
      setEditing(false);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Hóa đơn ${inv.invoiceNumber}`}
        description={<span className="flex flex-wrap items-center gap-2">Kỳ {formatPeriod(inv.period)} · Phòng <Link to={`/phong/${inv.room.id}`} className="link">{inv.room.roomNumber}</Link> · {inv.room.property.name} <StatusBadge map={INVOICE_STATUS} value={inv.displayStatus} /></span>}
        actions={
          <>
            {!cancelled && <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => setZalo(true)}>Gửi Zalo</Button>}
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/in/hoa-don/${inv.id}`, '_blank')}>In / PDF</Button>
            {canEdit && !editing && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={startEdit}>Sửa khoản</Button>}
            {canEdit && <Button variant="secondary" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>Hủy hóa đơn</Button>}
            {!cancelled && inv.balance > 0 && <Button variant="success" icon={<Banknote className="h-4 w-4" />} onClick={() => setPaying(true)}>Thu tiền</Button>}
          </>
        }
      />
      {cancelled && <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">Hóa đơn đã bị hủy lúc {formatDateTime(inv.cancelledAt)}. Lý do: {inv.cancelReason}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Chi tiết các khoản" subtitle={hasPayments && !cancelled ? 'Hóa đơn đã có thanh toán nên không thể sửa khoản' : undefined} />
            </div>
            {editing ? (
              <div className="space-y-4 px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500">
                      <tr><th className="py-2 pr-2">Loại</th><th className="py-2 pr-2">Nội dung</th><th className="w-24 py-2 pr-2 text-right">SL</th><th className="w-32 py-2 pr-2 text-right">Đơn giá</th><th className="py-2 text-right">Thành tiền</th><th /></tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2">
                            <select className={cell} value={it.type} onChange={(e) => setItem(i, { type: e.target.value as InvoiceItem['type'] })}>
                              {Object.entries(ITEM_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          </td>
                          <td className="py-1 pr-2"><input className={`${cell} min-w-[180px]`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                          <td className="py-1 pr-2"><input className={`${cell} text-right`} inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })} /></td>
                          <td className="py-1 pr-2"><input className={`${cell} text-right`} inputMode="numeric" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value as unknown as number })} /></td>
                          <td className="whitespace-nowrap py-1 text-right">{formatMoney(Number(it.quantity || 0) * Number(it.unitPrice || 0))}</td>
                          <td className="py-1 pl-1"><IconButton label="Xóa khoản" onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="hover:text-red-600"><Trash2 className="h-4 w-4" /></IconButton></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setItems([...items, { type: 'OTHER', description: '', quantity: 1, unitPrice: 0 }])}>Thêm khoản</Button>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DatePicker label="Hạn thanh toán" value={dueDate} min={dateInput(inv.issueDate)} onChange={setDueDate} />
                  <FormInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-600">Tổng mới: <b className="text-lg text-gray-900">{formatMoney(editTotal)}</b></p>
                  <div className="flex gap-2"><Button variant="secondary" onClick={() => setEditing(false)}>Hủy</Button><Button loading={saving} onClick={saveItems}>Lưu thay đổi</Button></div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr><th className="px-5 py-3 text-left">Khoản</th><th className="px-3 py-3 text-right">Số lượng</th><th className="px-3 py-3 text-right">Đơn giá</th><th className="px-5 py-3 text-right">Thành tiền</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inv.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-5 py-3"><p className="font-medium text-gray-900">{it.description}</p><p className="text-xs text-gray-500">{ITEM_TYPE[it.type]}</p></td>
                        <td className="px-3 py-3 text-right">{formatNumber(it.quantity)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(it.unitPrice)}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatMoney(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr><td colSpan={3} className="px-5 py-2 text-right text-gray-600">Tổng cộng</td><td className="px-5 py-2 text-right text-base font-semibold">{formatMoney(inv.totalAmount)}</td></tr>
                    <tr><td colSpan={3} className="px-5 py-2 text-right text-gray-600">Đã thanh toán</td><td className="px-5 py-2 text-right font-medium text-emerald-600">{formatMoney(inv.paidAmount)}</td></tr>
                    <tr><td colSpan={3} className="px-5 py-2 text-right text-gray-600">Còn lại</td><td className="px-5 py-2 text-right text-base font-semibold text-red-600">{formatMoney(cancelled ? 0 : inv.balance)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Lịch sử thanh toán" /></div>
            {!inv.payments?.length ? <p className="px-5 pb-6 text-sm text-gray-500">Chưa có thanh toán.</p> : (
              <ul className="divide-y divide-gray-100">
                {inv.payments.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${p.voidedAt ? 'opacity-60' : ''}`}>
                    <div>
                      <p className={`font-medium ${p.voidedAt ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{formatMoney(p.amount)} · {PAYMENT_METHOD[p.method].label}</p>
                      <p className="text-xs text-gray-500">{p.receiptNumber} · {formatDate(p.paymentDate)}{p.reference ? ` · ${p.reference}` : ''} · {p.createdBy?.fullName ?? ''}</p>
                      {p.voidedAt && <p className="text-xs text-red-600">Đã hủy: {p.voidReason}</p>}
                    </div>
                    <div className="flex gap-1">
                      {p.voidedAt ? <Badge tone="gray">Đã hủy</Badge> : (
                        <>
                          <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => window.open(`/in/phieu-thu/${p.id}`, '_blank')}>Phiếu thu</Button>
                          <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setVoiding(p)}>Hủy</Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Thông tin" />
            <InfoRow label="Ngày lập">{formatDate(inv.issueDate)}</InfoRow>
            <InfoRow label="Hạn thanh toán">{formatDate(inv.dueDate)}</InfoRow>
            <InfoRow label="Hợp đồng"><Link to={`/hop-dong/${inv.contract.id}`} className="link">{inv.contract.contractNumber}</Link></InfoRow>
            <InfoRow label="Người thuê">{primary?.fullName ?? '—'}</InfoRow>
            <InfoRow label="Điện thoại">{primary?.phone ?? '—'}</InfoRow>
            {inv.note && <InfoRow label="Ghi chú">{inv.note}</InfoRow>}
          </Card>
          {inv.reading && (
            <Card>
              <CardHeader title="Chỉ số điện nước" />
              <InfoRow label="Điện">{formatNumber(inv.reading.electricityPrev)} → {formatNumber(inv.reading.electricityCurr)}</InfoRow>
              <InfoRow label="Nước">{formatNumber(inv.reading.waterPrev)} → {formatNumber(inv.reading.waterCurr)}</InfoRow>
            </Card>
          )}
        </div>
      </div>

      {zalo && <ZaloSendModal invoiceId={inv.id} onClose={() => setZalo(false)} onChanged={reload} />}
      {paying && <PaymentForm invoice={inv} onClose={() => setPaying(false)} onSaved={() => reload()} />}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Hủy hóa đơn"
        message="Hóa đơn bị hủy vẫn được lưu lại trong lịch sử. Bạn có thể lập lại hóa đơn mới cho kỳ này sau khi hủy."
        confirmText="Hủy hóa đơn"
        requireReason
        onConfirm={async (reason) => {
          try {
            await api.post(`/invoices/${inv.id}/cancel`, { reason });
            toast.success('Đã hủy hóa đơn');
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title="Hủy phiếu thu"
        message={<>Hủy phiếu thu <b>{voiding?.receiptNumber}</b> ({formatMoney(voiding?.amount)})? Số tiền sẽ được trừ khỏi hóa đơn, phiếu vẫn được lưu trong lịch sử.</>}
        confirmText="Hủy phiếu thu"
        requireReason
        onConfirm={async (reason) => {
          try {
            await api.post(`/payments/${voiding!.id}/void`, { reason });
            toast.success('Đã hủy phiếu thu');
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
