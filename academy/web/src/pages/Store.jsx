import React, { useEffect, useMemo, useState } from 'react';
import { Search, Lock, PlayCircle, Eye, ShoppingBag, Check, Trash2, Ticket, CheckCircle2, XCircle, Clock3, BookOpen, User, Layers, ShieldCheck } from 'lucide-react';
import { useStore, useFetch } from '../store.jsx';
import { useRouter, Link } from '../router.jsx';
import { post } from '../api.js';
import { PageShell, PageTitle, Button, Card, Input, Select, Spinner, ErrorBox, Empty, Badge, Price, Alert, Skeleton } from '../ui/kit.jsx';
import { CourseCard, CourseCover } from '../ui/CourseCard.jsx';
import { LessonPlayer } from '../ui/VideoPlayer.jsx';
import { toFa, toman, duration, totalDuration, cls, faDateTime } from '../lib.js';

export function Catalog() {
  const { site } = useStore();
  const { query, navigate } = useRouter();
  const category = query.category || 'all';
  const sort = query.sort || 'default';
  const [term, setTerm] = useState(query.q || '');
  useEffect(() => { const t = setTimeout(() => { if ((query.q || '') !== term) setParam('q', term); }, 350); return () => clearTimeout(t); }, [term]);
  const setParam = (k, v) => { const p = new URLSearchParams({ ...query, [k]: v }); if (!v || v === 'all' || v === 'default') p.delete(k); navigate(`/courses${p.toString() ? '?' + p : ''}`, { replace: true, keepScroll: true }); };
  const qs = new URLSearchParams({ ...(category !== 'all' && { category }), ...(query.q && { q: query.q }), ...(sort !== 'default' && { sort }) }).toString();
  const { data, loading, error, reload } = useFetch(`/api/courses${qs ? '?' + qs : ''}`);
  const list = data?.courses || [];
  return (
    <PageShell>
      <PageTitle eyebrow="فروشگاه دوره‌ها" title="همه‌ی دوره‌ها و پکیج‌ها">{toFa(site?.stats?.courses ?? '')} دوره‌ی منتشرشده برای پایه‌های هفتم تا نهم.</PageTitle>
      <div className="mb-8 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <div className="relative"><Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" /><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="جست‌وجو در دوره‌ها" className="pr-12" aria-label="جست‌وجو در دوره‌ها" /></div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label="فیلتر پایه">
          {[{ slug: 'all', title: 'همه' }, ...(site?.categories || [])].map((c) => <button key={c.slug} role="tab" aria-selected={category === c.slug} onClick={() => setParam('category', c.slug)} className={cls('tab border border-white/10', category === c.slug && 'tab-active border-white/20')}>{c.title}</button>)}
        </div>
        <Select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="مرتب‌سازی" className="lg:w-48">
          <option value="default">پیشنهاد آکادمی</option><option value="price-asc">ارزان‌ترین</option><option value="price-desc">گران‌ترین</option>
        </Select>
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px]" />)}</div> :
        !list.length ? <Empty icon={Search} title="دوره‌ای با این مشخصات پیدا نشد." action={<Button variant="secondary" onClick={() => { setTerm(''); navigate('/courses', { replace: true }); }}>نمایش همه‌ی دوره‌ها</Button>}>عبارت دیگری را امتحان کن یا فیلتر پایه را بردار.</Empty> :
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.map((c) => <CourseCard key={c.id} course={c} />)}</div>}
    </PageShell>
  );
}

export function CourseDetail({ slug }) {
  const { data, loading, error, reload } = useFetch(`/api/courses/${slug}`);
  const { addToCart, cart, user } = useStore();
  const [preview, setPreview] = useState(null);
  const course = data?.course;
  useEffect(() => { if (course) document.title = `${course.title} | آکادمی ریاضی`; return () => { document.title = 'آکادمی ریاضی استاد علایی‌نسب'; }; }, [course]);
  if (loading) return <PageShell><Spinner /></PageShell>;
  if (error) return <PageShell><ErrorBox error={error} onRetry={error.status === 404 ? undefined : reload} /></PageShell>;
  const lessons = course.chapters.flatMap((c) => c.lessons);
  const freeLesson = preview || lessons.find((l) => l.access === 'free');
  const inCart = cart.includes(course.id);
  const canOpen = (l) => course.enrolled || l.access === 'free' || (l.access === 'preview' && user);
  return (
    <PageShell>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">{course.categoryTitle && <Badge tone="blue">{course.categoryTitle}</Badge>}{course.kind === 'package' && <Badge tone="violet">پکیج</Badge>}{course.badge && <Badge>{course.badge}</Badge>}</div>
          <h1 className="text-[1.7rem] font-black leading-[1.5] sm:text-4xl">{course.title}</h1>
          <p className="mt-4 text-[17px] leading-9 text-ink-soft">{course.shortDesc}</p>
          <div className="mt-6">{freeLesson ? <LessonPlayer key={freeLesson.id} lesson={freeLesson} /> : <CourseCover course={course} />}</div>
          {freeLesson && <p className="mt-3 text-sm text-ink-mute">در حال نمایش: {freeLesson.title}</p>}

          <section className="mt-10"><h2 className="mb-3 text-xl font-extrabold">درباره‌ی دوره</h2><p className="leading-9 text-ink-soft">{course.fullDesc}</p></section>
          {course.benefits?.length > 0 && <section className="mt-8"><h2 className="mb-3 text-xl font-extrabold">در این دوره یاد می‌گیری</h2><ul className="grid gap-2 sm:grid-cols-2">{course.benefits.map((x) => <li key={x} className="flex gap-2 rounded-2xl bg-white/[0.04] p-3 text-sm leading-7"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{x}</li>)}</ul></section>}
          {course.prerequisites?.length > 0 && <section className="mt-8"><h2 className="mb-3 text-xl font-extrabold">پیش‌نیازها</h2><ul className="space-y-2 text-ink-soft">{course.prerequisites.map((x) => <li key={x} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{x}</li>)}</ul></section>}

          <section className="mt-10">
            <h2 className="mb-1 text-xl font-extrabold">سرفصل‌ها</h2>
            <p className="mb-4 text-sm text-ink-mute">{toFa(course.chapterCount)} فصل · {toFa(course.lessonCount)} جلسه{course.totalSeconds ? ` · ${totalDuration(course.totalSeconds)}` : ''}</p>
            <div className="space-y-3">
              {course.chapters.map((ch) => (
                <details key={ch.id} open className="glass group rounded-2xl">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold"><span>{ch.title}</span><span className="text-xs font-normal text-ink-mute">{toFa(ch.lessons.length)} جلسه</span></summary>
                  <ul className="border-t border-white/5 px-2 pb-2">
                    {ch.lessons.map((l) => {
                      const open = canOpen(l);
                      return (
                        <li key={l.id}>
                          <button disabled={!open} onClick={() => { setPreview(l); scrollTo({ top: 0, behavior: 'smooth' }); }} className={cls('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm transition', open ? 'hover:bg-white/[0.06]' : 'cursor-not-allowed opacity-70')}>
                            {open ? <PlayCircle className="h-5 w-5 shrink-0 text-accent" /> : <Lock className="h-4 w-4 shrink-0 text-ink-mute" />}
                            <span className="flex-1 leading-7">{l.title}</span>
                            {l.access === 'free' && <Badge tone="green">رایگان</Badge>}
                            {l.access === 'preview' && <Badge tone="amber"><Eye className="h-3 w-3" />پیش‌نمایش</Badge>}
                            {l.durationSeconds > 0 && <span className="shrink-0 text-xs text-ink-mute">{duration(l.durationSeconds)}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Card className="p-5 sm:p-6">
            <Price course={course} size="lg" />
            {course.discountActive && course.discountExpiresAt && <p className="mt-1 text-xs text-amber-200">تخفیف تا {faDateTime(course.discountExpiresAt).split('،')[0]}</p>}
            <dl className="my-5 grid gap-3 text-sm">
              {[[User, 'مدرس', course.instructor], [Layers, 'فصل و درس', `${toFa(course.chapterCount)} فصل · ${toFa(course.lessonCount)} درس`], [Clock3, 'مدت ویدیوها', course.durationText || (course.totalSeconds ? totalDuration(course.totalSeconds) : '—')], [ShieldCheck, 'نوع دسترسی', 'دسترسی دائمی پس از تأیید پرداخت']].map(([Icon, k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3"><dt className="flex items-center gap-2 text-ink-mute"><Icon className="h-4 w-4" />{k}</dt><dd className="text-left font-semibold">{v}</dd></div>
              ))}
            </dl>
            {course.enrolled ? <Button className="w-full" variant="success" to={`/learn/${course.slug}`}><PlayCircle className="h-5 w-5" />ورود به کلاس</Button> :
              !course.purchasable ? <Alert tone="warning">فروش این دوره فعلاً متوقف است.</Alert> :
                <div className="grid gap-2">
                  <Button className="w-full" onClick={() => addToCart(course)} variant={inCart ? 'secondary' : 'primary'}>{inCart ? <><Check className="h-5 w-5" />در سبد خرید است</> : <><ShoppingBag className="h-5 w-5" />افزودن به سبد خرید</>}</Button>
                  {inCart && <Button variant="ghost" to="/cart">رفتن به سبد و پرداخت</Button>}
                </div>}
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

export function Cart() {
  const { cart, removeFromCart, user, toast } = useStore();
  const { navigate } = useRouter();
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!cart.length) { setQuote(null); setLoading(false); return; }
    setLoading(true); setError(null);
    post('/api/checkout/quote', { courseIds: cart, couponCode: applied }).then((d) => setQuote(d.quote)).catch((e) => setError(e)).finally(() => setLoading(false));
  }, [cart, applied, user]);
  useEffect(() => { // دوره‌های خریداری‌شده یا ناموجود را از سبد حذف کن
    quote?.warnings?.forEach((w) => { removeFromCart(w.courseId); toast(w.message, 'warning'); });
  }, [quote?.warnings]);
  const pay = async () => {
    if (!user) return navigate('/login?next=/cart');
    if (!user.verified) return navigate(`/verify?phone=${user.phone}&next=/cart`);
    setBusy(true); setError(null);
    try {
      const r = await post('/api/checkout', { courseIds: cart, couponCode: applied });
      location.href = r.redirectUrl; // انتقال به درگاه رسمی (یا صفحه نتیجه برای سفارش رایگان)
    } catch (e) { setError(e); setBusy(false); }
  };
  if (!cart.length) return <PageShell><PageTitle title="سبد خرید" /><Empty icon={ShoppingBag} title="سبد خریدت خالی است." action={<Button to="/courses">مشاهده دوره‌ها</Button>}>از میان دوره‌ها، دوره‌ی پایه‌ات را انتخاب کن.</Empty></PageShell>;
  return (
    <PageShell>
      <PageTitle title="سبد خرید" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {loading && !quote ? <Skeleton className="h-32" /> : quote?.items.map((it) => (
            <Card key={it.courseId} className="flex items-center gap-4 p-4">
              <BookOpen className="h-8 w-8 shrink-0 text-accent" />
              <div className="min-w-0 flex-1"><Link to={`/courses/${it.slug}`} className="font-bold leading-7 hover:text-accent">{it.title}</Link><div className="mt-1 text-sm">{it.unitPrice < it.listPrice && <span className="ml-2 text-ink-mute line-through">{toman(it.listPrice)}</span>}<span className="font-bold">{toman(it.unitPrice)}</span></div></div>
              <button onClick={() => removeFromCart(it.courseId)} className="rounded-full p-2 text-ink-mute hover:bg-rose-500/15 hover:text-rose-300" aria-label={`حذف ${it.title}`}><Trash2 className="h-5 w-5" /></button>
            </Card>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); setApplied(coupon.trim()); }} className="flex gap-2 pt-2">
            <div className="relative flex-1"><Ticket className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" /><Input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="کد تخفیف" className="pr-12 ltr text-left" aria-label="کد تخفیف" /></div>
            <Button type="submit" variant="secondary">اعمال کد</Button>
          </form>
          {quote?.couponError && <Alert tone="error">{quote.couponError}</Alert>}
          {quote?.coupon && <Alert tone="success">کد {quote.coupon.code} اعمال شد.</Alert>}
        </div>
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Card className="p-6">
            <h2 className="mb-4 font-extrabold">صورت‌حساب</h2>
            {quote && (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-ink-mute">جمع شهریه‌ها</dt><dd>{toman(quote.subtotal)}</dd></div>
                {quote.courseDiscount > 0 && <div className="flex justify-between text-emerald-300"><dt>تخفیف دوره‌ها</dt><dd>−{toman(quote.courseDiscount)}</dd></div>}
                {quote.couponDiscount > 0 && <div className="flex justify-between text-emerald-300"><dt>کد {quote.coupon?.code}</dt><dd>−{toman(quote.couponDiscount)}</dd></div>}
                <div className="flex justify-between border-t border-white/10 pt-3 text-base font-black"><dt>مبلغ قابل پرداخت</dt><dd>{toman(quote.finalAmount)}</dd></div>
              </dl>
            )}
            {error && <Alert tone="error" className="mt-4">{error.message}{error.data?.orderNumber && <> <Link to="/dashboard/orders" className="underline">سفارش‌های من</Link></>}</Alert>}
            <Button className="mt-5 w-full" size="lg" loading={busy} disabled={!quote?.items.length || loading} onClick={pay}>{!user ? 'ورود و پرداخت' : 'پرداخت از درگاه زرین‌پال'}</Button>
            <p className="mt-3 text-center text-xs leading-6 text-ink-mute">مبلغ نهایی در سرور محاسبه و پس از بازگشت، مستقیماً با API رسمی درگاه تأیید می‌شود.</p>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

export function PaymentResult() {
  const { query } = useRouter();
  const { clearCart } = useStore();
  const { data, loading, error, reload } = useFetch(query.order ? `/api/orders/${encodeURIComponent(query.order)}` : null);
  const order = data?.order;
  useEffect(() => { if (order?.status === 'paid') clearCart(); }, [order?.status]);
  if (!query.order) return <PageShell><ErrorBox error={{ message: 'تراکنش شناسایی نشد. اگر مبلغی کسر شده، تا ۷۲ ساعت به حساب شما برمی‌گردد یا با پشتیبانی تماس بگیرید.' }} /></PageShell>;
  if (loading) return <PageShell><Spinner label="در حال بررسی وضعیت پرداخت…" /></PageShell>;
  if (error) return <PageShell><ErrorBox error={error} onRetry={reload} /></PageShell>;
  const paid = order.status === 'paid';
  const pending = order.status === 'pending';
  const Icon = paid ? CheckCircle2 : pending ? Clock3 : XCircle;
  return (
    <PageShell className="max-w-2xl">
      <Card className="p-6 text-center sm:p-10">
        <Icon className={cls('mx-auto h-14 w-14', paid ? 'text-emerald-300' : pending ? 'text-amber-200' : 'text-rose-300')} />
        <h1 className="mt-4 text-2xl font-black">{paid ? 'پرداخت تأیید شد؛ کلاس باز است.' : pending ? 'پرداخت در حال بررسی است.' : 'پرداخت انجام نشد.'}</h1>
        <p className="mt-3 leading-8 text-ink-soft">{paid ? 'دسترسی دوره‌ها به حسابت اضافه شد.' : pending ? 'پاسخ تأیید از درگاه هنوز نهایی نشده است. چند دقیقه بعد صفحه را تازه کن؛ در صورت کسر وجه، سفارش پس از تأیید خودکار فعال می‌شود.' : 'تأییدیه‌ای از درگاه دریافت نشد، پس دسترسی فعال نشد. اگر مبلغی کسر شده باشد، طبق قوانین بانکی حداکثر ظرف ۷۲ ساعت برگشت داده می‌شود.'}</p>
        <dl className="mx-auto mt-6 grid max-w-sm gap-2 rounded-2xl bg-white/[0.04] p-4 text-sm">
          <div className="flex justify-between"><dt className="text-ink-mute">شماره سفارش</dt><dd className="ltr">{order.number}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-mute">مبلغ</dt><dd>{toman(order.finalAmount)}</dd></div>
          {order.payments.at(-1)?.refId && <div className="flex justify-between"><dt className="text-ink-mute">کد پیگیری</dt><dd className="ltr">{order.payments.at(-1).refId}</dd></div>}
        </dl>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {paid ? <Button to={`/learn/${order.items[0]?.slug}`}><PlayCircle className="h-5 w-5" />شروع یادگیری</Button> : pending ? <Button onClick={reload}>بررسی دوباره</Button> : <Button to="/cart">بازگشت به سبد خرید</Button>}
          <Button variant="secondary" to="/dashboard/orders">سفارش‌های من</Button>
        </div>
      </Card>
    </PageShell>
  );
}
