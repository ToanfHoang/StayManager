import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base =
  'block w-full rounded-lg border bg-white px-3 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500';
const ok = 'border-gray-300 focus:border-primary-500 focus:ring-primary-100';
const bad = 'border-red-400 focus:border-red-500 focus:ring-red-100';

interface FieldProps {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, error, hint, required, className = '', children }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children(id)}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string; suffix?: ReactNode };

export const FormInput = forwardRef<HTMLInputElement, InputProps>(function FormInput({ label, error, hint, wrapperClassName, suffix, className = '', required, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => (
        <div className="relative">
          <input ref={ref} id={id} required={required} aria-invalid={!!error} className={`${base} h-10 ${error ? bad : ok} ${suffix ? 'pr-12' : ''} ${className}`} {...rest} />
          {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">{suffix}</span>}
        </div>
      )}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  wrapperClassName?: string;
};

export function Select({ label, error, hint, options, placeholder, wrapperClassName, className = '', required, ...rest }: SelectProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => (
        <select id={id} required={required} aria-invalid={!!error} className={`${base} h-10 pr-8 ${error ? bad : ok} ${className}`} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string };

export function Textarea({ label, error, hint, wrapperClassName, className = '', required, rows = 3, ...rest }: TextareaProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      {(id) => <textarea id={id} rows={rows} required={required} aria-invalid={!!error} className={`${base} py-2 ${error ? bad : ok} ${className}`} {...rest} />}
    </Field>
  );
}

/** Ô nhập tiền: hiển thị dấu chấm phân cách hàng nghìn, trả về số */
export function MoneyInput({ value, onChange, ...rest }: Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: number | string | null | undefined; onChange: (v: number | '') => void }) {
  const fmt = (v: number | string | null | undefined) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? '' : new Intl.NumberFormat('vi-VN').format(Number(v)));
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    const parsed = text.replace(/\./g, '');
    if (String(value ?? '') !== parsed) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <FormInput
      {...rest}
      inputMode="numeric"
      suffix="₫"
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
        setText(digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '');
        onChange(digits ? Number(digits) : '');
      }}
    />
  );
}

/** DatePicker dùng input date gốc của trình duyệt (giá trị YYYY-MM-DD, hiển thị theo ngôn ngữ máy) */
export function DatePicker({ value, onChange, type = 'date', ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; type?: 'date' | 'month' }) {
  return <FormInput {...rest} type={type} value={value} onChange={(e) => onChange(e.target.value)} />;
}
