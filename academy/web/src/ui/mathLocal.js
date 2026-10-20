// موتور محاسباتی محلی سبک (جایگزین mathjs حجیم) برای وقتی سرور هوش مصنوعی تنظیم نشده است.
import { toEn } from '../lib.js';

const norm = (s) => toEn(s).replace(/[×✕]/g, '*').replace(/[÷]/g, '/').replace(/[−–—]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt').replace(/\s+/g, '');

// پارسر بازگشتی ایمن برای چندجمله‌ای‌های تک‌متغیره x — خروجی: ضرایب {درجه: ضریب}
function parsePoly(src) {
  let i = 0; const s = src;
  const peek = () => s[i];
  const add = (a, b, k = 1) => { const r = { ...a }; for (const d in b) r[d] = (r[d] || 0) + k * b[d]; return r; };
  const mul = (a, b) => { const r = {}; for (const x in a) for (const y in b) { const d = +x + +y; r[d] = (r[d] || 0) + a[x] * b[y]; } return r; };
  const pow = (a, n) => { if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error('توان پشتیبانی نمی‌شود'); let r = { 0: 1 }; for (let k = 0; k < n; k++) r = mul(r, a); return r; };
  const constOf = (p) => { const ks = Object.keys(p).filter((k) => Math.abs(p[k]) > 1e-12); if (ks.some((k) => k !== '0')) throw new Error('غیرثابت'); return p[0] || 0; };
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; v = add(v, term(), op === '+' ? 1 : -1); } return v; }
  function term() {
    let v = factor();
    for (;;) {
      if (peek() === '*') { i++; v = mul(v, factor()); }
      else if (peek() === '/') { i++; const d = constOf(factor()); if (d === 0) throw new Error('تقسیم بر صفر'); v = mul(v, { 0: 1 / d }); }
      else if (peek() && /[x(\d.s]/.test(peek())) v = mul(v, factor()); // ضرب ضمنی: 2x یا 3(x+1)
      else return v;
    }
  }
  function factor() { if (peek() === '-') { i++; return mul({ 0: -1 }, factor()); } if (peek() === '+') { i++; return factor(); } let b = base(); if (peek() === '^') { i++; b = pow(b, constOf(factor())); } return b; }
  function base() {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('پرانتز'); return v; }
    if (c === 'x') { i++; return { 1: 1 }; }
    if (s.startsWith('sqrt', i)) { i += 4; const v = constOf(base()); if (v < 0) throw new Error('رادیکال منفی'); return { 0: Math.sqrt(v) }; }
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (m) { i += m[0].length; return { 0: Number(m[0]) }; }
    throw new Error('عبارت نامعتبر');
  }
  const v = expr();
  if (i !== s.length) throw new Error('عبارت نامعتبر');
  return v;
}
const fmt = (n) => { const r = Math.round(n * 1000) / 1000; return String(Number.isInteger(r) ? r : r.toFixed(3).replace(/0+$/, '')); };
const polyStr = (p) => { const d = Math.max(0, ...Object.keys(p).filter((k) => Math.abs(p[k]) > 1e-12).map(Number)); const parts = []; for (let k = d; k >= 0; k--) { const c = p[k] || 0; if (Math.abs(c) < 1e-12) continue; const a = Math.abs(c); const coef = k && a === 1 ? '' : String(Math.round(a * 1000) / 1000); parts.push((c < 0 ? '- ' : parts.length ? '+ ' : '') + coef + (k ? (k === 1 ? 'x' : k === 2 ? 'x²' : `x^${k}`) : '')); } return parts.join(' ') || '0'; };

export function solveLocal(text, mode = 'step') {
  const raw = norm(text).replace(/[^0-9x+\-*/^().=sqrt]/g, '');
  if (!raw || !/[\d]/.test(raw)) return null;
  try {
    if (raw.includes('=')) {
      const [l, r] = raw.split('=');
      if (!l || !r) return null;
      const p = parsePoly(`(${l})-(${r})`);
      const a2 = p[2] || 0, a1 = p[1] || 0, a0 = p[0] || 0;
      if (Object.keys(p).some((k) => +k > 2 && Math.abs(p[k]) > 1e-12)) return 'این معادله از درجه بالاتر از ۲ است؛ برای حل آن دستیار آنلاین لازم است.';
      const std = `⟦${polyStr(p)} = 0⟧`;
      if (Math.abs(a2) < 1e-12) {
        if (Math.abs(a1) < 1e-12) return Math.abs(a0) < 1e-12 ? 'این تساوی همیشه برقرار است (بی‌شمار جواب).' : 'این معادله جواب ندارد (تناقض).';
        const x = -a0 / a1;
        if (mode === 'socratic') return `همه جمله‌ها را به یک طرف ببر تا به ${std} برسی.\nحالا ضریب x چند است؟ عدد ثابت را به طرف دیگر ببر و دو طرف را بر ضریب x تقسیم کن. جوابت را برای بررسی بفرست.`;
        if (mode === 'check') return `جواب درست ⟦x = ${fmt(x)}⟧ است. اگر جواب دیگری گرفته‌ای، علامت جمله‌ها هنگام انتقال به طرف دیگر تساوی را دوباره بررسی کن.`;
        return `۱) جمله‌ها را به یک طرف می‌بریم: ${std}\n۲) جمله ثابت را منتقل می‌کنیم: ⟦${a1 === 1 ? '' : a1 === -1 ? '-' : fmt(a1)}x = ${fmt(-a0)}⟧\n۳) دو طرف را بر ${fmt(a1)} تقسیم می‌کنیم: ⟦x = ${fmt(x)}⟧\n✔ امتحان: با جای‌گذاری ⟦x = ${fmt(x)}⟧ دو طرف تساوی برابر می‌شوند.`;
      }
      const D = a1 * a1 - 4 * a2 * a0;
      const head = `معادله درجه دوم: ${std}\nمبین: ⟦Δ = b² − 4ac = ${fmt(D)}⟧`;
      if (mode === 'socratic') return `${std}\nاول a، b و c را مشخص کن و Δ = b² − 4ac را حساب کن. علامت Δ درباره تعداد جواب‌ها چه می‌گوید؟`;
      if (D < 0) return `${head}\nچون Δ منفی است، معادله جواب حقیقی ندارد.`;
      const x1 = (-a1 + Math.sqrt(D)) / (2 * a2), x2 = (-a1 - Math.sqrt(D)) / (2 * a2);
      return D === 0 ? `${head}\nیک جواب مضاعف: ⟦x = ${fmt(x1)}⟧` : `${head}\nجواب‌ها: ⟦x₁ = ${fmt(x1)}⟧ و ⟦x₂ = ${fmt(x2)}⟧`;
    }
    const p = parsePoly(raw);
    if (Object.keys(p).some((k) => k !== '0' && Math.abs(p[k]) > 1e-12)) return `ساده‌شده عبارت: ⟦${polyStr(p)}⟧`;
    return `حاصل: ⟦${raw.replace(/\*/g, '×')} = ${fmt(p[0] || 0)}⟧`;
  } catch { return null; }
}

export function findLessons(text, courses) {
  const words = toEn(text).split(/[\s،,.?؟!]+/).filter((w) => w.length > 2);
  const out = [];
  for (const c of courses || []) {
    const hay = `${c.title} ${c.shortDesc}`;
    if (words.some((w) => hay.includes(w))) out.push(c);
  }
  return out.slice(0, 3);
}
