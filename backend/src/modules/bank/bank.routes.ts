import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { ah, badRequest, conflict, created, notFound, ok } from '../../lib/http';
import { zId, zOptId, zOptStr, zStr } from '../../lib/validation';
import { authorize, me } from '../../middleware/auth';
import { assertProperty, ownerForCreate, ownerIdOf, type AuthUser } from '../../lib/scope';
import { audit } from '../../lib/audit';
import { sanitizeTransferText, validateBankInfo, vietQrDataUrl } from '../../lib/vietqr';

export const bankRouter = Router();

const schema = z.object({
  propertyId: zOptId,
  bankCode: z.string().trim().regex(/^\d{6}$/, 'Mã ngân hàng (BIN) gồm 6 chữ số'),
  bankName: zStr(120),
  accountNumber: z.string().trim().regex(/^[0-9A-Za-z]{4,19}$/, 'Số tài khoản không hợp lệ (4–19 ký tự chữ/số)'),
  accountHolder: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .transform((s) => sanitizeTransferText(s, 120).toUpperCase()),
  branch: zOptStr(120),
  qrEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
  landlordId: zOptId,
});

const scope = (u: AuthUser): Prisma.BankAccountWhereInput => (u.role === 'ADMIN' ? {} : { landlordId: ownerIdOf(u) ?? -1 });

/**
 * Tài khoản nhận tiền áp dụng cho 1 khu trọ: ưu tiên tài khoản riêng của khu, nếu không có dùng tài khoản mặc định của chủ trọ.
 */
export async function bankAccountForProperty(propertyId: number, ownerId: number, db: Db = prisma) {
  return (
    (await db.bankAccount.findFirst({ where: { landlordId: ownerId, propertyId, isActive: true }, orderBy: { id: 'desc' } })) ??
    (await db.bankAccount.findFirst({ where: { landlordId: ownerId, propertyId: null, isActive: true }, orderBy: { id: 'desc' } }))
  );
}

bankRouter.get(
  '/',
  ah(async (req, res) => {
    const u = me(req);
    const items = await prisma.bankAccount.findMany({ where: scope(u), orderBy: [{ isActive: 'desc' }, { propertyId: 'asc' }, { id: 'desc' }], include: { property: { select: { id: true, name: true } } } });
    return ok(res, items);
  }),
);

async function checkUniqueActive(landlordId: number, propertyId: number | null, excludeId?: number) {
  const dup = await prisma.bankAccount.findFirst({ where: { landlordId, propertyId, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  if (dup) throw conflict(propertyId ? 'Khu trọ này đã có tài khoản nhận tiền đang dùng. Hãy tắt tài khoản cũ trước.' : 'Đã có tài khoản mặc định đang dùng. Hãy tắt tài khoản cũ trước.');
}

bankRouter.post(
  '/',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const { landlordId: reqOwner, ...body } = schema.parse(req.body);
    let landlordId = await ownerForCreate(u, reqOwner);
    if (body.propertyId) landlordId = (await assertProperty(u, body.propertyId)).ownerId;
    if (body.isActive) await checkUniqueActive(landlordId, body.propertyId ?? null);
    const acc = await prisma.bankAccount.create({ data: { ...body, propertyId: body.propertyId ?? null, landlordId } });
    await audit(u, 'CREATE', 'bank_account', acc.id, null, { ...acc, accountNumber: `***${acc.accountNumber.slice(-4)}` }, prisma, landlordId);
    return created(res, acc);
  }),
);

async function assertAccount(u: AuthUser, id: number) {
  const a = await prisma.bankAccount.findFirst({ where: { id, ...scope(u) } });
  if (!a) throw notFound('Không tìm thấy tài khoản ngân hàng');
  return a;
}

bankRouter.put(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertAccount(u, zId.parse(req.params.id));
    const { landlordId: _ignored, ...body } = schema.parse(req.body);
    if (body.propertyId) {
      const p = await assertProperty(u, body.propertyId);
      if (p.ownerId !== old.landlordId) throw badRequest('Khu trọ không thuộc chủ tài khoản');
    }
    if (body.isActive) await checkUniqueActive(old.landlordId, body.propertyId ?? null, old.id);
    const acc = await prisma.bankAccount.update({ where: { id: old.id }, data: { ...body, propertyId: body.propertyId ?? null } });
    await audit(u, 'UPDATE', 'bank_account', acc.id, { bankCode: old.bankCode, accountNumber: `***${old.accountNumber.slice(-4)}` }, { bankCode: acc.bankCode, accountNumber: `***${acc.accountNumber.slice(-4)}` }, prisma, old.landlordId);
    return ok(res, acc);
  }),
);

bankRouter.delete(
  '/:id',
  authorize('ADMIN', 'LANDLORD'),
  ah(async (req, res) => {
    const u = me(req);
    const old = await assertAccount(u, zId.parse(req.params.id));
    await prisma.bankAccount.delete({ where: { id: old.id } });
    await audit(u, 'DELETE', 'bank_account', old.id, { bankName: old.bankName, accountNumber: `***${old.accountNumber.slice(-4)}` }, null, prisma, old.landlordId);
    return ok(res, { deleted: true });
  }),
);

/** QR thử (không kèm số tiền) để chủ trọ kiểm tra bằng app ngân hàng trước khi dùng */
bankRouter.get(
  '/:id/qr-preview',
  ah(async (req, res) => {
    const a = await assertAccount(me(req), zId.parse(req.params.id));
    const err = validateBankInfo(a.bankCode, a.accountNumber);
    if (err) throw badRequest(err);
    return ok(res, { qrDataUrl: await vietQrDataUrl({ bin: a.bankCode, accountNumber: a.accountNumber, description: 'STAYMANAGER TEST' }) });
  }),
);
