import { q, one } from '../db/index.js';
import { config } from '../config.js';
import { randomToken, sha256, uuid } from './security.js';
import { serializeCookie, unauthorized, forbidden, HttpError } from './http.js';

export const COOKIE = config.isProd ? '__Host-session' : 'session';

export async function createSession(ctx, userId) {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 86400_000);
  await q('INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)',
    [sha256(token), userId, now.toISOString(), expires.toISOString(), ctx.ip, String(ctx.req.headers['user-agent'] || '').slice(0, 200)]);
  ctx.setCookie(serializeCookie(COOKIE, token, { maxAge: config.sessionDays * 86400, secure: config.isProd }));
}

export async function destroySession(ctx) {
  const token = ctx.cookies[COOKIE];
  if (token) await q('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
  ctx.setCookie(serializeCookie(COOKIE, '', { maxAge: 0, secure: config.isProd }));
}

export async function loadUser(ctx) {
  const token = ctx.cookies[COOKIE];
  if (!token || token.length > 100) return null;
  const row = await one(
    `SELECT u.id, u.name, u.phone, u.email, u.role, u.status, u.grade, u.phone_verified_at, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`, [sha256(token)]);
  if (!row) return null;
  if (row.expires_at < new Date().toISOString() || row.status !== 'active') {
    await q('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
    return null;
  }
  return row;
}

export const publicUser = (u) => u && ({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, grade: u.grade, verified: !!u.phone_verified_at, createdAt: u.created_at });

export function requireUser(ctx) {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}
export function requireVerified(ctx) {
  const u = requireUser(ctx);
  if (!u.phone_verified_at) throw new HttpError(403, 'ابتدا شماره موبایل خود را تأیید کنید.', { needsVerification: true });
  return u;
}
export function requireAdmin(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin') throw forbidden();
  return u;
}

/** ثبت کد OTP (هش‌شده) */
export async function storeOtp(phone, purpose, code) {
  const now = new Date();
  await q('UPDATE otp_codes SET consumed_at = $1 WHERE phone = $2 AND purpose = $3 AND consumed_at IS NULL', [now.toISOString(), phone, purpose]);
  await q('INSERT INTO otp_codes (id, phone, purpose, code_hash, attempts, expires_at, created_at) VALUES ($1,$2,$3,$4,0,$5,$6)',
    [uuid(), phone, purpose, sha256(`${phone}:${purpose}:${code}:${config.secret}`), new Date(now.getTime() + 2 * 60_000).toISOString(), now.toISOString()]);
}

/** بررسی OTP با محدودیت ۵ تلاش؛ در صورت موفقیت مصرف می‌شود */
export async function consumeOtp(phone, purpose, code) {
  const row = await one(`SELECT * FROM otp_codes WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`, [phone, purpose]);
  if (!row || row.expires_at < new Date().toISOString()) return { ok: false, reason: 'کد منقضی شده است؛ دوباره درخواست کنید.' };
  if (row.attempts >= 5) return { ok: false, reason: 'تعداد تلاش‌ها بیش از حد مجاز بود؛ کد جدید بگیرید.' };
  await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
  if (sha256(`${phone}:${purpose}:${code}:${config.secret}`) !== row.code_hash) return { ok: false, reason: 'کد واردشده صحیح نیست.' };
  const r = await q('UPDATE otp_codes SET consumed_at = $1 WHERE id = $2 AND consumed_at IS NULL', [new Date().toISOString(), row.id]);
  return r.rowCount === 1 ? { ok: true } : { ok: false, reason: 'کد قبلاً استفاده شده است.' };
}
