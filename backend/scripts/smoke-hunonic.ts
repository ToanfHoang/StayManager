/**
 * Kiểm thử end-to-end tính năng đọc công tơ Hunonic bằng MÁY CHỦ HUNONIC GIẢ LẬP (không gọi máy chủ thật).
 * Script tự khởi động 1 backend riêng (cổng 4198) trỏ tới máy chủ giả lập (cổng 4199).
 * Chạy: npm run test:hunonic   (cần MySQL đang chạy)
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { hunonicSign } from '../src/lib/hunonic';

const MOCK_PORT = 4199;
const API_PORT = 4198;
const BASE = `http://localhost:${API_PORT}/api`;
const db = new PrismaClient();
const stamp = Date.now().toString(36);
let passed = 0;
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

/* ---------- Máy chủ Hunonic giả lập ---------- */
const MOCK_PHONE = '0987000111';
const MOCK_PASS = 'mat-khau-hunonic';
const state = { logins: 0, validToken: '', badSignatures: 0, kwh: { A: { m: 45.6, p: 123.4 }, B: { m: 20, p: 98.25 } } };
function mockServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${MOCK_PORT}`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const send = (o: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    if (url.pathname === '/v3/user/login') {
      // multipart: tách field đơn giản
      const fields: Record<string, string> = {};
      for (const m of raw.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)) fields[m[1]] = m[2];
      const { signature, ...rest } = fields;
      if (signature !== hunonicSign(rest)) { state.badSignatures++; return send({ status: false, error_code: 1026, message: 'Sai chữ ký' }); }
      if (rest.phone !== MOCK_PHONE || rest.password !== md5(MOCK_PASS)) return send({ status: false, error_code: 1001, message: 'Sai mật khẩu' });
      state.logins++;
      state.validToken = `tok-${state.logins}-${crypto.randomBytes(4).toString('hex')}`;
      return send({ status: true, data: { token_id: state.validToken, id: 7, name: 'Chu tro' } });
    }
    if (url.pathname === '/v3/device/listDeviceByHome') {
      const params = Object.fromEntries(url.searchParams.entries());
      const { signature, ...rest } = params;
      if (signature !== hunonicSign(rest)) { state.badSignatures++; return send({ status: false, error_code: 1026, message: 'Sai chữ ký' }); }
      if (rest.token_id !== state.validToken) return send({ status: false, error_code: 401, message: 'Token hết hạn' });
      const extra = (k: { m: number; p: number }) => JSON.stringify({ power_of_month: k.m, power_of_prev_month: k.p, power_current: 230, cost_of_month: 1000 });
      return send({
        status: true,
        data: [{
          id: 1, name: 'Nhà trọ', rooms: [
            { id: 11, name: 'Tầng 1', devices: [
              { id: 101, root_id: 'MAC-A', root_type: 'elmeter', name: 'Công tơ P1', state: 1, index_in_root: '1', root_extra: extra(state.kwh.A) },
              { id: 102, root_id: 'SW-1', root_type: 'wswitch', name: 'Công tắc', state: 1 },
            ] },
            { id: 12, name: 'Tầng 2', devices: [{ id: 103, root_id: 'MAC-B', root_type: 'elmeter', name: 'Công tơ P2', state: 0, root_extra: extra(state.kwh.B) }] },
          ],
        }],
      });
    }
    res.statusCode = 404;
    send({ status: false, message: 'not found' });
  });
}

/* ---------- Tiện ích gọi API ---------- */
type Res = { status: number; body: any };
async function call(method: string, p: string, token?: string, body?: unknown): Promise<Res> {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const okData = (r: Res, status = 200) => { assert.equal(r.status, status, `Mong đợi ${status}, nhận ${r.status}: ${JSON.stringify(r.body?.error)}`); return r.body.data; };
const err = (r: Res, status: number) => { assert.equal(r.status, status, `Mong đợi lỗi ${status}, nhận ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`); return r.body.error; };
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); throw e; }
}
const vnToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const cur = vnToday.slice(0, 7);
const addM = (p: string, k: number) => { let [y, m] = p.split('-').map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const prev = addM(cur, -1);
const prev2 = addM(cur, -2);

async function main() {
  const mock = mockServer();
  await new Promise<void>((r) => mock.listen(MOCK_PORT, r));
  const node = process.execPath;
  const child = spawn(node, [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], {
    env: { ...process.env, PORT: String(API_PORT), HUNONIC_API_URL: `http://localhost:${MOCK_PORT}/v3/`, SCHEDULER_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childLog = '';
  child.stdout.on('data', (d) => (childLog += d));
  child.stderr.on('data', (d) => (childLog += d));
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* chưa sẵn sàng */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`StayManager – kiểm thử công tơ Hunonic (máy chủ giả lập) → ${BASE}`);
    const pw = `Smoke-${stamp}-pass`;
    const admin = okData(await call('POST', '/auth/login', undefined, { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })).token;
    const llUser = okData(await call('POST', '/users', admin, { email: `hn-${stamp}@smoke.test`, password: pw, fullName: 'Chủ trọ Công tơ', role: 'LANDLORD' }), 201);
    const ll = okData(await call('POST', '/auth/login', undefined, { email: `hn-${stamp}@smoke.test`, password: pw })).token;
    const staffU = okData(await call('POST', '/users', ll, { email: `hns-${stamp}@smoke.test`, password: pw, fullName: 'NV', role: 'STAFF' }), 201);
    const staff = okData(await call('POST', '/auth/login', undefined, { email: `hns-${stamp}@smoke.test`, password: pw })).token;

    const prop = okData(await call('POST', '/properties', ll, { name: 'Dãy Công tơ', address: 'Số 4', electricityPrice: 3500, waterPrice: 0, waterMode: 'SPLIT_PER_PERSON' }), 201);
    const rooms = [];
    for (const n of ['C1', 'C2']) {
      const r = okData(await call('POST', '/rooms', ll, { propertyId: prop.id, roomNumber: n, price: 2000000, maxOccupancy: 2 }), 201);
      const t = okData(await call('POST', '/tenants', ll, { fullName: `Khách ${n}`, phone: '0911222333' }), 201);
      okData(await call('POST', '/contracts', ll, { roomId: r.id, tenantIds: [t.id], startDate: `${prev2}-01`, endDate: '2099-12-31', rentPrice: 2000000 }), 201);
      rooms.push(r);
    }
    // chỉ số kỳ trước nữa: phòng C1 = 1000 kWh, phòng C2 chưa có
    okData(await call('POST', '/meter-readings', ll, { roomId: rooms[0].id, period: prev2, electricityPrev: 900, electricityCurr: 1000, waterPrev: 0, waterCurr: 0 }), 201);

    await step('Chưa kết nối → báo rõ ràng', async () => {
      assert.equal(okData(await call('GET', '/hunonic/account', ll)).connected, false);
      err(await call('GET', '/hunonic/meters', ll), 400);
    });
    await step('Sai mật khẩu Hunonic → không lưu tài khoản', async () => {
      const e = err(await call('PUT', '/hunonic/account', ll, { phone: MOCK_PHONE, password: 'sai' }), 400);
      assert.match(e.message, /Sai mật khẩu/);
      assert.equal(await db.hunonicAccount.count({ where: { landlordId: llUser.id } }), 0);
      assert.equal(state.badSignatures, 0, 'chữ ký phải luôn đúng');
    });
    await step('Nhân viên không được kết nối tài khoản', async () => {
      err(await call('PUT', '/hunonic/account', staff, { phone: MOCK_PHONE, password: MOCK_PASS }), 403);
    });
    await step('Kết nối đúng → chỉ lấy công tơ (bỏ công tắc), mật khẩu & token được mã hóa', async () => {
      const r = okData(await call('PUT', '/hunonic/account', ll, { phone: MOCK_PHONE, password: MOCK_PASS }));
      assert.equal(r.meters, 2);
      const row = await db.hunonicAccount.findUniqueOrThrow({ where: { landlordId: llUser.id } });
      assert.ok(!row.passwordEnc.includes(MOCK_PASS) && row.passwordEnc.startsWith('v1:'));
      assert.ok(row.tokenEnc && !row.tokenEnc.includes(state.validToken));
      const acc = okData(await call('GET', '/hunonic/account', ll));
      assert.equal(acc.phone, '*******111');
    });
    await step('Danh sách công tơ có kWh tháng này / tháng trước / công suất', async () => {
      const ms = okData(await call('GET', '/hunonic/meters', staff));
      const a = ms.find((m: any) => m.deviceId === 'MAC-A');
      assert.equal(a.kwhPrevMonth, 123.4);
      assert.equal(a.kwhThisMonth, 45.6);
      assert.equal(a.powerW, 230);
      assert.equal(a.online, true);
      assert.equal(ms.find((m: any) => m.deviceId === 'MAC-B').online, false);
    });
    await step('Gán công tơ cho phòng; 1 công tơ không gán 2 phòng', async () => {
      okData(await call('PUT', `/hunonic/rooms/${rooms[0].id}/meter`, ll, { deviceId: 'MAC-A', meterName: 'Công tơ P1' }));
      okData(await call('PUT', `/hunonic/rooms/${rooms[1].id}/meter`, ll, { deviceId: 'MAC-B', meterName: 'Công tơ P2' }));
      err(await call('PUT', `/hunonic/rooms/${rooms[1].id}/meter`, ll, { deviceId: 'MAC-A' }), 409);
      const ms = okData(await call('GET', '/hunonic/meters', ll));
      assert.equal(ms.find((m: any) => m.deviceId === 'MAC-A').room.roomNumber, 'C1');
    });
    await step('Gợi ý chỉ số tháng trước: chỉ số mới = chỉ số cũ + kWh công tơ', async () => {
      const s = okData(await call('GET', `/hunonic/readings?period=${prev}&propertyId=${prop.id}`, ll));
      const c1 = s.find((x: any) => x.roomNumber === 'C1');
      assert.equal(c1.electricityPrev, 1000);
      assert.equal(c1.kwh, 123.4);
      assert.equal(c1.electricityCurr, 1123.4);
      const c2 = s.find((x: any) => x.roomNumber === 'C2');
      assert.equal(c2.electricityPrev, 0);
      assert.equal(c2.electricityCurr, 98.25);
    });
    await step('Tháng này: số tạm (chưa hết tháng); tháng cũ hơn: báo không có dữ liệu', async () => {
      const s = okData(await call('GET', `/hunonic/readings?period=${cur}&propertyId=${prop.id}`, ll));
      assert.match(s[0].note, /chưa hết tháng/);
      const old = okData(await call('GET', `/hunonic/readings?period=${prev2}&propertyId=${prop.id}`, ll));
      assert.ok(old.every((x: any) => /chỉ lưu số của tháng này và tháng trước/.test(x.error)));
    });
    await step('Token hết hạn → tự đăng nhập lại', async () => {
      const before = state.logins;
      state.validToken = 'token-moi-chua-cap';
      okData(await call('GET', '/hunonic/meters', ll));
      assert.equal(state.logins, before + 1);
    });
    await step('Tự lấy số điện tháng trước (đầu tháng) cho phòng chưa có chỉ số + báo chủ trọ', async () => {
      process.env.HUNONIC_API_URL = `http://localhost:${MOCK_PORT}/v3/`;
      const { autoImportMeterReadings } = await import('../src/modules/hunonic/hunonic.service');
      const r = await autoImportMeterReadings({ force: true });
      assert.ok(r.meterImported >= 2);
      const c1 = await db.meterReading.findUniqueOrThrow({ where: { roomId_period: { roomId: rooms[0].id, period: prev } } });
      assert.equal(Number(c1.electricityPrev), 1000);
      assert.equal(Number(c1.electricityCurr), 1123.4);
      const again = await autoImportMeterReadings({ force: true });
      assert.equal(await db.meterReading.count({ where: { roomId: { in: rooms.map((x) => x.id) }, period: prev } }), 2, 'không tạo trùng');
      void again;
      const n = okData(await call('GET', '/notifications', ll));
      assert.ok(n.some((x: any) => /Đã tự lấy số điện/.test(x.title)));
    });
    await step('Lập hóa đơn tháng trước dùng đúng số điện từ công tơ', async () => {
      const g = okData(await call('POST', '/invoices/generate', ll, { period: prev, propertyId: prop.id, waterTotal: 200000 }));
      assert.equal(g.created.length, 2);
      const inv = okData(await call('GET', `/invoices/${g.created.find((c: any) => c.roomNumber === 'C1').invoiceId}`, ll));
      const e = inv.items.find((x: any) => x.type === 'ELECTRICITY');
      assert.equal(e.quantity, 123.4);
      assert.equal(e.amount, 431900);
    });
    await step('Ngắt kết nối → xóa thông tin đăng nhập', async () => {
      okData(await call('DELETE', '/hunonic/account', ll));
      assert.equal(await db.hunonicAccount.count({ where: { landlordId: llUser.id } }), 0);
    });
    await step('Dọn dẹp: khóa tài khoản thử nghiệm', async () => {
      await db.user.updateMany({ where: { id: { in: [llUser.id, staffU.id] } }, data: { isActive: false } });
    });
    console.log(`\n✅ Tất cả ${passed} bước kiểm thử công tơ Hunonic đều đạt (chữ ký sai: ${state.badSignatures})`);
  } catch {
    console.error(`\n❌ Kiểm thử thất bại sau ${passed} bước đạt`);
    if (process.env.DEBUG) console.error(childLog.slice(-3000));
    process.exitCode = 1;
  } finally {
    child.kill();
    mock.close();
    await db.$disconnect();
  }
}

main();
