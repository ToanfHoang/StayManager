import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, BellRing, CheckCheck, CheckCircle2, ClipboardList, FileText, Landmark, Megaphone, Receipt, Wrench, XCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { AppNotification, NotificationType } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';
import { NOTIFICATION_TYPE } from '../../lib/labels';
import { Button } from '../ui/Button';
import { Pagination } from '../ui/DataTable';
import { FilterDropdown } from '../ui/Filters';
import { EmptyState, ErrorState, LoadingState } from '../ui/States';
import { Badge } from '../ui/StatusBadge';

const ICON: Record<NotificationType, typeof Bell> = {
  INVOICE_CREATED: FileText, PAYMENT_REMINDER: BellRing, INVOICE_OVERDUE: AlertTriangle, PAYMENT_VERIFIED: CheckCircle2,
  PAYMENT_REJECTED: XCircle, PAYMENT_SUBMITTED: Receipt, MAINTENANCE_REQUEST: Wrench, MAINTENANCE_UPDATE: Wrench,
  UNPAID_SUMMARY: ClipboardList, CONTRACT_EXPIRING: FileText, ANNOUNCEMENT: Megaphone, BANK_TX_UNMATCHED: Landmark, PAYMENT_AUTO_MATCHED: CheckCircle2,
};
const COLOR: Partial<Record<NotificationType, string>> = {
  INVOICE_OVERDUE: 'bg-red-50 text-red-600', PAYMENT_REJECTED: 'bg-red-50 text-red-600', PAYMENT_VERIFIED: 'bg-emerald-50 text-emerald-600',
  PAYMENT_REMINDER: 'bg-amber-50 text-amber-600', UNPAID_SUMMARY: 'bg-amber-50 text-amber-600', BANK_TX_UNMATCHED: 'bg-amber-50 text-amber-600', PAYMENT_AUTO_MATCHED: 'bg-emerald-50 text-emerald-600',
};

/** Thời gian tương đối tiếng Việt */
export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ngày trước`;
  return formatDateTime(iso);
}

/** Đếm thông báo chưa đọc – tự cập nhật định kỳ và khi có sự kiện "notifications:changed" */
export function useUnreadCount(intervalMs = 45000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<{ count: number }>('/notifications/unread-count').then((r) => alive && setCount(r.data.count)).catch(() => undefined);
    void load();
    const t = setInterval(load, intervalMs);
    window.addEventListener('notifications:changed', load);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('notifications:changed', load);
      window.removeEventListener('focus', load);
    };
  }, [intervalMs]);
  return count;
}

export const notifyChanged = () => window.dispatchEvent(new Event('notifications:changed'));

function NotificationItem({ n, onOpen, compact }: { n: AppNotification; onOpen: (n: AppNotification) => void; compact?: boolean }) {
  const Icon = ICON[n.type] ?? Bell;
  return (
    <li className={`flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${n.isRead ? '' : 'bg-primary-50/40'}`}>
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${COLOR[n.type] ?? 'bg-primary-50 text-primary-600'}`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <button className="block w-full text-left" onClick={() => onOpen(n)}>
          <p className={`text-sm ${n.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</p>
          <p className={`mt-0.5 text-sm text-gray-600 ${compact ? 'line-clamp-2' : ''}`}>{n.message}</p>
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
          {!compact && <Badge tone={NOTIFICATION_TYPE[n.type]?.tone}>{NOTIFICATION_TYPE[n.type]?.label}</Badge>}
          {n.link && n.actionLabel && !compact && <Button size="sm" variant="secondary" onClick={() => onOpen(n)}>{n.actionLabel}</Button>}
        </div>
      </div>
      {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Chưa đọc" />}
    </li>
  );
}

function useOpenNotification() {
  const nav = useNavigate();
  return async (n: AppNotification, after?: () => void) => {
    if (!n.isRead) {
      await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
      notifyChanged();
    }
    after?.();
    if (n.link) {
      if (n.link.startsWith('/cong-thue/phieu-thu/')) window.open(n.link, '_blank');
      else nav(n.link);
    }
  };
}

/** Chuông thông báo trên header (cả 2 cổng) */
export function NotificationBell({ centerPath }: { centerPath: string }) {
  const count = useUnreadCount();
  const nav = useNavigate();
  const open = useOpenNotification();
  const [show, setShow] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setShow(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    if (show) api.get<AppNotification[]>('/notifications', { pageSize: 8 }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [show, count]);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    setItems((l) => l?.map((n) => ({ ...n, isRead: true })) ?? null);
    notifyChanged();
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setShow((s) => !s)} className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label={`Thông báo${count ? ` (${count} chưa đọc)` : ''}`}>
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {show && (
        <div className="absolute right-0 z-30 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="font-semibold text-gray-900">Thông báo</p>
            {count > 0 && <button className="link text-sm" onClick={readAll}>Đánh dấu tất cả đã đọc</button>}
          </div>
          {items === null ? <LoadingState className="py-8" /> : !items.length ? <p className="px-4 py-10 text-center text-sm text-gray-500">Bạn chưa có thông báo nào</p> : (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
              {items.map((n) => <NotificationItem key={n.id} n={n} compact onOpen={(x) => open(x, () => setShow(false))} />)}
            </ul>
          )}
          <button onClick={() => { setShow(false); nav(centerPath); }} className="block w-full border-t border-gray-100 py-2.5 text-center text-sm font-medium text-primary-600 hover:bg-gray-50">Xem tất cả thông báo</button>
        </div>
      )}
    </div>
  );
}

/** Trang trung tâm thông báo: lọc theo loại, đánh dấu đã đọc, bấm để đi tới trang liên quan */
export function NotificationCenter({ types }: { types: string[] }) {
  const toast = useToast();
  const open = useOpenNotification();
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload, setData } = useApi<AppNotification[]>('/notifications', { type, unread: unreadOnly ? 'true' : '', page, pageSize: 20 });
  const unread = meta?.summary?.unread ?? 0;

  const readAll = async () => {
    try {
      await api.post('/notifications/read-all');
      notifyChanged();
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterDropdown value={type} onChange={(v) => { setType(v); setPage(1); }} allLabel="Tất cả loại" options={types.map((t) => ({ value: t, label: NOTIFICATION_TYPE[t]?.label ?? t }))} />
        <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} className="h-4 w-4 rounded border-gray-300 text-primary-600" />Chỉ chưa đọc</label>
        <div className="flex items-center gap-3 sm:ml-auto">
          <span className="text-sm text-gray-500">{unread} chưa đọc</span>
          <Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} disabled={!unread} onClick={readAll}>Đánh dấu tất cả đã đọc</Button>
        </div>
      </div>
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="Không có thông báo" description={type || unreadOnly ? 'Thử bỏ bộ lọc.' : 'Thông báo mới sẽ xuất hiện tại đây.'} />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map((n) => <NotificationItem key={n.id} n={n} onOpen={(x) => open(x, () => setData((l) => l?.map((y) => (y.id === x.id ? { ...y, isRead: true } : y)) ?? null))} />)}
        </ul>
      )}
      <Pagination meta={meta} onChange={setPage} />
    </div>
  );
}
