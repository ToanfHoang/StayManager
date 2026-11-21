import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { pageMeta, paging, zId, zMoney, zOptStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertProperty, assertRoom, maskIdNumber, roomScope } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { computed } from '../meters/meters.routes';

export const roomsRouter = Router();

const uploadDir = path.resolve(env.UPLOAD_DIR, 'rooms');
const upload = multer({
  storage: multer.diskStorage({
    // Tạo lại thư mục mỗi lần (khôi phục dữ liệu có thể đã thay cả thư mục ảnh)
    destination: (_req, _file, cb) => fs.promises.mkdir(uploadDir, { recursive: true }).then(() => cb(null, uploadDir), (e) => cb(e, uploadDir)),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const okType = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) && /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    if (okType) cb(null, true);
    else cb(badRequest('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF'));
  },
});

const roomSchema = z.object({
  propertyId: zId,
  roomNumber: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().min(0).max(100).default(1),
  area: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(10000).nullable()),
  price: zMoney,
  maxOccupancy: z.coerce.number().int().min(1).max(50).default(2),
  description: zOptStr(5000),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE']).optional(),
});

const activeContractInclude = {
  where: { status: 'ACTIVE' as const },
  take: 1,
  include: { tenants: { where: { leftAt: null }, include: { tenant: { select: { id: true, fullName: true, phone: true } } }, orderBy: { isPrimary: 'desc' as const } } },
};

roomsRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const { page, pageSize, skip, take } = paging({ pageSize: 50, ...req.query });
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.RoomWhereInput = { ...roomScope(u) };
    if (q.propertyId) where.propertyId = zId.parse(q.propertyId);
    if (q.floor !== undefined && q.floor !== '') where.floor = z.coerce.number().int().parse(q.floor);
    if (q.status && ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'].includes(q.status)) where.status = q.status as Prisma.RoomWhereInput['status'];
    if (q.q?.trim()) where.roomNumber = { contains: q.q.trim() };
    const [items, total] = await Promise.all([
      prisma.room.findMany({
        where,
        skip,
        take,
        orderBy: [{ propertyId: 'asc' }, { floor: 'asc' }, { roomNumber: 'asc' }],
        include: { property: { select: { id: true, name: true } }, images: { take: 1, orderBy: { id: 'asc' } }, contracts: activeContractInclude },
      }),
      prisma.room.count({ where }),
    ]);
    const data = items.map(({ contracts, ...r }) => ({ ...r, activeContract: contracts[0] ?? null }));
    return ok(res, data, pageMeta(page, pageSize, total));
  }),
);

roomsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const base = await assertRoom(u, zId.parse(req.params.id));
    const room = await prisma.room.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        property: { select: { id: true, name: true, address: true, electricityPrice: true, waterPrice: true } },
        images: { orderBy: { id: 'asc' } },
        contracts: {
          orderBy: { startDate: 'desc' },
          include: { tenants: { include: { tenant: { select: { id: true, fullName: true, phone: true, idNumber: true } } }, orderBy: { isPrimary: 'desc' } } },
        },
        meterReadings: { orderBy: { period: 'desc' }, take: 12 },
        invoices: { where: { status: { not: 'CANCELLED' } }, orderBy: { period: 'desc' }, take: 12, select: { id: true, invoiceNumber: true, period: true, totalAmount: true, paidAmount: true, status: true, dueDate: true } },
      },
    });
    const contracts = room.contracts.map((c) => ({
      ...c,
      tenants: c.tenants.map((ct) => ({ ...ct, tenant: { ...ct.tenant, idNumber: maskIdNumber(u, ct.tenant.idNumber) } })),
    }));
    return ok(res, { ...room, meterReadings: room.meterReadings.map(computed), contracts, activeContract: contracts.find((c) => c.status === 'ACTIVE') ?? null });
  }),
);

roomsRouter.post(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const body = roomSchema.parse(req.body);
    const p = await assertProperty(u, body.propertyId);
    if (body.status === 'OCCUPIED') throw badRequest('Phòng chỉ chuyển sang "Đang thuê" khi tạo hợp đồng');
    if (await prisma.room.findFirst({ where: { propertyId: p.id, roomNumber: body.roomNumber } })) throw conflict(`Phòng ${body.roomNumber} đã tồn tại trong khu trọ này`);
    const room = await prisma.room.create({ data: { ...body, status: body.status ?? 'AVAILABLE' } });
    await audit(u, 'CREATE', 'room', room.id, null, room, prisma, p.ownerId);
    return created(res, room);
  }),
);

roomsRouter.put(
  '/:id',
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertRoom(u, zId.parse(req.params.id));
    const body = roomSchema.parse(req.body);
    if (body.propertyId !== old.propertyId) {
      await assertProperty(u, body.propertyId);
      if (old.status === 'OCCUPIED') throw conflict('Không thể chuyển phòng đang có hợp đồng sang khu trọ khác');
    }
    if (body.roomNumber !== old.roomNumber || body.propertyId !== old.propertyId) {
      const dup = await prisma.room.findFirst({ where: { propertyId: body.propertyId, roomNumber: body.roomNumber, id: { not: old.id } } });
      if (dup) throw conflict(`Phòng ${body.roomNumber} đã tồn tại trong khu trọ này`);
    }
    // Trạng thái OCCUPIED chỉ do hợp đồng quyết định
    let status = old.status;
    if (body.status && body.status !== old.status) {
      if (old.status === 'OCCUPIED') throw conflict('Phòng đang có hợp đồng hiệu lực. Hãy kết thúc hợp đồng trước khi đổi trạng thái.');
      if (body.status === 'OCCUPIED') throw badRequest('Phòng chỉ chuyển sang "Đang thuê" khi tạo hợp đồng');
      status = body.status;
    }
    const active = await prisma.contract.findFirst({ where: { roomId: old.id, status: 'ACTIVE' }, include: { _count: { select: { tenants: { where: { leftAt: null } } } } } });
    if (active && body.maxOccupancy < active._count.tenants) throw badRequest(`Phòng đang có ${active._count.tenants} người ở, không thể đặt sức chứa nhỏ hơn`);
    const room = await prisma.room.update({ where: { id: old.id }, data: { ...body, status } });
    await audit(u, 'UPDATE', 'room', room.id, old, room, prisma, old.property.ownerId);
    return ok(res, room);
  }),
);

roomsRouter.delete(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const room = await assertRoom(u, zId.parse(req.params.id));
    const [contracts, invoices, readings, maint] = await Promise.all([
      prisma.contract.count({ where: { roomId: room.id } }),
      prisma.invoice.count({ where: { roomId: room.id } }),
      prisma.meterReading.count({ where: { roomId: room.id } }),
      prisma.maintenanceRequest.count({ where: { roomId: room.id } }),
    ]);
    if (contracts + invoices + readings + maint > 0)
      throw conflict('Phòng đã có lịch sử hợp đồng / hóa đơn / chỉ số điện nước / sửa chữa nên không thể xóa. Bạn có thể chuyển phòng sang trạng thái "Bảo trì".');
    const images = await prisma.roomImage.findMany({ where: { roomId: room.id } });
    await prisma.room.delete({ where: { id: room.id } });
    images.forEach((img) => fs.promises.unlink(path.resolve(env.UPLOAD_DIR, img.url.replace(/^\/uploads\//, ''))).catch(() => undefined));
    await audit(u, 'DELETE', 'room', room.id, room, null, prisma, room.property.ownerId);
    return ok(res, { deleted: true });
  }),
);

/* ---------- Ảnh phòng ---------- */
roomsRouter.post(
  '/:id/images',
  ah(async (req, res, next) => {
    const room = await assertRoom(me(req), zId.parse(req.params.id));
    await new Promise<void>((resolve, reject) => upload.array('images', 10)(req, res, (err: unknown) => (err ? reject(err) : resolve())));
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('Vui lòng chọn ảnh');
    const count = await prisma.roomImage.count({ where: { roomId: room.id } });
    if (count + files.length > 20) {
      files.forEach((f) => fs.promises.unlink(f.path).catch(() => undefined));
      throw badRequest('Mỗi phòng tối đa 20 ảnh');
    }
    await prisma.roomImage.createMany({ data: files.map((f) => ({ roomId: room.id, url: `/uploads/rooms/${f.filename}` })) });
    void next;
    return created(res, await prisma.roomImage.findMany({ where: { roomId: room.id }, orderBy: { id: 'asc' } }));
  }),
);

roomsRouter.delete(
  '/:id/images/:imageId',
  ah(async (req, res) => {
    const room = await assertRoom(me(req), zId.parse(req.params.id));
    const img = await prisma.roomImage.findFirst({ where: { id: zId.parse(req.params.imageId), roomId: room.id } });
    if (!img) throw notFound('Không tìm thấy ảnh');
    await prisma.roomImage.delete({ where: { id: img.id } });
    await fs.promises.unlink(path.resolve(env.UPLOAD_DIR, img.url.replace(/^\/uploads\//, ''))).catch(() => undefined);
    return ok(res, { deleted: true });
  }),
);
