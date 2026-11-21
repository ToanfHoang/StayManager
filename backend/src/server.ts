/** Khởi động StayManager (dùng chung cho `npm run dev`, bản build và app desktop Electron) */
import type { Server } from 'http';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { bootstrapDatabase } from './lib/bootstrap';
import { startScheduler, stopScheduler } from './modules/scheduler/scheduler';
import { autoBackup, setRestartHandler } from './modules/backup/backup.service';

export { setRestartHandler };

let server: Server | null = null;
let backupTimer: NodeJS.Timeout | null = null;

export async function startServer(opts: { port?: number; host?: string } = {}) {
  const { migrated, restored } = await bootstrapDatabase();
  if (migrated.length) console.log(`✓ Đã cập nhật CSDL: ${migrated.join(', ')}`);
  if (restored) console.log('✓ Đã khôi phục dữ liệu từ bản sao lưu');

  const app = createApp();
  const port = opts.port ?? env.PORT;
  const host = opts.host ?? env.HOST;
  server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);
  });
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  console.log(`✅ StayManager đang chạy tại http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`);

  startScheduler();
  const runBackup = () => autoBackup().then((n) => n && console.log(`✓ Tự sao lưu: ${n}`)).catch((e) => console.error('[backup] Lỗi tự sao lưu', e));
  setTimeout(runBackup, 15_000);
  backupTimer = setInterval(runBackup, 60 * 60 * 1000);
  return { port: actualPort };
}

export async function stopServer() {
  stopScheduler();
  if (backupTimer) clearInterval(backupTimer);
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  await prisma.$disconnect();
}
