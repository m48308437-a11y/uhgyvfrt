import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Smartphone, KeyRound } from 'lucide-react';
import { post } from '../api.js';
import { useStore } from '../store.jsx';
import { useRouter, Link } from '../router.jsx';
import { PageShell, Card, Field, Input, Button, Alert, Select, Monogram } from '../ui/kit.jsx';
import { toEn, toFa } from '../lib.js';

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard');
const phoneOk = (p) => /^(\+98|0098|98|0)?9\d{9}$/.test(toEn(p).replace(/[\s-]/g, ''));

function AuthCard({ title, subtitle, children }) {
  return (
    <PageShell className="flex min-h-[100dvh] max-w-md items-center">
      <Card className="w-full p-6 sm:p-8">
        <div className="mb-6 text-center"><div className="mx-auto mb-4 w-fit"><Monogram size={52} /></div><h1 className="text-2xl font-black">{title}</h1>{subtitle && <p className="mt-2 text-sm leading-7 text-ink-mute">{subtitle}</p>}</div>
        {children}
      </Card>
    </PageShell>
  );
}
function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} className="pl-12 ltr text-left" {...props} />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-ink-mute" aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}>{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
    </div>
  );
}

export function Login() {
  const { setUser, toast, user } = useStore();
  const { query, navigate } = useRouter();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate(safeNext(query.next), { replace: true }); }, [user]);
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (!f.identifier.trim() || !f.password) return setErr('شماره موبایل/ایمیل و رمز عبور را وارد کنید.');
    setBusy(true);
    try {
      const r = await post('/api/auth/login', f);
      setUser(r.user); toast(`خوش آمدی ${r.user.name.split(' ')[0]}!`);
      navigate(safeNext(query.next), { replace: true });
    } catch (e2) {
      if (e2.data?.needsVerification) { await post('/api/auth/otp', { phone: e2.data.phone, purpose: 'verify' }).catch(() => {}); navigate(`/verify?phone=${e2.data.phone}&next=${encodeURIComponent(query.next || '')}`); return; }
      setErr(e2.message);
    } finally { setBusy(false); }
  };
  return (
    <AuthCard title="ورود به حساب" subtitle="با شماره موبایل یا ایمیل و رمز عبور وارد شو.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="شماره موبایل یا ایمیل"><Input value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" inputMode="email" placeholder="۰۹۱۲۳۴۵۶۷۸۹" className="ltr text-left" /></Field>
        <Field label="رمز عبور"><PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" size="lg" loading={busy}>ورود</Button>
        <div className="flex justify-between text-sm"><Link to="/forgot" className="text-accent">فراموشی رمز عبور</Link><Link to={`/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}`} className="text-accent">ثبت‌نام</Link></div>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const { query, navigate } = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', grade: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const validate = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'نام و نام خانوادگی را وارد کنید.';
    if (!phoneOk(f.phone)) e.phone = 'شماره موبایل معتبر نیست.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = 'ایمیل معتبر نیست.';
    if (f.password.length < 8 || !/\d|[۰-۹]/.test(f.password) || !/[A-Za-z\u0600-\u06FF]/.test(f.password)) e.password = 'حداقل ۸ کاراکتر، ترکیبی از حرف و عدد.';
    setErrs(e); return !Object.keys(e).length;
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const r = await post('/api/auth/register', { ...f, email: f.email || null });
      navigate(`/verify?phone=${r.phone}&next=${encodeURIComponent(query.next || '')}`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <AuthCard title="ساخت حساب کاربری" subtitle="پس از ثبت‌نام، کد تأیید به موبایلت پیامک می‌شود.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="نام و نام خانوادگی" error={errs.name}><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="شماره موبایل" error={errs.phone}><Input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="09123456789" className="ltr text-left" /></Field>
        <Field label="ایمیل (اختیاری)" error={errs.email}><Input value={f.email} onChange={set('email')} type="email" autoComplete="email" className="ltr text-left" /></Field>
        <Field label="پایه تحصیلی (اختیاری)"><Select value={f.grade} onChange={set('grade')}><option value="">انتخاب کنید</option><option value="7">هفتم</option><option value="8">هشتم</option><option value="9">نهم</option><option value="other">سایر</option></Select></Field>
        <Field label="رمز عبور" error={errs.password} hint="حداقل ۸ کاراکتر، ترکیبی از حرف و عدد"><PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" size="lg" loading={busy}>ثبت‌نام و دریافت کد</Button>
        <p className="text-center text-sm text-ink-mute">حساب داری؟ <Link to="/login" className="text-accent">وارد شو</Link></p>
      </form>
    </AuthCard>
  );
}

function useCountdown(sec) {
  const [t, setT] = useState(sec);
  useEffect(() => { if (t <= 0) return; const i = setTimeout(() => setT(t - 1), 1000); return () => clearTimeout(i); }, [t]);
  return [t, () => setT(sec)];
}

export function Verify() {
  const { query, navigate } = useRouter();
  const { setUser, toast } = useStore();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [t, restart] = useCountdown(60);
  const phone = query.phone || '';
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    const c = toEn(code).trim();
    if (!/^\d{6}$/.test(c)) return setErr('کد ۶ رقمی را وارد کنید.');
    setBusy(true);
    try { const r = await post('/api/auth/verify', { phone, code: c }); setUser(r.user); toast('شماره موبایل تأیید شد؛ خوش آمدی!'); navigate(safeNext(query.next), { replace: true }); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const resend = async () => { setErr(null); try { await post('/api/auth/otp', { phone, purpose: 'verify' }); restart(); toast('کد جدید ارسال شد.'); } catch (e2) { setErr(e2.message); } };
  return (
    <AuthCard title="تأیید شماره موبایل" subtitle={<>کد ۶ رقمی ارسال‌شده به <span className="ltr font-bold text-ink">{toFa(phone)}</span> را وارد کن.</>}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="کد تأیید"><Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="ltr text-center text-2xl tracking-[.5em]" autoFocus /></Field>
        {err && <Alert tone="error">{err}</Alert>}
        <Button type="submit" size="lg" loading={busy}><Smartphone className="h-5 w-5" />تأیید</Button>
        <button type="button" disabled={t > 0} onClick={resend} className="text-sm text-accent disabled:text-ink-mute">{t > 0 ? `ارسال مجدد کد تا ${toFa(t)} ثانیه دیگر` : 'ارسال مجدد کد'}</button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const { navigate } = useRouter();
  const { setUser, toast } = useStore();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [t, restart] = useCountdown(60);
  const send = async (e) => {
    e?.preventDefault(); setErr(null);
    if (!phoneOk(phone)) return setErr('شماره موبایل معتبر نیست.');
    setBusy(true);
    try { const r = await post('/api/auth/otp', { phone, purpose: 'reset' }); setMsg(r.message); setStep(2); restart(); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await post('/api/auth/reset', { phone, code: toEn(code), password: pw }); setUser(r.user); toast('رمز عبور تغییر کرد.'); navigate('/dashboard', { replace: true }); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthCard title="بازیابی رمز عبور" subtitle="کد بازیابی به شماره موبایل ثبت‌شده پیامک می‌شود.">
      {step === 1 ? (
        <form onSubmit={send} className="grid gap-4">
          <Field label="شماره موبایل"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="ltr text-left" placeholder="09123456789" /></Field>
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" size="lg" loading={busy}>ارسال کد بازیابی</Button>
        </form>
      ) : (
        <form onSubmit={reset} className="grid gap-4">
          {msg && <Alert tone="info">{msg}</Alert>}
          <Field label="کد تأیید"><Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="ltr text-center text-xl tracking-[.4em]" /></Field>
          <Field label="رمز عبور جدید" hint="حداقل ۸ کاراکتر، ترکیبی از حرف و عدد"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" size="lg" loading={busy}><KeyRound className="h-5 w-5" />تغییر رمز و ورود</Button>
          <button type="button" disabled={t > 0} onClick={send} className="text-sm text-accent disabled:text-ink-mute">{t > 0 ? `ارسال مجدد تا ${toFa(t)} ثانیه` : 'ارسال مجدد کد'}</button>
        </form>
      )}
    </AuthCard>
  );
}
