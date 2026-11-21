/**
 * Kiểm thử end-to-end: tiền nước chia đầu người + soạn tin nhắn tiền phòng gửi Zalo + chặn Cổng người thuê.
 * Yêu cầu API đang chạy. Chạy: npm run test:water-zalo
 */
import 'dotenv/config';
import assert from 'node:assert/strict';

const BASE = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4100}/api`;
const stamp = Date.now().toString(36);
let passed = 0;

type Res = { status: number; body: any };
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const okData = (r: Res, status = 200) => { assert.equal(r.status, status, `Mong đợi ${status}, nhận ${r.status}: ${JSON.stringify(r.body?.error)}`); return r.body.data; };
const err = (r: Res, status: number) => { assert.equal(r.status, status, `Mong đợi lỗi ${status}, nhận ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`); return r.body.error; };
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); throw e; }
}
const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const period = todayStr.slice(0, 7);

async function main() {
  console.log(`StayManager – kiểm thử tiền nước chia đầu người & Zalo → ${BASE}`);
  const pw = `Smoke-${stamp}-pass`;
  const admin = okData(await call('POST', '/auth/login', undefined, { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })).token;
  const llUser = okData(await call('POST', '/users', admin, { email: `wz-${stamp}@smoke.test`, password: pw, fullName: 'Chủ trọ Nước', role: 'LANDLORD' }), 201);
  const ll = okData(await call('POST', '/auth/login', undefined, { email: `wz-${stamp}@smoke.test`, password: pw })).token;

  // Khu trọ tính nước chia đầu người + wifi cố định; 3 phòng: 2 người, 1 người, 3 người (tổng 6 người)
  const prop = okData(await call('POST', '/properties', ll, { name: 'Dãy trọ Nước', address: 'Số 3', electricityPrice: 3500, waterPrice: 0, waterMode: 'SPLIT_PER_PERSON' }), 201);
  okData(await call('POST', `/properties/${prop.id}/services`, ll, { name: 'Wifi', type: 'INTERNET', unit: 'PER_ROOM', price: 100000 }), 201);
  const rooms: any[] = [];
  const sizes = [2, 1, 3];
  for (let i = 0; i < 3; i++) {
    const r = okData(await call('POST', '/rooms', ll, { propertyId: prop.id, roomNumber: `W${i + 1}`, price: 2000000 + i * 500000, maxOccupancy: 4 }), 201);
    const ids = [];
    for (let k = 0; k < sizes[i]; k++) ids.push(okData(await call('POST', '/tenants', ll, { fullName: `Người ${i + 1}.${k + 1}`, phone: `+84 91${i}${k} 12 34 5` }), 201).id);
    okData(await call('POST', '/contracts', ll, { roomId: r.id, tenantIds: ids, startDate: `${period}-01`, endDate: '2099-12-31', rentPrice: Number(r.price) }), 201);
    rooms.push(r);
  }

  await step('Nhập chỉ số điện (không cần nước) cho khu chia đầu người', async () => {
    const sheet = okData(await call('GET', `/meter-readings/sheet?period=${period}&propertyId=${prop.id}`, ll));
    assert.equal(sheet.rows[0].property.waterMode, 'SPLIT_PER_PERSON');
    okData(await call('POST', '/meter-readings/bulk', ll, { period, readings: rooms.map((r, i) => ({ roomId: r.id, electricityPrev: 100, electricityCurr: 150 + i * 10, waterPrev: 0, waterCurr: 0 })) }));
  });

  await step('Xem trước chia nước: 6 người trên 3 phòng', async () => {
    const p = okData(await call('GET', `/invoices/water-split-preview?propertyId=${prop.id}&period=${period}`, ll));
    assert.equal(p.waterMode, 'SPLIT_PER_PERSON');
    assert.equal(p.totalPeople, 6);
    assert.deepEqual(p.rooms.map((r: any) => r.people), [2, 1, 3]);
  });

  await step('Lập hóa đơn khi chưa nhập tổng tiền nước → bỏ qua kèm lý do rõ ràng', async () => {
    const g = okData(await call('POST', '/invoices/generate', ll, { period, propertyId: prop.id }));
    assert.equal(g.created.length, 0);
    assert.ok(g.skipped.every((s: any) => /tổng tiền nước/.test(s.reason)));
    err(await call('POST', '/invoices/generate', ll, { period, waterTotal: 600000 }), 400); // thiếu khu trọ
  });

  let invs: any[] = [];
  await step('Nhập tổng 600.000đ → 100.000đ/người, phòng 2 người = 200.000đ; wifi & tiền phòng cố định', async () => {
    const g = okData(await call('POST', '/invoices/generate', ll, { period, propertyId: prop.id, waterTotal: 600000 }));
    assert.equal(g.created.length, 3);
    assert.deepEqual(g.waterSplit, { total: 600000, totalPeople: 6, perPerson: 100000 });
    invs = await Promise.all(g.created.map(async (c: any) => okData(await call('GET', `/invoices/${c.invoiceId}`, ll))));
    invs.sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber));
    const water = invs.map((i) => i.items.find((x: any) => x.type === 'WATER').amount);
    assert.deepEqual(water, [200000, 100000, 300000]);
    assert.equal(water.reduce((a, b) => a + b, 0), 600000, 'tổng chia đúng bằng tiền nước cả dãy');
    const w1 = invs[0];
    assert.equal(w1.items.find((x: any) => x.type === 'RENT').amount, 2000000);
    assert.equal(w1.items.find((x: any) => x.type === 'INTERNET').amount, 100000);
    assert.equal(w1.items.find((x: any) => x.type === 'ELECTRICITY').amount, 175000); // 50 kWh × 3.500
    assert.equal(w1.totalAmount, 2000000 + 175000 + 200000 + 100000);
  });

  await step('Sửa chỉ số điện → khoản điện cập nhật, khoản nước chia đầu người giữ nguyên', async () => {
    const sheet = okData(await call('GET', `/meter-readings/sheet?period=${period}&propertyId=${prop.id}`, ll));
    const rid = sheet.rows.find((r: any) => r.room.id === rooms[0].id).reading.id;
    okData(await call('PUT', `/meter-readings/${rid}`, ll, { electricityPrev: 100, electricityCurr: 160, waterPrev: 0, waterCurr: 0 }));
    const inv = okData(await call('GET', `/invoices/${invs[0].id}`, ll));
    assert.equal(inv.items.find((x: any) => x.type === 'ELECTRICITY').amount, 210000);
    assert.equal(inv.items.find((x: any) => x.type === 'WATER').amount, 200000);
  });

  await step('Chia lẻ: 1.000.000đ / 6 người làm tròn tới đồng', async () => {
    const cancelReason = { reason: 'Lập lại để thử làm tròn' };
    for (const i of invs) okData(await call('POST', `/invoices/${i.id}/cancel`, ll, cancelReason));
    const g = okData(await call('POST', '/invoices/generate', ll, { period, propertyId: prop.id, waterTotal: 1000000 }));
    assert.equal(g.waterSplit.perPerson, 166667);
    invs = await Promise.all(g.created.map(async (c: any) => okData(await call('GET', `/invoices/${c.invoiceId}`, ll))));
  });

  await step('Soạn tin nhắn Zalo: đủ khoản, tổng, hạn, SĐT chuẩn hóa; chưa có tài khoản NH thì không có QR', async () => {
    const inv = invs.find((i) => i.room.roomNumber === 'W1');
    const m = okData(await call('GET', `/invoices/${inv.id}/zalo-message`, ll));
    assert.equal(m.phone, '0910012345');
    assert.match(m.text, /Dãy trọ Nước – Phòng W1/);
    assert.match(m.text, /Tiền nước \(2 người × 166\.667đ\): 333\.334đ/);
    assert.match(m.text, /Wifi: 100\.000đ/);
    assert.match(m.text, /Tổng cộng: /);
    assert.match(m.text, /Hạn thanh toán: \d{2}\/\d{2}\/\d{4}/);
    assert.equal(m.qr, null);
  });
  await step('Có tài khoản ngân hàng → tin nhắn kèm STK, nội dung CK và mã VietQR', async () => {
    okData(await call('POST', '/bank-accounts', ll, { bankCode: '970436', bankName: 'Vietcombank', accountNumber: '0123456789', accountHolder: 'Chu Tro Nuoc' }), 201);
    const inv = invs.find((i) => i.room.roomNumber === 'W1');
    const m = okData(await call('GET', `/invoices/${inv.id}/zalo-message`, ll));
    assert.match(m.qr.dataUrl, /^data:image\/png;base64,/);
    assert.equal(m.qr.amount, inv.totalAmount);
    assert.match(m.text, /STK 0123456789 – CHU TRO NUOC/);
    assert.match(m.text, /Nội dung CK: STAY-PW1-INV\d{6}-[0-9A-F]{4}/);
  });
  await step('Đánh dấu đã gửi Zalo + lọc hóa đơn chưa gửi', async () => {
    const inv = invs[0];
    const r = okData(await call('POST', `/invoices/${inv.id}/zalo-sent`, ll, { sent: true }));
    assert.ok(r.zaloSentAt);
    const unsent = okData(await call('GET', `/invoices?period=${period}&propertyId=${prop.id}&zalo=unsent&status=OUTSTANDING`, ll));
    assert.equal(unsent.length, 2);
    okData(await call('POST', `/invoices/${inv.id}/zalo-sent`, ll, { sent: false }));
    assert.equal(okData(await call('GET', `/invoices?period=${period}&propertyId=${prop.id}&zalo=unsent&status=OUTSTANDING`, ll)).length, 3);
  });
  await step('Cổng người thuê đã gỡ: API cũ không còn, tài khoản người thuê không đăng nhập được', async () => {
    err(await call('GET', '/portal/me', ll), 404);
    err(await call('POST', '/webhooks/sepay', ll, {}), 404);
    err(await call('POST', '/webhooks/sepay', undefined, {}), 401);
    if (process.env.SEED_DEMO_TENANT_EMAIL) {
      const r = await call('POST', '/auth/login', undefined, { email: process.env.SEED_DEMO_TENANT_EMAIL, password: process.env.SEED_DEMO_TENANT_PASSWORD });
      assert.equal(r.status, 401);
    }
  });

  await step('Dọn dẹp: khóa tài khoản thử nghiệm', async () => {
    okData(await call('PUT', `/users/${llUser.id}`, admin, { fullName: 'Tài khoản thử nghiệm (đã khóa)', isActive: false }));
  });
  console.log(`\n✅ Tất cả ${passed} bước kiểm thử tiền nước & Zalo đều đạt`);
}

main().catch(() => {
  console.error(`\n❌ Kiểm thử thất bại sau ${passed} bước đạt`);
  process.exitCode = 1;
});
