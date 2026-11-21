/**
 * Chuẩn bị CSDL khi khởi động (dùng cho cả bản desktop lẫn khi phát triển):
 *  1. Áp dụng bản khôi phục đang chờ (nếu người dùng vừa chọn "Khôi phục dữ liệu").
 *  2. Chạy các migration SQL chưa áp dụng (prisma/migrations/<tên>/migration.sql) – không cần Prisma CLI.
 *  3. Bật WAL, tạo danh mục thu chi mặc định.
 */
import fs from 'fs';
import path from 'path';
import type { EntryType } from '@prisma/client';
import { prisma } from './prisma';
import { dbFilePath, migrationsDir } from './db-file';
import { applyPendingRestore } from '../modules/backup/backup.service';

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

/** Tách file SQL thành từng câu lệnh (migration của Prisma: mỗi lệnh kết thúc bằng ';' cuối dòng) */
function splitSql(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

export async function runMigrations() {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_app_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL)');
  const applied = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>('SELECT name FROM "_app_migrations"')).map((r) => r.name));
  const dir = migrationsDir();
  const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const done: string[] = [];
  for (const name of folders) {
    if (applied.has(name)) continue;
    const file = path.join(dir, name, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const statements = splitSql(fs.readFileSync(file, 'utf8'));
    await prisma.$transaction([
      ...statements.map((st) => prisma.$executeRawUnsafe(st)),
      prisma.$executeRawUnsafe('INSERT INTO "_app_migrations" ("name", "applied_at") VALUES (?, ?)', name, new Date().toISOString()),
    ]);
    done.push(name);
  }
  return done;
}

export async function bootstrapDatabase() {
  fs.mkdirSync(path.dirname(dbFilePath()), { recursive: true });
  const restored = await applyPendingRestore();
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000');
  const migrated = await runMigrations();
  for (const [type, name] of DEFAULT_CATEGORIES) {
    const found = await prisma.expenseCategory.findFirst({ where: { ownerId: null, type, name } });
    if (!found) await prisma.expenseCategory.create({ data: { type, name } });
  }
  return { migrated, restored };
}
