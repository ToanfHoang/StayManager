import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Home, Lock, Mail, Receipt, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { SetupForm } from './SetupForm';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { FormInput } from '../../components/ui/FormInput';

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('het-han') ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' : null);
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ needsSetup: boolean }>('/auth/setup').then((r) => setNeedsSetup(r.data.needsSetup)).catch(() => setNeedsSetup(false));
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      nav((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15"><Home className="h-5 w-5" /></div>
          <span className="text-xl font-semibold">StayManager</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Quản lý nhà trọ gọn gàng, chính xác và minh bạch.</h1>
          <ul className="mt-8 space-y-4 text-primary-100">
            <li className="flex items-center gap-3"><Building2 className="h-5 w-5" /> Nhiều khu trọ, phòng, người thuê và hợp đồng</li>
            <li className="flex items-center gap-3"><Receipt className="h-5 w-5" /> Tự động tính tiền điện nước và lập hóa đơn</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /> Theo dõi công nợ, thu chi và báo cáo</li>
          </ul>
        </div>
        <p className="text-sm text-primary-200">© {new Date().getFullYear()} StayManager</p>
      </div>
      <div className="flex items-center justify-center bg-gray-50 px-4 py-12">
        {needsSetup === null ? null : needsSetup ? <SetupForm /> : (
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white"><Home className="h-5 w-5" /></div>
            <span className="text-lg font-semibold">StayManager</span>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Đăng nhập</h2>
          <p className="mt-1 text-sm text-gray-500">Chào mừng trở lại! Vui lòng nhập thông tin tài khoản.</p>
          {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</div>}
          <div className="mt-6 space-y-4">
            <div className="relative">
              <FormInput label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@example.com" className="pl-9" />
              <Mail className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-gray-400" />
            </div>
            <div className="relative">
              <FormInput label="Mật khẩu" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9" />
              <Lock className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-gray-400" />
            </div>
          </div>
          <Button type="submit" loading={loading} className="mt-6 w-full">Đăng nhập</Button>
          <p className="mt-6 text-center text-xs text-gray-500">Quên mật khẩu? Liên hệ quản trị viên hoặc chủ trọ để được đặt lại.</p>
        </form>
        )}
      </div>
    </div>
  );
}
