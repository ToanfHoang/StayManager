/**
 * Chuẩn bị thư mục desktop/server cho bản cài:
 *   server/backend  = dist (JS đã biên dịch) + migrations + node_modules (chỉ gói chạy) + Prisma client
 *   server/frontend = giao diện đã build (vite)
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(DESKTOP, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const OUT = path.join(DESKTOP, 'server');

const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}   (${path.relative(ROOT, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_API_PROXY: '' } });
};
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

console.log('1/4 Build giao diện');
run('npm run build', FRONTEND);

console.log('2/4 Build máy chủ');
fs.rmSync(path.join(BACKEND, 'dist'), { recursive: true, force: true });
run('npx prisma generate', BACKEND);
run('npm run build', BACKEND);

console.log('3/4 Gom file vào desktop/server');
fs.rmSync(OUT, { recursive: true, force: true });
const be = path.join(OUT, 'backend');
fs.mkdirSync(path.join(be, 'prisma'), { recursive: true });
copy(path.join(BACKEND, 'dist'), path.join(be, 'dist'));
copy(path.join(BACKEND, 'prisma', 'migrations'), path.join(be, 'prisma', 'migrations'));
copy(path.join(BACKEND, 'prisma', 'schema.prisma'), path.join(be, 'prisma', 'schema.prisma'));
for (const f of ['package.json', 'package-lock.json']) copy(path.join(BACKEND, f), path.join(be, f));
copy(path.join(FRONTEND, 'dist'), path.join(OUT, 'frontend'));

console.log('4/4 Cài thư viện chạy (không gồm công cụ phát triển)');
run('npm ci --omit=dev --legacy-peer-deps --ignore-scripts --no-audit --no-fund', be);
// Prisma client đã sinh sẵn (kèm query engine cho Windows)
copy(path.join(BACKEND, 'node_modules', '.prisma'), path.join(be, 'node_modules', '.prisma'));
// Bỏ các engine WASM (dành cho edge / CSDL khác) – bản desktop dùng engine gốc Windows (.dll.node)
let pruned = 0;
for (const dir of [path.join(be, 'node_modules', '@prisma', 'client', 'runtime'), path.join(be, 'node_modules', '.prisma', 'client')]) {
  for (const f of fs.readdirSync(dir)) {
    if (/wasm/i.test(f) || f.endsWith('.map')) {
      pruned += fs.statSync(path.join(dir, f)).size;
      fs.rmSync(path.join(dir, f));
    }
  }
}
console.log(`Đã bỏ ${(pruned / 1024 / 1024).toFixed(0)} MB engine WASM không dùng`);
const engine = fs.readdirSync(path.join(be, 'node_modules', '.prisma', 'client')).find((f) => f.endsWith('.node'));
if (!engine) throw new Error('Thiếu Prisma query engine trong node_modules/.prisma/client');
console.log(`\n✓ Xong: ${path.relative(ROOT, OUT)} (engine: ${engine})`);
