/**
 * Sao lưu / khôi phục dữ liệu cho bản cài trên máy tính.
 *  - Bản sao lưu = file .zip gồm staymanager.db (ảnh chụp nhất quán bằng VACUUM INTO) + thư mục ảnh phòng.
 *  - Khôi phục: kiểm tra file → lưu thành "bản khôi phục đang chờ" → khởi động lại app → áp dụng TRƯỚC khi mở CSDL.
 *    CSDL hiện tại được giữ lại thành bản dự phòng trong thư mục backups trước khi bị thay.
 *  - Tự sao lưu mỗi ngày vào thư mục backups (giữ 14 bản gần nhất).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { prisma } from '../../lib/prisma';
import { dataDir, dbFilePath } from '../../lib/db-file';
import { badRequest } from '../../lib/http';

const DB_ENTRY = 'staymanager.db';
const KEEP_AUTO = 14;
const backupsDir = () => path.join(dataDir(), 'backups');
const pendingPath = () => path.join(dataDir(), 'restore-pending.zip');
export const uploadsDir = () => path.resolve(process.env.UPLOAD_DIR || 'uploads');

let restartHandler: (() => void) | null = null;
/** Bản desktop đăng ký hàm khởi động lại app (Electron) */
export const setRestartHandler = (fn: () => void) => (restartHandler = fn);
export const canRestart = () => !!restartHandler;
export const requestRestart = () => restartHandler?.();

const stamp = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const sqlQuote = (p: string) => `'${p.replace(/\\/g, '/').replace(/'/g, "''")}'`;

/** Ảnh chụp nhất quán của CSDL đang chạy */
async function snapshotDb(target: string) {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  await prisma.$executeRawUnsafe(`VACUUM INTO ${sqlQuote(target)}`);
}

export async function createBackupZip() {
  const tmp = path.join(os.tmpdir(), `staymanager-${process.pid}-${Date.now()}.db`);
  await snapshotDb(tmp);
  try {
    const zip = new AdmZip();
    zip.addLocalFile(tmp, '', DB_ENTRY);
    if (fs.existsSync(uploadsDir())) zip.addLocalFolder(uploadsDir(), 'uploads');
    zip.addFile('backup-info.json', Buffer.from(JSON.stringify({ app: 'StayManager', createdAt: new Date().toISOString(), format: 1 })));
    return { buffer: zip.toBuffer(), fileName: `staymanager-saoluu-${stamp()}.zip` };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Kiểm tra file sao lưu và đặt làm bản khôi phục đang chờ */
export function stageRestore(buffer: Buffer) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest('File không phải bản sao lưu StayManager (.zip)');
  }
  const entry = zip.getEntry(DB_ENTRY);
  if (!entry) throw badRequest('File sao lưu không chứa dữ liệu StayManager');
  const head = entry.getData().subarray(0, 16).toString('latin1');
  if (head !== 'SQLite format 3\u0000') throw badRequest('Dữ liệu trong file sao lưu bị hỏng');
  for (const e of zip.getEntries()) {
    const n = e.entryName.replace(/\\/g, '/');
    if (n.includes('..') || path.isAbsolute(n)) throw badRequest('File sao lưu không hợp lệ');
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(pendingPath(), buffer);
}

/** Gọi lúc khởi động, TRƯỚC khi truy vấn CSDL */
export async function applyPendingRestore() {
  const pending = pendingPath();
  if (!fs.existsSync(pending)) return false;
  const zip = new AdmZip(pending);
  const db = dbFilePath();
  fs.mkdirSync(backupsDir(), { recursive: true });
  // Giữ bản dự phòng của dữ liệu hiện tại (kèm file -wal nếu app trước đó bị tắt đột ngột)
  const keep = path.join(backupsDir(), `truoc-khoi-phuc-${stamp()}.db`);
  if (fs.existsSync(db)) fs.copyFileSync(db, keep);
  if (fs.existsSync(db + '-wal')) fs.copyFileSync(db + '-wal', keep + '-wal');
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(db + ext, { force: true });
  fs.writeFileSync(db, zip.getEntry(DB_ENTRY)!.getData());
  const up = uploadsDir();
  const imgs = zip.getEntries().filter((e) => e.entryName.startsWith('uploads/') && !e.isDirectory);
  if (imgs.length) {
    fs.rmSync(up, { recursive: true, force: true });
    for (const e of imgs) {
      const out = path.join(up, e.entryName.slice('uploads/'.length));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, e.getData());
    }
  }
  fs.rmSync(pending, { force: true });
  return true;
}

/** Tự sao lưu 1 bản / ngày, giữ KEEP_AUTO bản gần nhất */
export async function autoBackup() {
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `tu-dong-${stamp().slice(0, 8)}.db`;
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return null;
  await snapshotDb(target);
  const autos = fs.readdirSync(dir).filter((f) => f.startsWith('tu-dong-')).sort();
  for (const old of autos.slice(0, Math.max(0, autos.length - KEEP_AUTO))) fs.rmSync(path.join(dir, old), { force: true });
  return name;
}

export function backupInfo() {
  const dir = backupsDir();
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, modifiedAt: st.mtime.toISOString() };
      }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    : [];
  return { dataDir: dataDir(), backupsDir: dir, autoBackups: files, canRestart: canRestart() };
}
