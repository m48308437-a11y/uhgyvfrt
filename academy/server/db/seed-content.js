// وارد کردن محتوای اصلی سایت قبلی (دسته‌بندی پایه‌ها، دوره‌ها، فصل‌ها، جلسات، مقالات، برند و FAQ)
// این داده‌ها «محتوای آموزشی» واقعی سایت هستند؛ هیچ کاربر، سفارش یا پرداخت ساختگی ساخته نمی‌شود.
// اجرای مجدد امن است: اگر قبلاً دوره‌ای وجود داشته باشد، کاری انجام نمی‌دهد.
import fs from 'node:fs';
import { q, one, tx } from './index.js';
import { uuid } from '../lib/security.js';
import { DEFAULT_BRAND, DEFAULT_FAQ, DEFAULT_AI, GRADES } from './defaults.js';

const faToEn = (s) => String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
// پایان روز ۱۴۰۵/۰۸/۳۰ به وقت تهران (تاریخ پایان تخفیف در سایت قبلی)
const JALALI_END = { '۱۴۰۵/۰۸/۳۰': '2026-11-21T20:29:59.000Z' };
const toSeconds = (d) => { const [m, s] = faToEn(d).split(':').map(Number); return (m || 0) * 60 + (s || 0); };

export async function seedContent({ withDevCoupons = false } = {}) {
  const content = JSON.parse(fs.readFileSync(new URL('./content.json', import.meta.url), 'utf8'));
  if (await one('SELECT id FROM courses LIMIT 1')) return { skipped: true };
  const now = new Date().toISOString();
  await tx(async () => {
    for (const [key, value] of [['brand', DEFAULT_BRAND], ['faq', DEFAULT_FAQ], ['ai', DEFAULT_AI]]) {
      await q('INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value), now]);
    }
    const catIds = {};
    for (const [i, g] of GRADES.entries()) {
      catIds[g.id] = uuid();
      await q('INSERT INTO categories (id, slug, title, sort_order) VALUES ($1,$2,$3,$4)', [catIds[g.id], `grade-${g.id}`, g.title.replace('ریاضی ', ''), i]);
    }
    for (const [ci, c] of content.courses.entries()) {
      const courseId = uuid();
      await q(`INSERT INTO courses (id, slug, kind, title, short_desc, full_desc, instructor, category_id, level, badge, price, discount_price,
                 status, featured, duration_text, prerequisites, benefits, formula_accent, sort_order, created_at, updated_at, discount_expires_at)
               VALUES ($1,$2,'course',$3,$4,$5,$6,$7,'all',$8,$9,$10,'published',$11,$12,$13,$14,$15,$16,$17,$17,$18)`,
        [courseId, c.slug, c.title, c.shortDesc, c.fullDesc, c.instructor, catIds[c.grade], c.badge, c.price, c.discountPrice,
          !!c.featured, c.durationText, JSON.stringify(c.prerequisites), JSON.stringify(c.benefits), c.formulaAccent, ci, now, JALALI_END[c.discountExpiresAt] || null]);
      for (const [chi, ch] of c.chapters.entries()) {
        const chId = uuid();
        await q('INSERT INTO chapters (id, course_id, title, sort_order) VALUES ($1,$2,$3,$4)', [chId, courseId, ch.title, chi]);
        for (const [li, l] of ch.lessons.entries()) {
          await q(`INSERT INTO lessons (id, course_id, chapter_id, title, description, sort_order, duration_seconds, access, published, math_topic, formula, key_points, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
            [uuid(), courseId, chId, l.title, l.description, li, toSeconds(l.duration), l.isFree ? 'free' : 'paid', l.isPublished !== false, l.mathTopic, l.formula, JSON.stringify(l.keyPoints || []), now]);
        }
      }
    }
    for (const [i, a] of content.articles.entries()) {
      await q('INSERT INTO articles (id, slug, title, category, grade, read_time, excerpt, content, published, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [uuid(), `article-${i + 1}`, a.title, a.category, a.grade, a.readTime, a.excerpt, a.content, true, new Date(Date.now() - (3 - i) * 86400_000).toISOString()]);
    }
    if (withDevCoupons) {
      for (const cp of content.coupons) {
        await q('INSERT INTO coupons (id, code, type, value, max_usage, used_count, active, description, created_at) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8)',
          [uuid(), cp.code, cp.type, cp.value, cp.maxUsage, true, cp.description + ' (نمونه توسعه)', now]);
      }
    }
  });
  return { skipped: false };
}
