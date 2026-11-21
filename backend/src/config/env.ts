import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('true').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4100),
  /** Bản desktop: chỉ nghe trên 127.0.0.1 */
  HOST: z.string().default('0.0.0.0'),
  /** Thư mục build của frontend – nếu có, backend phục vụ luôn giao diện (bản desktop) */
  FRONTEND_DIST: z.string().default(''),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('uploads'),
  /** Thư mục lưu file nhạy cảm (ảnh biên lai chuyển khoản) – KHÔNG phục vụ công khai */
  PRIVATE_UPLOAD_DIR: z.string().default('storage/private'),

  /* Scheduler thông báo tự động (giờ Asia/Ho_Chi_Minh) */
  SCHEDULER_ENABLED: bool,
  SCHEDULER_CRON: z.string().default('0 7-21 * * *'),

  /** Khóa AES-256 (base64, 32 byte) mã hóa dữ liệu nhạy cảm (mật khẩu Hunonic). Thiếu ⇒ suy ra từ JWT_SECRET */
  APP_ENCRYPTION_KEY: z.string().default(''),
  /** API (không chính thức) của app Hunonic – đọc số kWh công tơ Wi-Fi */
  HUNONIC_API_URL: z.string().url().default('https://api.hunonicpro.com/v3/'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Cấu hình môi trường không hợp lệ:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
