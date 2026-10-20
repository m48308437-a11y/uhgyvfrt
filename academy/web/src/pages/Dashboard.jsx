import React, { useState } from 'react';
import { PlayCircle, Receipt, MessageSquare, UserRound, BookOpen, Send } from 'lucide-react';
import { useStore, useFetch } from '../store.jsx';
import { useRouter, Link } from '../router.jsx';
import { post, patch } from '../api.js';
import { PageShell, PageTitle, Card, Button, Spinner, ErrorBox, Empty, Badge, Field, Input, Textarea, Select, Alert } from '../ui/kit.jsx';
import { CourseCover } from '../ui/CourseCard.jsx';
import { toFa, toman, faDate, faDateTime, cls } from '../lib.js';

const ORDER_STATUS = { paid: ['پرداخت موفق', 'green'], pending: ['در انتظار پرداخت', 'amber'], failed: ['ناموفق', 'red'], cancelled: ['لغوشده', 'default'], refunded: ['بازگشت وجه', 'violet'] };
export const OrderBadge = ({ status }) => <Badge tone={ORDER_STATUS[status]?.[1]}>{ORDER_STATUS[status]?.[0] || status}</Badge>;

export default function Dashboard({ tab = 'courses' }) {
  const { user } = useStore();
  const { navigate } = useRouter();
  const tabs = [['courses', 'دوره‌های من', BookOpen], ['orders', 'سفارش‌ها', Receipt], ['tickets', 'پرسش علمی', MessageSquare], ['profile', 'حساب کاربری', UserRound]];
  return (
    <PageShell>
      <PageTitle eyebrow="پنل دانش‌آموز" title={`سلام ${user.name.split(' ')[0]}!`} />
      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto" role="tablist">
        {tabs.map(([k, l, Icon]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => navigate(k === 'courses' ? '/dashboard' : `/dashboard/${k}`, { keepScroll: true })} className={cls('tab inline-flex items-center gap-2 border border-white/10', tab === k && 'tab-active')}><Icon className="h-4 w-4" />{l}</button>)}
      </div>
      {tab === 'courses' && <MyCourses />}
      {tab === 'orders' && <MyOrders />}
      {tab === 'tickets' && <MyTickets />}
      {tab === 'profile' && <Profile />}
    </PageShell>
  );
}

function MyCourses() {
  const { data, loading, error, reload } = useFetch('/api/me/courses');
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.courses.length) return <Empty icon={BookOpen} title="هنوز دوره‌ای نخریده‌ای." action={<Button to="/courses">مشاهده دوره‌ها</Button>}>پس از تأیید پرداخت، دوره‌ها اینجا نمایش داده می‌شوند.</Empty>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {data.courses.map((c) => {
        const pct = c.lessonCount ? Math.round((c.completedLessons / c.lessonCount) * 100) : 0;
        return (
          <Card key={c.id} className="flex flex-col p-3">
            <CourseCover course={c} />
            <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
              <h3 className="font-extrabold leading-8">{c.title}</h3>
              <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-ink-mute"><span>پیشرفت</span><span>{toFa(c.completedLessons)} از {toFa(c.lessonCount)} درس · ٪{toFa(pct)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-l from-accent to-brand" style={{ width: `${pct}%` }} /></div></div>
              <Button className="mt-5" to={`/learn/${c.slug}${c.lastLessonId ? `/${c.lastLessonId}` : ''}`}><PlayCircle className="h-5 w-5" />{c.lastLessonId ? 'ادامه یادگیری' : 'شروع دوره'}</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MyOrders() {
  const { data, loading, error, reload } = useFetch('/api/orders');
  const { toast } = useStore();
  const [busy, setBusy] = useState(null);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.orders.length) return <Empty icon={Receipt} title="سفارشی ثبت نشده است." />;
  const pay = async (n) => { setBusy(n); try { const r = await post(`/api/orders/${n}/pay`); location.href = r.redirectUrl; } catch (e) { toast(e.message, 'error'); setBusy(null); } };
  const cancel = async (n) => { if (!confirm('این سفارش لغو شود؟')) return; try { await post(`/api/orders/${n}/cancel`); toast('سفارش لغو شد.'); reload(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className="space-y-3">
      {data.orders.map((o) => (
        <Card key={o.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><span className="ltr font-bold">{o.number}</span><span className="mr-3 text-sm text-ink-mute">{faDateTime(o.createdAt)}</span></div>
            <OrderBadge status={o.status} />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">{o.items.map((i) => <li key={i.courseId}>• {i.title}</li>)}</ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3 text-sm">
            <span>مبلغ: <b>{toman(o.finalAmount)}</b>{o.discountAmount > 0 && <span className="mr-2 text-emerald-300">(تخفیف {toman(o.discountAmount)})</span>}{o.payments.find((p) => p.refId) && <span className="mr-3 text-ink-mute">کد پیگیری: <span className="ltr">{o.payments.find((p) => p.refId).refId}</span></span>}</span>
            {['pending', 'failed'].includes(o.status) && <span className="flex gap-2"><Button size="sm" loading={busy === o.number} onClick={() => pay(o.number)}>پرداخت</Button><Button size="sm" variant="ghost" onClick={() => cancel(o.number)}>لغو</Button></span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MyTickets() {
  const t = useFetch('/api/me/tickets');
  const mine = useFetch('/api/me/courses');
  const { toast } = useStore();
  const [f, setF] = useState({ subject: '', message: '', courseId: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.subject.trim().length < 3 || f.message.trim().length < 5) return toast('موضوع و متن پرسش را کامل بنویس.', 'error');
    setBusy(true);
    try { await post('/api/me/tickets', { ...f, courseId: f.courseId || null }); toast('پرسش علمی‌ات ثبت شد؛ پاسخ استاد همین‌جا نمایش داده می‌شود.'); setF({ subject: '', message: '', courseId: '' }); t.reload(); }
    catch (e2) { toast(e2.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="p-5 lg:self-start">
        <h2 className="mb-4 font-extrabold">ارسال پرسش علمی</h2>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="دوره (اختیاری)"><Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">عمومی</option>{(mine.data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
          <Field label="موضوع"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={150} placeholder="مثلاً: فصل ۶ نهم، جلسه ۳" /></Field>
          <Field label="متن پرسش"><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={3000} /></Field>
          <Button type="submit" loading={busy}><Send className="h-4 w-4 -scale-x-100" />ارسال</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {t.loading ? <Spinner /> : t.error ? <ErrorBox error={t.error} onRetry={t.reload} /> : !t.data.tickets.length ? <Empty icon={MessageSquare} title="هنوز پرسشی ثبت نکرده‌ای." /> :
          t.data.tickets.map((x) => (
            <Card key={x.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{x.subject}</h3><Badge tone={x.status === 'answered' ? 'green' : x.status === 'closed' ? 'default' : 'amber'}>{x.status === 'answered' ? 'پاسخ داده شد' : x.status === 'closed' ? 'بسته‌شده' : 'در انتظار پاسخ'}</Badge></div>
              <p className="mt-1 text-xs text-ink-mute">{x.course_title || 'عمومی'} · {faDate(x.created_at)}</p>
              <p className="mt-3 whitespace-pre-line leading-8 text-ink-soft">{x.message}</p>
              {x.reply && <div className="mt-3 rounded-2xl border-r-2 border-accent bg-accent/10 p-4 text-sm leading-8"><b className="mb-1 block text-accent">پاسخ استاد:</b><span className="whitespace-pre-line">{x.reply}</span></div>}
            </Card>
          ))}
      </div>
    </div>
  );
}

function Profile() {
  const { user, setUser, toast } = useStore();
  const [f, setF] = useState({ name: user.name, email: user.email || '', grade: user.grade || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState('');
  const save = async (e) => { e.preventDefault(); setBusy('p'); try { const r = await patch('/api/me', { ...f, email: f.email || null }); setUser({ ...user, ...r.user }); toast('اطلاعات حساب ذخیره شد.'); } catch (e2) { toast(e2.message, 'error'); } finally { setBusy(''); } };
  const change = async (e) => { e.preventDefault(); setBusy('w'); try { await post('/api/me/password', pw); toast('رمز عبور تغییر کرد؛ سایر نشست‌ها خارج شدند.'); setPw({ current: '', next: '' }); } catch (e2) { toast(e2.message, 'error'); } finally { setBusy(''); } };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-extrabold">اطلاعات حساب</h2>
        <form onSubmit={save} className="grid gap-4">
          <Field label="نام و نام خانوادگی"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="شماره موبایل" hint="برای تغییر شماره با پشتیبانی تماس بگیر."><Input value={user.phone} disabled className="ltr text-left" /></Field>
          <Field label="ایمیل"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="ltr text-left" /></Field>
          <Field label="پایه تحصیلی"><Select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">—</option><option value="7">هفتم</option><option value="8">هشتم</option><option value="9">نهم</option><option value="other">سایر</option></Select></Field>
          <Button type="submit" loading={busy === 'p'}>ذخیره تغییرات</Button>
        </form>
      </Card>
      <Card className="p-5 sm:p-6 lg:self-start">
        <h2 className="mb-4 font-extrabold">تغییر رمز عبور</h2>
        <form onSubmit={change} className="grid gap-4">
          <Field label="رمز فعلی"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" className="ltr text-left" /></Field>
          <Field label="رمز جدید" hint="حداقل ۸ کاراکتر، ترکیبی از حرف و عدد"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" className="ltr text-left" /></Field>
          <Button type="submit" variant="secondary" loading={busy === 'w'}>تغییر رمز</Button>
        </form>
        <Alert tone="info" className="mt-5">عضو از {faDate(user.createdAt)}</Alert>
      </Card>
    </div>
  );
}
