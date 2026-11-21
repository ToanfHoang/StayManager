import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type PageMeta } from '../api/client';

/** Gọi GET và quản lý trạng thái loading / error / reload */
export function useApi<T>(url: string | null, params?: object) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const key = url ? `${url}?${JSON.stringify(params ?? {})}` : null;
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url, params);
      if (id !== seq.current) return;
      setData(res.data);
      setMeta(res.meta);
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, meta, loading, error, reload: load, setData };
}

export function useDebounce<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
