/**
 * Tạo chuỗi QR theo chuẩn VietQR (EMVCo – NAPAS 247, chuyển khoản tới tài khoản).
 * Mọi app ngân hàng Việt Nam hỗ trợ VietQR đều quét được; số tiền và nội dung được điền sẵn.
 */
import QRCode from 'qrcode';

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) theo EMVCo */
export function crc16(input: string) {
  let crc = 0xffff;
  for (const ch of Buffer.from(input, 'utf8')) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu tiếng Việt, chỉ giữ ký tự an toàn cho nội dung chuyển khoản */
export function sanitizeTransferText(s: string, max = 50) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .slice(0, max);
}

export interface VietQrInput {
  bin: string; // mã BIN ngân hàng 6 chữ số
  accountNumber: string;
  amount?: number; // VND, số nguyên
  description?: string;
}

export function validateBankInfo(bin: string, accountNumber: string) {
  if (!/^\d{6}$/.test(bin)) return 'Mã ngân hàng (BIN) phải gồm 6 chữ số theo chuẩn NAPAS';
  if (!/^[0-9A-Za-z]{4,19}$/.test(accountNumber)) return 'Số tài khoản không hợp lệ (4–19 ký tự chữ/số)';
  return null;
}

export function buildVietQrPayload({ bin, accountNumber, amount, description }: VietQrInput) {
  const err = validateBankInfo(bin, accountNumber);
  if (err) throw new Error(err);
  const consumer = tlv('00', bin) + tlv('01', accountNumber);
  const merchant = tlv('00', 'A000000727') + tlv('01', consumer) + tlv('02', 'QRIBFTTA');
  const hasAmount = amount !== undefined && amount > 0;
  let payload =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') + // 12 = QR động (có số tiền), 11 = QR tĩnh
    tlv('38', merchant) +
    tlv('53', '704') + // VND
    (hasAmount ? tlv('54', String(Math.round(amount!))) : '') +
    tlv('58', 'VN');
  const desc = description ? sanitizeTransferText(description) : '';
  if (desc) payload += tlv('62', tlv('08', desc));
  payload += '6304';
  return payload + crc16(payload);
}

export async function vietQrDataUrl(input: VietQrInput) {
  return QRCode.toDataURL(buildVietQrPayload(input), { errorCorrectionLevel: 'M', margin: 2, width: 320 });
}
