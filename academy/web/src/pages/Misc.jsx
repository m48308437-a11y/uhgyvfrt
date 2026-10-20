import React from 'react';
import { Phone, Mail, Clock3, MessageSquare, Send, FileText, Sparkles } from 'lucide-react';
import { useFetch, useStore } from '../store.jsx';
import { Link } from '../router.jsx';
import { PageShell, PageTitle, Card, Spinner, ErrorBox, Button, Badge, Empty } from '../ui/kit.jsx';
import { AssistantChat } from '../ui/Assistant.jsx';
import { faDate } from '../lib.js';

export function Articles() {
  const { data, loading, error, reload } = useFetch('/api/articles');
  return (
    <PageShell>
      <PageTitle eyebrow="مقالات آموزشی" title="نوشته‌هایی برای خوب فهمیدن" />
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.articles.length ? <Empty icon={FileText} title="هنوز مقاله‌ای منتشر نشده است." /> :
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {data.articles.map((a) => (
            <Card key={a.id} as="article" className="flex flex-col p-6">
              <div className="mb-3 flex flex-wrap gap-2">{a.category && <Badge tone="blue">{a.category}</Badge>}{a.grade && <Badge>{a.grade}</Badge>}</div>
              <h2 className="text-lg font-extrabold leading-8"><Link to={`/articles/${a.slug}`} className="hover:text-accent">{a.title}</Link></h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-ink-mute">{a.excerpt}</p>
              <p className="mt-4 text-xs text-ink-mute">{a.read_time} · {faDate(a.published_at)}</p>
            </Card>
          ))}
        </div>}
    </PageShell>
  );
}
export function Article({ slug }) {
  const { data, loading, error } = useFetch(`/api/articles/${slug}`);
  if (loading) return <PageShell><Spinner /></PageShell>;
  if (error) return <PageShell><ErrorBox error={error} /></PageShell>;
  const a = data.article;
  return (
    <PageShell className="max-w-3xl">
      <div className="mb-3 flex gap-2">{a.category && <Badge tone="blue">{a.category}</Badge>}{a.grade && <Badge>{a.grade}</Badge>}</div>
      <h1 className="text-[1.7rem] font-black leading-[1.6] sm:text-4xl">{a.title}</h1>
      <p className="mt-3 text-sm text-ink-mute">{a.read_time} · {faDate(a.published_at)}</p>
      <p className="mt-6 text-lg leading-9 text-ink">{a.excerpt}</p>
      <div className="prose-fa mt-6">{a.content.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
      <Button variant="secondary" className="mt-8" to="/articles">همه‌ی مقالات</Button>
    </PageShell>
  );
}
export function Support() {
  const { site, user } = useStore();
  const b = site?.brand || {};
  return (
    <PageShell>
      <PageTitle eyebrow="پشتیبانی" title="کنارت هستیم." />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {[[Phone, 'تلفن', b.supportPhone], [Clock3, 'ساعات پاسخگویی', b.supportHours], [Mail, 'ایمیل', b.supportEmail], [Send, 'تلگرام', b.telegramId]].filter((x) => x[2]).map(([Icon, t, v]) => (
          <Card key={t} className="p-6"><Icon className="h-6 w-6 text-accent" /><h2 className="mt-3 text-sm text-ink-mute">{t}</h2><p className="mt-1 font-bold leading-7">{v}</p></Card>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-6"><MessageSquare className="h-6 w-6 text-accent" /><h2 className="mt-3 text-lg font-extrabold">پرسش علمی از استاد</h2><p className="mt-2 leading-8 text-ink-soft">سؤال درسی‌ات را با ذکر فصل و جلسه از پنل دانش‌آموز بفرست؛ پاسخ در همان‌جا ثبت می‌شود.</p><Button className="mt-5" to={user ? '/dashboard/tickets' : '/login?next=/dashboard/tickets'}>رفتن به پنل دانش‌آموز</Button></Card>
        <Card className="p-6"><h2 className="text-lg font-extrabold">قوانین و بازپرداخت</h2><p className="mt-3 leading-8 text-ink-soft">{b.refundPolicy}</p></Card>
      </div>
    </PageShell>
  );
}
export function AssistantPage() {
  const { site } = useStore();
  return (
    <PageShell className="max-w-3xl">
      <PageTitle eyebrow={<span className="inline-flex items-center gap-1"><Sparkles className="h-4 w-4" />{site?.ai?.name || 'دستیار ریاضی'}</span>} title="بپرس، با هم حلش کنیم.">دستیار تخصصی ریاضی پایه‌های هفتم، هشتم و نهم: حل تشریحی، هدایت سقراطی، تولید تمرین و بررسی پاسخ تو.</PageTitle>
      <Card className="p-4 sm:p-5"><AssistantChat /></Card>
    </PageShell>
  );
}
export const NotFound = () => <PageShell><Empty title="این صفحه پیدا نشد." action={<Button to="/">بازگشت به خانه</Button>}>آدرس را بررسی کن یا از منو استفاده کن.</Empty></PageShell>;
