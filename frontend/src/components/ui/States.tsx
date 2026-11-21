import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ label = 'Đang tải dữ liệu…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-gray-500 ${className}`} role="status">
      <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500"><AlertTriangle className="h-6 w-6" /></div>
      <p className="font-medium text-gray-900">Không tải được dữ liệu</p>
      <p className="mt-1 max-w-md text-sm text-gray-500">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Thử lại</Button>}
    </div>
  );
}

/** Tiện ích: hiển thị loading/error/empty trước nội dung */
export function AsyncContent({ loading, error, onRetry, empty, children }: { loading: boolean; error: string | null; onRetry?: () => void; empty?: ReactNode | false; children: ReactNode }) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}
