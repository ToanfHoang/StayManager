import { api } from '../../api/client';
import type { Invoice, Payment } from '../../api/types';
import { useForm } from '../../hooks/useForm';
import { useToast } from '../../context/ToastContext';
import { paymentSchema } from '../../lib/schemas';
import { formatMoney, todayStr } from '../../lib/format';
import { options, PAYMENT_METHOD } from '../../lib/labels';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { DatePicker, FormInput, MoneyInput, Select, Textarea } from '../../components/ui/FormInput';

export function PaymentForm({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: (p: Payment) => void }) {
  const toast = useToast();
  const f = useForm({ amount: invoice.balance as number | '', method: 'CASH', paymentDate: todayStr(), reference: '', note: '' } as Record<string, unknown>, paymentSchema);
  const v = f.values as Record<string, string | number>;

  const save = () =>
    f.submit(async (values) => {
      if (Number(values.amount) > invoice.balance) {
        f.setErrors({ amount: `Không vượt quá số còn nợ ${formatMoney(invoice.balance)}` });
        return;
      }
      const res = await api.post<{ payment: Payment }>('/payments', { ...values, invoiceId: invoice.id });
      toast.success(`Đã ghi nhận ${formatMoney(Number(values.amount))} – phiếu thu ${res.data.payment.receiptNumber}`);
      onSaved(res.data.payment);
      onClose();
    });

  return (
    <Modal open onClose={onClose} title="Ghi nhận thanh toán" description={`Hóa đơn ${invoice.invoiceNumber} · còn nợ ${formatMoney(invoice.balance)}`} footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button variant="success" loading={f.submitting} onClick={save}>Xác nhận thu tiền</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <MoneyInput label="Số tiền thu" required value={v.amount} onChange={(x) => f.set('amount', x)} error={f.errors.amount} hint={<button type="button" className="link" onClick={() => f.set('amount', invoice.balance)}>Thu toàn bộ {formatMoney(invoice.balance)}</button>} wrapperClassName="sm:col-span-2" />
        <Select label="Hình thức" required value={v.method} onChange={(e) => f.set('method', e.target.value)} options={options(PAYMENT_METHOD)} />
        <DatePicker label="Ngày thanh toán" required value={String(v.paymentDate)} max={todayStr()} onChange={(x) => f.set('paymentDate', x)} error={f.errors.paymentDate} />
        <FormInput label={v.method === 'BANK_TRANSFER' ? 'Mã giao dịch / nội dung CK' : 'Mã tham chiếu'} required={v.method === 'BANK_TRANSFER'} value={v.reference} onChange={(e) => f.set('reference', e.target.value)} error={f.errors.reference} wrapperClassName="sm:col-span-2" />
        <Textarea label="Ghi chú" rows={2} value={v.note} onChange={(e) => f.set('note', e.target.value)} wrapperClassName="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
