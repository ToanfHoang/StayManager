import { useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { CheckCircle2, Copy, Download, ExternalLink, Image as ImageIcon, Share2, Undo2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Invoice } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingState, ErrorState } from '../ui/States';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPeriod } from '../../lib/format';

interface ZaloMessage {
  invoiceId: number;
  text: string;
  phone: string | null;
  rawPhone: string | null;
  tenantName: string | null;
  zaloSentAt: string | null;
  qr: { dataUrl: string | null; bankName: string; accountNumber: string; accountHolder: string; amount: number; reference: string } | null;
}

/** Ảnh hóa đơn gửi qua Zalo (được chuyển thành PNG) */
function InvoiceCard({ inv, msg }: { inv: Invoice; msg: ZaloMessage }) {
  return (
    <div style={{ width: 380, fontFamily: 'Arial, Helvetica, sans-serif' }} className="bg-white p-5 text-[13px] text-gray-900">
      <p className="text-center text-base font-bold uppercase">{inv.room.property.name}</p>
      <p className="text-center text-sm font-semibold">HÓA ĐƠN TIỀN PHÒNG THÁNG {formatPeriod(inv.period)}</p>
      <p className="mt-2 text-center">Phòng <b>{inv.room.roomNumber}</b>{msg.tenantName ? <> · {msg.tenantName}</> : null}</p>
      <table className="mt-3 w-full border-collapse">
        <tbody>
          {inv.items?.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="py-1.5 pr-2">
                {it.description.replace(/\s*\(.*\)\s*$/, '')}
                {(it.type === 'ELECTRICITY' || it.type === 'WATER' || it.quantity !== 1) && (
                  <span className="block text-[11px] text-gray-500">
                    {it.type === 'ELECTRICITY' ? `${it.description.match(/\((.*)\)/)?.[1] ?? ''} = ${formatNumber(it.quantity)} kWh × ${formatMoney(it.unitPrice)}`
                      : it.type === 'WATER' && it.description.includes('chia đầu người') ? `${formatNumber(it.quantity)} người × ${formatMoney(it.unitPrice)}`
                      : `${formatNumber(it.quantity)} × ${formatMoney(it.unitPrice)}`}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right align-top font-medium">{formatMoney(it.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 text-sm font-bold">TỔNG CỘNG</td>
            <td className="pt-2 text-right text-base font-bold">{formatMoney(inv.totalAmount)}</td>
          </tr>
          {inv.paidAmount > 0 && (
            <tr><td className="text-gray-600">Còn phải trả</td><td className="text-right font-bold">{formatMoney(inv.balance)}</td></tr>
          )}
        </tbody>
      </table>
      <p className="mt-2">Hạn thanh toán: <b>{formatDate(inv.dueDate)}</b></p>
      {msg.qr && (
        <div className="mt-3 border-t border-gray-200 pt-3 text-center">
          {msg.qr.dataUrl && <img src={msg.qr.dataUrl} alt="QR" style={{ width: 180, height: 180 }} className="mx-auto" />}
          <p className="mt-1 font-semibold">{msg.qr.bankName}</p>
          <p>STK: <b>{msg.qr.accountNumber}</b> – {msg.qr.accountHolder}</p>
          <p>Nội dung: <b>{msg.qr.reference}</b></p>
          {msg.qr.dataUrl && <p className="text-[11px] text-gray-500">Quét mã bằng app ngân hàng – số tiền & nội dung đã điền sẵn</p>}
        </div>
      )}
    </div>
  );
}

const canShareFiles = () => {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
};

export function ZaloSendModal({ invoiceId, onClose, onChanged }: { invoiceId: number; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const msg = useApi<ZaloMessage>(`/invoices/${invoiceId}/zalo-message`);
  const inv = useApi<Invoice>(`/invoices/${invoiceId}`);
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null | undefined>(undefined);
  const sent = sentAt === undefined ? msg.data?.zaloSentAt : sentAt;

  const makeImage = async () => {
    if (!cardRef.current) throw new Error('Chưa sẵn sàng');
    const blob = await toBlob(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true });
    if (!blob) throw new Error('Không tạo được ảnh hóa đơn');
    return blob;
  };
  const fileName = () => `hoa-don-${inv.data?.room.roomNumber}-${inv.data?.period}.png`;
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const mark = async (value: boolean) => {
    const r = await api.post<{ zaloSentAt: string | null }>(`/invoices/${invoiceId}/zalo-sent`, { sent: value });
    setSentAt(r.data.zaloSentAt);
    onChanged?.();
  };

  const share = () => act('share', async () => {
    const file = new File([await makeImage()], fileName(), { type: 'image/png' });
    await navigator.share({ files: [file], text: msg.data!.text });
    await mark(true);
    toast.success('Đã mở chia sẻ – chọn Zalo và người thuê để gửi');
  });
  const copyText = () => act('text', async () => {
    await navigator.clipboard.writeText(msg.data!.text);
    toast.success('Đã sao chép tin nhắn – dán vào khung chat Zalo');
  });
  const copyImage = () => act('image', async () => {
    const blob = await makeImage();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast.success('Đã sao chép ảnh hóa đơn – dán (Ctrl+V) vào khung chat Zalo');
  });
  const download = () => act('download', async () => {
    const href = URL.createObjectURL(await makeImage());
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  });

  const loading = (msg.loading && !msg.data) || (inv.loading && !inv.data);
  const error = msg.error || inv.error;

  return (
    <Modal open onClose={onClose} size="xl" title="Gửi tiền phòng qua Zalo" description={msg.data ? `${msg.data.tenantName ?? 'Người thuê'} · ${msg.data.rawPhone ?? 'chưa có SĐT'}` : undefined}>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : msg.data && inv.data && (
        <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div ref={cardRef} className="inline-block"><InvoiceCard inv={inv.data} msg={msg.data} /></div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Nội dung tin nhắn</p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 font-sans text-sm text-gray-800">{msg.data.text}</pre>
            </div>
            {!msg.data.qr && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Chưa có mã QR: thêm tài khoản ngân hàng ở Cài đặt → Tài khoản ngân hàng để tin nhắn kèm STK và mã QR.</p>}
            {canShareFiles() && (
              <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-3">
                <p className="mb-2 text-sm text-primary-900"><b>Trên điện thoại:</b> bấm Chia sẻ → chọn <b>Zalo</b> → chọn người thuê.</p>
                <Button className="w-full" icon={<Share2 className="h-4 w-4" />} loading={busy === 'share'} onClick={share}>Chia sẻ ảnh + tin nhắn (chọn Zalo)</Button>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-sm text-gray-700"><b>Trên máy tính:</b> mở chat Zalo, rồi dán tin nhắn và ảnh vào khung chat.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<ExternalLink className="h-4 w-4" />} disabled={!msg.data.phone} onClick={() => window.open(`https://zalo.me/${msg.data!.phone}`, '_blank')}>1. Mở chat Zalo</Button>
                <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} loading={busy === 'text'} onClick={copyText}>2. Sao chép tin nhắn</Button>
                <Button size="sm" variant="secondary" icon={<ImageIcon className="h-4 w-4" />} loading={busy === 'image'} onClick={copyImage}>3. Sao chép ảnh</Button>
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} loading={busy === 'download'} onClick={download}>Tải ảnh</Button>
              </div>
              {!msg.data.phone && <p className="mt-2 text-xs text-red-600">Người thuê chưa có số điện thoại hợp lệ – cập nhật ở hồ sơ người thuê.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
              {sent ? <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã gửi lúc {formatDateTime(sent)}</p> : <p className="text-sm text-gray-500">Chưa đánh dấu đã gửi</p>}
              {sent ? (
                <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} loading={busy === 'mark'} onClick={() => act('mark', () => mark(false))}>Bỏ đánh dấu</Button>
              ) : (
                <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy === 'mark'} onClick={() => act('mark', async () => { await mark(true); toast.success('Đã đánh dấu đã gửi'); })}>Đánh dấu đã gửi</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
