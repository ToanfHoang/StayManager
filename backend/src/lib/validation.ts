import { z } from 'zod';
import { toDate } from './dates';

// Thông báo lỗi tiếng Việt mặc định cho Zod
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Trường này là bắt buộc' };
      return { message: 'Giá trị không hợp lệ' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Trường này là bắt buộc' : `Tối thiểu ${issue.minimum} ký tự` };
      if (issue.type === 'array') return { message: `Chọn ít nhất ${issue.minimum} mục` };
      return { message: `Giá trị phải ≥ ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Tối đa ${issue.maximum} ký tự` };
      return { message: `Giá trị phải ≤ ${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Email không hợp lệ' };
      return { message: 'Định dạng không hợp lệ' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Giá trị không hợp lệ' };
    default:
      return { message: ctx.defaultError };
  }
});

export const zId = z.coerce.number().int().positive();
export const zOptId = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), zId.optional());

export const zDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ');
export const zDate = zDateStr.transform(toDate);
export const zOptDate = z.preprocess((v) => (v === '' || v === undefined ? null : v), zDate.nullable());

export const zPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ không hợp lệ (định dạng YYYY-MM)');

export const zMoney = z.coerce.number({ invalid_type_error: 'Số tiền không hợp lệ' }).min(0, 'Số tiền không được âm').max(1e12);
export const zOptMoney = z.preprocess((v) => (v === '' || v === undefined ? null : v), zMoney.nullable());

export const zReading = z.coerce.number({ invalid_type_error: 'Chỉ số không hợp lệ' }).min(0, 'Chỉ số không được âm').max(1e10);

/** Chuỗi tùy chọn: rỗng → null */
export const zOptStr = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v ?? null), z.string().max(max).nullable());

export const zStr = (max: number) => z.string().trim().min(1).max(max);

export const zPhone = z.string().trim().regex(/^[0-9+().\s-]{8,20}$/, 'Số điện thoại không hợp lệ');

export const zPaging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export function paging(query: unknown) {
  const { page, pageSize } = zPaging.parse(query);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const pageMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

/** Đọc tham số sắp xếp an toàn: chỉ cho phép các trường trong whitelist */
export function sortParam<T extends string>(query: Record<string, unknown>, allowed: readonly T[], def: T, defDir: 'asc' | 'desc' = 'desc') {
  const field = (allowed as readonly string[]).includes(String(query.sortBy)) ? (query.sortBy as T) : def;
  const dir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : query.sortDir === 'desc' ? 'desc' : defDir;
  return { [field]: dir } as Record<T, 'asc' | 'desc'>;
}
