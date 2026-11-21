export const TZ = 'Asia/Ho_Chi_Minh';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Ngày hôm nay theo giờ Việt Nam: YYYY-MM-DD */
export const todayStr = () => ymd.format(new Date());

/** Chuyển 'YYYY-MM-DD' thành Date (UTC 00:00) – dùng cho cột DATE */
export const toDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

export const today = () => toDate(todayStr());

export const dateStr = (d: Date) => d.toISOString().slice(0, 10);

export const currentPeriod = () => todayStr().slice(0, 7);

export function addDays(d: Date, n: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function addMonths(period: string, k: number) {
  let [y, m] = period.split('-').map(Number);
  m += k;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ngày đầu và cuối của kỳ YYYY-MM */
export function periodRange(period: string) {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m - 1, daysInMonth(y, m))) };
}

/** Ngày `day` của tháng `period`, tự giới hạn theo số ngày của tháng */
export function dayOfPeriod(period: string, day: number) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, Math.min(Math.max(1, day), daysInMonth(y, m))));
}

/** Danh sách kỳ từ `from` tới `to` (bao gồm) */
export function periodsBetween(from: string, to: string) {
  const out: string[] = [];
  let p = from;
  while (p <= to && out.length < 240) { out.push(p); p = addMonths(p, 1); }
  return out;
}

export const periodOf = (d: Date) => dateStr(d).slice(0, 7);
