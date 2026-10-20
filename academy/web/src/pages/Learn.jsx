import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, Lock, List, X, ArrowRight } from 'lucide-react';
import { useFetch, useStore } from '../store.jsx';
import { useRouter, Link } from '../router.jsx';
import { post } from '../api.js';
import { Spinner, ErrorBox, Button, Badge, Alert } from '../ui/kit.jsx';
import { LessonPlayer, PurchaseCta } from '../ui/VideoPlayer.jsx';
import { toFa, duration, cls } from '../lib.js';

export default function Learn({ slug, lessonId }) {
  const { data, loading, error, reload } = useFetch(`/api/courses/${slug}`);
  const { navigate } = useRouter();
  const { addToCart, toast, user } = useStore();
  const [progress, setProgress] = useState({});
  const [side, setSide] = useState(false);
  useEffect(() => { if (data?.progress) setProgress(data.progress); }, [data]);
  const onProgress = useCallback((id, p) => setProgress((x) => ({ ...x, [id]: { ...x[id], ...p } })), []);
  if (loading) return <div className="pt-24"><Spinner /></div>;
  if (error) return <div className="px-4 pt-24"><ErrorBox error={error} onRetry={reload} /></div>;
  const course = data.course;
  const lessons = course.chapters.flatMap((c) => c.lessons);
  const current = lessons.find((l) => l.id === lessonId) || lessons.find((l) => !progress[l.id]?.completed) || lessons[0];
  const idx = lessons.indexOf(current);
  const canOpen = (l) => course.enrolled || user?.role === 'admin' || l.access === 'free' || (l.access === 'preview' && user);
  const go = (l) => { setSide(false); navigate(`/learn/${slug}/${l.id}`, { replace: true }); };
  const done = Object.values(progress).filter((p) => p.completed).length;
  const toggleComplete = async () => {
    const was = !!progress[current.id]?.completed;
    try { await post('/api/progress', { lessonId: current.id, position: progress[current.id]?.position || 0, completed: !was }); onProgress(current.id, { completed: !was }); toast(!was ? 'وضعیت مطالعه جلسه در کارنامه‌ات ثبت شد.' : 'علامت تکمیل برداشته شد.'); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (!current) return <div className="px-4 pt-24"><Alert>این دوره هنوز جلسه‌ای ندارد.</Alert></div>;
  const Sidebar = (
    <nav className="space-y-4" aria-label="فهرست جلسات">
      <div className="text-sm text-ink-mute">{toFa(done)} از {toFa(lessons.length)} جلسه تکمیل شده</div>
      {course.chapters.map((ch) => (
        <div key={ch.id}>
          <h3 className="mb-2 text-sm font-bold text-ink-soft">{ch.title}</h3>
          <ul className="space-y-1">
            {ch.lessons.map((l) => {
              const open = canOpen(l); const c = progress[l.id]?.completed;
              return (
                <li key={l.id}>
                  <button disabled={!open} onClick={() => go(l)} className={cls('flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm transition', l.id === current.id ? 'bg-brand/20 text-ink' : 'text-ink-soft hover:bg-white/[0.06]', !open && 'cursor-not-allowed opacity-60')}>
                    {!open ? <Lock className="mt-1 h-4 w-4 shrink-0" /> : c ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> : <Circle className="mt-1 h-4 w-4 shrink-0 text-ink-mute" />}
                    <span className="flex-1 leading-6">{l.title}</span>
                    {l.durationSeconds > 0 && <span className="shrink-0 text-xs text-ink-mute">{duration(l.durationSeconds)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 pt-20 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8 lg:pt-24">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link to={course.enrolled ? '/dashboard' : `/courses/${slug}`} className="inline-flex items-center gap-1 text-sm text-ink-mute hover:text-ink"><ArrowRight className="h-4 w-4" />{course.title}</Link>
          <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setSide(true)}><List className="h-4 w-4" />جلسات</Button>
        </div>
        {canOpen(current) ? <LessonPlayer key={current.id} lesson={current} onProgress={onProgress} onEnded={() => lessons[idx + 1] && canOpen(lessons[idx + 1]) && toast('جلسه تمام شد؛ جلسه بعدی آماده است.')} /> :
          <div className="grid aspect-video place-items-center rounded-3xl border border-white/10 bg-night-950/80 p-6 text-center"><div><Lock className="mx-auto mb-3 h-9 w-9 text-accent" /><p className="font-bold">این جلسه مخصوص دانش‌آموزان ثبت‌نام‌شده در دوره است.</p></div></div>}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex gap-2">{current.access === 'free' && <Badge tone="green">رایگان</Badge>}{current.access === 'preview' && <Badge tone="amber">پیش‌نمایش</Badge>}</div>
            <h1 className="text-xl font-black leading-9 sm:text-2xl">{current.title}</h1>
            <p className="mt-2 leading-8 text-ink-soft">{current.description}</p>
          </div>
          {user && canOpen(current) && <Button size="sm" variant={progress[current.id]?.completed ? 'success' : 'secondary'} onClick={toggleComplete}><CheckCircle2 className="h-4 w-4" />{progress[current.id]?.completed ? 'تکمیل شده' : 'ثبت تکمیل جلسه'}</Button>}
        </div>
        {current.keyPoints?.length > 0 && <div className="glass mt-5 rounded-2xl p-5"><h2 className="mb-3 font-bold">محورهای کلیدی این جلسه</h2><ul className="space-y-2 text-sm text-ink-soft">{current.keyPoints.map((k) => <li key={k} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{k}</li>)}</ul></div>}
        {!course.enrolled && user?.role !== 'admin' && <div className="mt-5"><PurchaseCta course={course} onAdd={(c) => { addToCart(c); navigate('/cart'); }} /></div>}
        <div className="mt-6 flex justify-between gap-3">
          <Button variant="ghost" disabled={idx <= 0 || !canOpen(lessons[idx - 1])} onClick={() => go(lessons[idx - 1])}><ChevronRight className="h-4 w-4" />جلسه قبلی</Button>
          <Button variant="secondary" disabled={idx >= lessons.length - 1 || !canOpen(lessons[idx + 1])} onClick={() => go(lessons[idx + 1])}>جلسه بعدی<ChevronLeft className="h-4 w-4" /></Button>
        </div>
      </div>
      <aside className="glass hidden max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-3xl p-5 lg:sticky lg:top-24 lg:block">{Sidebar}</aside>
      {side && (
        <div className="fixed inset-0 z-[70] bg-black/60 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setSide(false)}>
          <div className="glass-strong animate-rise absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl p-5">
            <div className="mb-3 flex justify-between"><b>جلسات دوره</b><button onClick={() => setSide(false)} aria-label="بستن"><X className="h-5 w-5" /></button></div>
            {Sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
