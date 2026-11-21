import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, created, forbidden, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zId, zOptId, zOptStr, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { ownerIdOf } from '../../lib/scope';
import { audit } from '../../lib/audit';

export const usersRouter = Router();

const select = {
  id: true, email: true, fullName: true, phone: true, role: true, landlordId: true, isActive: true, createdAt: true,
  landlord: { select: { id: true, fullName: true } },
} satisfies Prisma.UserSelect;

/** Danh sách người có thể được giao việc (chủ trọ + nhân viên) – mọi vai trò đều xem được */
usersRouter.get(
  '/assignees',
  ah(async (req, res) => {
    const u = me(req);
    const owner = ownerIdOf(u);
    const where: Prisma.UserWhereInput = owner === null ? { isActive: true, role: { in: ['LANDLORD', 'STAFF'] } } : { isActive: true, OR: [{ id: owner }, { landlordId: owner }] };
    const users = await prisma.user.findMany({ where, select: { id: true, fullName: true, role: true }, orderBy: { fullName: 'asc' } });
    return ok(res, users);
  }),
);

usersRouter.use(authorize('ADMIN', 'LANDLORD'));

usersRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging(req.query);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : '';
    const where: Prisma.UserWhereInput = {
      ...(u.role === 'LANDLORD' ? { landlordId: u.id } : {}),
      ...(['ADMIN', 'LANDLORD', 'STAFF'].includes(role) ? { role: role as Prisma.UserWhereInput['role'] } : {}),
      ...(q ? { OR: [{ fullName: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return ok(res, items, pageMeta(page, pageSize, total));
  }),
);

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
  fullName: zStr(120),
  phone: zOptStr(20),
  role: z.enum(['ADMIN', 'LANDLORD', 'STAFF']),
  landlordId: zOptId,
});

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = createSchema.parse(req.body);
    let landlordId: number | null = null;
    if (u.role === 'LANDLORD') {
      if (body.role !== 'STAFF') throw forbidden('Chủ trọ chỉ được tạo tài khoản nhân viên');
      landlordId = u.id;
    } else if (body.role === 'STAFF') {
      if (!body.landlordId) throw badRequest('Vui lòng chọn chủ trọ cho nhân viên');
      const ll = await prisma.user.findFirst({ where: { id: body.landlordId, role: 'LANDLORD' } });
      if (!ll) throw badRequest('Chủ trọ không tồn tại');
      landlordId = ll.id;
    }
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Email đã được sử dụng');
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash: await bcrypt.hash(body.password, 12), fullName: body.fullName, phone: body.phone, role: body.role, landlordId },
      select,
    });
    await audit(u, 'CREATE', 'user', user.id, null, user);
    return created(res, user);
  }),
);

usersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const id = zId.parse(req.params.id);
    const body = z
      .object({ fullName: zStr(120), phone: zOptStr(20), isActive: z.boolean().optional(), password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100).optional().or(z.literal('')) })
      .parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || (u.role === 'LANDLORD' && target.landlordId !== u.id)) throw notFound('Không tìm thấy tài khoản');
    if (target.id === u.id && body.isActive === false) throw badRequest('Không thể tự khóa tài khoản của mình');
    const data: Prisma.UserUpdateInput = { fullName: body.fullName, phone: body.phone };
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.update({ where: { id }, data, select });
    await audit(u, 'UPDATE', 'user', id, { fullName: target.fullName, isActive: target.isActive }, { fullName: user.fullName, isActive: user.isActive, passwordChanged: !!body.password });
    return ok(res, user);
  }),
);
