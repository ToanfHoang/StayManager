import { Prisma, PrismaClient } from '@prisma/client';

// Trả Decimal về dạng number trong JSON (VND không có phần lẻ đáng kể, an toàn với double)
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/**
 * "Khóa" một dòng trong transaction theo cách chạy được cả SQLite lẫn MySQL:
 * một lệnh UPDATE không đổi dữ liệu buộc transaction giành quyền ghi ngay
 * (SQLite: khóa ghi cả CSDL; MySQL: khóa dòng) ⇒ các thao tác tài chính đồng thời được tuần tự hóa.
 */
const LOCKABLE = new Set(['rooms', 'contracts', 'invoices']);
export async function lockRow(tx: Tx, table: 'rooms' | 'contracts' | 'invoices', id: number) {
  if (!LOCKABLE.has(table)) throw new Error('Bảng không hợp lệ');
  await tx.$executeRawUnsafe(`UPDATE "${table}" SET id = id WHERE id = ?`, id);
}
