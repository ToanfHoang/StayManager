import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '../../api/client';
import { EmptyState, ErrorState, LoadingState } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Ẩn cột trên màn hình nhỏ */
  hideOnMobile?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, footer }: {
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
}) {
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !rows?.length) return <LoadingState />;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Chưa có dữ liệu" />}</>;
  return (
    <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${align(c.align)} ${c.hideOnMobile ? 'hidden md:table-cell' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 align-middle text-gray-700 ${align(c.align)} ${c.hideOnMobile ? 'hidden md:table-cell' : ''} ${c.className ?? ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="bg-gray-50 font-semibold">{footer}</tfoot>}
      </table>
    </div>
  );
}

export function Pagination({ meta, onChange }: { meta?: PageMeta; onChange: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  const pages: number[] = [];
  for (let p = Math.max(1, meta.page - 2); p <= Math.min(meta.totalPages, meta.page + 2); p++) pages.push(p);
  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
      <span>Hiển thị {from}–{to} / {meta.total}</span>
      {meta.totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button className={`${btn} hover:bg-gray-100 disabled:opacity-40`} disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></button>
          {pages.map((p) => (
            <button key={p} className={`${btn} ${p === meta.page ? 'bg-primary-600 font-medium text-white' : 'hover:bg-gray-100'}`} onClick={() => onChange(p)}>{p}</button>
          ))}
          <button className={`${btn} hover:bg-gray-100 disabled:opacity-40`} disabled={meta.page >= meta.totalPages} onClick={() => onChange(meta.page + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
