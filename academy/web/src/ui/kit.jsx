import React, { useEffect, useRef } from 'react';
import { Loader2, X, AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cls, toman } from '../lib.js';
import { Link } from '../router.jsx';

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-glow',
  secondary: 'border border-white/15 bg-white/[0.07] text-ink hover:bg-white/[0.12]',
  ghost: 'text-ink-soft hover:bg-white/[0.07] hover:text-ink',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
  success: 'bg-emerald-500/90 text-white hover:bg-emerald-500',
};
const SIZES = { sm: 'h-9 px-3.5 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-7 text-base' };

export function Button({ variant = 'primary', size = 'md', loading, className, children, to, ...rest }) {
  const c = cls('inline-flex select-none items-center justify-center gap-2 rounded-full font-bold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', VARIANTS[variant], SIZES[size], className);
  if (to) return <Link to={to} className={c} {...rest}>{children}</Link>;
  return <button type="button" className={c} disabled={loading || rest.disabled} {...rest}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}

export const Card = ({ className, children, as: As = 'div', ...rest }) => <As className={cls('glass rounded-3xl', className)} {...rest}>{children}</As>;

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-300">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-mute">{hint}</span> : null}
    </label>
  );
}
const inputCls = 'w-full rounded-2xl border border-white/12 bg-night-900/60 px-4 py-3 text-[15px] text-ink placeholder:text-ink-mute outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-60';
export const Input = React.forwardRef(({ className, ...p }, ref) => <input ref={ref} className={cls(inputCls, className)} {...p} />);
export const Textarea = ({ className, ...p }) => <textarea className={cls(inputCls, 'min-h-[110px] leading-7', className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cls(inputCls, 'appearance-none bg-[length:0]', className)} {...p}>{children}</select>;
export const Toggle = ({ checked, onChange, label }) => (
  <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-ink-soft">
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cls('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand' : 'bg-white/15')}>
      <span className={cls('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'right-0.5' : 'right-[22px]')} />
    </button>{label}
  </label>
);

export const Badge = ({ tone = 'default', children, className }) => {
  const t = { default: 'bg-white/10 text-ink-soft', blue: 'bg-accent/15 text-accent', green: 'bg-emerald-400/15 text-emerald-300', amber: 'bg-amber-400/15 text-amber-200', red: 'bg-rose-400/15 text-rose-300', violet: 'bg-violet-400/15 text-violet-200' }[tone];
  return <span className={cls('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', t, className)}>{children}</span>;
};

export const Spinner = ({ label = 'در حال بارگذاری…', className }) => (
  <div className={cls('flex items-center justify-center gap-3 py-16 text-ink-mute', className)} role="status"><Loader2 className="h-5 w-5 animate-spin text-accent" />{label}</div>
);
export const Skeleton = ({ className }) => <div className={cls('animate-pulse rounded-2xl bg-white/[0.06]', className)} />;

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="mx-auto my-10 max-w-md rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6 text-center">
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-300" />
      <p className="text-rose-100">{error?.message || String(error)}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>تلاش دوباره</Button>}
    </div>
  );
}
export const Empty = ({ icon: Icon = Info, title, children, action }) => (
  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/12 px-6 py-14 text-center">
    <Icon className="mb-4 h-10 w-10 text-accent/70" />
    <h3 className="text-lg font-bold">{title}</h3>
    {children && <p className="mt-2 max-w-md text-sm leading-7 text-ink-mute">{children}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
export const Alert = ({ tone = 'info', children, className }) => {
  const m = { info: ['border-accent/25 bg-accent/10 text-sky-100', Info], warning: ['border-amber-300/25 bg-amber-400/10 text-amber-100', TriangleAlert], error: ['border-rose-400/25 bg-rose-500/10 text-rose-100', AlertCircle], success: ['border-emerald-400/25 bg-emerald-500/10 text-emerald-100', CheckCircle2] }[tone];
  const Icon = m[1];
  return <div className={cls('flex gap-3 rounded-2xl border p-4 text-sm leading-7', m[0], className)} role={tone === 'error' ? 'alert' : undefined}><Icon className="mt-1 h-4 w-4 shrink-0" /><div>{children}</div></div>;
};

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cls('glass-strong animate-rise max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-5 outline-none sm:rounded-3xl sm:p-7', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-mute hover:bg-white/10 hover:text-ink" aria-label="بستن"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Price({ course, size = 'md' }) {
  const lg = size === 'lg';
  if (!course.finalPrice) return <span className={cls('font-black text-emerald-300', lg ? 'text-2xl' : 'text-lg')}>رایگان</span>;
  const off = course.discountActive ? Math.round(((course.price - course.finalPrice) / course.price) * 100) : 0;
  return (
    <div className="flex flex-col items-start">
      {off > 0 && <div className="flex items-center gap-2 text-sm"><span className="text-ink-mute line-through decoration-ink-mute/60">{toman(course.price)}</span><Badge tone="red">٪{String(off).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} تخفیف</Badge></div>}
      <span className={cls('font-black text-ink', lg ? 'text-2xl sm:text-3xl' : 'text-lg')}>{toman(course.finalPrice)}</span>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cls('animate-rise pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl',
          t.type === 'error' ? 'border-rose-400/30 bg-rose-950/85 text-rose-100' : t.type === 'warning' ? 'border-amber-300/30 bg-amber-950/85 text-amber-100' : 'border-emerald-400/30 bg-emerald-950/85 text-emerald-100')}>
          {t.type === 'error' ? <AlertCircle className="h-4 w-4" /> : t.type === 'warning' ? <TriangleAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{t.message}
        </div>
      ))}
    </div>
  );
}

export function Monogram({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs><radialGradient id="mg" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#1B3A8A" /><stop offset="1" stopColor="#0A1638" /></radialGradient></defs>
      <circle cx="24" cy="24" r="23" fill="url(#mg)" stroke="#8FD0FF" strokeOpacity=".35" />
      {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2, r = i % 6 === 0 ? 17.5 : 19.5; return <line key={i} x1={24 + Math.cos(a) * r} y1={24 + Math.sin(a) * r} x2={24 + Math.cos(a) * 21.5} y2={24 + Math.sin(a) * 21.5} stroke={i % 6 === 0 ? '#DCE6FF' : '#8FD0FF'} strokeOpacity={i % 6 === 0 ? 0.95 : 0.45} strokeWidth=".9" />; })}
      <polygon points="24,10.5 35.7,30.75 12.3,30.75" fill="none" stroke="#C4E6FF" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="6.2" fill="none" stroke="#A99BFF" />
      <circle cx="24" cy="24" r="1.6" fill="#FFFFFF" />
    </svg>
  );
}

export const PageShell = ({ children, className }) => <main className={cls('relative mx-auto w-full max-w-7xl px-4 pb-28 pt-24 sm:px-6 lg:px-8 lg:pb-20 lg:pt-28', className)}>{children}</main>;
export const PageTitle = ({ eyebrow, title, children }) => (
  <header className="mb-8">
    {eyebrow && <div className="mb-3 flex items-center gap-3 text-sm font-semibold text-accent"><span className="h-px w-8 bg-accent" />{eyebrow}</div>}
    <h1 className="text-[1.75rem] font-black leading-tight sm:text-4xl">{title}</h1>
    {children && <p className="mt-3 max-w-2xl leading-8 text-ink-soft">{children}</p>}
  </header>
);
