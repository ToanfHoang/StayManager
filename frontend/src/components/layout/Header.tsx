import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Menu, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE } from '../../lib/labels';
import { initials } from '../../lib/format';
import { NAV } from './Sidebar';
import { NotificationBell } from '../notifications/NotificationCenter';

const EXTRA: Record<string, { label: string }> = { 'thanh-toan': { label: 'Lịch sử thanh toán' }, 'thong-bao': { label: 'Thông báo' } };

/** Breadcrumb tự sinh từ đường dẫn; trang chi tiết có thể ghi đè nhãn cuối bằng document.title */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return <span className="text-sm font-medium text-gray-900">Tổng quan</span>;
  const section = NAV.find((n) => n.to === `/${parts[0]}`) ?? EXTRA[parts[0]];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link to="/" className="text-gray-500 hover:text-gray-700">Tổng quan</Link>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      {parts.length > 1 ? (
        <>
          <Link to={`/${parts[0]}`} className="truncate text-gray-500 hover:text-gray-700">{section?.label ?? parts[0]}</Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          <span className="truncate font-medium text-gray-900">Chi tiết</span>
        </>
      ) : (
        <span className="truncate font-medium text-gray-900">{section?.label ?? parts[0]}</span>
      )}
    </nav>
  );
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" onClick={onMenu} aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><Breadcrumb /></div>
      <NotificationBell centerPath="/thong-bao" />
      <div className="relative" ref={ref}>
        <button onClick={() => setOpen((o) => !o)} aria-label="Menu tài khoản" aria-expanded={open} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-50">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(user.fullName)}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-gray-900">{user.fullName}</span>
            <span className="block text-xs text-gray-500">{ROLE[user.role].label}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            <div className="border-b border-gray-100 px-4 py-2">
              <p className="truncate text-sm font-medium text-gray-900">{user.fullName}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
            <button className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setOpen(false); nav('/cai-dat'); }}>
              <Settings className="h-4 w-4" /> Tài khoản & cài đặt
            </button>
            <button className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50" onClick={async () => { await logout(); nav('/dang-nhap'); }}>
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
