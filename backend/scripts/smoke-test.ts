/**
 * Kiểm thử end-to-end các luồng nghiệp vụ chính qua REST API.
 * Yêu cầu API đang chạy. Chạy: npm run test:e2e
 * Script tạo 2 chủ trọ thử nghiệm (email *@smoke.test) + dữ liệu của họ, cuối cùng KHÓA các tài khoản này.
 * Dữ liệu thử nghiệm được cô lập theo chủ trọ nên không ảnh hưởng dữ liệu thật.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';

const BASE = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4100}/api`;
const stamp = Date.now().toString(36);
let passed = 0;

type Res = { status: number; body: { success: boolean; data?: any; meta?: any; error?: { code: string; message: string } } };

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : { success: r.ok } };
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
    throw e;
  }
}

const expectOk = (r: Res, status = 200) => { assert.equal(r.status, status, `Mong đợi ${status}, nhận ${r.status}: ${JSON.stringify(r.body.error)}`); return r.body.data; };
const expectErr = (r: Res, status: number) => { assert.equal(r.status, status, `Mong đợi lỗi ${status}, nhận ${r.status}: ${JSON.stringify(r.body)}`); return r.body.error!; };

const period = (offset = 0) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

async function main() {
  console.log(`StayManager smoke test → ${BASE}`);
  let admin = '', ll = '', ll2 = '', staff = '';
  const ids: Record<string, number> = {};
  const createdUsers: number[] = [];

  await step('Đăng nhập sai mật khẩu bị từ chối', async () => {
    expectErr(await call('POST', '/auth/login', undefined, { email: process.env.SEED_ADMIN_EMAIL, password: 'sai-mat-khau' }), 401);
  });
  await step('API yêu cầu đăng nhập', async () => { expectErr(await call('GET', '/properties'), 401); });
  await step('Admin đăng nhập', async () => {
    admin = expectOk(await call('POST', '/auth/login', undefined, { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })).token;
  });

  const pw = `Smoke-${stamp}-pass`;
  await step('Admin tạo 2 chủ trọ thử nghiệm', async () => {
    for (const n of [1, 2]) {
      const u = expectOk(await call('POST', '/users', admin, { email: `ll${n}-${stamp}@smoke.test`, password: pw, fullName: `Chủ trọ thử ${n}`, role: 'LANDLORD' }), 201);
      createdUsers.push(u.id);
    }
    ll = expectOk(await call('POST', '/auth/login', undefined, { email: `ll1-${stamp}@smoke.test`, password: pw })).token;
    ll2 = expectOk(await call('POST', '/auth/login', undefined, { email: `ll2-${stamp}@smoke.test`, password: pw })).token;
  });
  await step('Chủ trọ tạo nhân viên; chủ trọ không được tạo chủ trọ khác', async () => {
    const s = expectOk(await call('POST', '/users', ll, { email: `staff-${stamp}@smoke.test`, password: pw, fullName: 'Nhân viên thử', role: 'STAFF' }), 201);
    createdUsers.push(s.id);
    staff = expectOk(await call('POST', '/auth/login', undefined, { email: `staff-${stamp}@smoke.test`, password: pw })).token;
    expectErr(await call('POST', '/users', ll, { email: `x-${stamp}@smoke.test`, password: pw, fullName: 'X', role: 'LANDLORD' }), 403);
  });

  await step('Tạo khu trọ + dịch vụ', async () => {
    const p = expectOk(await call('POST', '/properties', ll, { name: 'Khu trọ thử', address: '1 Đường A', floors: 3, electricityPrice: 3500, waterPrice: 20000 }), 201);
    ids.property = p.id;
    expectOk(await call('POST', `/properties/${p.id}/services`, ll, { name: 'Internet', type: 'INTERNET', unit: 'PER_ROOM', price: 100000 }), 201);
    expectOk(await call('POST', `/properties/${p.id}/services`, ll, { name: 'Gửi xe', type: 'PARKING', unit: 'PER_PERSON', price: 50000 }), 201);
    expectErr(await call('POST', '/properties', staff, { name: 'X', address: 'Y', electricityPrice: 1, waterPrice: 1 }), 403);
  });
  await step('Validation: thiếu trường bắt buộc trả 400', async () => {
    const e = expectErr(await call('POST', '/properties', ll, { name: '', address: '', electricityPrice: -1, waterPrice: 1 }), 400);
    assert.equal(e.code, 'VALIDATION_ERROR');
  });

  await step('Tạo phòng; trùng số phòng bị chặn; không tự đặt OCCUPIED', async () => {
    ids.room1 = expectOk(await call('POST', '/rooms', ll, { propertyId: ids.property, roomNumber: '101', floor: 1, area: 20, price: 3000000, maxOccupancy: 2 }), 201).id;
    ids.room2 = expectOk(await call('POST', '/rooms', staff, { propertyId: ids.property, roomNumber: '102', floor: 1, price: 2500000, maxOccupancy: 3 }), 201).id;
    expectErr(await call('POST', '/rooms', ll, { propertyId: ids.property, roomNumber: '101', price: 1 }), 409);
    expectErr(await call('POST', '/rooms', ll, { propertyId: ids.property, roomNumber: '103', price: 1, status: 'OCCUPIED' }), 400);
  });

  await step('Cô lập dữ liệu: chủ trọ khác không thấy khu trọ/phòng', async () => {
    const list = expectOk(await call('GET', '/properties', ll2));
    assert.equal(list.length, 0);
    expectErr(await call('GET', `/rooms/${ids.room1}`, ll2), 404);
    expectErr(await call('PUT', `/properties/${ids.property}`, ll2, { name: 'hack', address: 'x', electricityPrice: 1, waterPrice: 1 }), 404);
  });

  await step('Tạo người thuê; CCCD trùng bị chặn; nhân viên thấy CCCD bị che', async () => {
    ids.t1 = expectOk(await call('POST', '/tenants', ll, { fullName: 'Nguyễn Văn A', phone: '0901234567', idNumber: '012345678901', gender: 'MALE', dateOfBirth: '1995-05-20' }), 201).id;
    ids.t2 = expectOk(await call('POST', '/tenants', ll, { fullName: 'Trần Thị B', phone: '0907654321' }), 201).id;
    ids.t3 = expectOk(await call('POST', '/tenants', ll, { fullName: 'Lê C', phone: '0911111111' }), 201).id;
    expectErr(await call('POST', '/tenants', ll, { fullName: 'Trùng', phone: '0900000000', idNumber: '012345678901' }), 409);
    const viaStaff = expectOk(await call('GET', `/tenants/${ids.t1}`, staff));
    assert.equal(viaStaff.idNumber, '********8901');
    const viaOwner = expectOk(await call('GET', `/tenants/${ids.t1}`, ll));
    assert.equal(viaOwner.idNumber, '012345678901');
    expectErr(await call('GET', `/tenants/${ids.t1}`, ll2), 404);
    const found = expectOk(await call('GET', '/tenants?q=0907', ll));
    assert.equal(found.length, 1);
  });

  const start = `${period(-1)}-01`;
  await step('Tạo hợp đồng nhiều người thuê → phòng chuyển OCCUPIED', async () => {
    const c = expectOk(await call('POST', '/contracts', ll, { roomId: ids.room1, tenantIds: [ids.t1, ids.t2], primaryTenantId: ids.t1, startDate: start, endDate: '2099-12-31', rentPrice: 3000000, deposit: 3000000, paymentDueDay: 5 }), 201);
    ids.contract = c.id;
    assert.match(c.contractNumber, /^HD-\d{4}-\d{5}$/);
    assert.equal(expectOk(await call('GET', `/rooms/${ids.room1}`, ll)).status, 'OCCUPIED');
  });
  await step('Quy tắc 1: phòng không có 2 hợp đồng hiệu lực', async () => {
    expectErr(await call('POST', '/contracts', ll, { roomId: ids.room1, tenantIds: [ids.t3], startDate: start, endDate: '2099-01-01', rentPrice: 1 }), 409);
  });
  await step('Người thuê không thể ở 2 hợp đồng hiệu lực; vượt sức chứa bị chặn', async () => {
    expectErr(await call('POST', '/contracts', ll, { roomId: ids.room2, tenantIds: [ids.t1], startDate: start, endDate: '2099-01-01', rentPrice: 1 }), 409);
    expectErr(await call('POST', `/contracts/${ids.contract}/tenants`, ll, { tenantId: ids.t3 }), 409);
  });
  await step('Không đổi trạng thái phòng đang có hợp đồng', async () => {
    expectErr(await call('PUT', `/rooms/${ids.room1}`, ll, { propertyId: ids.property, roomNumber: '101', price: 3000000, maxOccupancy: 2, status: 'MAINTENANCE' }), 409);
  });

  await step('Chỉ số điện nước: tiêu thụ âm bị chặn', async () => {
    expectErr(await call('POST', '/meter-readings', ll, { roomId: ids.room1, period: period(), electricityPrev: 100, electricityCurr: 90, waterPrev: 10, waterCurr: 12 }), 400);
  });
  await step('Nhập chỉ số hàng loạt + tự tính tiêu thụ/thành tiền', async () => {
    expectOk(await call('POST', '/meter-readings/bulk', ll, { period: period(), readings: [{ roomId: ids.room1, electricityPrev: 1000, electricityCurr: 1100, waterPrev: 50, waterCurr: 55 }] }));
    const sheet = expectOk(await call('GET', `/meter-readings/sheet?period=${period()}`, ll));
    const row = sheet.rows.find((r: any) => r.room.id === ids.room1);
    assert.equal(row.reading.electricityUsage, 100);
    assert.equal(row.reading.electricityCost, 350000);
    assert.equal(row.reading.waterCost, 100000);
  });

  let invoiceId = 0;
  await step('Tạo hóa đơn: tổng = Σ chi tiết; phòng thiếu chỉ số bị bỏ qua có lý do', async () => {
    const r = expectOk(await call('POST', '/invoices/generate', ll, { period: period() }));
    assert.equal(r.created.length, 1);
    invoiceId = r.created[0].invoiceId;
    const inv = expectOk(await call('GET', `/invoices/${invoiceId}`, ll));
    const sum = inv.items.reduce((a: number, i: any) => a + i.amount, 0);
    // 3.000.000 + 350.000 + 100.000 + internet 100.000 + gửi xe 2 người × 50.000
    assert.equal(inv.totalAmount, 3650000);
    assert.equal(sum, inv.totalAmount);
    assert.equal(inv.status, 'UNPAID');
    const prev = expectOk(await call('POST', '/invoices/generate', ll, { period: period(-1) }));
    assert.equal(prev.created.length, 0);
    assert.match(prev.skipped[0].reason, /chỉ số/);
  });
  await step('Quy tắc 4: không tạo trùng hóa đơn', async () => {
    const r = expectOk(await call('POST', '/invoices/generate', ll, { period: period() }));
    assert.equal(r.created.length, 0);
    assert.match(r.skipped[0].reason, /Đã có hóa đơn/);
  });
  await step('Sửa khoản hóa đơn → tổng tự tính lại', async () => {
    const inv = expectOk(await call('GET', `/invoices/${invoiceId}`, ll));
    const items = inv.items.map((i: any) => ({ type: i.type, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }));
    items.push({ type: 'OTHER', description: 'Phí sửa khóa', quantity: 1, unitPrice: 50000 });
    const upd = expectOk(await call('PUT', `/invoices/${invoiceId}`, ll, { items, dueDate: inv.dueDate.slice(0, 10), note: null }));
    assert.equal(upd.totalAmount, 3700000);
  });
  await step('Sửa chỉ số khi hóa đơn chưa thanh toán → khoản điện cập nhật', async () => {
    const sheet = expectOk(await call('GET', `/meter-readings/sheet?period=${period()}`, ll));
    const rid = sheet.rows.find((r: any) => r.room.id === ids.room1).reading.id;
    expectOk(await call('PUT', `/meter-readings/${rid}`, ll, { electricityPrev: 1000, electricityCurr: 1110, waterPrev: 50, waterCurr: 55 }));
    const inv = expectOk(await call('GET', `/invoices/${invoiceId}`, ll));
    assert.equal(inv.totalAmount, 3735000);
    const logs = expectOk(await call('GET', `/meter-readings/${rid}/audit`, ll));
    assert.ok(logs.some((l: any) => l.action === 'UPDATE'), 'Phải có audit log khi sửa chỉ số');
  });

  let paymentId = 0;
  await step('Quy tắc 7: thanh toán một phần → PARTIALLY_PAID, số dư đúng', async () => {
    const r = expectOk(await call('POST', '/payments', staff, { invoiceId, amount: 1000000, method: 'CASH', paymentDate: todayStr }), 201);
    paymentId = r.payment.id;
    assert.match(r.payment.receiptNumber, /^PT\d{6}-\d{6}$/);
    assert.equal(r.invoice.status, 'PARTIALLY_PAID');
    assert.equal(r.invoice.balance, 2735000);
  });
  await step('Không cho trả vượt số còn nợ; chuyển khoản phải có mã GD', async () => {
    expectErr(await call('POST', '/payments', ll, { invoiceId, amount: 2735001, method: 'CASH', paymentDate: todayStr }), 400);
    expectErr(await call('POST', '/payments', ll, { invoiceId, amount: 1000, method: 'BANK_TRANSFER', paymentDate: todayStr }), 400);
  });
  await step('Đã có thanh toán → không sửa khoản / không hủy hóa đơn / không sửa chỉ số', async () => {
    const inv = expectOk(await call('GET', `/invoices/${invoiceId}`, ll));
    expectErr(await call('PUT', `/invoices/${invoiceId}`, ll, { items: [{ type: 'RENT', description: 'x', quantity: 1, unitPrice: 1 }], dueDate: inv.dueDate.slice(0, 10) }), 409);
    expectErr(await call('POST', `/invoices/${invoiceId}/cancel`, ll, { reason: 'thử hủy' }), 409);
    const rid = inv.reading.id;
    expectErr(await call('PUT', `/meter-readings/${rid}`, ll, { electricityPrev: 1000, electricityCurr: 1200, waterPrev: 50, waterCurr: 55 }), 409);
  });
  await step('Quy tắc 8: trả đủ → PAID', async () => {
    const r = expectOk(await call('POST', '/payments', ll, { invoiceId, amount: 2735000, method: 'BANK_TRANSFER', reference: 'VCB123', paymentDate: todayStr }), 201);
    assert.equal(r.invoice.status, 'PAID');
    assert.equal(r.invoice.balance, 0);
  });
  await step('Quy tắc 12: hủy phiếu thu (void) → hóa đơn tính lại, phiếu vẫn còn lịch sử', async () => {
    const r = expectOk(await call('POST', `/payments/${paymentId}/void`, ll, { reason: 'Ghi nhầm' }));
    assert.equal(r.invoice.status, 'PARTIALLY_PAID');
    assert.equal(r.invoice.paidAmount, 2735000);
    const all = expectOk(await call('GET', `/payments?invoiceId=${invoiceId}&includeVoided=true`, ll));
    assert.equal(all.length, 2);
  });

  await step('Hủy hóa đơn chưa thanh toán rồi lập lại cho cùng kỳ', async () => {
    expectOk(await call('POST', '/meter-readings', ll, { roomId: ids.room1, period: period(-1), electricityPrev: 900, electricityCurr: 1000, waterPrev: 45, waterCurr: 50 }), 201);
    const g = expectOk(await call('POST', '/invoices/generate', ll, { period: period(-1) }));
    const id = g.created[0].invoiceId;
    expectOk(await call('POST', `/invoices/${id}/cancel`, ll, { reason: 'Lập sai' }));
    const again = expectOk(await call('POST', '/invoices/generate', ll, { period: period(-1) }));
    assert.equal(again.created.length, 1);
    ids.prevInvoice = again.created[0].invoiceId;
  });
  await step('Quy tắc 9: hóa đơn quá hạn được nhận diện là OVERDUE', async () => {
    const inv = expectOk(await call('GET', `/invoices/${ids.prevInvoice}`, ll));
    const items = inv.items.map((i: any) => ({ type: i.type, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }));
    const issue = inv.issueDate.slice(0, 10);
    // đặt hạn = ngày lập; nếu ngày lập < hôm nay thì sẽ quá hạn
    expectOk(await call('PUT', `/invoices/${ids.prevInvoice}`, ll, { items, dueDate: issue }));
    const fresh = expectOk(await call('GET', `/invoices/${ids.prevInvoice}`, ll));
    if (issue < todayStr) assert.equal(fresh.displayStatus, 'OVERDUE');
    else assert.equal(fresh.displayStatus, 'UNPAID');
  });

  await step('Thu chi + yêu cầu sửa chữa hoàn thành tự tạo khoản chi', async () => {
    const cats = expectOk(await call('GET', '/expense-categories?type=EXPENSE', ll));
    expectOk(await call('POST', '/expenses', ll, { propertyId: ids.property, categoryId: cats[0].id, type: 'EXPENSE', amount: 200000, entryDate: todayStr, description: 'Mua bóng đèn' }), 201);
    expectErr(await call('POST', '/expenses', ll, { propertyId: ids.property, categoryId: cats[0].id, type: 'INCOME', amount: 1, entryDate: todayStr, description: 'sai loại' }), 400);
    const m = expectOk(await call('POST', '/maintenance-requests', staff, { roomId: ids.room1, title: 'Hỏng vòi nước', priority: 'HIGH', requestDate: todayStr }), 201);
    expectOk(await call('PUT', `/maintenance-requests/${m.id}`, ll, { roomId: ids.room1, title: 'Hỏng vòi nước', priority: 'HIGH', requestDate: todayStr, status: 'COMPLETED', actualCost: 150000, createExpense: true }));
    const sum = expectOk(await call('GET', `/expenses/summary?from=${todayStr}&to=${todayStr}`, ll));
    assert.equal(sum.expense, 350000);
    assert.equal(sum.rentIncome, 2735000);
  });

  await step('Dashboard & báo cáo lấy số liệu thật', async () => {
    const d = expectOk(await call('GET', '/dashboard', ll));
    assert.equal(d.stats.properties, 1);
    assert.equal(d.stats.rooms, 2);
    assert.equal(d.stats.occupied, 1);
    assert.equal(d.stats.occupancyRate, 50);
    assert.equal(d.stats.monthlyExpense, 350000);
    const rep = expectOk(await call('GET', `/reports?from=${period(-2)}&to=${period()}`, ll));
    assert.equal(rep.monthly.length, 3);
    assert.ok(rep.totals.outstanding > 0);
    const d2 = expectOk(await call('GET', '/dashboard', ll2));
    assert.equal(d2.stats.rooms, 0, 'Chủ trọ khác không thấy số liệu');
  });
  await step('Xuất Excel báo cáo', async () => {
    const r = await fetch(`${BASE}/reports/export?from=${period(-2)}&to=${period()}`, { headers: { Authorization: `Bearer ${ll}` } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /spreadsheetml/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK');
  });

  await step('Kết thúc hợp đồng → phòng trống; không xóa phòng có lịch sử', async () => {
    const r = expectOk(await call('POST', `/contracts/${ids.contract}/terminate`, ll, { endDate: todayStr, reason: 'Chuyển đi' }));
    assert.equal(r.status, 'TERMINATED');
    assert.ok(r.outstanding.count >= 1);
    assert.equal(expectOk(await call('GET', `/rooms/${ids.room1}`, ll)).status, 'AVAILABLE');
    expectErr(await call('DELETE', `/rooms/${ids.room1}`, ll), 409);
    expectErr(await call('DELETE', `/properties/${ids.property}`, ll), 409);
    expectOk(await call('DELETE', `/tenants/${ids.t3}`, ll));
  });

  await step('Dọn dẹp: khóa tài khoản thử nghiệm', async () => {
    for (const id of createdUsers.reverse()) expectOk(await call('PUT', `/users/${id}`, admin, { fullName: 'Tài khoản thử nghiệm (đã khóa)', isActive: false }));
    expectErr(await call('GET', '/auth/me', ll), 401);
  });

  console.log(`\n✅ Tất cả ${passed} bước kiểm thử đều đạt`);
}

main().catch(() => {
  console.error(`\n❌ Kiểm thử thất bại sau ${passed} bước đạt`);
  process.exit(1);
});
