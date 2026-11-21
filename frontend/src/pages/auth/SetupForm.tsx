import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { FormInput } from '../../components/ui/FormInput';

/** Màn hình thiết lập lần đầu: tạo tài khoản chủ trọ khi ứng dụng chưa có tài khoản nào */
export function SetupForm() {
  const { setup } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.fullName.trim()) er.fullName = 'Vui lòng nhập họ tên';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'Email không hợp lệ';
    if (f.password.length < 8) er.password = 'Mật khẩu tối thiểu 8 ký tự';
    if (f.confirm !== f.password) er.confirm = 'Mật khẩu nhập lại không khớp';
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    setError(null);
    try {
      await setup({ fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, password: f.password });
      nav('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <div className="mb-8 flex items-center gap-2 lg:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white"><Home className="h-5 w-5" /></div>
        <span className="text-lg font-semibold">StayManager</span>
      </div>
      <h2 className="text-2xl font-semibold text-gray-900">Thiết lập lần đầu</h2>
      <p className="mt-1 text-sm text-gray-500">Tạo tài khoản chủ trọ để bắt đầu sử dụng. Hãy ghi nhớ email và mật khẩu này.</p>
      {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</div>}
      <div className="mt-6 space-y-4">
        <FormInput label="Họ tên" required value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" />
        <FormInput label="Email đăng nhập" required type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="username" placeholder="ban@example.com" />
        <FormInput label="Số điện thoại" value={f.phone} onChange={set('phone')} autoComplete="tel" />
        <FormInput label="Mật khẩu" required type="password" value={f.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
        <FormInput label="Nhập lại mật khẩu" required type="password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
      </div>
      <Button type="submit" loading={loading} className="mt-6 w-full">Tạo tài khoản và bắt đầu</Button>
    </form>
  );
}
