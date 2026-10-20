import { q, one, all, b } from '../db/index.js';
import { notFound, bad, readJson, HttpError } from '../lib/http.js';
import { serializeCourse, COURSE_SELECT, curriculum, activeEnrollment, lessonAccess, getSettings } from '../lib/domain.js';
import { playbackUrl } from '../lib/storage.js';
import { requireUser } from '../lib/auth.js';
import { str, intv } from '../lib/validate.js';
import { uuid } from '../lib/security.js';
import { DEFAULT_BRAND, DEFAULT_FAQ, DEFAULT_AI } from '../db/defaults.js';

const PUB = (sql, pub = true) => sql.replaceAll('$PUB', pub ? 'TRUE' : 'TRUE');

export async function listPublishedCourses() {
  const rows = await all(PUB(COURSE_SELECT) + ` WHERE c.status = 'published' ORDER BY c.featured DESC, c.sort_order, c.created_at`);
  return rows.map((c) => serializeCourse(c));
}

export default function catalogRoutes(r) {
  r.get('/api/site', async () => {
    const [brand, faq, ai, categories, courses] = await Promise.all([
      getSettings('brand', DEFAULT_BRAND), getSettings('faq', DEFAULT_FAQ), getSettings('ai', DEFAULT_AI),
      all('SELECT id, slug, title, sort_order FROM categories ORDER BY sort_order, title'), listPublishedCourses(),
    ]);
    const counts = Object.fromEntries(categories.map((c) => [c.slug, courses.filter((x) => x.categoryId === c.id).length]));
    return {
      brand: { ...DEFAULT_BRAND, ...brand }, faq, ai: { enabled: ai.enabled !== false, name: ai.name, welcome: ai.welcome },
      categories: categories.map((c) => ({ id: c.id, slug: c.slug, title: c.title, courseCount: counts[c.slug] || 0 })),
      stats: { courses: courses.length, lessons: courses.reduce((s, c) => s + c.lessonCount, 0) },
    };
  });

  r.get('/api/courses', async (ctx) => {
    let list = await listPublishedCourses();
    const { category, q: query, sort, kind } = ctx.query;
    if (category && category !== 'all') list = list.filter((c) => c.categorySlug === category);
    if (kind) list = list.filter((c) => c.kind === kind);
    const term = String(query || '').trim().slice(0, 80);
    if (term) list = list.filter((c) => [c.title, c.shortDesc, c.categoryTitle].some((s) => s?.includes(term)));
    if (sort === 'price-asc') list.sort((a, b2) => a.finalPrice - b2.finalPrice);
    if (sort === 'price-desc') list.sort((a, b2) => b2.finalPrice - a.finalPrice);
    if (ctx.user) {
      const mine = new Set((await all('SELECT course_id FROM enrollments WHERE user_id = $1 AND revoked_at IS NULL', [ctx.user.id])).map((e) => e.course_id));
      list = list.map((c) => ({ ...c, enrolled: mine.has(c.id) }));
    }
    return { courses: list };
  });

  r.get('/api/courses/:slug', async (ctx) => {
    const c = await one(PUB(COURSE_SELECT) + ' WHERE c.slug = $1', [ctx.params.slug]);
    const enrolled = c ? !!(await activeEnrollment(ctx.user?.id, c.id)) : false;
    if (!c || (c.status !== 'published' && !enrolled && ctx.user?.role !== 'admin')) throw notFound('این دوره پیدا نشد یا هنوز منتشر نشده است.');
    const chapters = await curriculum(c.id);
    let progress = {};
    if (ctx.user) {
      const rows = await all('SELECT p.lesson_id, p.position_seconds, p.completed FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = $1 AND l.course_id = $2', [ctx.user.id, c.id]);
      progress = Object.fromEntries(rows.map((p) => [p.lesson_id, { position: p.position_seconds, completed: b(p.completed) }]));
    }
    return { course: serializeCourse(c, { enrolled, chapters, purchasable: c.status === 'published' }), progress };
  });

  // صدور لینک پخش امضاشده — فقط پس از بررسی مجوز در سرور
  r.get('/api/lessons/:id/play', async (ctx) => {
    const lesson = await one('SELECT * FROM lessons WHERE id = $1', [ctx.params.id]);
    if (!lesson) throw notFound('درس پیدا نشد.');
    const course = await one('SELECT * FROM courses WHERE id = $1', [lesson.course_id]);
    const acc = await lessonAccess(ctx.user, lesson, course);
    if (!acc.allowed) {
      const msg = acc.reason === 'login' ? 'برای مشاهده این جلسه وارد حساب کاربری شوید.' : acc.reason === 'purchase' ? 'این جلسه مخصوص دانش‌آموزان ثبت‌نام‌شده در دوره است.' : 'این جلسه در دسترس نیست.';
      throw new HttpError(acc.reason === 'login' ? 401 : 403, msg, { reason: acc.reason });
    }
    let video = null;
    if (lesson.video_id) {
      const v = await one("SELECT * FROM videos WHERE id = $1 AND status = 'ready'", [lesson.video_id]);
      if (v) video = { ...playbackUrl(v, ctx.user?.id), mime: v.mime };
    }
    let position = 0;
    if (ctx.user) position = (await one('SELECT position_seconds FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [ctx.user.id, lesson.id]))?.position_seconds || 0;
    return { lessonId: lesson.id, video, position, watermark: ctx.user ? ctx.user.phone.replace(/^(\d{4})\d{3}/, '$1***') : null };
  });

  r.get('/api/articles', async () => ({
    articles: (await all('SELECT id, slug, title, category, grade, read_time, excerpt, published_at FROM articles WHERE published = TRUE ORDER BY published_at DESC')),
  }));
  r.get('/api/articles/:slug', async (ctx) => {
    const a = await one('SELECT * FROM articles WHERE slug = $1 AND published = TRUE', [ctx.params.slug]);
    if (!a) throw notFound('مقاله پیدا نشد.');
    return { article: a };
  });

  // پرسش علمی / تیکت دانش‌آموز
  r.get('/api/me/tickets', async (ctx) => {
    const u = requireUser(ctx);
    return { tickets: await all('SELECT t.*, c.title AS course_title FROM tickets t LEFT JOIN courses c ON c.id = t.course_id WHERE t.user_id = $1 ORDER BY t.created_at DESC', [u.id]) };
  });
  r.post('/api/me/tickets', async (ctx) => {
    const u = requireUser(ctx);
    const body = await readJson(ctx.req);
    const subject = str(body.subject, { field: 'موضوع', min: 3, max: 150, required: true });
    const message = str(body.message, { field: 'متن پرسش', min: 5, max: 3000, required: true });
    let courseId = body.courseId ? String(body.courseId) : null;
    if (courseId && !(await one('SELECT id FROM courses WHERE id = $1', [courseId]))) courseId = null;
    const open = await one("SELECT COUNT(*) AS n FROM tickets WHERE user_id = $1 AND status = 'open'", [u.id]);
    if (Number(open.n) >= 10) throw bad('تعداد پرسش‌های باز شما زیاد است؛ منتظر پاسخ بمانید.');
    const id = uuid();
    await q('INSERT INTO tickets (id, user_id, course_id, subject, message, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, u.id, courseId, subject, message, 'open', new Date().toISOString()]);
    return { ok: true, id };
  });

  // پیشرفت آموزشی — فقط برای درس‌هایی که کاربر مجاز به مشاهده‌شان است
  r.post('/api/progress', async (ctx) => {
    const u = requireUser(ctx);
    const body = await readJson(ctx.req);
    const lesson = await one('SELECT * FROM lessons WHERE id = $1', [String(body.lessonId || '')]);
    if (!lesson) throw notFound('درس پیدا نشد.');
    const course = await one('SELECT * FROM courses WHERE id = $1', [lesson.course_id]);
    if (!(await lessonAccess(u, lesson, course)).allowed) throw new HttpError(403, 'دسترسی به این درس ندارید.');
    const position = intv(Math.floor(Number(body.position) || 0), { field: 'موقعیت', max: 24 * 3600 });
    const now = new Date().toISOString();
    const prev = await one('SELECT completed FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [u.id, lesson.id]);
    const completed = body.completed === true || (prev ? b(prev.completed) : false);
    if (body.completed === false) {
      await q('UPDATE lesson_progress SET completed = $1, updated_at = $2 WHERE user_id = $3 AND lesson_id = $4', [false, now, u.id, lesson.id]);
      return { ok: true, completed: false };
    }
    await q(`INSERT INTO lesson_progress (user_id, lesson_id, position_seconds, completed, updated_at) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (user_id, lesson_id) DO UPDATE SET position_seconds = EXCLUDED.position_seconds, completed = EXCLUDED.completed, updated_at = EXCLUDED.updated_at`,
      [u.id, lesson.id, position, completed, now]);
    return { ok: true, completed };
  });

  r.get('/api/me/courses', async (ctx) => {
    const u = requireUser(ctx);
    const rows = await all(PUB(COURSE_SELECT) + ' JOIN enrollments e ON e.course_id = c.id WHERE e.user_id = $1 AND e.revoked_at IS NULL ORDER BY e.created_at DESC', [u.id]);
    const prog = await all('SELECT l.course_id, COUNT(*) AS done FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = $1 AND p.completed = TRUE GROUP BY l.course_id', [u.id]);
    const last = await all('SELECT l.course_id, p.lesson_id, p.updated_at FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = $1 ORDER BY p.updated_at DESC', [u.id]);
    const doneBy = Object.fromEntries(prog.map((p) => [p.course_id, Number(p.done)]));
    return {
      courses: rows.map((c) => {
        const s = serializeCourse(c, { enrolled: true });
        return { ...s, completedLessons: doneBy[c.id] || 0, lastLessonId: last.find((l) => l.course_id === c.id)?.lesson_id || null };
      }),
    };
  });
}
