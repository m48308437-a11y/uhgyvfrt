import { q, one } from '../db/index.js';
import { readJson, bad, conflict, HttpError, forbidden } from '../lib/http.js';
import { hashPassword, verifyPassword, fakeVerify, rateLimit, otpCode, uuid } from '../lib/security.js';
import { normalizePhone, normalizeEmail, str, password as pwd, faToEn } from '../lib/validate.js';
import { createSession, destroySession, publicUser, requireUser, storeOtp, consumeOtp } from '../lib/auth.js';
import { sendOtp } from '../lib/sms.js';
import { audit, logError } from '../lib/log.js';

const limit = (key, max, ms) => {
  const r = rateLimit(key, max, ms);
  if (!r.ok) throw new HttpError(429, `تعداد درخواست‌ها زیاد است؛ ${r.retryAfter} ثانیه دیگر دوباره تلاش کنید.`);
};
const phoneOrThrow = (v) => { const p = normalizePhone(v); if (!p) throw bad('شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹).'); return p; };

async function issueOtp(phone, purpose, ip) {
  limit(`otp:phone:${phone}`, 1, 60_000);
  limit(`otp:phone-h:${phone}`, 6, 3600_000);
  limit(`otp:ip:${ip}`, 20, 3600_000);
  const code = otpCode();
  await storeOtp(phone, purpose, code);
  try { await sendOtp(phone, code); }
  catch (e) { await logError('sms', e.message, { phone: phone.slice(0, 4) + '***' }); throw new HttpError(502, 'ارسال پیامک با خطا مواجه شد؛ چند دقیقه دیگر تلاش کنید.'); }
}

export default function authRoutes(r) {
  r.post('/api/auth/register', async (ctx) => {
    const b = await readJson(ctx.req);
    limit(`register:${ctx.ip}`, 10, 3600_000);
    const name = str(b.name, { field: 'نام و نام خانوادگی', min: 2, max: 80, required: true });
    const phone = phoneOrThrow(b.phone);
    const email = normalizeEmail(b.email);
    if (email === undefined) throw bad('ایمیل معتبر نیست.');
    const password = pwd(b.password);
    const grade = ['7', '8', '9', 'other'].includes(String(b.grade)) ? String(b.grade) : null;
    const exists = await one('SELECT id, phone_verified_at FROM users WHERE phone = $1', [phone]);
    if (exists) throw conflict('این شماره موبایل قبلاً ثبت‌نام کرده است؛ وارد شوید یا رمز عبور را بازیابی کنید.');
    if (email && (await one('SELECT id FROM users WHERE email = $1', [email]))) throw conflict('این ایمیل قبلاً استفاده شده است.');
    const id = uuid(); const now = new Date().toISOString();
    try {
      await q(`INSERT INTO users (id, name, phone, email, password_hash, role, status, grade, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,'student','active',$6,$7,$7)`, [id, name, phone, email, await hashPassword(password), grade, now]);
    } catch (e) {
      if (/unique|UNIQUE/.test(e.message)) throw conflict('این شماره یا ایمیل قبلاً ثبت شده است.');
      throw e;
    }
    await audit(id, 'user.register', 'user', id, null, ctx.ip);
    await issueOtp(phone, 'verify', ctx.ip);
    return { ok: true, needsVerification: true, phone };
  });

  r.post('/api/auth/otp', async (ctx) => {
    const b = await readJson(ctx.req);
    const phone = phoneOrThrow(b.phone);
    const purpose = b.purpose === 'reset' ? 'reset' : 'verify';
    const user = await one('SELECT id, phone_verified_at, status FROM users WHERE phone = $1', [phone]);
    // پاسخ یکسان برای جلوگیری از شمارش شماره‌های ثبت‌شده
    if (!user || user.status !== 'active' || (purpose === 'verify' && user.phone_verified_at)) {
      limit(`otp:phone:${phone}`, 1, 60_000);
      return { ok: true, message: 'اگر حسابی با این شماره وجود داشته باشد، کد ارسال شد.' };
    }
    await issueOtp(phone, purpose, ctx.ip);
    return { ok: true, message: 'کد تأیید پیامک شد.' };
  });

  r.post('/api/auth/verify', async (ctx) => {
    const b = await readJson(ctx.req);
    const phone = phoneOrThrow(b.phone);
    limit(`verify:${ctx.ip}`, 30, 3600_000);
    const code = faToEn(b.code).trim();
    if (!/^\d{6}$/.test(code)) throw bad('کد تأیید ۶ رقمی است.');
    const res = await consumeOtp(phone, 'verify', code);
    if (!res.ok) throw bad(res.reason);
    const user = await one('SELECT * FROM users WHERE phone = $1', [phone]);
    if (!user) throw bad('حساب پیدا نشد.');
    await q('UPDATE users SET phone_verified_at = $1, updated_at = $1 WHERE id = $2', [new Date().toISOString(), user.id]);
    await createSession(ctx, user.id);
    await audit(user.id, 'user.verify_phone', 'user', user.id, null, ctx.ip);
    return { ok: true, user: publicUser({ ...user, phone_verified_at: 'now' }) };
  });

  r.post('/api/auth/login', async (ctx) => {
    const b = await readJson(ctx.req);
    const ident = String(b.identifier ?? b.phone ?? '').trim();
    const phone = normalizePhone(ident);
    const email = phone ? null : normalizeEmail(ident);
    if (!phone && !email) throw bad('شماره موبایل یا ایمیل را درست وارد کنید.');
    limit(`login:ip:${ctx.ip}`, 30, 15 * 60_000);
    limit(`login:id:${phone || email}`, 8, 15 * 60_000);
    const password = String(b.password ?? '');
    const user = await one(phone ? 'SELECT * FROM users WHERE phone = $1' : 'SELECT * FROM users WHERE email = $1', [phone || email]);
    if (!user) { await fakeVerify(password); throw new HttpError(401, 'شماره/ایمیل یا رمز عبور اشتباه است.'); }
    if (!(await verifyPassword(password, user.password_hash))) {
      await audit(user.id, 'user.login_failed', 'user', user.id, null, ctx.ip);
      throw new HttpError(401, 'شماره/ایمیل یا رمز عبور اشتباه است.');
    }
    if (user.status !== 'active') throw forbidden('حساب کاربری شما مسدود شده است؛ با پشتیبانی تماس بگیرید.');
    if (!user.phone_verified_at) throw new HttpError(403, 'شماره موبایل هنوز تأیید نشده است.', { needsVerification: true, phone: user.phone });
    await createSession(ctx, user.id);
    await audit(user.id, 'user.login', 'user', user.id, null, ctx.ip);
    return { ok: true, user: publicUser(user) };
  });

  r.post('/api/auth/logout', async (ctx) => { await destroySession(ctx); return { ok: true }; });

  r.post('/api/auth/reset', async (ctx) => {
    const b = await readJson(ctx.req);
    const phone = phoneOrThrow(b.phone);
    limit(`reset:${ctx.ip}`, 20, 3600_000);
    const code = faToEn(b.code).trim();
    const password = pwd(b.password);
    if (!/^\d{6}$/.test(code)) throw bad('کد تأیید ۶ رقمی است.');
    const res = await consumeOtp(phone, 'reset', code);
    if (!res.ok) throw bad(res.reason);
    const user = await one('SELECT * FROM users WHERE phone = $1', [phone]);
    if (!user || user.status !== 'active') throw bad('حساب فعالی با این شماره پیدا نشد.');
    const now = new Date().toISOString();
    await q('UPDATE users SET password_hash = $1, phone_verified_at = COALESCE(phone_verified_at, $2), updated_at = $2 WHERE id = $3', [await hashPassword(password), now, user.id]);
    await q('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await createSession(ctx, user.id);
    await audit(user.id, 'user.password_reset', 'user', user.id, null, ctx.ip);
    return { ok: true, user: publicUser({ ...user, phone_verified_at: user.phone_verified_at || now }) };
  });

  r.get('/api/auth/me', async (ctx) => ({ user: publicUser(ctx.user) }));

  r.patch('/api/me', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    const name = str(b.name, { field: 'نام', min: 2, max: 80, required: true });
    const email = normalizeEmail(b.email);
    if (email === undefined) throw bad('ایمیل معتبر نیست.');
    if (email && (await one('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, u.id]))) throw conflict('این ایمیل قبلاً استفاده شده است.');
    const grade = ['7', '8', '9', 'other'].includes(String(b.grade)) ? String(b.grade) : null;
    await q('UPDATE users SET name = $1, email = $2, grade = $3, updated_at = $4 WHERE id = $5', [name, email, grade, new Date().toISOString(), u.id]);
    return { ok: true, user: publicUser({ ...u, name, email, grade }) };
  });

  r.post('/api/me/password', async (ctx) => {
    const u = requireUser(ctx);
    const b = await readJson(ctx.req);
    limit(`chpw:${u.id}`, 10, 3600_000);
    const row = await one('SELECT password_hash FROM users WHERE id = $1', [u.id]);
    if (!(await verifyPassword(String(b.current ?? ''), row.password_hash))) throw bad('رمز عبور فعلی اشتباه است.');
    const next = pwd(b.next);
    await q('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [await hashPassword(next), new Date().toISOString(), u.id]);
    await q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    await createSession(ctx, u.id);
    await audit(u.id, 'user.password_change', 'user', u.id, null, ctx.ip);
    return { ok: true };
  });
}
