// پخش‌کننده امن: لینک امضاشده زمان‌دار از سرور، ادامه از محل قبلی، ذخیره پیشرفت، واترمارک پویا
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Lock, LogIn, ShoppingBag, Film } from 'lucide-react';
import { get, post } from '../api.js';
import { Button, Spinner } from './kit.jsx';
import { MathVisual } from './MathVisual.jsx';
import { useRouter } from '../router.jsx';

export function LessonPlayer({ lesson, onProgress, onEnded, autoPlay = false }) {
  const [state, setState] = useState({ loading: true });
  const vref = useRef(null);
  const lastSave = useRef(0);
  const restoreAt = useRef(null);
  const { path } = useRouter();

  const load = useCallback(async (keepTime) => {
    try {
      const d = await get(`/api/lessons/${lesson.id}/play`);
      restoreAt.current = keepTime ?? d.position ?? 0;
      setState({ loading: false, ...d });
    } catch (e) {
      setState({ loading: false, error: e, status: e.status, reason: e.data?.reason });
    }
  }, [lesson.id]);
  useEffect(() => { setState({ loading: true }); load(); }, [load]);

  const save = useCallback((completed) => {
    const v = vref.current; if (!v || !state.watermark) return; // فقط کاربر واردشده
    const body = { lessonId: lesson.id, position: Math.floor(v.currentTime || 0) };
    if (completed) body.completed = true;
    post('/api/progress', body).then((r) => onProgress?.(lesson.id, { position: body.position, completed: r.completed })).catch(() => {});
  }, [lesson.id, state.watermark, onProgress]);

  // ذخیره در خروج از صفحه
  useEffect(() => () => { try { save(false); } catch {} }, [save]);

  if (state.loading) return <div className="grid aspect-video place-items-center rounded-3xl bg-night-950/80"><Spinner label="در حال آماده‌سازی جلسه…" /></div>;
  if (state.error) {
    const login = state.status === 401;
    return (
      <div className="grid aspect-video place-items-center rounded-3xl border border-white/10 bg-night-950/80 p-6 text-center">
        <div>
          <Lock className="mx-auto mb-3 h-9 w-9 text-accent" />
          <p className="font-bold">{state.error.message}</p>
          {state.status === 403 && state.reason === 'purchase' && <p className="mt-2 text-sm text-ink-mute">جلسات «رایگان» و «پیش‌نمایش» برای بررسی کیفیت تدریس باز هستند.</p>}
          <div className="mt-4 flex justify-center gap-2">
            {login ? <Button size="sm" to={`/login?next=${encodeURIComponent(path)}`}><LogIn className="h-4 w-4" />ورود</Button> : state.reason === 'purchase' ? null : <Button size="sm" variant="secondary" onClick={() => load()}>تلاش دوباره</Button>}
          </div>
        </div>
      </div>
    );
  }
  if (!state.video) {
    return (
      <div>
        <MathVisual topic={lesson.mathTopic} formula={lesson.formula} />
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-mute"><Film className="h-4 w-4" />ویدیوی این جلسه هنوز بارگذاری نشده است؛ شبیه‌ساز تعاملی مبحث نمایش داده می‌شود.</p>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-3xl bg-black" onContextMenu={(e) => e.preventDefault()}>
      <video
        ref={vref} key={state.video.url} src={state.video.url} controls playsInline preload="metadata" autoPlay={autoPlay}
        controlsList="nodownload noplaybackrate" disablePictureInPicture className="aspect-video w-full bg-black"
        onLoadedMetadata={(e) => { const t = restoreAt.current; if (t && t < e.currentTarget.duration - 5) e.currentTarget.currentTime = t; restoreAt.current = null; }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget; const now = Date.now();
          if (now - lastSave.current > 15000) { lastSave.current = now; save(v.duration && v.currentTime / v.duration > 0.92); }
        }}
        onPause={() => save(false)}
        onEnded={() => { save(true); onEnded?.(); }}
        onError={() => { const t = vref.current?.currentTime; if (!state.retried) { setState((s) => ({ ...s, retried: true })); load(t); } }}
      />
      {state.watermark && <span className="pointer-events-none absolute left-4 top-4 select-none rounded bg-black/30 px-2 py-0.5 text-[11px] text-white/45 ltr" aria-hidden="true">{state.watermark}</span>}
    </div>
  );
}

export function PurchaseCta({ course, onAdd }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm">
      <span>برای باز شدن قفل همه جلسات، دوره را تهیه کن.</span>
      <Button size="sm" onClick={() => onAdd(course)}><ShoppingBag className="h-4 w-4" />افزودن به سبد</Button>
    </div>
  );
}
