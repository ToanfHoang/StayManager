import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, ok, unauthorized } from '../../lib/http';
import { zOptStr, zStr } from '../../lib/validation';
import { authenticate, me, signToken } from '../../middleware/auth';
import { audit } from '../../lib/audit';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true, // chỉ đếm lần đăng nhập sai
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Bạn đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút' } },
});

const publicUser = (u: { id: number; email: string; fullName: string; phone: string | null; role: string; landlordId: number | null; tenantId: number | null }) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone,
  role: u.role,
  landlordId: u.landlordId,
  tenantId: u.tenantId,
});

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !valid) throw unauthorized('Email hoặc mật khẩu không đúng');
    if (!user.isActive) throw unauthorized('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
    if (user.role === 'TENANT') throw unauthorized('Cổng người thuê đã ngừng hoạt động. Vui lòng liên hệ chủ trọ.');
    return ok(res, { token: signToken(user.id, user.role), user: publicUser(user) });
  }),
);

// JWT là stateless: client xóa token. Endpoint giữ để thống nhất API và có thể mở rộng blacklist sau này.
authRouter.post('/logout', authenticate, (_req, res) => ok(res, { loggedOut: true }));

authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
    return ok(res, publicUser(user));
  }),
);

authRouter.put(
  '/profile',
  authenticate,
  ah(async (req, res) => {
    const body = z.object({ fullName: zStr(120), phone: zOptStr(20) }).parse(req.body);
    const user = await prisma.user.update({ where: { id: me(req).id }, data: body });
    return ok(res, publicUser(user));
  }),
);

authRouter.put(
  '/password',
  authenticate,
  ah(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự').max(100) })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Mật khẩu hiện tại không đúng');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } });
    await audit(me(req), 'CHANGE_PASSWORD', 'user', user.id);
    return ok(res, { changed: true });
  }),
);

/* ---------- Thiết lập lần đầu (bản cài mới chưa có tài khoản nào) ---------- */
const needsSetup = async () => (await prisma.user.count()) === 0;

authRouter.get('/setup', ah(async (_req, res) => ok(res, { needsSetup: await needsSetup() })));

authRouter.post(
  '/setup',
  loginLimiter,
  ah(async (req, res) => {
    const body = z
      .object({
        fullName: zStr(120),
        email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
        phone: zOptStr(20),
        password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    // Kiểm tra + tạo trong cùng giao dịch để không thể tạo 2 tài khoản chủ trọ khi bấm đúp
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw badRequest('Ứng dụng đã được thiết lập, vui lòng đăng nhập');
      return tx.user.create({ data: { email: body.email, fullName: body.fullName, phone: body.phone ?? null, role: 'LANDLORD', passwordHash } });
    });
    await audit(user, 'SETUP', 'user', user.id);
    return ok(res, { token: signToken(user.id, user.role), user: publicUser(user) });
  }),
);
