import { useParams } from 'react-router-dom';
import type { Payment } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatDateTime, formatMoney, formatPeriod } from '../../lib/format';
import { PAYMENT_METHOD } from '../../lib/labels';
import { moneyToWords } from '../../lib/numberToWords';
import { PrintShell, Signatures } from './PrintShell';

export default function ReceiptPrintPage({ apiBase = '/payments' }: { apiBase?: string }) {
  const { id } = useParams();
  const { data: p, loading, error } = useApi<Payment>(`${apiBase}/${id}`);
  const inv = p?.invoice;
  const payer = inv?.contract?.tenants[0]?.tenant;
  return (
    <PrintShell title={p ? `Phieu-thu-${p.receiptNumber}` : 'Phiếu thu'} loading={loading} error={error}>
      {p && inv && (
        <>
          <div className="flex justify-between gap-6">
            <div>
              <p className="font-bold uppercase">{inv.room.property.name}</p>
              <p>{inv.room.property.address}</p>
            </div>
            <div className="text-right"><p>Số: <b>{p.receiptNumber}</b></p></div>
          </div>
          <h1 className="mt-6 text-center text-xl font-bold uppercase">Phiếu thu</h1>
          <p className="text-center">Ngày {formatDate(p.paymentDate)}</p>
          {p.voidedAt && <p className="mt-2 text-center font-bold text-red-600">PHIẾU ĐÃ HỦY – {p.voidReason}</p>}
          <div className="mt-8 space-y-2.5">
            <p>Họ tên người nộp tiền: <b>{payer?.fullName ?? '—'}</b></p>
            <p>Phòng: <b>{inv.room.roomNumber}</b></p>
            <p>Lý do nộp: Thanh toán hóa đơn {inv.invoiceNumber} – kỳ tháng {formatPeriod(inv.period)}</p>
            <p>Số tiền: <b className="text-base">{formatMoney(p.amount)}</b></p>
            <p>Bằng chữ: <i>{moneyToWords(p.amount)}</i></p>
            <p>Hình thức: {PAYMENT_METHOD[p.method].label}{p.reference ? ` – Mã GD: ${p.reference}` : ''}</p>
            {p.note && <p>Ghi chú: {p.note}</p>}
            <p className="text-gray-600">Tổng hóa đơn: {formatMoney(inv.totalAmount)} · Đã thanh toán (tính đến hiện tại): {formatMoney(inv.paidAmount)} · Còn lại: {formatMoney(inv.totalAmount - inv.paidAmount)}</p>
          </div>
          <Signatures left="Người nộp tiền" right="Người thu tiền" leftName={payer?.fullName} rightName={p.createdBy?.fullName} />
          <p className="mt-8 text-center text-xs text-gray-400">In lúc {formatDateTime(new Date().toISOString())}</p>
        </>
      )}
    </PrintShell>
  );
}
