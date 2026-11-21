/**
 * Seed dữ liệu khởi tạo (không phải dữ liệu giả):
 *  - Tài khoản quản trị và tài khoản chủ trọ đầu tiên (lấy từ biến môi trường SEED_*)
 *  - Danh mục thu/chi mặc định của hệ thống
 * Chạy lại an toàn (idempotent).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type EntryType } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES: [EntryType, string][] = [
  ['EXPENSE', 'Sửa chữa'],
  ['EXPENSE', 'Bảo trì'],
  ['EXPENSE', 'Tiền điện nước (chủ trả)'],
  ['EXPENSE', 'Vệ sinh'],
  ['EXPENSE', 'Internet'],
  ['EXPENSE', 'Thuế & phí'],
  ['EXPENSE', 'Chi phí khác'],
  ['INCOME', 'Phí dịch vụ phát sinh'],
  ['INCOME', 'Thu nhập khác'],
];

async function upsertUser(email: string | undefined, password: string | undefined, fullName: string, role: 'ADMIN' | 'LANDLORD') {
  if (!email || !password) {
    console.log(`⚠️  Bỏ qua tạo ${role}: thiếu SEED_*_EMAIL hoặc SEED_*_PASSWORD trong .env`);
    return;
  }
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) {
    console.log(`✓ ${role} ${email} đã tồn tại`);
    return;
  }
  await prisma.user.create({ data: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), fullName, role } });
  console.log(`✓ Đã tạo ${role}: ${email}`);
}

async function main() {
  await upsertUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Quản trị viên', 'ADMIN');
  await upsertUser(process.env.SEED_LANDLORD_EMAIL, process.env.SEED_LANDLORD_PASSWORD, process.env.SEED_LANDLORD_NAME || 'Chủ nhà', 'LANDLORD');

  for (const [type, name] of DEFAULT_CATEGORIES) {
    const found = await prisma.expenseCategory.findFirst({ where: { ownerId: null, type, name } });
    if (!found) await prisma.expenseCategory.create({ data: { type, name } });
  }
  console.log(`✓ Danh mục thu chi mặc định: ${DEFAULT_CATEGORIES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
