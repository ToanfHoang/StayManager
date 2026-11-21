import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { Textarea } from './FormInput';

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]),select,textarea')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${widths[size]}`}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Hộp xác nhận; nếu requireReason thì bắt nhập lý do */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Xác nhận', danger = true, requireReason, reasonLabel = 'Lý do' }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const run = async () => {
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      /* lỗi đã được thông báo bởi nơi gọi */
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={<span className="flex items-center gap-2">{danger && <AlertTriangle className="h-5 w-5 text-red-500" />}{title}</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy bỏ</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={requireReason && reason.trim().length < 3} onClick={run}>{confirmText}</Button>
        </>
      }
    >
      <div className="text-sm text-gray-600">{message}</div>
      {requireReason && (
        <div className="mt-4">
          <Textarea label={reasonLabel} required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tối thiểu 3 ký tự" />
        </div>
      )}
    </Modal>
  );
}
