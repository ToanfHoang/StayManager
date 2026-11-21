import { NavLink } from 'react-router-dom';
import {
  MessageCircle, BarChart3, Building2, DoorOpen, FileSignature, Gauge, LayoutDashboard, Receipt, Settings, Users, Wallet, Wrench, X, Home,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/khu-tro', label: 'Quản lý khu trọ', icon: Building2 },
  { to: '/phong', label: 'Quản lý phòng', icon: DoorOpen },
  { to: '/nguoi-thue', label: 'Người thuê', icon: Users },
  { to: '/hop-dong', label: 'Hợp đồng', icon: FileSignature },
  { to: '/hoa-don', label: 'Hóa đơn', icon: Receipt },
  { to: '/gui-zalo', label: 'Gửi tiền phòng (Zalo)', icon: MessageCircle },
  { to: '/dien-nuoc', label: 'Điện nước', icon: Gauge },
  { to: '/thu-chi', label: 'Thu chi', icon: Wallet },
  { to: '/sua-chua', label: 'Yêu cầu sửa chữa', icon: Wrench },
  { to: '/bao-cao', label: 'Báo cáo thống kê', icon: BarChart3 },
  { to: '/cai-dat', label: 'Cài đặt', icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between gap-2 border-b border-gray-100 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white"><Home className="h-5 w-5" /></div>
            <div>
              <p className="text-base font-semibold leading-tight text-gray-900">StayManager</p>
              <p className="text-xs text-gray-500">Quản lý nhà trọ</p>
            </div>
          </div>
          <button className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 lg:hidden" onClick={onClose} aria-label="Đóng menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">Phiên bản 1.0 · Giờ Việt Nam (GMT+7)</p>
      </aside>
    </>
  );
}
