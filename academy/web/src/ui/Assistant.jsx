import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X, Maximize2, Loader2 } from 'lucide-react';
import { post } from '../api.js';
import { useStore } from '../store.jsx';
import { Link, useRouter } from '../router.jsx';
import { solveLocal, findLessons } from './mathLocal.js';
import { cls } from '../lib.js';

export const MODES = [
  { id: 'step', label: 'حل تشریحی' }, { id: 'socratic', label: 'راهنمای سقراطی' }, { id: 'quiz', label: 'تولید تمرین' },
  { id: 'check', label: 'بررسی پاسخ من' }, { id: 'multi', label: 'راه‌حل‌های مختلف' },
];

// نمایش امن متن: هیچ HTML خامی رندر نمی‌شود؛ فقط ⟦فرمول⟧ با فونت ریاضی
function RichText({ text }) {
  return String(text).split('\n').map((line, i) => (
    <p key={i} className="mb-1.5 last:mb-0">
      {line.split(/(⟦[^⟧]*⟧)/g).map((part, j) => part.startsWith('⟦') ? <span key={j} className="math mx-0.5 rounded bg-white/[0.07] px-1.5 py-0.5 text-accent">{part.slice(1, -1)}</span> : <React.Fragment key={j}>{part}</React.Fragment>)}
    </p>
  ));
}

export function AssistantChat({ compact }) {
  const { site } = useStore();
  const [mode, setMode] = useState('step');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [courses, setCourses] = useState(null);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);
  const ai = site?.ai;
  if (ai && ai.enabled === false) return <p className="p-6 text-center text-ink-mute">دستیار فعلاً غیرفعال است.</p>;

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const r = await post('/api/ai/chat', { messages: next.slice(-10), mode });
      if (r.text) setMsgs((m) => [...m, { role: 'assistant', content: r.text }]);
      else {
        let list = courses;
        if (!list) { list = await fetch('/api/courses').then((x) => x.json()).then((d) => d.courses).catch(() => []); setCourses(list); }
        const local = solveLocal(text, mode);
        const lessons = findLessons(text, list);
        const content = local || (mode === 'quiz'
          ? 'تولید تمرین هوشمند به سرور هوش مصنوعی نیاز دارد. فعلاً یک معادله بنویس (مثلاً ⟦3x − 7 = 2x + 5⟧) تا قدم‌به‌قدم حلش کنیم.'
          : 'این سؤال را با موتور محلی نتوانستم حل کنم. معادله یا عبارت را به شکل ریاضی بنویس (مثلاً ⟦2x + 5 = 17⟧ یا ⟦x² − 5x + 6 = 0⟧)، یا سؤال درسی‌ات را از پنل من برای استاد بفرست.');
        setMsgs((m) => [...m, { role: 'assistant', content, lessons, local: true }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', content: err.message, error: true }]);
    } finally { setBusy(false); }
  };

  return (
    <div className={cls('flex flex-col', compact ? 'h-[min(70dvh,560px)]' : 'h-[min(72dvh,680px)]')}>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-3">
        {MODES.map((m) => <button key={m.id} onClick={() => setMode(m.id)} className={cls('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition', mode === m.id ? 'border-brand bg-brand/20 text-ink' : 'border-white/10 text-ink-mute hover:text-ink')}>{m.label}</button>)}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-night-950/50 p-3 text-[15px] leading-7" aria-live="polite">
        <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-white/[0.07] p-3"><RichText text={ai?.welcome || 'سلام! سؤال ریاضی‌ات را بفرست.'} /></div>
        {msgs.map((m, i) => (
          <div key={i} className={cls('max-w-[90%] rounded-2xl p-3', m.role === 'user' ? 'mr-auto rounded-tl-sm bg-brand/25' : cls('rounded-tr-sm', m.error ? 'bg-rose-500/15' : 'bg-white/[0.07]'))}>
            <RichText text={m.content} />
            {m.lessons?.length > 0 && <div className="mt-2 grid gap-1 text-sm">{m.lessons.map((c) => <Link key={c.id} to={`/courses/${c.slug}`} className="text-accent underline-offset-4 hover:underline">← {c.title}</Link>)}</div>}
            {m.local && <span className="mt-1 block text-[11px] text-ink-mute">پاسخ موتور محاسباتی محلی</span>}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" />در حال فکر کردن…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="mt-3 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="مثلاً: 2x + 5 = 17" className="min-w-0 flex-1 rounded-full border border-white/12 bg-night-900/70 px-4 py-3 outline-none focus:border-accent/60" aria-label="پیام" />
        <button type="submit" disabled={busy || !input.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="ارسال"><Send className="h-5 w-5 -scale-x-100" /></button>
      </form>
    </div>
  );
}

export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const { site } = useStore();
  const { path } = useRouter();
  if (!site?.ai?.enabled || path.startsWith('/assistant') || path.startsWith('/admin') || path.startsWith('/learn')) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-24 left-4 z-40 hidden h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-glow transition hover:scale-105 lg:bottom-6 lg:left-6 lg:grid" aria-label="باز کردن دستیار ریاضی"><Sparkles className="h-6 w-6" /></button>
      {open && (
        <div className="glass-strong animate-rise fixed bottom-6 left-6 z-[60] w-[400px] rounded-3xl p-4" role="dialog" aria-label="دستیار ریاضی">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-accent" />{site.ai.name}</span>
            <span className="flex gap-1">
              <Link to="/assistant" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="صفحه کامل"><Maximize2 className="h-4 w-4" /></Link>
              <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="بستن"><X className="h-4 w-4" /></button>
            </span>
          </div>
          <AssistantChat compact />
        </div>
      )}
    </>
  );
}
