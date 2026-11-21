import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../ui/States';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/** Bố cục chính + bảo vệ route (yêu cầu đăng nhập) */
export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  if (loading) return <LoadingState label="Đang kiểm tra đăng nhập…" className="min-h-screen" />;
  if (!user) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="lg:pl-64">
        <Header onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Route chỉ cho vai trò nhất định */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState className="min-h-screen" />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return <>{children}</>;
}
