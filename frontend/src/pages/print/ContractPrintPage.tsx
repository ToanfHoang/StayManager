import { useParams } from 'react-router-dom';
import type { Contract } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatMoney } from '../../lib/format';
import { GENDER } from '../../lib/labels';
import { moneyToWords } from '../../lib/numberToWords';
import { PrintShell, Signatures } from './PrintShell';

export default function ContractPrintPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, loading, error } = useApi<Contract>(`/contracts/${id}`);
  const tenants = c?.tenants?.filter((t) => !t.leftAt) ?? [];
  const primary = tenants.find((t) => t.isPrimary) ?? tenants[0];
  const prop = c?.room?.property;
  return (
    <PrintShell title={c ? `Hop-dong-${c.contractNumber}` : 'Hợp đồng'} loading={loading} error={error}>
      {c && (
        <>
          <div className="text-center">
            <p className="font-bold uppercase">Cộng hòa xã hội chủ nghĩa Việt Nam</p>
            <p className="font-semibold">Độc lập – Tự do – Hạnh phúc</p>
            <p>———————</p>
            <h1 className="mt-4 text-xl font-bold uppercase">Hợp đồng thuê phòng trọ</h1>
            <p>Số: {c.contractNumber}</p>
          </div>
          <p className="mt-6">Hôm nay, ngày {formatDate(c.startDate)}, tại {prop?.address}, chúng tôi gồm:</p>

          <h2 className="mt-4 font-bold">BÊN CHO THUÊ (Bên A)</h2>
          <p>Đại diện: {prop?.contactName || (user?.role === 'LANDLORD' ? user.fullName : '……………………………')}</p>
          <p>Điện thoại: {prop?.contactPhone || '……………………………'}</p>
          <p>Địa chỉ khu trọ: {prop?.name} – {prop?.address}</p>

          <h2 className="mt-4 font-bold">BÊN THUÊ (Bên B)</h2>
          {tenants.map((t, i) => (
            <div key={t.tenantId} className="mb-1.5">
              <p>{i + 1}. Họ tên: <b>{t.tenant.fullName}</b>{t.isPrimary ? ' (đại diện)' : ''}{t.tenant.gender ? ` – Giới tính: ${GENDER[t.tenant.gender]}` : ''}</p>
              <p className="pl-4">Ngày sinh: {formatDate(t.tenant.dateOfBirth)} – CCCD: {t.tenant.idNumber || '……………'} – ĐT: {t.tenant.phone}</p>
              {t.tenant.permanentAddress && <p className="pl-4">Thường trú: {t.tenant.permanentAddress}</p>}
            </div>
          ))}

          <h2 className="mt-4 font-bold">Điều 1. Đối tượng và thời hạn thuê</h2>
          <p>Bên A đồng ý cho Bên B thuê phòng số <b>{c.room?.roomNumber}</b>{c.room?.floor !== undefined ? `, tầng ${c.room.floor}` : ''}{c.room?.area ? `, diện tích ${c.room.area} m²` : ''}, tối đa {c.room?.maxOccupancy} người ở.</p>
          <p>Thời hạn thuê: từ ngày <b>{formatDate(c.startDate)}</b> đến ngày <b>{formatDate(c.endDate)}</b>.</p>

          <h2 className="mt-4 font-bold">Điều 2. Giá thuê, tiền cọc và thanh toán</h2>
          <p>Giá thuê: <b>{formatMoney(c.rentPrice)}</b>/tháng ({moneyToWords(c.rentPrice).toLowerCase()}).</p>
          <p>Tiền đặt cọc: <b>{formatMoney(c.deposit)}</b> ({moneyToWords(c.deposit).toLowerCase()}).</p>
          <p>Tiền điện, nước tính theo chỉ số đồng hồ hằng tháng và đơn giá công bố tại khu trọ; các dịch vụ khác tính theo bảng giá dịch vụ.</p>
          <p>Bên B thanh toán hóa đơn tháng trước chậm nhất vào ngày <b>{c.paymentDueDay}</b> hằng tháng.</p>

          <h2 className="mt-4 font-bold">Điều 3. Điều khoản chung</h2>
          <p className="whitespace-pre-line">{c.terms || 'Hai bên cam kết thực hiện đúng các điều khoản đã thỏa thuận.'}</p>
          {c.notes && <><h2 className="mt-4 font-bold">Ghi chú</h2><p className="whitespace-pre-line">{c.notes}</p></>}
          <p className="mt-4">Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>

          <Signatures left="BÊN THUÊ (Bên B)" right="BÊN CHO THUÊ (Bên A)" leftName={primary?.tenant.fullName} rightName={prop?.contactName ?? undefined} />
        </>
      )}
    </PrintShell>
  );
}
