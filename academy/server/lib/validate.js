import { bad } from './http.js';

export const faToEn = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

export function normalizePhone(input) {
  let p = faToEn(input).replace(/[\s\-()]/g, '');
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  else if (p.startsWith('0098')) p = '0' + p.slice(4);
  else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  else if (p.startsWith('9') && p.length === 10) p = '0' + p;
  return /^09\d{9}$/.test(p) ? p : null;
}
export function normalizeEmail(input) {
  const e = String(input ?? '').trim().toLowerCase();
  if (!e) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : undefined;
}

/** متن ساده با حذف کاراکترهای کنترلی و محدودیت طول */
export function str(v, { field, min = 0, max = 500, required = false } = {}) {
  const s = String(v ?? '').replace(/[-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !s) throw bad(`${field} الزامی است.`);
  if (s && s.length < min) throw bad(`${field} باید حداقل ${min} کاراکتر باشد.`);
  if (s.length > max) throw bad(`${field} حداکثر ${max} کاراکتر است.`);
  return s;
}
export function intv(v, { field, min = 0, max = 2_000_000_000, required = false, nullable = false } = {}) {
  if (v === null || v === undefined || v === '') {
    if (required) throw bad(`${field} الزامی است.`);
    return nullable ? null : 0;
  }
  const n = Number(faToEn(v));
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} باید عدد صحیح بین ${min} و ${max} باشد.`);
  return n;
}
export function oneOf(v, list, field) {
  if (!list.includes(v)) throw bad(`مقدار ${field} نامعتبر است.`);
  return v;
}
export function strList(v, field, maxItems = 20, maxLen = 200) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw bad(`${field} باید فهرست باشد.`);
  return v.slice(0, maxItems).map((x) => str(x, { field, max: maxLen })).filter(Boolean);
}
export function isoDate(v, field) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`تاریخ ${field} نامعتبر است.`);
  return d.toISOString();
}
export function slug(v, field = 'نامک (slug)') {
  const s = String(v ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length > 80) throw bad(`${field} فقط شامل حروف انگلیسی کوچک، عدد و خط تیره باشد.`);
  return s;
}
export function password(v) {
  const p = String(v ?? '');
  if (p.length < 8) throw bad('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  if (p.length > 128) throw bad('رمز عبور بیش از حد طولانی است.');
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d|[۰-۹]/.test(p)) throw bad('رمز عبور باید ترکیبی از حرف و عدد باشد.');
  return p;
}
export const safeUrl = (v, field) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { const u = new URL(s); if (u.protocol === 'https:') return u.toString(); } catch {}
  throw bad(`${field} باید آدرس https یا مسیر داخلی باشد.`);
};
