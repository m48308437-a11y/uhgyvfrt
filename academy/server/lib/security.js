import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** هش رمز عبور با scrypt + salt تصادفی. رمز به صورت متن ساده ذخیره نمی‌شود. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}
// هش ساختگی برای یکسان‌سازی زمان پاسخ وقتی کاربر وجود ندارد (جلوگیری از شمارش کاربران)
let dummyHash = null;
export async function fakeVerify(password) { dummyHash ||= await hashPassword('dummy-password-x'); await verifyPassword(password, dummyHash); return false; }

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (s) => crypto.createHmac('sha256', config.secret || 'dev-only-secret').update(s).digest('base64url');
export const uuid = () => crypto.randomUUID();
export const otpCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// محدودکننده نرخ درخواست در حافظه (برای چند نمونه سرور، Redis جایگزین شود)
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  if (buckets.size > 50000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
export const resetRateLimits = () => buckets.clear();
