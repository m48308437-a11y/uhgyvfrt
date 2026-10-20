// API پنل مدیریت — همه مسیرها با requireAdmin در سمت سرور محافظت می‌شوند.
import { q, one, all, tx, j, b } from '../db/index.js';
import { readJson, bad, notFound, conflict, forbidden, send } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { uuid } from '../lib/security.js';
import { str, intv, oneOf, strList, isoDate, slug as slugv, safeUrl, faToEn } from '../lib/validate.js';
import { serializeCourse, COURSE_SELECT, curriculum, getSettings } from '../lib/domain.js';
import { audit } from '../lib/log.js';
import { serializeOrder, settleVerification } from './checkout.js';
import { verifyPayment } from '../lib/zarinpal.js';
import * as storage from '../lib/storage.js';
import { config } from '../config.js';
import { DEFAULT_BRAND, DEFAULT_FAQ, DEFAULT_AI } from '../db/defaults.js';

const now = () => new Date().toISOString();
const SEL = COURSE_SELECT.replaceAll('$PUB', 'TRUE');

function coursePayload(bd) {
  const price = intv(bd.price, { field: 'قیمت اصلی', required: true, max: 1_000_000_000 });
  const discount = intv(bd.discountPrice, { field: 'قیمت تخفیف‌خورده', nullable: true, max: 1_000_000_000 });
  if (discount != null && discount > price) throw bad('قیمت تخفیف‌خورده نمی‌تواند بیشتر از قیمت اصلی باشد.');
  return {
    title: str(bd.title, { field: 'عنوان دوره', min: 3, max: 160, required: true }),
    slug: slugv(bd.slug),
    kind: oneOf(bd.kind || 'course', ['course', 'package'], 'نوع'),
    short_desc: str(bd.shortDesc, { field: 'توضیح کوتاه', max: 400 }),
    full_desc: str(bd.fullDesc, { field: 'توضیحات کامل', max: 8000 }),
    cover_url: safeUrl(bd.coverUrl, 'تصویر کاور'),
    instructor: str(bd.instructor, { field: 'مدرس', max: 80 }),
    category_id: bd.categoryId || null,
    level: oneOf(bd.level || 'all', ['beginner', 'intermediate', 'advanced', 'all'], 'سطح'),
    badge: str(bd.badge, { field: 'برچسب', max: 40 }) || null,
    price, discount_price: discount,
    discount_expires_at: isoDate(bd.discountExpiresAt, 'پایان تخفیف'),
    status: oneOf(bd.status || 'draft', ['draft', 'published', 'inactive', 'archived'], 'وضعیت'),
    featured: !!bd.featured,
    duration_text: str(bd.durationText, { field: 'مدت دوره', max: 60 }) || null,
    prerequisites: JSON.stringify(strList(bd.prerequisites, 'پیش‌نیازها')),
    benefits: JSON.stringify(strList(bd.benefits, 'مزایا')),
    formula_accent: str(bd.formulaAccent, { field: 'فرمول شاخص', max: 120 }) || null,
    sort_order: intv(bd.sortOrder, { field: 'ترتیب', max: 100000 }),
  };
}

export default function adminRoutes(r) {
  const A = (fn) => async (ctx) => { ctx.admin = requireAdmin(ctx); return fn(ctx); };

  // ───── داشبورد (آمار واقعی از پایگاه داده) ─────
  r.get('/api/admin/stats', A(async () => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [users, newUsers, courses, revenue, orders, tickets, paid30, signups30, topCourses, recent] = await Promise.all([
      one("SELECT COUNT(*) AS n FROM users WHERE role = 'student'"),
      one("SELECT COUNT(*) AS n FROM users WHERE created_at >= $1", [since]),
      one("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published FROM courses"),
      one("SELECT COALESCE(SUM(final_amount),0) AS net, COALESCE(SUM(subtotal),0) AS gross, COALESCE(SUM(discount_amount),0) AS discounts, COUNT(*) AS n FROM orders WHERE status = 'paid'"),
      one("SELECT SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid, SUM(CASE WHEN status IN ('failed','cancelled') THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) AS refunded FROM orders"),
      one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"),
      all("SELECT paid_at, final_amount FROM orders WHERE status = 'paid' AND paid_at >= $1", [since]),
      all("SELECT created_at FROM users WHERE created_at >= $1", [since]),
      all("SELECT i.course_id, i.title_snapshot AS title, COUNT(*) AS sales, SUM(i.unit_price) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'paid' GROUP BY i.course_id, i.title_snapshot ORDER BY sales DESC LIMIT 8"),
      all("SELECT o.*, u.name AS user_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 8"),
    ]);
    const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10));
    const daily = days.map((d) => ({
      date: d,
      revenue: paid30.filter((o) => o.paid_at.slice(0, 10) === d).reduce((s, o) => s + o.final_amount, 0),
      orders: paid30.filter((o) => o.paid_at.slice(0, 10) === d).length,
      signups: signups30.filter((u) => u.created_at.slice(0, 10) === d).length,
    }));
    return {
      students: Number(users.n), newUsers30: Number(newUsers.n),
      courses: { total: Number(courses.total), published: Number(courses.published || 0) },
      revenue: { net: Number(revenue.net), gross: Number(revenue.gross), discounts: Number(revenue.discounts), paidOrders: Number(revenue.n) },
      orders: Object.fromEntries(Object.entries(orders).map(([k, v]) => [k, Number(v || 0)])),
      openTickets: Number(tickets.n), daily,
      topCourses: topCourses.map((t) => ({ ...t, sales: Number(t.sales), revenue: Number(t.revenue) })),
      recentOrders: recent.map((o) => ({ number: o.order_number, userName: o.user_name, status: o.status, finalAmount: o.final_amount, createdAt: o.created_at })),
    };
  }));

  // ───── کاربران و نقش‌ها ─────
  r.get('/api/admin/users', A(async (ctx) => {
    const term = String(ctx.query.q || '').trim().slice(0, 60);
    const page = Math.max(0, Number(ctx.query.page) || 0);
    const where = term ? 'WHERE u.name ILIKE $1 OR u.phone LIKE $1 OR u.email ILIKE $1' : '';
    const params = term ? [`%${faToEn(term)}%`] : [];
    const rows = await all(`SELECT u.id, u.name, u.phone, u.email, u.role, u.status, u.grade, u.phone_verified_at, u.created_at,
        (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.revoked_at IS NULL) AS enrollments
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT 50 OFFSET ${page * 50}`, params);
    const total = await one(`SELECT COUNT(*) AS n FROM users u ${where}`, params);
    return { users: rows.map((u) => ({ ...u, enrollments: Number(u.enrollments), verified: !!u.phone_verified_at })), total: Number(total.n) };
  }));
  r.get('/api/admin/users/:id', A(async (ctx) => {
    const u = await one('SELECT id, name, phone, email, role, status, grade, phone_verified_at, created_at FROM users WHERE id = $1', [ctx.params.id]);
    if (!u) throw notFound();
    const enrollments = await all('SELECT e.*, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = $1 ORDER BY e.created_at DESC', [u.id]);
    const orders = await all('SELECT order_number, status, final_amount, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [u.id]);
    return { user: u, enrollments, orders };
  }));
  r.patch('/api/admin/users/:id', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const u = await one('SELECT * FROM users WHERE id = $1', [ctx.params.id]);
    if (!u) throw notFound();
    const role = bd.role ? oneOf(bd.role, ['student', 'admin'], 'نقش') : u.role;
    const status = bd.status ? oneOf(bd.status, ['active', 'blocked'], 'وضعیت') : u.status;
    if (u.id === ctx.admin.id && (role !== 'admin' || status !== 'active')) throw forbidden('نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید.');
    await q('UPDATE users SET role = $1, status = $2, updated_at = $3 WHERE id = $4', [role, status, now(), u.id]);
    if (status === 'blocked' || role !== u.role) await q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    await audit(ctx.admin.id, 'user.update', 'user', u.id, { role, status }, ctx.ip);
    return { ok: true };
  }));
  r.post('/api/admin/users/:id/enrollments', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const course = await one('SELECT id FROM courses WHERE id = $1', [String(bd.courseId || '')]);
    const user = await one('SELECT id FROM users WHERE id = $1', [ctx.params.id]);
    if (!course || !user) throw notFound();
    await q(`INSERT INTO enrollments (id, user_id, course_id, source, created_at) VALUES ($1,$2,$3,'manual',$4)
             ON CONFLICT (user_id, course_id) DO UPDATE SET revoked_at = NULL`, [uuid(), user.id, course.id, now()]);
    await audit(ctx.admin.id, 'enrollment.grant_manual', 'user', user.id, { courseId: course.id, note: str(bd.note, { field: 'توضیح', max: 300 }) }, ctx.ip);
    return { ok: true };
  }));
  r.delete('/api/admin/users/:id/enrollments/:courseId', A(async (ctx) => {
    await q('UPDATE enrollments SET revoked_at = $1 WHERE user_id = $2 AND course_id = $3 AND revoked_at IS NULL', [now(), ctx.params.id, ctx.params.courseId]);
    await audit(ctx.admin.id, 'enrollment.revoke', 'user', ctx.params.id, { courseId: ctx.params.courseId }, ctx.ip);
    return { ok: true };
  }));

  // ───── دوره‌ها / پکیج‌ها ─────
  r.get('/api/admin/courses', A(async () => {
    const rows = await all(SEL + ' ORDER BY c.sort_order, c.created_at');
    const sales = await all("SELECT i.course_id, COUNT(*) AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'paid' GROUP BY i.course_id");
    const by = Object.fromEntries(sales.map((s) => [s.course_id, Number(s.n)]));
    return { courses: rows.map((c) => serializeCourse(c, { sales: by[c.id] || 0, discountPrice: c.discount_price, rawDiscountExpiresAt: c.discount_expires_at })) };
  }));
  r.get('/api/admin/courses/:id', A(async (ctx) => {
    const c = await one(SEL + ' WHERE c.id = $1', [ctx.params.id]);
    if (!c) throw notFound();
    return { course: serializeCourse(c, { discountPrice: c.discount_price, rawDiscountExpiresAt: c.discount_expires_at, sortOrder: c.sort_order, chapters: await curriculum(c.id, { includeUnpublished: true }) }) };
  }));
  r.post('/api/admin/courses', A(async (ctx) => {
    const p = coursePayload(await readJson(ctx.req));
    if (await one('SELECT id FROM courses WHERE slug = $1', [p.slug])) throw conflict('این نامک (slug) قبلاً استفاده شده است.');
    const id = uuid(); const t = now();
    const cols = Object.keys(p);
    await q(`INSERT INTO courses (id, ${cols.join(', ')}, created_at, updated_at) VALUES ($1, ${cols.map((_, i) => '$' + (i + 2)).join(', ')}, $${cols.length + 2}, $${cols.length + 2})`, [id, ...Object.values(p), t]);
    await audit(ctx.admin.id, 'course.create', 'course', id, { title: p.title }, ctx.ip);
    return { ok: true, id };
  }));
  r.put('/api/admin/courses/:id', A(async (ctx) => {
    const c = await one('SELECT id FROM courses WHERE id = $1', [ctx.params.id]);
    if (!c) throw notFound();
    const p = coursePayload(await readJson(ctx.req));
    if (await one('SELECT id FROM courses WHERE slug = $1 AND id <> $2', [p.slug, c.id])) throw conflict('این نامک (slug) قبلاً استفاده شده است.');
    const cols = Object.keys(p);
    await q(`UPDATE courses SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = $${cols.length + 1} WHERE id = $${cols.length + 2}`, [...Object.values(p), now(), c.id]);
    await audit(ctx.admin.id, 'course.update', 'course', c.id, { status: p.status, price: p.price, discount: p.discount_price }, ctx.ip);
    return { ok: true };
  }));
  r.delete('/api/admin/courses/:id', A(async (ctx) => {
    const c = await one('SELECT id, title FROM courses WHERE id = $1', [ctx.params.id]);
    if (!c) throw notFound();
    const used = await one('SELECT (SELECT COUNT(*) FROM order_items WHERE course_id = $1) + (SELECT COUNT(*) FROM enrollments WHERE course_id = $1) AS n', [c.id]);
    if (Number(used.n) > 0) {
      await q("UPDATE courses SET status = 'archived', updated_at = $1 WHERE id = $2", [now(), c.id]);
      await audit(ctx.admin.id, 'course.archive', 'course', c.id, null, ctx.ip);
      return { ok: true, archived: true, message: 'این دوره سابقه سفارش یا دانش‌آموز دارد؛ برای حفظ سوابق مالی حذف نشد و بایگانی شد.' };
    }
    await q('DELETE FROM courses WHERE id = $1', [c.id]);
    await audit(ctx.admin.id, 'course.delete', 'course', c.id, { title: c.title }, ctx.ip);
    return { ok: true, archived: false };
  }));

  // ───── فصل‌ها ─────
  r.post('/api/admin/courses/:id/chapters', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    if (!(await one('SELECT id FROM courses WHERE id = $1', [ctx.params.id]))) throw notFound();
    const max = await one('SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE course_id = $1', [ctx.params.id]);
    const id = uuid();
    await q('INSERT INTO chapters (id, course_id, title, sort_order) VALUES ($1,$2,$3,$4)', [id, ctx.params.id, str(bd.title, { field: 'عنوان فصل', min: 2, max: 160, required: true }), Number(max.m) + 1]);
    return { ok: true, id };
  }));
  r.patch('/api/admin/chapters/:id', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const r2 = await q('UPDATE chapters SET title = $1 WHERE id = $2', [str(bd.title, { field: 'عنوان فصل', min: 2, max: 160, required: true }), ctx.params.id]);
    if (!r2.rowCount) throw notFound();
    return { ok: true };
  }));
  r.delete('/api/admin/chapters/:id', A(async (ctx) => {
    await q('DELETE FROM chapters WHERE id = $1', [ctx.params.id]);
    await audit(ctx.admin.id, 'chapter.delete', 'chapter', ctx.params.id, null, ctx.ip);
    return { ok: true };
  }));
  r.post('/api/admin/courses/:id/chapters/reorder', A(async (ctx) => {
    const { ids } = await readJson(ctx.req);
    if (!Array.isArray(ids)) throw bad('ترتیب نامعتبر است.');
    await tx(async () => { for (const [i, id] of ids.entries()) await q('UPDATE chapters SET sort_order = $1 WHERE id = $2 AND course_id = $3', [i, String(id), ctx.params.id]); });
    return { ok: true };
  }));

  // ───── درس‌ها / ویدیوها (بدون محدودیت تعداد) ─────
  async function lessonPayload(bd, courseId) {
    let videoId = bd.videoId || null;
    if (videoId && !(await one('SELECT id FROM videos WHERE id = $1', [videoId]))) throw bad('ویدیوی انتخاب‌شده پیدا نشد.');
    let chapterId = bd.chapterId || null;
    if (chapterId && !(await one('SELECT id FROM chapters WHERE id = $1 AND course_id = $2', [chapterId, courseId]))) throw bad('فصل مقصد متعلق به این دوره نیست.');
    return {
      title: str(bd.title, { field: 'عنوان جلسه', min: 2, max: 200, required: true }),
      description: str(bd.description, { field: 'توضیحات جلسه', max: 3000 }),
      duration_seconds: intv(bd.durationSeconds, { field: 'مدت', max: 24 * 3600 }),
      access: oneOf(bd.access || 'paid', ['free', 'preview', 'paid'], 'نوع دسترسی'),
      published: bd.published !== false,
      video_id: videoId,
      math_topic: bd.mathTopic ? oneOf(bd.mathTopic, ['linear', 'integer', 'geometry', 'pythagoras', 'parabola', 'sets'], 'شبیه‌ساز') : null,
      formula: str(bd.formula, { field: 'فرمول', max: 160 }) || null,
      key_points: JSON.stringify(strList(bd.keyPoints, 'نکات کلیدی')),
      ...(chapterId ? { chapter_id: chapterId } : {}),
    };
  }
  r.post('/api/admin/chapters/:id/lessons', A(async (ctx) => {
    const ch = await one('SELECT * FROM chapters WHERE id = $1', [ctx.params.id]);
    if (!ch) throw notFound('ابتدا یک فصل برای دوره ایجاد کنید.');
    const p = await lessonPayload(await readJson(ctx.req), ch.course_id);
    delete p.chapter_id;
    const max = await one('SELECT COALESCE(MAX(sort_order), -1) AS m FROM lessons WHERE chapter_id = $1', [ch.id]);
    const id = uuid(); const t = now();
    const cols = Object.keys(p);
    await q(`INSERT INTO lessons (id, course_id, chapter_id, sort_order, ${cols.join(', ')}, created_at, updated_at) VALUES ($1,$2,$3,$4, ${cols.map((_, i) => '$' + (i + 5)).join(', ')}, $${cols.length + 5}, $${cols.length + 5})`,
      [id, ch.course_id, ch.id, Number(max.m) + 1, ...Object.values(p), t]);
    await audit(ctx.admin.id, 'lesson.create', 'lesson', id, { title: p.title }, ctx.ip);
    return { ok: true, id };
  }));
  r.put('/api/admin/lessons/:id', A(async (ctx) => {
    const l = await one('SELECT * FROM lessons WHERE id = $1', [ctx.params.id]);
    if (!l) throw notFound();
    const p = await lessonPayload(await readJson(ctx.req), l.course_id);
    if (p.chapter_id && p.chapter_id !== l.chapter_id) {
      const max = await one('SELECT COALESCE(MAX(sort_order), -1) AS m FROM lessons WHERE chapter_id = $1', [p.chapter_id]);
      p.sort_order = Number(max.m) + 1;
    }
    const cols = Object.keys(p);
    await q(`UPDATE lessons SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = $${cols.length + 1} WHERE id = $${cols.length + 2}`, [...Object.values(p), now(), l.id]);
    return { ok: true };
  }));
  r.delete('/api/admin/lessons/:id', A(async (ctx) => {
    await q('DELETE FROM lessons WHERE id = $1', [ctx.params.id]);
    await audit(ctx.admin.id, 'lesson.delete', 'lesson', ctx.params.id, null, ctx.ip);
    return { ok: true };
  }));
  r.post('/api/admin/chapters/:id/lessons/reorder', A(async (ctx) => {
    const { ids } = await readJson(ctx.req);
    if (!Array.isArray(ids)) throw bad('ترتیب نامعتبر است.');
    await tx(async () => { for (const [i, id] of ids.entries()) await q('UPDATE lessons SET sort_order = $1 WHERE id = $2 AND chapter_id = $3', [i, String(id), ctx.params.id]); });
    return { ok: true };
  }));

  // ───── کتابخانه ویدیو و آپلود چندبخشی قابل ادامه ─────
  r.get('/api/admin/videos', A(async () => {
    const rows = await all(`SELECT v.*, (SELECT COUNT(*) FROM lessons l WHERE l.video_id = v.id) AS used_in FROM videos v ORDER BY v.created_at DESC LIMIT 500`);
    return { videos: rows.map((v) => ({ id: v.id, name: v.original_name, mime: v.mime, size: Number(v.size_bytes), partSize: v.part_size, duration: v.duration_seconds, status: v.status, error: v.error, usedIn: Number(v.used_in), createdAt: v.created_at, provider: v.storage_provider })) };
  }));
  r.post('/api/admin/videos', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const name = str(bd.fileName, { field: 'نام فایل', min: 1, max: 200, required: true });
    const size = Number(bd.size);
    const mime = String(bd.mime || '');
    if (!storage.ALLOWED_MIME.includes(mime)) throw bad('فرمت فایل پشتیبانی نمی‌شود. فقط MP4، MOV، WebM یا MKV (پیشنهاد: MP4 با کدک H.264).');
    if (!Number.isSafeInteger(size) || size <= 0) throw bad('حجم فایل نامعتبر است.');
    if (size > config.storage.maxVideoBytes) throw bad(`حجم فایل بیش از حد مجاز (${Math.round(config.storage.maxVideoBytes / 1048576)} مگابایت) است.`);
    const id = uuid(); const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' }[mime];
    const video = { id, storage_provider: storage.providerName(), storage_key: `videos/${id}.${ext}`, mime, size_bytes: size, part_size: storage.partSizeFor(size) };
    const { uploadId } = await storage.initUpload(video);
    await q(`INSERT INTO videos (id, storage_provider, storage_key, upload_id, original_name, mime, size_bytes, part_size, duration_seconds, status, uploaded_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'uploading',$10,$11,$11)`,
      [id, video.storage_provider, video.storage_key, uploadId, name, mime, size, video.part_size, intv(Math.round(Number(bd.duration) || 0), { field: 'مدت', max: 86400 }) || null, ctx.admin.id, now()]);
    await audit(ctx.admin.id, 'video.upload_start', 'video', id, { name, size }, ctx.ip);
    return { ok: true, id, partSize: video.part_size, partCount: Math.ceil(size / video.part_size) };
  }));
  const getVideo = async (id) => { const v = await one('SELECT * FROM videos WHERE id = $1', [id]); if (!v) throw notFound('ویدیو پیدا نشد.'); return { ...v, size_bytes: Number(v.size_bytes) }; };
  r.post('/api/admin/videos/:id/part-urls', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    if (v.status !== 'uploading') throw bad('آپلود این ویدیو قبلاً تکمیل یا لغو شده است.');
    const { parts } = await readJson(ctx.req);
    const total = Math.ceil(v.size_bytes / v.part_size);
    const nums = (Array.isArray(parts) ? parts : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= total).slice(0, 100);
    return { urls: storage.partUrls(v, nums) };
  }));
  r.get('/api/admin/videos/:id/parts', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    return { status: v.status, partSize: v.part_size, size: v.size_bytes, parts: v.status === 'uploading' ? await storage.listUploadedParts(v) : [] };
  }));
  r.post('/api/admin/videos/:id/complete', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    if (v.status === 'ready') return { ok: true };
    const { parts } = await readJson(ctx.req);
    try {
      await storage.completeUpload(v, (parts || []).map((p) => ({ n: Number(p.n), etag: String(p.etag || '') })));
    } catch (e) {
      await q("UPDATE videos SET error = $1, updated_at = $2 WHERE id = $3", [e.message.slice(0, 300), now(), v.id]);
      throw bad(e.message);
    }
    await q("UPDATE videos SET status = 'ready', error = NULL, updated_at = $1 WHERE id = $2", [now(), v.id]);
    await audit(ctx.admin.id, 'video.upload_complete', 'video', v.id, null, ctx.ip);
    return { ok: true };
  }));
  r.patch('/api/admin/videos/:id', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    const bd = await readJson(ctx.req);
    await q('UPDATE videos SET original_name = $1, duration_seconds = $2, updated_at = $3 WHERE id = $4', [str(bd.name, { field: 'نام', min: 1, max: 200, required: true }), intv(bd.duration, { field: 'مدت', max: 86400, nullable: true }), now(), v.id]);
    return { ok: true };
  }));
  r.delete('/api/admin/videos/:id', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    if (v.status === 'uploading') await storage.abortUpload(v); else await storage.deleteVideoFile(v);
    await q('UPDATE lessons SET video_id = NULL WHERE video_id = $1', [v.id]);
    await q('DELETE FROM videos WHERE id = $1', [v.id]);
    await audit(ctx.admin.id, 'video.delete', 'video', v.id, { name: v.original_name }, ctx.ip);
    return { ok: true };
  }));
  r.get('/api/admin/videos/:id/preview', A(async (ctx) => {
    const v = await getVideo(ctx.params.id);
    if (v.status !== 'ready') throw bad('ویدیو هنوز آماده پخش نیست.');
    return storage.playbackUrl(v, ctx.admin.id);
  }));

  // ───── کدهای تخفیف ─────
  r.get('/api/admin/coupons', A(async () => ({ coupons: (await all('SELECT * FROM coupons ORDER BY created_at DESC')).map((c) => ({ ...c, active: b(c.active) })) })));
  const couponPayload = (bd) => {
    const type = oneOf(bd.type, ['percent', 'fixed'], 'نوع تخفیف');
    const value = intv(bd.value, { field: 'مقدار تخفیف', min: 1, max: type === 'percent' ? 100 : 1_000_000_000, required: true });
    return { type, value, max_usage: intv(bd.maxUsage, { field: 'سقف استفاده', min: 1, max: 1_000_000, required: true }), expires_at: isoDate(bd.expiresAt, 'انقضا'), active: bd.active !== false, description: str(bd.description, { field: 'توضیح', max: 200 }) || null };
  };
  r.post('/api/admin/coupons', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const code = String(bd.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw bad('کد تخفیف باید ۳ تا ۳۲ کاراکتر انگلیسی/عدد باشد.');
    if (await one('SELECT id FROM coupons WHERE code = $1', [code])) throw conflict('این کد تخفیف قبلاً ثبت شده است.');
    const p = couponPayload(bd); const id = uuid();
    await q('INSERT INTO coupons (id, code, type, value, max_usage, used_count, expires_at, active, description, created_at) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9)', [id, code, p.type, p.value, p.max_usage, p.expires_at, p.active, p.description, now()]);
    await audit(ctx.admin.id, 'coupon.create', 'coupon', id, { code }, ctx.ip);
    return { ok: true, id };
  }));
  r.put('/api/admin/coupons/:id', A(async (ctx) => {
    const c = await one('SELECT * FROM coupons WHERE id = $1', [ctx.params.id]);
    if (!c) throw notFound();
    const p = couponPayload(await readJson(ctx.req));
    if (p.max_usage < c.used_count) throw bad('سقف استفاده نمی‌تواند کمتر از تعداد استفاده‌شده باشد.');
    await q('UPDATE coupons SET type=$1, value=$2, max_usage=$3, expires_at=$4, active=$5, description=$6 WHERE id=$7', [p.type, p.value, p.max_usage, p.expires_at, p.active, p.description, c.id]);
    await audit(ctx.admin.id, 'coupon.update', 'coupon', c.id, p, ctx.ip);
    return { ok: true };
  }));
  r.delete('/api/admin/coupons/:id', A(async (ctx) => {
    const used = await one('SELECT COUNT(*) AS n FROM orders WHERE coupon_id = $1', [ctx.params.id]);
    if (Number(used.n) > 0) { await q('UPDATE coupons SET active = $1 WHERE id = $2', [false, ctx.params.id]); return { ok: true, deactivated: true }; }
    await q('DELETE FROM coupons WHERE id = $1', [ctx.params.id]);
    return { ok: true };
  }));

  // ───── سفارش‌ها، پرداخت‌ها، بازگشت وجه ─────
  r.get('/api/admin/orders', A(async (ctx) => {
    const status = ['pending', 'paid', 'failed', 'cancelled', 'refunded'].includes(ctx.query.status) ? ctx.query.status : null;
    const term = String(ctx.query.q || '').trim().slice(0, 60);
    const cond = []; const params = [];
    if (status) { params.push(status); cond.push(`o.status = $${params.length}`); }
    if (term) { params.push(`%${faToEn(term)}%`); cond.push(`(o.order_number ILIKE $${params.length} OR u.phone LIKE $${params.length} OR u.name ILIKE $${params.length})`); }
    const rows = await all(`SELECT o.*, u.name AS user_name, u.phone AS user_phone FROM orders o JOIN users u ON u.id = o.user_id ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT 200`, params);
    const out = [];
    for (const o of rows) out.push({ ...serializeOrder(o, await all('SELECT i.*, c.slug FROM order_items i JOIN courses c ON c.id = i.course_id WHERE i.order_id = $1', [o.id]), await all('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at', [o.id])), userName: o.user_name, userPhone: o.user_phone });
    return { orders: out };
  }));
  r.post('/api/admin/orders/:number/reconcile', A(async (ctx) => {
    const o = await one('SELECT * FROM orders WHERE order_number = $1', [ctx.params.number]);
    if (!o) throw notFound();
    const pays = await all("SELECT * FROM payments WHERE order_id = $1 AND status = 'initiated' AND authority IS NOT NULL", [o.id]);
    const results = [];
    for (const p of pays) {
      const res = await verifyPayment({ amountRial: Number(p.amount_rial), authority: p.authority }).catch((e) => ({ ok: false, error: e.message }));
      if (res.error) { results.push({ authority: p.authority, result: 'error', message: res.error }); continue; }
      // کد -51 و مشابه یعنی پرداخت انجام نشده
      results.push({ authority: p.authority, result: await settleVerification(p.id, res), code: res.code });
    }
    await audit(ctx.admin.id, 'order.reconcile', 'order', o.order_number, results, ctx.ip);
    return { ok: true, results };
  }));
  r.post('/api/admin/orders/:number/refund', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const note = str(bd.note, { field: 'توضیح بازگشت وجه', min: 3, max: 300, required: true });
    const o = await one('SELECT * FROM orders WHERE order_number = $1', [ctx.params.number]);
    if (!o) throw notFound();
    if (o.status !== 'paid') throw bad('فقط سفارش‌های پرداخت‌شده قابل بازگشت وجه هستند.');
    await tx(async () => {
      await q("UPDATE orders SET status = 'refunded', updated_at = $1 WHERE id = $2 AND status = 'paid'", [now(), o.id]);
      await q("UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'verified'", [o.id]);
      await q('UPDATE enrollments SET revoked_at = $1 WHERE order_id = $2 AND revoked_at IS NULL', [now(), o.id]);
    });
    await audit(ctx.admin.id, 'order.refund', 'order', o.order_number, { note }, ctx.ip);
    return { ok: true };
  }));

  // ───── گزارش فروش ─────
  r.get('/api/admin/reports/sales', A(async (ctx) => {
    const from = isoDate(ctx.query.from, 'از') || new Date(Date.now() - 90 * 86400_000).toISOString();
    const to = isoDate(ctx.query.to, 'تا') || now();
    const rows = await all(`SELECT o.order_number, o.paid_at, o.final_amount, o.discount_amount, o.coupon_code, u.name, u.phone,
                              (SELECT ${'STRING_AGG'}(i.title_snapshot, ' | ') FROM order_items i WHERE i.order_id = o.id) AS titles
                            FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'paid' AND o.paid_at BETWEEN $1 AND $2 ORDER BY o.paid_at`, [from, to]).catch(async () =>
      all(`SELECT o.order_number, o.paid_at, o.final_amount, o.discount_amount, o.coupon_code, u.name, u.phone,
             (SELECT GROUP_CONCAT(i.title_snapshot, ' | ') FROM order_items i WHERE i.order_id = o.id) AS titles
           FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'paid' AND o.paid_at BETWEEN $1 AND $2 ORDER BY o.paid_at`, [from, to]));
    if (ctx.query.format === 'csv') {
      const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
      const csv = '\uFEFF' + ['شماره سفارش,تاریخ پرداخت,مبلغ (تومان),تخفیف,کد تخفیف,نام,موبایل,دوره‌ها', ...rows.map((r2) => [r2.order_number, r2.paid_at, r2.final_amount, r2.discount_amount, r2.coupon_code, r2.name, r2.phone, r2.titles].map(esc).join(','))].join('\n');
      send(ctx.res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sales-report.csv"' });
      return;
    }
    return { from, to, total: rows.reduce((s, x) => s + x.final_amount, 0), count: rows.length, rows };
  }));

  // ───── دسته‌بندی‌ها ─────
  r.get('/api/admin/categories', A(async () => ({ categories: await all('SELECT c.*, (SELECT COUNT(*) FROM courses x WHERE x.category_id = c.id) AS courses FROM categories c ORDER BY sort_order, title') })));
  r.post('/api/admin/categories', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const s = slugv(bd.slug);
    if (await one('SELECT id FROM categories WHERE slug = $1', [s])) throw conflict('این نامک قبلاً استفاده شده است.');
    const id = uuid();
    await q('INSERT INTO categories (id, slug, title, sort_order) VALUES ($1,$2,$3,$4)', [id, s, str(bd.title, { field: 'عنوان', min: 2, max: 60, required: true }), intv(bd.sortOrder, { field: 'ترتیب', max: 1000 })]);
    return { ok: true, id };
  }));
  r.put('/api/admin/categories/:id', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const s = slugv(bd.slug);
    if (await one('SELECT id FROM categories WHERE slug = $1 AND id <> $2', [s, ctx.params.id])) throw conflict('این نامک قبلاً استفاده شده است.');
    await q('UPDATE categories SET slug = $1, title = $2, sort_order = $3 WHERE id = $4', [s, str(bd.title, { field: 'عنوان', min: 2, max: 60, required: true }), intv(bd.sortOrder, { field: 'ترتیب', max: 1000 }), ctx.params.id]);
    return { ok: true };
  }));
  r.delete('/api/admin/categories/:id', A(async (ctx) => { await q('DELETE FROM categories WHERE id = $1', [ctx.params.id]); return { ok: true }; }));

  // ───── تنظیمات و محتوای سایت ─────
  const SETTINGS = {
    brand: { def: DEFAULT_BRAND, clean: (v) => Object.fromEntries(Object.keys(DEFAULT_BRAND).map((k) => [k, str(v[k], { field: k, max: 1500 })])) },
    faq: { def: DEFAULT_FAQ, clean: (v) => (Array.isArray(v) ? v : []).slice(0, 40).map((f) => ({ q: str(f.q, { field: 'پرسش', max: 300, required: true }), a: str(f.a, { field: 'پاسخ', max: 2000, required: true }) })) },
    ai: { def: DEFAULT_AI, clean: (v) => ({ enabled: v.enabled !== false, name: str(v.name, { field: 'نام دستیار', min: 2, max: 60, required: true }), welcome: str(v.welcome, { field: 'پیام خوشامد', max: 800 }), systemPrompt: str(v.systemPrompt, { field: 'دستور سیستمی', max: 4000 }) }) },
  };
  r.get('/api/admin/settings/:key', A(async (ctx) => {
    const s = SETTINGS[ctx.params.key]; if (!s) throw notFound();
    const value = await getSettings(ctx.params.key, s.def);
    return { value: Array.isArray(s.def) ? value : { ...s.def, ...value }, aiServerConfigured: ctx.params.key === 'ai' ? !!(config.ai.url && config.ai.key) : undefined };
  }));
  r.put('/api/admin/settings/:key', A(async (ctx) => {
    const s = SETTINGS[ctx.params.key]; if (!s) throw notFound();
    const value = s.clean((await readJson(ctx.req)).value || {});
    await q('INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at', [ctx.params.key, JSON.stringify(value), now()]);
    await audit(ctx.admin.id, 'settings.update', 'settings', ctx.params.key, null, ctx.ip);
    return { ok: true };
  }));

  r.get('/api/admin/articles', A(async () => ({ articles: (await all('SELECT * FROM articles ORDER BY published_at DESC')).map((a) => ({ ...a, published: b(a.published) })) })));
  const articlePayload = (bd) => ({ slug: slugv(bd.slug), title: str(bd.title, { field: 'عنوان', min: 3, max: 200, required: true }), category: str(bd.category, { field: 'دسته', max: 80 }), grade: str(bd.grade, { field: 'پایه', max: 40 }), read_time: str(bd.readTime ?? bd.read_time, { field: 'زمان مطالعه', max: 40 }), excerpt: str(bd.excerpt, { field: 'خلاصه', max: 600 }), content: str(bd.content, { field: 'متن', max: 30000 }), published: bd.published !== false });
  r.post('/api/admin/articles', A(async (ctx) => {
    const p = articlePayload(await readJson(ctx.req));
    if (await one('SELECT id FROM articles WHERE slug = $1', [p.slug])) throw conflict('این نامک قبلاً استفاده شده است.');
    const id = uuid();
    await q('INSERT INTO articles (id, slug, title, category, grade, read_time, excerpt, content, published, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, p.slug, p.title, p.category, p.grade, p.read_time, p.excerpt, p.content, p.published, now()]);
    return { ok: true, id };
  }));
  r.put('/api/admin/articles/:id', A(async (ctx) => {
    const p = articlePayload(await readJson(ctx.req));
    if (await one('SELECT id FROM articles WHERE slug = $1 AND id <> $2', [p.slug, ctx.params.id])) throw conflict('این نامک قبلاً استفاده شده است.');
    await q('UPDATE articles SET slug=$1, title=$2, category=$3, grade=$4, read_time=$5, excerpt=$6, content=$7, published=$8 WHERE id=$9', [p.slug, p.title, p.category, p.grade, p.read_time, p.excerpt, p.content, p.published, ctx.params.id]);
    return { ok: true };
  }));
  r.delete('/api/admin/articles/:id', A(async (ctx) => { await q('DELETE FROM articles WHERE id = $1', [ctx.params.id]); return { ok: true }; }));

  // ───── تیکت‌ها ─────
  r.get('/api/admin/tickets', A(async () => ({ tickets: await all('SELECT t.*, u.name AS user_name, u.phone AS user_phone, c.title AS course_title FROM tickets t JOIN users u ON u.id = t.user_id LEFT JOIN courses c ON c.id = t.course_id ORDER BY CASE WHEN t.status = \'open\' THEN 0 ELSE 1 END, t.created_at DESC LIMIT 300') })));
  r.post('/api/admin/tickets/:id/reply', A(async (ctx) => {
    const bd = await readJson(ctx.req);
    const reply = str(bd.reply, { field: 'پاسخ', min: 2, max: 5000, required: true });
    const r2 = await q("UPDATE tickets SET reply = $1, status = 'answered', replied_at = $2 WHERE id = $3", [reply, now(), ctx.params.id]);
    if (!r2.rowCount) throw notFound();
    return { ok: true };
  }));
  r.post('/api/admin/tickets/:id/close', A(async (ctx) => { await q("UPDATE tickets SET status = 'closed' WHERE id = $1", [ctx.params.id]); return { ok: true }; }));

  // ───── گزارش رخدادها و خطاهای سیستم ─────
  r.get('/api/admin/logs', A(async () => ({
    audit: await all('SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200'),
    errors: await all('SELECT * FROM error_log ORDER BY created_at DESC LIMIT 200'),
    system: {
      database: config.databaseUrl.startsWith('postgres') ? 'PostgreSQL' : 'SQLite (توسعه)', storage: config.storage.provider, sms: config.sms.provider,
      payment: config.zarinpal.merchantId ? (config.zarinpal.sandbox ? 'زرین‌پال (sandbox)' : 'زرین‌پال (واقعی)') : 'تنظیم نشده', ai: config.ai.url ? 'متصل' : 'موتور محلی', env: config.env,
    },
  })));
}
