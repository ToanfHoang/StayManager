/**
 * Client CHỈ ĐỌC cho API mobile (không chính thức) của app Hunonic – dùng để lấy số kWh của công tơ Wi-Fi Hunonic ENTEC.
 *
 * Dựa trên dự án mã nguồn mở vietnam-hunonic (MIT, https://github.com/home-assistant-plugins/vietnam-hunonic),
 * vốn dò ngược từ app chính thức. Hunonic KHÔNG công bố API này: có thể thay đổi bất cứ lúc nào.
 * Chỉ dùng cho mục đích cá nhân với thiết bị của chính chủ trọ. Client này không bao giờ gửi lệnh điều khiển.
 */
import crypto from 'crypto';

const SLOT5 = 'HUNONICBIGBUG94d3c445e72ae7805fca3489edac9608c893e66b';
const SLOT6 = 'accessKey98ccdcbbe7b5528bec0ca31bbe8d93b4e76590dd';
const ENV7 = 58;
const UA = 'okhttp/4.9.2';

/** Các loại thiết bị là công tơ điện (elmeter = công tơ phòng, atmwifi* = aptomat tổng có đo điện) */
export const METER_TYPES = ['elmeter', 'atmwifi', 'atmwifiv2'];

const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
/** Giống JS: `!value || Number(value) == 0` */
const isZero = (v: string) => v === '' || Number(v) === 0;

export function signAccumulator(params: Record<string, string>) {
  let acc = 0;
  for (const [k, raw] of Object.entries(params)) {
    if (k === 'signature') continue;
    const v = raw ?? '';
    if (isZero(v)) acc += (k ? k.charCodeAt(0) : 97) + ENV7;
    else {
      const b = b64(v);
      acc += b.charCodeAt(0) + b.charCodeAt(Math.floor(b.length / 2)) + b.charCodeAt(b.length - 1);
    }
  }
  return acc;
}

/** Chữ ký `hunonicEncodeSign` của app */
export const hunonicSign = (params: Record<string, string>) => md5(`sha256fakeaccessKey=${SLOT6}${md5(String(signAccumulator(params)))}${SLOT5}`);

export class HunonicError extends Error {
  constructor(message: string, public auth = false) {
    super(message);
  }
}

export interface HunonicMeter {
  deviceId: string; // root_id – định danh ổn định của thiết bị
  name: string;
  type: string;
  homeName: string;
  roomName: string;
  online: boolean;
  kwhThisMonth: number | null;
  kwhPrevMonth: number | null;
  powerW: number | null;
  extraKeys: string[];
}

async function call(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
    const text = await r.text();
    let body: { status?: unknown; data?: unknown; error_code?: unknown; message?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new HunonicError(`Máy chủ Hunonic trả về dữ liệu không đọc được (HTTP ${r.status})`);
    }
    return body;
  } catch (e) {
    if (e instanceof HunonicError) throw e;
    throw new HunonicError(`Không kết nối được máy chủ Hunonic: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export class HunonicClient {
  constructor(private baseUrl: string) {}

  /** Đăng nhập bằng SĐT + mật khẩu → token_id */
  async login(phone: string, password: string) {
    const fields: Record<string, string> = { password: md5(password), app_name: 'hunonic', lang: 'vi', is_pro_app: '0', phone, app_role: '1' };
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...fields, signature: hunonicSign(fields) })) form.append(k, v);
    const body = await call(`${this.baseUrl}user/login`, { method: 'POST', body: form });
    if (!body.status) throw new HunonicError(`Đăng nhập Hunonic thất bại: ${body.message ?? body.error_code ?? 'sai số điện thoại hoặc mật khẩu'}`, true);
    const token = String((body.data as { token_id?: unknown } | undefined)?.token_id ?? '');
    if (!token) throw new HunonicError('Đăng nhập Hunonic thành công nhưng không nhận được token', true);
    return token;
  }

  /** Danh sách công tơ điện của tất cả nhà (kể cả nhà được chia sẻ) */
  async listMeters(token: string): Promise<HunonicMeter[]> {
    const params: Record<string, string> = { token_id: token, home_id: '', app_role: '1' };
    const qs = new URLSearchParams({ ...params, signature: hunonicSign(params) }).toString();
    const body = await call(`${this.baseUrl}device/listDeviceByHome?${qs}`, { method: 'POST', body: '' });
    if (!body.status) throw new HunonicError(`Hunonic từ chối yêu cầu (${body.error_code ?? '?'}): ${body.message ?? 'phiên đăng nhập có thể đã hết hạn'}`, true);
    const homes = Array.isArray(body.data) ? body.data : [body.data];
    const byRoot = new Map<string, HunonicMeter>();
    for (const home of homes as { name?: string; rooms?: { name?: string; devices?: Record<string, unknown>[] }[] }[]) {
      for (const room of home?.rooms ?? []) {
        for (const dev of room.devices ?? []) {
          const type = String(dev.root_type ?? '');
          const rootId = String(dev.root_id ?? '');
          if (!rootId || !METER_TYPES.includes(type) || byRoot.has(rootId)) continue;
          let extra: Record<string, unknown> = {};
          const rawExtra = dev.root_extra;
          if (typeof rawExtra === 'string') {
            try {
              extra = JSON.parse(rawExtra);
            } catch {
              extra = {};
            }
          } else if (rawExtra && typeof rawExtra === 'object') extra = rawExtra as Record<string, unknown>;
          byRoot.set(rootId, {
            deviceId: rootId,
            name: String(dev.name ?? rootId),
            type,
            homeName: String(home?.name ?? ''),
            roomName: String(room.name ?? ''),
            online: Number(dev.state) === 1 || dev.state === true,
            kwhThisMonth: num(extra.power_of_month),
            kwhPrevMonth: num(extra.power_of_prev_month),
            powerW: num(extra.power_current),
            extraKeys: Object.keys(extra),
          });
        }
      }
    }
    return [...byRoot.values()];
  }
}
