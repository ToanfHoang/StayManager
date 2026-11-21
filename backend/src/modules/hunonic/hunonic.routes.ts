import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, ok } from '../../lib/http';
import { zId, zPeriod } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertRoom, ownerIdOf, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { connectAccount, fetchMeters, readingSuggestions } from './hunonic.service';

export const hunonicRouter = Router();

const ownerOf = (u: AuthUser) => {
  const o = ownerIdOf(u);
  if (!o || o < 0) throw badRequest('Chức năng công tơ Hunonic dành cho tài khoản chủ trọ / nhân viên');
  return o;
};
const maskPhone = (p: string) => (p.length > 4 ? `${'*'.repeat(p.length - 3)}${p.slice(-3)}` : p);

hunonicRouter.get(
  '/account',
  ah(async (req, res) => {
    const acc = await prisma.hunonicAccount.findUnique({ where: { landlordId: ownerOf(me(req)) } });
    return ok(res, acc ? { connected: true, phone: maskPhone(acc.phone), autoImport: acc.autoImport, lastSyncAt: acc.lastSyncAt, lastError: acc.lastError } : { connected: false });
  }),
);

/** Kết nối tài khoản: đăng nhập thử, chỉ lưu khi thành công */
hunonicRouter.put(
  '/account',
  authorize('LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const body = z.object({ phone: z.string().trim().regex(/^0\d{9,10}$/, 'Số điện thoại đăng nhập Hunonic không hợp lệ'), password: z.string().min(1, 'Nhập mật khẩu').max(100) }).parse(req.body);
    const meters = await connectAccount(u.id, body.phone, body.password);
    await audit(u, 'CONNECT', 'hunonic_account', null, null, { phone: maskPhone(body.phone), meters: meters.length });
    return ok(res, { connected: true, meters: meters.length });
  }),
);

hunonicRouter.patch(
  '/account',
  authorize('LANDLORD'),
  ah(async (req, res) => {
    const { autoImport } = z.object({ autoImport: z.boolean() }).parse(req.body);
    const r = await prisma.hunonicAccount.update({ where: { landlordId: me(req).id }, data: { autoImport } }).catch(() => null);
    if (!r) throw badRequest('Chưa kết nối tài khoản Hunonic');
    return ok(res, { autoImport: r.autoImport });
  }),
);

hunonicRouter.delete(
  '/account',
  authorize('LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    await prisma.hunonicAccount.deleteMany({ where: { landlordId: u.id } });
    await audit(u, 'DISCONNECT', 'hunonic_account', null, null, null);
    return ok(res, { connected: false });
  }),
);

/** Danh sách công tơ + phòng đang gán */
hunonicRouter.get(
  '/meters',
  ah(async (req, res) => {
    const owner = ownerOf(me(req));
    const [meters, rooms] = await Promise.all([
      fetchMeters(owner),
      prisma.room.findMany({ where: { meterDeviceId: { not: null }, property: { ownerId: owner } }, select: { id: true, roomNumber: true, meterDeviceId: true, property: { select: { name: true } } } }),
    ]);
    return ok(res, meters.map((m) => ({ ...m, room: rooms.find((r) => r.meterDeviceId === m.deviceId) ?? null })));
  }),
);

/** Gán / bỏ gán công tơ cho phòng (1 công tơ chỉ gán cho 1 phòng) */
hunonicRouter.put(
  '/rooms/:roomId/meter',
  authorize('LANDLORD', 'ADMIN'),
  ah(async (req, res) => {
    const u = me(req);
    const room = await assertRoom(u, zId.parse(req.params.roomId));
    const body = z.object({ deviceId: z.string().trim().max(64).nullable(), meterName: z.string().trim().max(120).nullish() }).parse(req.body);
    if (body.deviceId) {
      const dup = await prisma.room.findFirst({ where: { meterDeviceId: body.deviceId, property: { ownerId: room.property.ownerId }, id: { not: room.id } } });
      if (dup) throw conflict(`Công tơ này đang gán cho phòng ${dup.roomNumber}`);
    }
    const r = await prisma.room.update({ where: { id: room.id }, data: { meterDeviceId: body.deviceId, meterName: body.deviceId ? body.meterName ?? null : null } });
    await audit(u, 'ASSIGN_METER', 'room', room.id, { meterDeviceId: room.meterDeviceId }, { meterDeviceId: r.meterDeviceId }, prisma, room.property.ownerId);
    return ok(res, { roomId: r.id, meterDeviceId: r.meterDeviceId, meterName: r.meterName });
  }),
);

/** Gợi ý chỉ số điện của kỳ từ công tơ (chưa lưu – chủ trọ xem lại rồi bấm Lưu) */
hunonicRouter.get(
  '/readings',
  ah(async (req, res) => {
    const owner = ownerOf(me(req));
    const period = zPeriod.parse(req.query.period);
    const propertyId = req.query.propertyId ? zId.parse(req.query.propertyId) : undefined;
    return ok(res, await readingSuggestions(owner, period, propertyId));
  }),
);
