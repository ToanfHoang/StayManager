import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { ah, forbidden, unauthorized } from '../lib/http';
import type { AuthUser } from '../lib/scope';

export function signToken(userId: number, role: Role) {
  return jwt.sign({ sub: String(userId), role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export const authenticate = ah(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: { sub?: string };
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub?: string };
  } catch {
    throw unauthorized('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user || !user.isActive) throw unauthorized('Tài khoản không tồn tại hoặc đã bị khóa');
  if (user.role === 'STAFF' && !user.landlordId) throw forbidden('Tài khoản nhân viên chưa được gán chủ trọ');
  if (user.role === 'TENANT') throw unauthorized('Cổng người thuê đã ngừng hoạt động');
  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role, landlordId: user.landlordId, tenantId: user.tenantId };
  next();
});

export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Lấy user đã xác thực (dùng trong handler sau authenticate) */
export const me = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
