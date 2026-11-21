import { useParams } from 'react-router-dom';
import type { Invoice } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS } from '../../lib/labels';
import { moneyToWords } from '../../lib/numberToWords';
import { PrintShell, Signatures } from './PrintShell';

export default function InvoicePrintPage() {
  const { id } = useParams();
  const { data: inv, loading, error } = useApi<Invoice>(`/invoices/${id}`);
  const tenant = inv?.contract.tenants[0]?.tenant;
  const cell = 'border border-gray-300 px-3 py-2';
  return (
    <PrintShell title={inv ? `Hoa-don-${inv.invoiceNumber}` : 'Hóa đơn'} loading={loading} error={error}>
      {inv && (
        <>
          <div className="flex justify-between gap-6 border-b border-gray-300 pb-4">
            <div>
              <p className="text-base font-bold uppercase">{inv.room.property.name}</p>
              <p>{inv.room.property.address}</p>
              {inv.room.property.contactPhone && <p>ĐT: {inv.room.property.contactPhone}{inv.room.property.contactName ? ` (${inv.room.property.contactName})` : ''}</p>}
            </div>
            <div className="text-right">
              <p>Số: <b>{inv.invoiceNumber}</b></p>
              <p>Ngày lập: {formatDate(inv.issueDate)}</p>
            </div>
          </div>
          <h1 className="mt-6 text-center text-xl font-bold uppercase">Hóa đơn tiền phòng</h1>
          <p className="text-center">Kỳ tháng {formatPeriod(inv.period)}</p>
          {inv.status === 'CANCELLED' && <p className="mt-2 text-center font-bold text-red-600">ĐÃ HỦY</p>}

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1">
            <p>Phòng: <b>{inv.room.roomNumber}</b></p>
            <p>Hợp đồng: {inv.contract.contractNumber}</p>
            <p>Người thuê: <b>{tenant?.fullName}</b></p>
            <p>Điện thoại: {tenant?.phone}</p>
          </div>

          <table className="mt-5 w-full border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className={`${cell} w-10`}>STT</th><th className={`${cell} text-left`}>Nội dung</th><th className={`${cell} text-right`}>Số lượng</th><th className={`${cell} text-right`}>Đơn giá</th><th className={`${cell} text-right`}>Thành tiền</th></tr>
            </thead>
            <tbody>
              {inv.items?.map((it, i) => (
                <tr key={it.id}><td className={`${cell} text-center`}>{i + 1}</td><td className={cell}>{it.description}</td><td className={`${cell} text-right`}>{formatNumber(it.quantity)}</td><td className={`${cell} text-right`}>{formatMoney(it.unitPrice)}</td><td className={`${cell} text-right`}>{formatMoney(it.amount)}</td></tr>
              ))}
              <tr className="font-bold"><td className={cell} colSpan={4}>Tổng cộng</td><td className={`${cell} text-right`}>{formatMoney(inv.totalAmount)}</td></tr>
              <tr><td className={cell} colSpan={4}>Đã thanh toán</td><td className={`${cell} text-right`}>{formatMoney(inv.paidAmount)}</td></tr>
              <tr className="font-bold"><td className={cell} colSpan={4}>Còn phải trả</td><td className={`${cell} text-right`}>{formatMoney(inv.status === 'CANCELLED' ? 0 : inv.balance)}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 italic">Bằng chữ (tổng cộng): {moneyToWords(inv.totalAmount)}.</p>
          <p className="mt-2">Hạn thanh toán: <b>{formatDate(inv.dueDate)}</b> · Trạng thái: <b>{INVOICE_STATUS[inv.displayStatus]?.label}</b></p>
          {inv.note && <p className="mt-1">Ghi chú: {inv.note}</p>}
          <Signatures left="Người thuê" right="Người lập hóa đơn" leftName={tenant?.fullName} />
        </>
      )}
    </PrintShell>
  );
}
