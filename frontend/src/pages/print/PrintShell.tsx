import { useEffect, type ReactNode } from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/States';

/** Khung trang in A4: thanh công cụ (ẩn khi in) + nội dung. Dùng "In → Lưu thành PDF" để xuất PDF. */
export function PrintShell({ title, loading, error, children }: { title: string; loading: boolean; error: string | null; children: ReactNode }) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <p className="text-sm text-gray-600">Chọn <b>In</b> → máy in <b>“Lưu thành PDF”</b> để xuất file PDF.</p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => window.close()}>Đóng</Button>
          <Button icon={<Printer className="h-4 w-4" />} disabled={loading || !!error} onClick={() => window.print()}>In / Lưu PDF</Button>
        </div>
      </div>
      <div className="print-page mx-auto max-w-[210mm] bg-white px-10 py-10 text-[13px] leading-relaxed text-gray-900 shadow-lg">
        {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : children}
      </div>
    </div>
  );
}

export function Signatures({ left, right, leftName, rightName }: { left: string; right: string; leftName?: string; rightName?: string }) {
  return (
    <div className="mt-10 grid grid-cols-2 text-center">
      <div><p className="font-semibold">{left}</p><p className="text-xs italic text-gray-500">(Ký, ghi rõ họ tên)</p><p className="mt-16 font-medium">{leftName}</p></div>
      <div><p className="font-semibold">{right}</p><p className="text-xs italic text-gray-500">(Ký, ghi rõ họ tên)</p><p className="mt-16 font-medium">{rightName}</p></div>
    </div>
  );
}
