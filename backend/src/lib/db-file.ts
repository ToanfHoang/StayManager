/** Đường dẫn file SQLite và thư mục dữ liệu, suy ra từ DATABASE_URL (file:...) */
import path from 'path';

const PRISMA_DIR = path.resolve(__dirname, '../../prisma');

export function dbFilePath() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) throw new Error('DATABASE_URL phải có dạng file:<đường dẫn SQLite>');
  const raw = url.slice(5).split('?')[0];
  // Prisma hiểu đường dẫn tương đối theo thư mục chứa schema.prisma
  return path.isAbsolute(raw) ? raw : path.resolve(PRISMA_DIR, raw);
}

export const dataDir = () => process.env.DATA_DIR || path.dirname(dbFilePath());
export const migrationsDir = () => process.env.MIGRATIONS_DIR || path.join(PRISMA_DIR, 'migrations');
