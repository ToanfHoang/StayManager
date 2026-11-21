import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, TOKEN_KEY } from '../api/client';
import type { Role, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Tạo tài khoản chủ trọ đầu tiên (bản cài mới) */
  setup: (body: { fullName: string; email: string; phone?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<User>('/auth/me');
      setUser(data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };

  const setup = async (body: { fullName: string; email: string; phone?: string; password: string }) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/setup', body);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token có thể đã hết hạn */
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const hasRole = (...roles: Role[]) => !!user && roles.includes(user.role);

  return <Ctx.Provider value={{ user, loading, login, setup, logout, refresh, hasRole }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth phải dùng trong AuthProvider');
  return c;
}
