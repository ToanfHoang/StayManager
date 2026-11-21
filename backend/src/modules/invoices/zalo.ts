/**
 * Soạn tin nhắn tiền phòng để chủ trọ gửi qua Zalo (bán tự động: app soạn + tạo ảnh, chủ trọ bấm gửi).
 * Không dùng bot cho tài khoản Zalo cá nhân (vi phạm điều khoản Zalo).
 */
import { prisma } from '../../lib/prisma';
import { validateBankInfo, vietQrDataUrl } from '../../lib/vietqr';
import { bankAccountForProperty } from '../bank/bank.routes';
import { ensurePaymentReference, round } from './invoices.service';

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const vnDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const vnPeriod = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;
const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Số di động VN dạng 0xxxxxxxxx (dùng cho đường dẫn zalo.me) */
export function normalizeVnPhone(raw: string | null | undefined) {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  else if (p.startsWith('84') && p.length === 11) p = `0${p.slice(2)}`;
  return /^0\d{9}$/.test(p) ? p : null;
}

export async function buildZaloMessage(invoiceId: number) {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      room: { include: { property: true } },
      contract: { include: { tenants: { where: { leftAt: null }, orderBy: { isPrimary: 'desc' }, include: { tenant: { select: { fullName: true, phone: true } } } } } },
    },
  });
  const reference = await ensurePaymentReference(prisma, inv.id);
  const balance = round(Number(inv.totalAmount) - Number(inv.paidAmount));
  const primary = inv.contract.tenants[0]?.tenant;

  // Tài khoản & QR (nếu chủ trọ đã cấu hình)
  const acc = await bankAccountForProperty(inv.room.propertyId, inv.room.property.ownerId);
  let qr: { dataUrl: string | null; bankName: string; accountNumber: string; accountHolder: string; amount: number; reference: string } | null = null;
  if (acc && balance > 0) {
    const ok = acc.qrEnabled && !validateBankInfo(acc.bankCode, acc.accountNumber);
    qr = {
      dataUrl: ok ? await vietQrDataUrl({ bin: acc.bankCode, accountNumber: acc.accountNumber, amount: balance, description: reference }) : null,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountHolder: acc.accountHolder,
      amount: balance,
      reference,
    };
  }

  const lines: string[] = [];
  lines.push(`🏠 ${inv.room.property.name} – Phòng ${inv.room.roomNumber}`);
  lines.push(`Thông báo tiền phòng tháng ${vnPeriod(inv.period)}${primary ? ` gửi ${primary.fullName}` : ''}:`);
  for (const it of inv.items) {
    let detail = '';
    if (it.type === 'ELECTRICITY') detail = ` (${num(Number(it.quantity))} kWh × ${vnd(Number(it.unitPrice))})`;
    else if (it.type === 'WATER') detail = it.description.includes('chia đầu người') ? ` (${num(Number(it.quantity))} người × ${vnd(Number(it.unitPrice))})` : ` (${num(Number(it.quantity))} m³ × ${vnd(Number(it.unitPrice))})`;
    else if (Number(it.quantity) !== 1) detail = ` (${num(Number(it.quantity))} × ${vnd(Number(it.unitPrice))})`;
    const label = it.description.replace(/\s*\(.*\)\s*$/, '');
    lines.push(`• ${label}${detail}: ${vnd(Number(it.amount))}`);
  }
  lines.push(`👉 Tổng cộng: ${vnd(Number(inv.totalAmount))}`);
  if (Number(inv.paidAmount) > 0) lines.push(`Đã trả: ${vnd(Number(inv.paidAmount))} – Còn lại: ${vnd(balance)}`);
  lines.push(`Hạn thanh toán: ${vnDate(inv.dueDate)}`);
  if (qr) {
    lines.push('');
    lines.push(`Chuyển khoản: ${qr.bankName} – STK ${qr.accountNumber} – ${qr.accountHolder}`);
    lines.push(`Nội dung CK: ${reference}`);
    if (qr.dataUrl) lines.push('(Có thể quét mã QR trong ảnh hóa đơn, số tiền và nội dung đã điền sẵn)');
  }
  if (inv.note) lines.push(`Ghi chú: ${inv.note}`);
  lines.push('Cảm ơn bạn!');

  return {
    invoiceId: inv.id,
    text: lines.join('\n'),
    phone: normalizeVnPhone(primary?.phone),
    rawPhone: primary?.phone ?? null,
    tenantName: primary?.fullName ?? null,
    zaloSentAt: inv.zaloSentAt,
    qr,
  };
}
