// ابزارهای عمومی: تبدیل اعداد، قیمت، تاریخ شمسی
export const toFa = (v) => (v == null ? '' : String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]));
export const toEn = (v) => String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const toman = (n) => (!n ? 'رایگان' : `${toFa(Number(n).toLocaleString('en-US')).replace(/,/g, '٬')} تومان`);
export const num = (n) => toFa(Number(n || 0).toLocaleString('en-US')).replace(/,/g, '٬');
const dtf = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });
const dtt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const faDate = (iso) => (iso ? dtf.format(new Date(iso)) : '—');
export const faDateTime = (iso) => (iso ? dtt.format(new Date(iso)) : '—');
export const duration = (sec) => {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return toFa(h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`);
};
export const totalDuration = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${toFa(h)} ساعت${m ? ` و ${toFa(m)} دقیقه` : ''}` : `${toFa(m)} دقیقه`;
};
export const bytes = (b) => (b >= 1073741824 ? `${toFa((b / 1073741824).toFixed(2))} گیگابایت` : `${toFa((b / 1048576).toFixed(1))} مگابایت`);
export const cls = (...a) => a.filter(Boolean).join(' ');

// تبدیل تاریخ شمسی ↔ میلادی (الگوریتم jalaali)
const div = (a, b) => ~~(a / b), mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) {
  let gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump, n, i;
  for (i = 1; i < BREAKS.length; i++) { jm = BREAKS[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
  n = jy - jp; leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
  return { leap, gy, march: 20 + leapJ - leapG };
}
const g2d = (gy, gm, gd) => { let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408; return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752; };
function d2g(jdn) {
  let j = 4 * jdn + 139361631; j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308, gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
  return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
}
const j2d = (jy, jm, jd) => { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; };
function d2j(jdn) {
  const gy = d2g(jdn).gy; let jy = gy - 621; const r = jalCal(jy); let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) { if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
export const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
export const toJalaali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
/** ISO → رشته شمسی 1405/08/30 به وقت تهران */
export function isoToJalali(iso) {
  if (!iso) return '';
  const t = new Date(new Date(iso).getTime() + 3.5 * 3600_000);
  const { jy, jm, jd } = toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}
/** رشته شمسی → ISO پایان همان روز به وقت تهران */
export function jalaliToIso(s) {
  const m = toEn(s).trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const [jy, jm, jd] = m.slice(1).map(Number);
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(gy, gm - 1, gd, 23, 59, 59) - 3.5 * 3600_000).toISOString();
}
