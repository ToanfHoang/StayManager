import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'staymanager_token';

export const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith('/dang-nhap')) location.assign('/dang-nhap?het-han=1');
    }
    return Promise.reject(err);
  },
);

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary?: Record<string, number>;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PageMeta;
  error?: { code: string; message: string; details?: Record<string, string> };
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: Record<string, string>) {
    super(message);
  }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as Envelope<unknown> | undefined;
    if (body?.error) return new ApiError(body.error.message, e.response!.status, body.error.code, body.error.details);
    if (!e.response) return new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra mạng hoặc máy chủ API.', 0);
    return new ApiError(`Lỗi máy chủ (${e.response.status})`, e.response.status);
  }
  return new ApiError((e as Error)?.message ?? 'Đã có lỗi xảy ra', 0);
}

export const errorMessage = (e: unknown) => toApiError(e).message;

async function request<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown, params?: object) {
  try {
    const res = await http.request<Envelope<T>>({ method, url, data: body, params: params ? cleanParams(params) : undefined });
    return { data: res.data.data, meta: res.data.meta };
  } catch (e) {
    throw toApiError(e);
  }
}

/** Bỏ các tham số rỗng khỏi query string */
export function cleanParams(params: object) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== 'ALL'));
}

export const api = {
  get: <T>(url: string, params?: object) => request<T>('get', url, undefined, params),
  post: <T>(url: string, body?: unknown) => request<T>('post', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('put', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('patch', url, body),
  del: <T>(url: string) => request<T>('delete', url),
  upload: async <T>(url: string, form: FormData) => {
    try {
      const res = await http.post<Envelope<T>>(url, form);
      return { data: res.data.data, meta: res.data.meta };
    } catch (e) {
      throw toApiError(e);
    }
  },
  /** Tải file (Excel…) kèm token */
  download: async (url: string, params: object, filename: string) => {
    try {
      const res = await http.get(url, { params: cleanParams(params), responseType: 'blob' });
      const href = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch (e) {
      throw toApiError(e);
    }
  },
};
