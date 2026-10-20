import React from 'react';
import { BookOpen, Clock3, PlayCircle, ShoppingBag, Check } from 'lucide-react';
import { Link } from '../router.jsx';
import { useStore } from '../store.jsx';
import { Badge, Button, Price } from './kit.jsx';
import { toFa, totalDuration, cls } from '../lib.js';

const TINTS = ['from-sky-500/25 to-indigo-600/10', 'from-violet-500/25 to-blue-600/10', 'from-cyan-400/25 to-sky-700/10', 'from-indigo-500/25 to-fuchsia-600/10'];

export function CourseCover({ course, className }) {
  const tint = TINTS[(course.slug || '').length % TINTS.length];
  if (course.coverUrl) return <img src={course.coverUrl} alt={`کاور ${course.title}`} loading="lazy" decoding="async" className={cls('aspect-[16/9] w-full rounded-2xl object-cover', className)} />;
  return (
    <div className={cls('relative grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-2xl bg-gradient-to-br', tint, className)} role="img" aria-label={`کاور ${course.title}`}>
      <svg viewBox="0 0 160 90" className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={i * 20} y1="0" x2={i * 20} y2="90" stroke="#8FD0FF" strokeOpacity=".2" />)}
        {Array.from({ length: 5 }, (_, i) => <line key={'h' + i} x1="0" y1={i * 22} x2="160" y2={i * 22} stroke="#8FD0FF" strokeOpacity=".2" />)}
      </svg>
      <span className="math relative px-4 text-center text-sm text-ink sm:text-base">{course.formulaAccent || course.title}</span>
    </div>
  );
}

export function CourseCard({ course }) {
  const { addToCart, cart } = useStore();
  const inCart = cart.includes(course.id);
  return (
    <article className="glass group flex flex-col rounded-3xl p-3 transition hover:-translate-y-0.5 hover:border-white/20">
      <Link to={`/courses/${course.slug}`} className="block"><CourseCover course={course} /></Link>
      <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {course.categoryTitle && <Badge tone="blue">{course.categoryTitle}</Badge>}
          {course.kind === 'package' && <Badge tone="violet">پکیج</Badge>}
          {course.badge && <Badge>{course.badge}</Badge>}
        </div>
        <h3 className="text-[17px] font-extrabold leading-8"><Link to={`/courses/${course.slug}`} className="hover:text-accent">{course.title}</Link></h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-7 text-ink-mute">{course.shortDesc}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
          <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{toFa(course.lessonCount)} درس</span>
          {course.totalSeconds > 0 && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{course.durationText || totalDuration(course.totalSeconds)}</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <Price course={course} />
          {course.enrolled ? <Button size="sm" variant="success" to={`/learn/${course.slug}`}><PlayCircle className="h-4 w-4" />ورود به کلاس</Button> :
            <Button size="sm" variant={inCart ? 'secondary' : 'primary'} onClick={() => addToCart(course)} aria-label={`افزودن ${course.title} به سبد`}>{inCart ? <><Check className="h-4 w-4" />در سبد</> : <><ShoppingBag className="h-4 w-4" />افزودن</>}</Button>}
        </div>
      </div>
    </article>
  );
}
