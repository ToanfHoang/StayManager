import { useState } from 'react';
import type { ZodType } from 'zod';
import { ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';

/**
 * Quản lý form: giá trị, lỗi theo trường, kiểm tra Zod phía client,
 * và gắn lỗi validation từ server (details) vào đúng trường.
 */
export function useForm<T extends Record<string, unknown>>(initial: T, schema?: ZodType) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
  };

  const validate = () => {
    if (!schema) return true;
    const r = schema.safeParse(values);
    if (r.success) return true;
    const errs: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = issue.path.join('.');
      if (!errs[k]) errs[k] = issue.message;
    }
    setErrors(errs);
    return false;
  };

  const submit = async (fn: (values: T) => Promise<void>) => {
    if (!validate()) {
      toast.error('Vui lòng kiểm tra lại các trường được đánh dấu');
      return;
    }
    setSubmitting(true);
    try {
      await fn(values);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.details) setErrors(e.details);
        toast.error(e.message);
      } else toast.error('Đã có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, set, errors, setErrors, submitting, submit };
}
