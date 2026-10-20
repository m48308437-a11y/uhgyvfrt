// پنل مدیریت (نسخه اولیه رابط): داشبورد آمار واقعی. API کامل مدیریت در server/routes/admin.js پیاده و تست شده است.
import React from 'react';
import { useFetch } from '../store.jsx';
import { PageShell, PageTitle, Card, Spinner, ErrorBox, Alert } from '../ui/kit.jsx';
import { toman, num } from '../lib.js';
export default function Admin() {
  const { data, loading, error, reload } = useFetch('/api/admin/stats');
  if (loading) return <PageShell><Spinner /></PageShell>;
  if (error) return <PageShell><ErrorBox error={error} onRetry={reload} /></PageShell>;
  const s = data;
  return (
    <PageShell>
      <PageTitle eyebrow="پنل مدیریت" title="داشبورد" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['فروش خالص تأییدشده', toman(s.revenue.net)], ['سفارش‌های موفق', num(s.orders.paid)], ['دانش‌آموزان', num(s.students)], ['تیکت‌های باز', num(s.openTickets)]].map(([k, v]) => <Card key={k} className="p-5"><p className="text-sm text-ink-mute">{k}</p><p className="mt-2 text-2xl font-black">{v}</p></Card>)}
      </div>
      <Alert tone="warning" className="mt-6">صفحات رابط کاربری مدیریت دوره‌ها، آپلودر ویدیو، سفارش‌ها و کاربران در مرحله بعد تکمیل می‌شوند؛ API همه این بخش‌ها آماده و تست‌شده است (README بخش «وضعیت پروژه»).</Alert>
    </PageShell>
  );
}
