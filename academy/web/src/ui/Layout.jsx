import React, { useEffect, useState, useRef } from 'react';
import { BookOpen, House, Search, ShoppingBag, UserRound, Menu, X, Sparkles, LogOut, LayoutDashboard, ShieldCheck, ChevronDown, Phone, Mail, Send, Clock3 } from 'lucide-react';
import { Link, useRouter } from '../router.jsx';
import { useStore } from '../store.jsx';
import { Monogram, Input, Button } from './kit.jsx';
import { cls, toFa, toman } from '../lib.js';
import { get } from '../api.js';

function Wordmark({ brand }) {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label={brand?.academyName}>
      <Monogram size={38} />
      <span className="leading-tight">
        <span className="block text-[15px] font-black sm:text-base">{brand?.academyName || 'آکادمی ریاضی'}</span>
        <span className="hidden text-[11px] text-ink-mute sm:block">ریاضی دوره اول متوسطه</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ onSearch }) {
  const { site, user, cart, logout } = useStore();
  const { path, navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [acc, setAcc] = useState(false);
  const [grades, setGrades] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accRef = useRef(null);
  useEffect(() => { const on = () => setScrolled(scrollY > 10); addEventListener('scroll', on, { passive: true }); return () => removeEventListener('scroll', on); }, []);
  useEffect(() => { setOpen(false); setAcc(false); setGrades(false); }, [path]);
  useEffect(() => { const c = (e) => accRef.current && !accRef.current.contains(e.target) && setAcc(false); addEventListener('mousedown', c); return () => removeEventListener('mousedown', c); }, []);
  const nav = [
    ['/courses', 'دوره‌ها'], ['/assistant', 'دستیار'], ['/#teacher', 'درباره استاد'], ['/articles', 'مقالات'], ['/support', 'پشتیبانی'],
  ];
  const active = (to) => (to === '/courses' ? path.startsWith('/courses') : path === to);
  const go = (to) => { if (to.startsWith('/#')) { navigate('/', { keepScroll: true }); setTimeout(() => document.getElementById(to.slice(2))?.scrollIntoView({ behavior: 'smooth' }), 80); } else navigate(to); };
  return (
    <header className={cls('fixed inset-x-0 top-0 z-50 transition', scrolled || open ? 'border-b border-white/10 bg-night-900/85 backdrop-blur-xl' : 'bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Wordmark brand={site?.brand} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="ناوبری اصلی">
          {nav.slice(0, 1).map(([to, l]) => <button key={to} onClick={() => go(to)} className={cls('tab', active(to) && 'tab-active')}>{l}</button>)}
          <div className="relative">
            <button className="tab inline-flex items-center gap-1" onClick={() => setGrades((v) => !v)} aria-expanded={grades}>پایه‌ها<ChevronDown className="h-4 w-4" /></button>
            {grades && (
              <div className="glass-strong animate-rise absolute right-0 top-11 w-60 rounded-2xl p-2">
                {(site?.categories || []).map((c) => (
                  <Link key={c.id} to={`/courses?category=${c.slug}`} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-white/10">
                    <span>{c.title}</span><span className="text-xs text-ink-mute">{toFa(c.courseCount)} دوره</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {nav.slice(1).map(([to, l]) => <button key={to} onClick={() => go(to)} className={cls('tab', active(to) && 'tab-active')}>{l}</button>)}
        </nav>
        <div className="flex items-center gap-1.5">
          <button onClick={onSearch} className="hidden rounded-full p-2.5 text-ink-soft hover:bg-white/10 sm:inline-flex" aria-label="جست‌وجو"><Search className="h-5 w-5" /></button>
          <Link to="/cart" className="relative rounded-full p-2.5 text-ink-soft hover:bg-white/10" aria-label={`سبد خرید (${toFa(cart.length)})`}>
            <ShoppingBag className="h-5 w-5" />
            {cart.length > 0 && <span className="absolute -left-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold">{toFa(cart.length)}</span>}
          </Link>
          {user === undefined ? <span className="h-10 w-24" /> : user ? (
            <div className="relative hidden sm:block" ref={accRef}>
              <button onClick={() => setAcc((v) => !v)} className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] py-1.5 pl-3 pr-1.5 text-sm font-semibold hover:bg-white/10" aria-expanded={acc}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/30 text-xs">{user.name.slice(0, 1)}</span>{user.name.split(' ')[0]}<ChevronDown className="h-4 w-4" />
              </button>
              {acc && (
                <div className="glass-strong animate-rise absolute left-0 top-12 w-56 rounded-2xl p-2 text-sm">
                  <Link to="/dashboard" className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/10"><LayoutDashboard className="h-4 w-4" />پنل من</Link>
                  {user.role === 'admin' && <Link to="/admin" className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/10"><ShieldCheck className="h-4 w-4" />پنل مدیریت</Link>}
                  <button onClick={() => { logout(); navigate('/'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-rose-200 hover:bg-white/10"><LogOut className="h-4 w-4" />خروج</button>
                </div>
              )}
            </div>
          ) : (
            <Button size="sm" to={`/login?next=${encodeURIComponent(path)}`} className="hidden sm:inline-flex">ورود / ثبت‌نام</Button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="rounded-full p-2.5 text-ink-soft hover:bg-white/10 lg:hidden" aria-label="منو" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <div className="animate-rise border-t border-white/10 px-4 pb-5 pt-2 lg:hidden">
          <nav className="grid gap-1">
            {nav.map(([to, l]) => <button key={to} onClick={() => go(to)} className="rounded-xl px-3 py-3 text-right font-semibold hover:bg-white/10">{l}</button>)}
            <div className="my-2 flex flex-wrap gap-2">
              {(site?.categories || []).map((c) => <Link key={c.id} to={`/courses?category=${c.slug}`} className="rounded-full border border-white/12 px-3 py-1.5 text-sm">{c.title}</Link>)}
            </div>
            {user ? (
              <>
                <Link to="/dashboard" className="rounded-xl px-3 py-3 font-semibold hover:bg-white/10">پنل من</Link>
                {user.role === 'admin' && <Link to="/admin" className="rounded-xl px-3 py-3 font-semibold hover:bg-white/10">پنل مدیریت</Link>}
                <button onClick={() => { logout(); navigate('/'); }} className="rounded-xl px-3 py-3 text-right font-semibold text-rose-200 hover:bg-white/10">خروج از حساب</button>
              </>
            ) : <Button to="/login" className="mt-2">ورود / ثبت‌نام</Button>}
          </nav>
        </div>
      )}
    </header>
  );
}

export function MobileDock({ onSearch }) {
  const { path } = useRouter();
  const { user } = useStore();
  const items = [['/', 'خانه', House], ['/courses', 'دوره‌ها', BookOpen], [null, 'جست‌وجو', Search], ['/assistant', 'دستیار', Sparkles], [user ? '/dashboard' : '/login', 'حساب', UserRound]];
  if (path.startsWith('/learn') || path.startsWith('/admin')) return null;
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-900/90 backdrop-blur-xl lg:hidden" aria-label="ناوبری پایین">
      <div className="mx-auto grid max-w-md grid-cols-5 pt-1.5">
        {items.map(([to, label, Icon]) => {
          const on = to && (to === '/' ? path === '/' : path.startsWith(to));
          const inner = <><Icon className={cls('h-5 w-5', on && 'text-accent')} /><span className={cls('text-[11px]', on ? 'font-bold text-ink' : 'text-ink-mute')}>{label}</span></>;
          return to ? <Link key={label} to={to} className="flex flex-col items-center gap-1 py-1.5">{inner}</Link> : <button key={label} onClick={onSearch} className="flex flex-col items-center gap-1 py-1.5">{inner}</button>;
        })}
      </div>
    </nav>
  );
}

export function SearchSheet({ open, onClose }) {
  const [term, setTerm] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const { navigate } = useRouter();
  const ref = useRef(null);
  useEffect(() => { if (open) { setTimeout(() => ref.current?.focus(), 50); } else setTerm(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      get(`/api/courses${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`).then((d) => setList(d.courses)).catch(() => setList([])).finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [term, open]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); if (open) addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-strong animate-rise mx-auto mt-16 max-w-xl rounded-3xl p-4 sm:mt-24" role="dialog" aria-label="جست‌وجوی دوره‌ها">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-ink-mute" />
          <Input ref={ref} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="نام دوره یا مبحث؛ مثلاً فیثاغورس" className="border-0 bg-transparent focus:ring-0" />
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="بستن"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 max-h-[60dvh] overflow-y-auto">
          {loading && !list.length ? <p className="p-4 text-sm text-ink-mute">در حال جست‌وجو…</p> : !list.length ? <p className="p-4 text-sm text-ink-mute">نتیجه‌ای برای «{term}» پیدا نشد.</p> :
            list.map((c) => (
              <button key={c.id} onClick={() => { onClose(); navigate(`/courses/${c.slug}`); }} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-right hover:bg-white/[0.07]">
                <span><span className="block font-semibold">{c.title}</span><span className="text-xs text-ink-mute">{c.categoryTitle} · {toFa(c.lessonCount)} درس</span></span>
                <span className="shrink-0 text-sm text-accent">{toman(c.finalPrice)}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { site } = useStore();
  const b = site?.brand || {};
  return (
    <footer className="border-t border-white/10 bg-night-950/60 pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <Wordmark brand={b} />
          <p className="mt-4 max-w-sm text-sm leading-7 text-ink-mute">{b.slogan}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div className="grid content-start gap-2.5">
            <span className="font-bold">آکادمی</span>
            <Link to="/courses" className="text-ink-mute hover:text-ink">همه‌ی دوره‌ها</Link>
            {(site?.categories || []).map((c) => <Link key={c.id} to={`/courses?category=${c.slug}`} className="text-ink-mute hover:text-ink">{c.title}</Link>)}
          </div>
          <div className="grid content-start gap-2.5">
            <span className="font-bold">راهنما</span>
            <Link to="/articles" className="text-ink-mute hover:text-ink">مقالات آموزشی</Link>
            <Link to="/support" className="text-ink-mute hover:text-ink">پشتیبانی و قوانین</Link>
            <Link to="/assistant" className="text-ink-mute hover:text-ink">دستیار ریاضی</Link>
          </div>
        </div>
        <div className="grid content-start gap-3 text-sm text-ink-mute">
          <span className="font-bold text-ink">تماس</span>
          {b.supportPhone && <span className="flex items-center gap-2"><Phone className="h-4 w-4 text-accent" />{b.supportPhone}</span>}
          {b.supportHours && <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-accent" />{b.supportHours}</span>}
          {b.supportEmail && <a href={`mailto:${b.supportEmail}`} className="flex items-center gap-2 hover:text-ink"><Mail className="h-4 w-4 text-accent" /><span className="ltr">{b.supportEmail}</span></a>}
          {b.telegramId && <span className="flex items-center gap-2"><Send className="h-4 w-4 text-accent" /><span className="ltr">{b.telegramId}</span></span>}
        </div>
      </div>
      <div className="border-t border-white/5 py-5 text-center text-xs leading-6 text-ink-mute">تمامی حقوق مادی و معنوی برای {b.academyName} محفوظ است.<br />طراحی، معماری و توسعه: سید محمد جواد رضوی</div>
    </footer>
  );
}
