import type { PaymentMethod } from '@prisma/client';
import type { Tx } from '../../lib/prisma';
import { badRequest, conflict } from '../../lib/http';
import { dateStr } from '../../lib/dates';
import { audit } from '../../lib/audit';
import type { AuthUser } from '../../lib/scope';
import { lockInvoice, recomputePaid, round, withComputed } from '../invoices/invoices.service';

export type PaymentSource = 'MANUAL' | 'SUBMISSION' | 'BANK_TX' | 'WEBHOOK';

export interface RecordPaymentInput {
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  paymentDate: Date;
  reference?: string | null;
  note?: string | null;
  source: PaymentSource;
}

/**
 * Ghi nhận MỘT phiếu thu chính thức – điểm duy nhất làm thay đổi số tiền đã trả của hóa đơn.
 * Phải gọi trong transaction. Khóa dòng hóa đơn (FOR UPDATE) để chống ghi nhận đồng thời,
 * không cho trả vượt số còn nợ, tính lại paid_amount & trạng thái, ghi audit log.
 * Dùng chung cho: chủ trọ ghi thu trực tiếp, xác nhận yêu cầu chuyển khoản của người thuê,
 * và (tương lai) webhook có chữ ký hợp lệ từ cổng thanh toán.
 */
export async function recordPaymentTx(tx: Tx, user: AuthUser | null, input: RecordPaymentInput, ownerId: number) {
  await lockInvoice(tx, input.invoiceId);
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
  if (inv.status === 'CANCELLED') throw conflict('Hóa đơn đã bị hủy');
  const balance = round(Number(inv.totalAmount) - Number(inv.paidAmount));
  if (balance <= 0) throw conflict('Hóa đơn đã được thanh toán đủ');
  const amount = round(input.amount);
  if (amount <= 0) throw badRequest('Số tiền phải lớn hơn 0');
  if (amount > balance) throw badRequest(`Số tiền vượt quá số còn nợ (${balance.toLocaleString('vi-VN')} đ). Hệ thống không nhận thanh toán trước.`);

  const p = await tx.payment.create({
    data: {
      invoiceId: inv.id,
      amount,
      method: input.method,
      paymentDate: input.paymentDate,
      reference: input.reference ?? null,
      note: input.note ?? null,
      source: input.source,
      createdById: user?.id ?? null,
    },
  });
  const receiptNumber = `PT${dateStr(input.paymentDate).slice(0, 7).replace('-', '')}-${String(p.id).padStart(6, '0')}`;
  const payment = await tx.payment.update({ where: { id: p.id }, data: { receiptNumber } });
  const invoice = await recomputePaid(tx, inv.id);
  await audit(user, 'CREATE', 'payment', p.id, null, { invoiceId: inv.id, amount, method: input.method, receiptNumber, source: input.source }, tx, ownerId);
  return { payment, invoice: withComputed(invoice) };
}
