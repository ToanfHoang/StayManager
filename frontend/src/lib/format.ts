export const TZ = 'Asia/Ho_Chi_Minh';

const moneyFmt = new Intl.NumberFormat('vi-VN');

/** 1500000 → "1.500.000 ₫" */
export const formatMoney = (n: number | null | undefined) => `${moneyFmt.format(Math.round(Number(n ?? 0)))} ₫`;

export const formatNumber = (n: number | null | undefined, digits = 2) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(n ?? 0));

/** Rút gọn cho biểu đồ: 12.500.000 → "12,5 tr" */
export function compactMoney(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${formatNumber(n / 1e9, 1)} tỷ`;
  if (abs >= 1e6) return `${formatNumber(n / 1e6, 1)} tr`;
  if (abs >= 1e3) return `${formatNumber(n / 1e3, 0)}k`;
  return formatNumber(n, 0);
}

/** Ngày nghiệp vụ (DATE, lưu UTC 00:00) → DD/MM/YYYY */
export function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

/** Thời điểm (timestamp) → DD/MM/YYYY HH:mm theo giờ Việt Nam */
export function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

/** 2026-11 → 11/2026 */
export const formatPeriod = (p: string | null | undefined) => (p ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : '—');

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const currentPeriod = () => todayStr().slice(0, 7);

export function addMonths(period: string, k: number) {
  let [y, m] = period.split('-').map(Number);
  m += k;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function addDaysStr(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addYearsStr(date: string, years: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export const daysUntil = (date: string) =>
  Math.round((new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${todayStr()}T00:00:00Z`).getTime()) / 86400000);

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export const dateInput = (d: string | null | undefined) => (d ? d.slice(0, 10) : '');
