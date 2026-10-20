import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Compass, Lightbulb, Target, ClipboardCheck, ChevronDown, PlayCircle } from 'lucide-react';
import { useStore, useFetch } from '../store.jsx';
import { Link } from '../router.jsx';
import { Button, Skeleton, Badge } from '../ui/kit.jsx';
import { CourseCard } from '../ui/CourseCard.jsx';
import { HeroVisual, SlopeLab } from '../ui/MathVisual.jsx';
import { LessonPlayer } from '../ui/VideoPlayer.jsx';
import { AssistantChat } from '../ui/Assistant.jsx';
import { toFa, cls } from '../lib.js';

const Eyebrow = ({ children }) => <div className="mb-3 flex items-center gap-3 text-sm font-semibold text-accent"><span className="h-px w-8 bg-accent" />{children}</div>;
const Section = ({ id, children, className }) => <section id={id} className={cls('mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6 sm:py-20 lg:px-8', className)}>{children}</section>;
const GRADE_TAGS = { 'grade-7': 'عدد صحیح، معادله و نخستین استدلال‌ها', 'grade-8': 'فیثاغورس، اتحادها و هم‌نهشتی', 'grade-9': 'معادله خط، تشابه و آمادگی نهایی' };

export default function Home() {
  const { site } = useStore();
  const { data, loading } = useFetch('/api/courses');
  const courses = data?.courses || [];
  const b = site?.brand || {};
  const featured = courses.filter((c) => c.featured).slice(0, 6);
  const freeCourse = courses[0];
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-24 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-12 lg:px-8 lg:pb-16 lg:pt-32">
        <div className="reveal">
          <Badge tone="blue" className="mb-5">ریاضی دوره‌ی اول متوسطه · پایه‌های هفتم، هشتم و نهم</Badge>
          <h1 className="text-[2.1rem] font-black leading-[1.35] sm:text-5xl lg:text-[3.4rem]">ریاضی را <span className="bg-gradient-to-l from-accent to-violet bg-clip-text text-transparent">متفاوت</span> ببین.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-9 text-ink-soft">{b.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" to="/courses">مشاهده دوره‌ها<ArrowLeft className="h-5 w-5" /></Button>
            <Button size="lg" variant="secondary" onClick={() => document.getElementById('free-lesson')?.scrollIntoView({ behavior: 'smooth' })}><PlayCircle className="h-5 w-5" />یک درس رایگان ببین</Button>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {[[site?.stats?.courses, 'دوره منتشرشده'], [site?.stats?.lessons, 'درس آموزشی'], [3, 'پایه‌ی تحصیلی']].map(([n, l]) => (
              <div key={l}><dt className="text-xs text-ink-mute">{l}</dt><dd className="text-2xl font-black">{n == null ? '—' : toFa(n)}</dd></div>
            ))}
          </dl>
        </div>
        <div className="reveal"><HeroVisual /></div>
      </section>

      {/* پایه‌ها */}
      <Section id="grades">
        <Eyebrow>دسته‌بندی پایه‌ها</Eyebrow>
        <h2 className="text-2xl font-black sm:text-3xl">پایه‌ی خودت را انتخاب کن.</h2>
        <p className="mt-3 max-w-2xl leading-8 text-ink-soft">هر پایه، فصل‌به‌فصل همراه تدریس ویدیویی، شبیه‌ساز هندسی و حل نمونه سؤال امتحانی.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {(site?.categories || []).map((c, i) => (
            <Link key={c.id} to={`/courses?category=${c.slug}`} className="glass group rounded-3xl p-6 transition hover:-translate-y-1 hover:border-accent/40">
              <span className="math block text-5xl text-accent/80">{['7', '8', '9'][i] || '∑'}</span>
              <h3 className="mt-4 text-xl font-extrabold">{c.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-mute">{GRADE_TAGS[c.slug] || ''}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent">{toFa(c.courseCount)} دوره<ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </Section>

      {/* دوره‌های منتخب */}
      <Section id="featured">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Eyebrow>دوره‌های منتخب</Eyebrow><h2 className="text-2xl font-black sm:text-3xl">دوره‌های پرمخاطب آکادمی.</h2></div>
          <Link to="/courses" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">دیدن همه‌ی دوره‌ها<ArrowLeft className="h-4 w-4" /></Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px]" />) : featured.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      </Section>

      {/* استاد */}
      <Section id="teacher">
        <div className="glass grid gap-8 rounded-[2rem] p-6 sm:p-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <Eyebrow>درباره‌ی استاد</Eyebrow>
            <h2 className="text-2xl font-black sm:text-3xl">{b.instructorName}</h2>
            <p className="mt-2 text-ink-mute">مدرس ریاضی دوره‌ی اول متوسطه</p>
            <blockquote className="mt-6 border-r-2 border-accent pr-4 leading-8 text-ink-soft">«{b.teacherWelcome}»</blockquote>
          </div>
          <div className="space-y-4 leading-8 text-ink-soft"><p>{b.teacherBio}</p><p>{b.teacherMethod}</p></div>
        </div>
      </Section>

      {/* روش */}
      <Section id="method">
        <Eyebrow>مزیت‌ها و روش یادگیری</Eyebrow>
        <h2 className="text-2xl font-black sm:text-3xl">چهار گام؛ از شهود تا تسلط.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[[Compass, 'شهود', 'هر مبحث با یک تصویر یا پرسش آغاز می‌شود؛ پیش از هر فرمولی.'], [Lightbulb, 'مفهوم', 'چرایی قاعده را می‌سازیم تا فرمول، نتیجه‌ی فهم باشد نه حفظ.'], [Target, 'تمرین هدفمند', 'تمرین‌ها و کاردرکلاس‌های کتاب، تیپ‌بندی‌شده و گام‌به‌گام.'], [ClipboardCheck, 'سنجش', 'نمونه‌سؤال امتحانی و پرسش علمی مستقیم از استاد در پنل.']].map(([Icon, t, d], i) => (
            <div key={t} className="glass rounded-3xl p-6"><Icon className="h-7 w-7 text-accent" /><span className="mt-4 block text-xs text-ink-mute">گام {toFa(i + 1)}</span><h3 className="mt-1 text-lg font-extrabold">{t}</h3><p className="mt-2 text-sm leading-7 text-ink-mute">{d}</p></div>
          ))}
        </div>
        <div className="glass mt-6 grid items-center gap-6 rounded-3xl p-6 sm:p-8 lg:grid-cols-2">
          <div><span className="text-sm font-semibold text-accent">گام اول، در عمل</span><h3 className="mt-2 text-xl font-black">شیب خط را حس کن، نه حفظ.</h3><p className="mt-3 leading-8 text-ink-soft">لغزنده‌ها را حرکت بده تا ببینی با تغییر شیب و عرض از مبدأ، خط چطور می‌چرخد و جابه‌جا می‌شود؛ همان تصویری که در کلاس ساخته می‌شود.</p></div>
          <div className="mx-auto w-full max-w-sm"><SlopeLab /></div>
        </div>
      </Section>

      {/* دستیار */}
      {site?.ai?.enabled && (
        <Section id="assistant">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <Eyebrow>دستیار هوشمند</Eyebrow>
              <h2 className="text-2xl font-black sm:text-3xl">سؤال نصفه‌شب هم بی‌جواب نمی‌ماند.</h2>
              <p className="mt-3 leading-8 text-ink-soft">معادله‌ات را بنویس تا قدم‌به‌قدم یا به روش سقراطی حل شود، پاسخت را برای بررسی خطا بفرست، یا از هر مبحث تمرین بگیر.</p>
              <Button variant="secondary" className="mt-6" to="/assistant"><Sparkles className="h-4 w-4" />صفحه‌ی کامل دستیار</Button>
            </div>
            <div className="glass rounded-3xl p-4"><AssistantChat compact /></div>
          </div>
        </Section>
      )}

      {/* درس رایگان */}
      <Section id="free-lesson">
        <Eyebrow>درس رایگان</Eyebrow>
        <h2 className="text-2xl font-black sm:text-3xl">پیش از ثبت‌نام، یک جلسه ببین.</h2>
        {freeCourse ? <FreeLesson slug={freeCourse.slug} /> : <Skeleton className="mt-6 aspect-video" />}
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <Eyebrow>پرسش‌های پرتکرار</Eyebrow>
        <h2 className="text-2xl font-black sm:text-3xl">پیش از شروع، بدان.</h2>
        <div className="mt-8 grid gap-3">{(site?.faq || []).map((f, i) => <Faq key={i} {...f} />)}</div>
      </Section>

      <Section>
        <div className="rounded-[2rem] bg-gradient-to-l from-brand/30 via-violet/20 to-transparent p-8 text-center sm:p-14">
          <h2 className="text-2xl font-black sm:text-3xl">سال تحصیلی‌ات را با نقشه شروع کن.</h2>
          <p className="mt-3 text-ink-soft">پایه‌ات را انتخاب کن، یک درس رایگان ببین و بعد تصمیم بگیر.</p>
          <Button size="lg" className="mt-7" to="/courses">شروع یادگیری<ArrowLeft className="h-5 w-5" /></Button>
        </div>
      </Section>
    </main>
  );
}

function FreeLesson({ slug }) {
  const { data } = useFetch(`/api/courses/${slug}`);
  const lesson = data?.course?.chapters?.flatMap((c) => c.lessons).find((l) => l.access === 'free');
  if (!data) return <Skeleton className="mt-6 aspect-video" />;
  if (!lesson) return null;
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <LessonPlayer lesson={lesson} />
      <div className="glass rounded-3xl p-6">
        <Badge tone="green">پیش‌نمایش رایگان</Badge>
        <h3 className="mt-3 text-lg font-extrabold leading-8">{lesson.title}</h3>
        <p className="mt-2 text-sm leading-7 text-ink-mute">{lesson.description}</p>
        {lesson.keyPoints?.length > 0 && <ul className="mt-4 space-y-2 text-sm text-ink-soft">{lesson.keyPoints.map((k) => <li key={k} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{k}</li>)}</ul>}
        <Button variant="secondary" className="mt-6" to={`/courses/${slug}`}>مشاهده دوره کامل</Button>
      </div>
    </div>
  );
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-2xl">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 p-5 text-right font-bold" aria-expanded={open}>{q}<ChevronDown className={cls('h-5 w-5 shrink-0 transition', open && 'rotate-180')} /></button>
      {open && <p className="animate-rise px-5 pb-5 leading-8 text-ink-soft">{a}</p>}
    </div>
  );
}
