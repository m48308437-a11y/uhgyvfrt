// قواعد دامنه: قیمت‌گذاری، سریال‌سازی دوره و کنترل دسترسی (همه در سمت سرور)
import { one, all, j, b } from '../db/index.js';
import { bad } from './http.js';

export function effectivePrice(c, now = new Date().toISOString()) {
  const hasDiscount = c.discount_price != null && c.discount_price < c.price && (!c.discount_expires_at || c.discount_expires_at > now);
  return hasDiscount ? c.discount_price : c.price;
}

export function serializeCourse(c, extra = {}) {
  const now = new Date().toISOString();
  const eff = effectivePrice(c, now);
  return {
    id: c.id, slug: c.slug, kind: c.kind, title: c.title, shortDesc: c.short_desc, fullDesc: c.full_desc,
    coverUrl: c.cover_url, instructor: c.instructor, categoryId: c.category_id, categorySlug: c.category_slug || null,
    categoryTitle: c.category_title || null, level: c.level, badge: c.badge, price: c.price, finalPrice: eff,
    discountActive: eff < c.price, discountExpiresAt: eff < c.price ? c.discount_expires_at : null,
    status: c.status, featured: b(c.featured), durationText: c.duration_text,
    prerequisites: j(c.prerequisites), benefits: j(c.benefits), formulaAccent: c.formula_accent,
    lessonCount: Number(c.lesson_count ?? 0), chapterCount: Number(c.chapter_count ?? 0),
    totalSeconds: Number(c.total_seconds ?? 0), ...extra,
  };
}

export const COURSE_SELECT = `
  SELECT c.*, cat.slug AS category_slug, cat.title AS category_title,
    (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = $PUB) AS lesson_count,
    (SELECT COUNT(*) FROM chapters ch WHERE ch.course_id = c.id) AS chapter_count,
    (SELECT COALESCE(SUM(l.duration_seconds),0) FROM lessons l WHERE l.course_id = c.id AND l.published = $PUB) AS total_seconds
  FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id`;

export async function activeEnrollment(userId, courseId) {
  if (!userId) return null;
  return one('SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2 AND revoked_at IS NULL', [userId, courseId]);
}

/** آیا کاربر مجاز به مشاهده این درس است؟ (تنها مرجع تصمیم‌گیری دسترسی) */
export async function lessonAccess(user, lesson, course) {
  if (user?.role === 'admin') return { allowed: true, reason: 'admin' };
  if (!b(lesson.published)) return { allowed: false, reason: 'unpublished' };
  const enrolled = await activeEnrollment(user?.id, course.id);
  if (enrolled) return { allowed: true, reason: 'enrolled' };
  if (course.status !== 'published') return { allowed: false, reason: 'unavailable' };
  if (lesson.access === 'free') return { allowed: true, reason: 'free' };
  if (lesson.access === 'preview') return user ? { allowed: true, reason: 'preview' } : { allowed: false, reason: 'login' };
  return { allowed: false, reason: user ? 'purchase' : 'login' };
}

/** محاسبه صورت‌حساب کاملاً در سرور؛ قیمت ارسالی از مرورگر هرگز پذیرفته نمی‌شود. */
export async function buildQuote(courseIds, couponCode, userId) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) throw bad('سبد خرید خالی است.');
  const ids = [...new Set(courseIds.map(String))].slice(0, 20);
  const now = new Date().toISOString();
  const items = []; const warnings = [];
  for (const id of ids) {
    const c = await one('SELECT * FROM courses WHERE id = $1', [id]);
    if (!c || c.status !== 'published') { warnings.push({ courseId: id, message: 'این دوره در حال حاضر قابل خرید نیست.' }); continue; }
    if (await activeEnrollment(userId, c.id)) { warnings.push({ courseId: id, message: `«${c.title}» را قبلاً خریده‌اید.` }); continue; }
    items.push({ courseId: c.id, slug: c.slug, title: c.title, listPrice: c.price, unitPrice: effectivePrice(c, now) });
  }
  const subtotal = items.reduce((s, i) => s + i.listPrice, 0);
  const afterCourse = items.reduce((s, i) => s + i.unitPrice, 0);
  let coupon = null; let couponDiscount = 0; let couponError = null;
  const code = String(couponCode || '').trim().toUpperCase();
  if (code) {
    const cp = await one('SELECT * FROM coupons WHERE code = $1', [code]);
    if (!cp || !b(cp.active)) couponError = 'این کد تخفیف معتبر نیست.';
    else if (cp.expires_at && cp.expires_at < now) couponError = 'مهلت استفاده از این کد تخفیف تمام شده است.';
    else if (cp.used_count >= cp.max_usage) couponError = 'ظرفیت این کد تخفیف تمام شده است.';
    else {
      coupon = cp;
      couponDiscount = cp.type === 'percent' ? Math.floor((afterCourse * cp.value) / 100) : Math.min(afterCourse, cp.value);
    }
  }
  const finalAmount = Math.max(0, afterCourse - couponDiscount);
  return {
    items, warnings, subtotal, courseDiscount: subtotal - afterCourse, couponDiscount, discountAmount: subtotal - finalAmount,
    finalAmount, coupon: coupon && { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value }, couponError,
  };
}

export async function getSettings(key, fallback) {
  const row = await one('SELECT value FROM site_settings WHERE key = $1', [key]);
  return row ? j(row.value, fallback) : fallback;
}

export async function curriculum(courseId, { includeUnpublished = false } = {}) {
  const chapters = await all('SELECT * FROM chapters WHERE course_id = $1 ORDER BY sort_order, title', [courseId]);
  const lessons = await all(`SELECT l.*, v.status AS video_status, v.duration_seconds AS video_duration FROM lessons l LEFT JOIN videos v ON v.id = l.video_id WHERE l.course_id = $1 ORDER BY l.sort_order, l.created_at`, [courseId]);
  return chapters.map((ch) => ({
    id: ch.id, title: ch.title, order: ch.sort_order,
    lessons: lessons.filter((l) => l.chapter_id === ch.id && (includeUnpublished || b(l.published))).map((l) => ({
      id: l.id, title: l.title, description: l.description, order: l.sort_order, durationSeconds: l.duration_seconds || l.video_duration || 0,
      access: l.access, published: b(l.published), hasVideo: !!l.video_id && l.video_status === 'ready',
      mathTopic: l.math_topic, formula: l.formula, keyPoints: j(l.key_points),
      ...(includeUnpublished ? { videoId: l.video_id, videoStatus: l.video_status } : {}),
    })),
  }));
}
