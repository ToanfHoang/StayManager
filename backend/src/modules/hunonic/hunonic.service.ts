import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/http';
import { addMonths, currentPeriod, periodRange, today } from '../../lib/dates';
import { decrypt, encrypt } from '../../lib/secret-box';
import { HunonicClient, HunonicError, type HunonicMeter } from '../../lib/hunonic';
import { audit } from '../../lib/audit';
import { managersOfOwner, notifyUsers, vnPeriod } from '../notifications/notifications.service';

export const hunonicClient = () => new HunonicClient(env.HUNONIC_API_URL);

/** Đăng nhập thử rồi lưu tài khoản (mật khẩu + token mã hóa) */
export async function connectAccount(landlordId: number, phone: string, password: string) {
  let token: string;
  let meters: HunonicMeter[];
  try {
    token = await hunonicClient().login(phone, password);
    meters = await hunonicClient().listMeters(token);
  } catch (e) {
    if (e instanceof HunonicError) throw badRequest(e.message);
    throw e;
  }
  const data = { phone, passwordEnc: encrypt(password), tokenEnc: encrypt(token), lastSyncAt: new Date(), lastError: null };
  await prisma.hunonicAccount.upsert({ where: { landlordId }, create: { landlordId, ...data }, update: data });
  return meters;
}

/** Giải mã dữ liệu đã lưu; thất bại khi dữ liệu được khôi phục từ máy khác (khóa mã hóa khác) */
function openSecret(box: string) {
  try {
    return decrypt(box);
  } catch {
    throw new HunonicError('Không đọc được mật khẩu Hunonic đã lưu (có thể do dữ liệu được khôi phục từ máy khác). Vui lòng ngắt kết nối và kết nối lại tài khoản Hunonic.', false);
  }
}

/** Lấy danh sách công tơ; token hết hạn ⇒ tự đăng nhập lại 1 lần */
export async function fetchMeters(landlordId: number): Promise<HunonicMeter[]> {
  const acc = await prisma.hunonicAccount.findUnique({ where: { landlordId } });
  if (!acc) throw badRequest('Chưa kết nối tài khoản Hunonic (Cài đặt → Công tơ Hunonic)');
  const client = hunonicClient();
  try {
    let token = '';
    try {
      token = acc.tokenEnc ? decrypt(acc.tokenEnc) : '';
    } catch {
      token = ''; // token cũ không giải mã được ⇒ đăng nhập lại
    }
    let meters: HunonicMeter[];
    try {
      if (!token) throw new HunonicError('no token', true);
      meters = await client.listMeters(token);
    } catch (e) {
      if (!(e instanceof HunonicError) || !e.auth) throw e;
      token = await client.login(acc.phone, openSecret(acc.passwordEnc));
      meters = await client.listMeters(token);
      await prisma.hunonicAccount.update({ where: { id: acc.id }, data: { tokenEnc: encrypt(token) } });
    }
    await prisma.hunonicAccount.update({ where: { id: acc.id }, data: { lastSyncAt: new Date(), lastError: null } });
    return meters;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.hunonicAccount.update({ where: { id: acc.id }, data: { lastError: msg.slice(0, 1000) } });
    if (e instanceof HunonicError) throw badRequest(msg);
    throw e;
  }
}

/** Số kWh của kỳ: công tơ chỉ lưu "tháng này" và "tháng trước" (theo lịch) */
export function kwhForPeriod(m: HunonicMeter, period: string): { kwh: number; note: string } | { error: string } {
  const cur = currentPeriod();
  if (period === addMonths(cur, -1)) return m.kwhPrevMonth === null ? { error: 'Công tơ chưa có số tháng trước' } : { kwh: m.kwhPrevMonth, note: 'Tháng trước (đã chốt)' };
  if (period === cur) return m.kwhThisMonth === null ? { error: 'Công tơ chưa có số tháng này' } : { kwh: m.kwhThisMonth, note: 'Tháng này (chưa hết tháng – số còn tăng)' };
  return { error: 'Công tơ Hunonic chỉ lưu số của tháng này và tháng trước' };
}

/** Gợi ý chỉ số mới cho các phòng đã gán công tơ: chỉ số mới = chỉ số cũ + kWh của kỳ */
export async function readingSuggestions(landlordId: number, period: string, propertyId?: number) {
  const meters = await fetchMeters(landlordId);
  const byId = new Map(meters.map((m) => [m.deviceId, m]));
  const rooms = await prisma.room.findMany({
    where: { meterDeviceId: { not: null }, property: { ownerId: landlordId, ...(propertyId ? { id: propertyId } : {}) } },
    include: { meterReadings: { where: { period: { lte: period } }, orderBy: { period: 'desc' }, take: 2 } },
    orderBy: { roomNumber: 'asc' },
  });
  return rooms.map((r) => {
    const m = byId.get(r.meterDeviceId!);
    const current = r.meterReadings.find((x) => x.period === period);
    const prev = r.meterReadings.find((x) => x.period < period);
    const electricityPrev = current ? Number(current.electricityPrev) : prev ? Number(prev.electricityCurr) : 0;
    const base = { roomId: r.id, roomNumber: r.roomNumber, deviceId: r.meterDeviceId, meterName: m?.name ?? r.meterName, electricityPrev };
    if (!m) return { ...base, error: 'Không tìm thấy công tơ trong tài khoản Hunonic' };
    const k = kwhForPeriod(m, period);
    if ('error' in k) return { ...base, error: k.error };
    return { ...base, kwh: k.kwh, note: k.note, electricityCurr: Math.round((electricityPrev + k.kwh) * 100) / 100 };
  });
}

/**
 * Tự lấy số điện THÁNG TRƯỚC (ngày 1–5 hằng tháng) cho các phòng đã gán công tơ thuộc khu trọ chia nước đầu người
 * (khu tính nước theo đồng hồ vẫn cần nhập số nước nên không tự lưu). Bỏ qua phòng đã có chỉ số.
 */
export async function autoImportMeterReadings(opts: { force?: boolean } = {}) {
  const day = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric' }).format(new Date()));
  if (day > 5 && !opts.force) return { meterImported: 0 };
  const period = addMonths(currentPeriod(), -1);
  const { end } = periodRange(period);
  let imported = 0;
  for (const acc of await prisma.hunonicAccount.findMany({ where: { autoImport: true } })) {
    try {
      const rooms = await prisma.room.findMany({
        where: {
          meterDeviceId: { not: null },
          property: { ownerId: acc.landlordId, waterMode: 'SPLIT_PER_PERSON' },
          contracts: { some: { status: 'ACTIVE', startDate: { lte: end } } },
          meterReadings: { none: { period } },
        },
        include: { property: true },
      });
      if (!rooms.length) continue;
      const meters = new Map((await fetchMeters(acc.landlordId)).map((m) => [m.deviceId, m]));
      const done: string[] = [];
      for (const r of rooms) {
        const m = meters.get(r.meterDeviceId!);
        if (!m || m.kwhPrevMonth === null) continue;
        const prev = await prisma.meterReading.findFirst({ where: { roomId: r.id, period: { lt: period } }, orderBy: { period: 'desc' } });
        const ePrev = prev ? Number(prev.electricityCurr) : 0;
        try {
          const reading = await prisma.meterReading.create({
            data: {
              roomId: r.id, period, electricityPrev: ePrev, electricityCurr: Math.round((ePrev + m.kwhPrevMonth) * 100) / 100,
              electricityPrice: r.property.electricityPrice, waterPrev: 0, waterCurr: 0, waterPrice: 0, readingDate: today(),
              note: `Tự động từ công tơ Hunonic "${m.name}"`,
            },
          });
          await audit(null, 'AUTO_IMPORT', 'meter_reading', reading.id, null, { kwh: m.kwhPrevMonth, deviceId: m.deviceId }, prisma, acc.landlordId);
          done.push(`P.${r.roomNumber} ${m.kwhPrevMonth} kWh`);
          imported++;
        } catch (e) {
          if ((e as { code?: string }).code !== 'P2002') throw e;
        }
      }
      if (done.length) {
        await notifyUsers(
          await managersOfOwner(acc.landlordId),
          {
            type: 'UNPAID_SUMMARY',
            title: `Đã tự lấy số điện tháng ${vnPeriod(period)} từ công tơ`,
            message: `${done.length} phòng: ${done.join(', ')}. Hãy kiểm tra ở mục Điện nước rồi lập hóa đơn.`,
            link: '/dien-nuoc',
            actionLabel: 'Kiểm tra số điện',
            entityType: 'meter_import',
          },
          { dedupeKey: (uid) => `METER_IMPORT:${acc.landlordId}:${period}:${uid}` },
        );
      }
    } catch (e) {
      console.error(`[hunonic] Tự lấy số điện thất bại cho chủ trọ ${acc.landlordId}:`, (e as Error).message);
    }
  }
  return { meterImported: imported };
}
