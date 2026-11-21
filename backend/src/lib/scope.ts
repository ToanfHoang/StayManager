import type { Prisma, Role } from '@prisma/client';
import { prisma, type Db } from './prisma';
import { badRequest, forbidden, notFound } from './http';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  landlordId: number | null;
  tenantId: number | null;
}

/** Chủ sở hữu dữ liệu của user; null = ADMIN (xem toàn bộ) */
export function ownerIdOf(u: AuthUser): number | null {
  if (u.role === 'LANDLORD') return u.id;
  if (u.role === 'STAFF') return u.landlordId;
  if (u.role === 'TENANT') return -1; // người thuê không sở hữu dữ liệu quản lý nào
  return null;
}

/** Owner dùng khi TẠO dữ liệu. ADMIN phải chỉ định ownerId */
export async function ownerForCreate(u: AuthUser, requested?: number | null): Promise<number> {
  const own = ownerIdOf(u);
  if (own !== null) return own;
  if (!requested) throw badRequest('Vui lòng chọn chủ trọ');
  const owner = await prisma.user.findFirst({ where: { id: requested, role: 'LANDLORD' } });
  if (!owner) throw badRequest('Chủ trọ không tồn tại');
  return owner.id;
}

export const propertyScope = (u: AuthUser): Prisma.PropertyWhereInput =>
  u.role === 'ADMIN' ? {} : { ownerId: ownerIdOf(u) ?? -1 };

export const roomScope = (u: AuthUser): Prisma.RoomWhereInput =>
  u.role === 'ADMIN' ? {} : { property: { ownerId: ownerIdOf(u) ?? -1 } };

export const tenantScope = (u: AuthUser): Prisma.TenantWhereInput =>
  u.role === 'ADMIN' ? {} : { ownerId: ownerIdOf(u) ?? -1 };

export const contractScope = (u: AuthUser): Prisma.ContractWhereInput =>
  u.role === 'ADMIN' ? {} : { room: roomScope(u) };

export const invoiceScope = (u: AuthUser): Prisma.InvoiceWhereInput =>
  u.role === 'ADMIN' ? {} : { room: roomScope(u) };

export const expenseScope = (u: AuthUser): Prisma.ExpenseWhereInput =>
  u.role === 'ADMIN' ? {} : { property: propertyScope(u) };

export async function assertProperty(u: AuthUser, id: number, db: Db = prisma) {
  const p = await db.property.findFirst({ where: { id, ...propertyScope(u) } });
  if (!p) throw notFound('Không tìm thấy khu trọ');
  return p;
}

export async function assertRoom(u: AuthUser, id: number, db: Db = prisma) {
  const r = await db.room.findFirst({ where: { id, ...roomScope(u) }, include: { property: true } });
  if (!r) throw notFound('Không tìm thấy phòng');
  return r;
}

export async function assertTenant(u: AuthUser, id: number, db: Db = prisma) {
  const t = await db.tenant.findFirst({ where: { id, ...tenantScope(u) } });
  if (!t) throw notFound('Không tìm thấy người thuê');
  return t;
}

export async function assertContract(u: AuthUser, id: number, db: Db = prisma) {
  const c = await db.contract.findFirst({ where: { id, ...contractScope(u) }, include: { room: { include: { property: true } } } });
  if (!c) throw notFound('Không tìm thấy hợp đồng');
  return c;
}

export async function assertInvoice(u: AuthUser, id: number, db: Db = prisma) {
  const i = await db.invoice.findFirst({ where: { id, ...invoiceScope(u) }, include: { room: { include: { property: true } } } });
  if (!i) throw notFound('Không tìm thấy hóa đơn');
  return i;
}

/** STAFF chỉ được xem CCCD đã che */
export function maskIdNumber(u: AuthUser, idNumber: string | null | undefined) {
  if (!idNumber) return idNumber ?? null;
  if (u.role !== 'STAFF') return idNumber;
  return idNumber.length <= 4 ? '****' : '*'.repeat(idNumber.length - 4) + idNumber.slice(-4);
}

export function requireRole(u: AuthUser, ...roles: Role[]) {
  if (!roles.includes(u.role)) throw forbidden();
}
