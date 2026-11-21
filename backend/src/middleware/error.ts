import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import multer from 'multer';
import { ApiError } from '../lib/http';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Đường dẫn API không tồn tại' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });

  if (err instanceof ApiError) return send(err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!details[key]) details[key] = issue.message;
    }
    const first = Object.values(details)[0];
    return send(400, 'VALIDATION_ERROR', first ? `Dữ liệu không hợp lệ: ${first}` : 'Dữ liệu không hợp lệ', details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(409, 'DUPLICATE', 'Dữ liệu bị trùng với bản ghi đã có');
    if (err.code === 'P2003') return send(409, 'IN_USE', 'Dữ liệu đang được sử dụng ở nơi khác, không thể thực hiện');
    if (err.code === 'P2025') return send(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu');
  }

  if (err instanceof multer.MulterError) {
    return send(400, 'UPLOAD_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh vượt quá dung lượng cho phép (5MB)' : 'Tải ảnh thất bại');
  }

  if (err instanceof SyntaxError && 'body' in (err as object)) return send(400, 'BAD_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON');

  console.error(err);
  return send(500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra, vui lòng thử lại sau');
}
