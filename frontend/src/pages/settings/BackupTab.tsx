import { useRef, useState } from 'react';
import { Download, FolderOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, errorMessage, http } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../lib/format';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';

interface BackupInfo {
  dataDir: string;
  backupsDir: string;
  autoBackups: { name: string; size: number; modifiedAt: string }[];
  canRestart: boolean;
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function BackupTab() {
  const toast = useToast();
  const { data } = useApi<BackupInfo>('/backup');
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState<'idle' | 'restarting' | 'manual'>('idle');
  const input = useRef<HTMLInputElement>(null);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await http.get('/backup/download', { responseType: 'blob', timeout: 300000 });
      const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'staymanager-saoluu.zip';
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success('Đã tạo bản sao lưu. Hãy cất file này ra ngoài máy (USB, Google Drive…).');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  const restore = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data: r } = await api.upload<{ restarting: boolean }>('/backup/restore', form);
      setFile(null);
      setRestoring(r.restarting ? 'restarting' : 'manual');
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  if (restoring !== 'idle') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <div>
            <p className="font-semibold text-gray-900">{restoring === 'restarting' ? 'Đang khởi động lại ứng dụng để khôi phục dữ liệu…' : 'Đã nhận bản sao lưu'}</p>
            <p className="mt-1 text-sm text-gray-600">
              {restoring === 'restarting'
                ? 'Ứng dụng sẽ tự mở lại sau vài giây. Sau đó đăng nhập bằng tài khoản có trong bản sao lưu.'
                : 'Hãy tắt rồi mở lại ứng dụng để hoàn tất khôi phục. Sau đó đăng nhập bằng tài khoản có trong bản sao lưu.'}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Sao lưu dữ liệu" subtitle="Tải về 1 file .zip chứa toàn bộ dữ liệu (khu trọ, phòng, người thuê, hóa đơn, thu chi, ảnh phòng)." />
        <Button onClick={download} loading={downloading}><Download className="h-4 w-4" /> Tải bản sao lưu</Button>
        <p className="mt-3 text-sm text-gray-500">Nên sao lưu ít nhất mỗi tháng sau khi lập hóa đơn và cất file ra ngoài máy (USB, Google Drive…) phòng khi máy hỏng.</p>
      </Card>

      <Card>
        <CardHeader title="Khôi phục dữ liệu" subtitle="Dùng khi cài lại máy hoặc chuyển sang máy tính khác." />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Toàn bộ dữ liệu hiện tại sẽ được <b>thay thế</b> bằng dữ liệu trong file sao lưu. Ứng dụng vẫn giữ lại 1 bản dự phòng của dữ liệu hiện tại trong thư mục sao lưu tự động.
        </div>
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <Button variant="secondary" className="mt-4" onClick={() => input.current?.click()}><RotateCcw className="h-4 w-4" /> Chọn file sao lưu để khôi phục…</Button>
      </Card>

      <Card>
        <CardHeader title="Sao lưu tự động" subtitle="Mỗi ngày ứng dụng tự lưu 1 bản trên máy này, giữ 14 bản gần nhất." />
        {data ? (
          <>
            <p className="flex items-start gap-2 break-all text-sm text-gray-600"><FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> {data.backupsDir}</p>
            {data.autoBackups.length ? (
              <ul className="mt-3 divide-y divide-gray-100 text-sm">
                {data.autoBackups.slice(0, 5).map((b) => (
                  <li key={b.name} className="flex justify-between gap-3 py-2"><span className="truncate">{b.name}</span><span className="shrink-0 text-gray-500">{formatDateTime(b.modifiedAt)} · {size(b.size)}</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Chưa có bản tự động nào (bản đầu tiên được tạo sau khi mở ứng dụng vài giây).</p>
            )}
            <p className="mt-3 flex items-center gap-2 text-xs text-gray-500"><ShieldCheck className="h-4 w-4 text-green-600" /> Bản tự động nằm trên cùng ổ đĩa – vẫn nên tải bản sao lưu ra ngoài định kỳ.</p>
          </>
        ) : <p className="text-sm text-gray-500">Đang tải…</p>}
      </Card>

      <ConfirmDialog
        open={!!file}
        onClose={() => setFile(null)}
        onConfirm={restore}
        title="Khôi phục dữ liệu?"
        message={`Dữ liệu hiện tại sẽ được thay bằng dữ liệu trong file "${file?.name ?? ''}". Ứng dụng sẽ khởi động lại.`}
        confirmText="Khôi phục"
      />
    </div>
  );
}
