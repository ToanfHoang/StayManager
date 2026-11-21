/** Mã hóa/giải mã chuỗi nhạy cảm bằng AES-256-GCM (iv ngẫu nhiên + tag xác thực). */
import crypto from 'crypto';
import { env } from '../config/env';

function key() {
  if (env.APP_ENCRYPTION_KEY) {
    const k = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
    if (k.length !== 32) throw new Error('APP_ENCRYPTION_KEY phải là 32 byte mã hóa base64');
    return k;
  }
  return crypto.createHash('sha256').update(`staymanager:${env.JWT_SECRET}`).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(box: string) {
  const [v, iv, tag, data] = box.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Dữ liệu mã hóa không hợp lệ');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
