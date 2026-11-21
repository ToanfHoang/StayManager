/**
 * (Tùy chọn) Tạo tài khoản DEMO với dữ liệu mẫu để dùng thử giao diện.
 * Dữ liệu thuộc riêng tài khoản demo (SEED_DEMO_EMAIL), không lẫn với dữ liệu thật.
 * Toàn bộ dữ liệu được tạo QUA API nên tuân thủ đầy đủ quy tắc nghiệp vụ.
 * Yêu cầu API đang chạy. Chạy: npm run db:seed-demo
 */
import 'dotenv/config';

const BASE = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4100}/api`;

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!j.success) throw new Error(`${method} ${path}: ${j.error?.message}`);
  return j.data as T;
}

const tz = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const today = tz(new Date());
const period = (k: number) => {
  let [y, m] = today.slice(0, 7).split('-').map(Number);
  m += k;
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
};

async function main() {
  const email = process.env.SEED_DEMO_EMAIL ?? 'demo@staymanager.local';
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('Thiếu SEED_DEMO_PASSWORD trong .env');
  const admin = (await call('POST', '/auth/login', undefined, { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })).token;

  const existing = await call<any[]>('GET', `/users?q=${encodeURIComponent(email)}`, admin);
  if (existing.length) {
    console.log(`Tài khoản demo ${email} đã tồn tại – bỏ qua.`);
    return;
  }
  await call('POST', '/users', admin, { email, password, fullName: 'Chủ trọ Demo', role: 'LANDLORD', phone: '0909000111' });
  const t = (await call('POST', '/auth/login', undefined, { email, password })).token;

  const p1 = await call('POST', '/properties', t, { name: 'Nhà trọ Hoa Mai', address: '25 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM', floors: 3, contactName: 'Chủ trọ Demo', contactPhone: '0909000111', electricityPrice: 3500, waterPrice: 20000, description: 'Khu trọ 3 tầng, có camera, giờ giấc tự do.' });
  const p2 = await call('POST', '/properties', t, { name: 'Căn hộ mini Sen Hồng', address: '112 Lê Văn Sỹ, Q. Phú Nhuận, TP.HCM', floors: 4, contactPhone: '0909000222', electricityPrice: 4000, waterPrice: 25000 });
  await call('POST', `/properties/${p1.id}/services`, t, { name: 'Internet', type: 'INTERNET', unit: 'PER_ROOM', price: 100000 });
  await call('POST', `/properties/${p1.id}/services`, t, { name: 'Gửi xe máy', type: 'PARKING', unit: 'PER_PERSON', price: 50000 });
  await call('POST', `/properties/${p1.id}/services`, t, { name: 'Vệ sinh chung', type: 'CLEANING', unit: 'PER_ROOM', price: 30000 });
  await call('POST', `/properties/${p2.id}/services`, t, { name: 'Wifi + truyền hình', type: 'INTERNET', unit: 'PER_ROOM', price: 150000 });

  const rooms: any[] = [];
  for (const [prop, nums, price] of [[p1, ['101', '102', '103', '201', '202', '203'], 2800000], [p2, ['A1', 'A2', 'B1', 'B2'], 4500000]] as const) {
    for (const n of nums) rooms.push(await call('POST', '/rooms', t, { propertyId: prop.id, roomNumber: n, floor: Number.isNaN(Number(n[0])) ? (n[0] === 'A' ? 1 : 2) : Number(n[0]), area: 18 + rooms.length, price: price + (rooms.length % 3) * 200000, maxOccupancy: 3 }));
  }
  await call('PUT', `/rooms/${rooms[5].id}`, t, { ...rooms[5], status: 'MAINTENANCE' });

  const people = [
    ['Nguyễn Văn An', '0901111222', '079095001234', 'MALE', '1995-03-12'],
    ['Trần Thị Bình', '0902222333', '079196002345', 'FEMALE', '1996-07-21'],
    ['Lê Hoàng Cường', '0903333444', '079097003456', 'MALE', '1997-11-02'],
    ['Phạm Thu Dung', '0904444555', '079198004567', 'FEMALE', '1998-01-30'],
    ['Võ Minh Đức', '0905555666', '079099005678', 'MALE', '1999-05-15'],
    ['Đặng Ngọc Hà', '0906666777', '079190006789', 'FEMALE', '1990-09-09'],
    ['Bùi Quốc Huy', '0907777888', '079091007890', 'MALE', '1991-12-24'],
  ];
  const tenants: any[] = [];
  for (const [fullName, phone, idNumber, gender, dob] of people) tenants.push(await call('POST', '/tenants', t, { fullName, phone, idNumber, gender, dateOfBirth: dob, permanentAddress: 'TP. Hồ Chí Minh' }));

  const start = `${period(-3)}-01`;
  const plan: [number, number[], string][] = [[0, [0, 1], '2027-12-31'], [1, [2], `${period(1)}-15`], [3, [3], '2027-06-30'], [6, [4, 5], '2027-09-30'], [7, [6], `${period(0)}-28`]];
  for (const [ri, ti, end] of plan) {
    const r = rooms[ri];
    await call('POST', '/contracts', t, { roomId: r.id, tenantIds: ti.map((i) => tenants[i].id), startDate: start, endDate: end, rentPrice: Number(r.price), deposit: Number(r.price), paymentDueDay: 5 });
  }

  const occupied = plan.map(([ri]) => rooms[ri]);
  for (let k = -3; k <= 0; k++) {
    // Chỉ số liên tục: chỉ số cũ kỳ này = chỉ số mới kỳ trước
    const j = k + 3;
    await call('POST', '/meter-readings/bulk', t, {
      period: period(k),
      readings: occupied.map((r, i) => {
        const e = 105 + i * 12 + (j % 2) * 8;
        const w = 5 + (i % 3);
        const eBase = 1000 + i * 300;
        const wBase = 100 + i * 40;
        const ePrev = eBase + Array.from({ length: j }, (_, x) => 105 + i * 12 + (x % 2) * 8).reduce((a, b) => a + b, 0);
        const wPrev = wBase + j * w;
        return { roomId: r.id, electricityPrev: ePrev, electricityCurr: ePrev + e, waterPrev: wPrev, waterCurr: wPrev + w };
      }),
    });
    const gen = await call('POST', '/invoices/generate', t, { period: period(k) });
    for (const c of gen.created) {
      const inv = await call('GET', `/invoices/${c.invoiceId}`, t);
      if (k <= -2) await call('POST', '/payments', t, { invoiceId: inv.id, amount: inv.balance, method: c.roomNumber.startsWith('A') ? 'BANK_TRANSFER' : 'CASH', reference: c.roomNumber.startsWith('A') ? `CK${inv.id}` : undefined, paymentDate: `${period(k + 1)}-04` });
      else if (k === -1 && c.roomNumber !== '102') await call('POST', '/payments', t, { invoiceId: inv.id, amount: c.roomNumber === '201' ? Math.round(inv.balance / 2) : inv.balance, method: 'CASH', paymentDate: today });
    }
  }

  const cats = await call<any[]>('GET', '/expense-categories?type=EXPENSE', t);
  const cat = (n: string) => cats.find((c) => c.name.startsWith(n))?.id ?? cats[0].id;
  for (let k = -3; k <= 0; k++) {
    await call('POST', '/expenses', t, { propertyId: p1.id, categoryId: cat('Tiền điện'), type: 'EXPENSE', amount: 850000 + k * 20000, entryDate: `${period(k)}-10`, description: 'Điện nước khu vực chung' });
    await call('POST', '/expenses', t, { propertyId: p2.id, categoryId: cat('Vệ sinh'), type: 'EXPENSE', amount: 400000, entryDate: `${period(k)}-15`, description: 'Thuê vệ sinh hành lang' });
  }
  const m1 = await call('POST', '/maintenance-requests', t, { roomId: rooms[0].id, title: 'Vòi nước nhà tắm bị rò', priority: 'HIGH', requestDate: today, reportedBy: 'Nguyễn Văn An', estimatedCost: 200000 });
  await call('PUT', `/maintenance-requests/${m1.id}`, t, { roomId: rooms[0].id, title: 'Vòi nước nhà tắm bị rò', priority: 'HIGH', requestDate: today, status: 'COMPLETED', actualCost: 180000, createExpense: true, reportedBy: 'Nguyễn Văn An' });
  await call('POST', '/maintenance-requests', t, { roomId: rooms[6].id, title: 'Máy lạnh kêu to', priority: 'MEDIUM', requestDate: today, status: 'IN_PROGRESS', estimatedCost: 350000 });
  await call('POST', '/maintenance-requests', t, { roomId: rooms[5].id, title: 'Sơn lại tường phòng 203', priority: 'LOW', requestDate: today });
  console.log(`✅ Đã tạo tài khoản demo ${email} với dữ liệu mẫu (mật khẩu xem trong backend/.env: SEED_DEMO_PASSWORD)`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
