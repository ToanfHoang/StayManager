import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Vui lòng đăng nhập') => new ApiError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') => new ApiError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Không tìm thấy dữ liệu') => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message: string, details?: unknown) => new ApiError(409, message, 'CONFLICT', details);

export function ok(res: Response, data: unknown, meta?: unknown, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export const created = (res: Response, data: unknown) => ok(res, data, undefined, 201);

/** Bọc handler async để lỗi được chuyển tới middleware xử lý lỗi */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
