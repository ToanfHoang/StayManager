import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string }

const Ctx = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => remove(id), kind === 'error' ? 6000 : 3500);
  }, []);
  const value = useMemo(() => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg ${t.kind === 'error' ? 'border-red-200' : 'border-emerald-200'}`}>
            {t.kind === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
            <p className="flex-1 text-sm text-gray-700">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600" aria-label="Đóng"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast phải dùng trong ToastProvider');
  return c;
}
