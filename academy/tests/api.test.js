import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, gateway } from './helpers.js';

let app; let admin; let student; let other; let courses;
const PW = 'Riazi12345';

async function registerAndVerify(c, phone, name = 'دانش‌آموز تست') {
  const r = await c.post('/api/auth/register', { name, phone, password: PW });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const code = app.sms.sentMessages.filter((m) => m.phone === phone).at(-1).code;
  const v = await c.post('/api/auth/verify', { phone, code });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.data.user;
}

before(async () => {
  app = await startApp();
  admin = client(app.base); student = client(app.base); other = client(app.base);
  // ساخت مدیر مستقیم در DB (معادل اسکریپت create-admin)
  const { q } = await import('../server/db/index.js');
  const now = new Date().toISOString();
  await q("INSERT INTO users (id, name, phone, password_hash, role, status, phone_verified_at, created_at, updated_at) VALUES ($1,'مدیر','09120000000',$2,'admin','active',$3,$3,$3)", [app.sec.uuid(), await app.sec.hashPassword(PW), now]);
});
after(async () => { app.server.close(); app.zp.close(); const { closeDb } = await import('../server/db/index.js'); await closeDb(); });

test('محتوای عمومی سایت و فهرست دوره‌ها', async () => {
  const s = await student.get('/api/site');
  assert.equal(s.status, 200);
  assert.equal(s.data.brand.academyName, 'آکادمی ریاضی استاد علایی‌نسب');
  assert.equal(s.data.categories.length, 3);
  const c = await student.get('/api/courses');
  courses = c.data.courses;
  assert.equal(courses.length, 4);
  assert.ok(courses.every((x) => x.finalPrice <= x.price));
  const d = await student.get(`/api/courses/${courses[0].slug}`);
  assert.equal(d.status, 200);
  assert.ok(d.data.course.chapters.length > 0);
  assert.equal(JSON.stringify(d.data).includes('storage_key'), false, 'کلید فایل نباید افشا شود');
});

test('ثبت‌نام: اعتبارسنجی، جلوگیری از تکرار، OTP', async () => {
  let r = await student.post('/api/auth/register', { name: 'ا', phone: '123', password: '1' });
  assert.equal(r.status, 400);
  r = await student.post('/api/auth/register', { name: 'سارا', phone: '۰۹۱۳۱۱۱۲۲۳۳', password: 'short' });
  assert.equal(r.status, 400);
  await registerAndVerify(student, '09131112233', 'سارا رضایی');
  r = await other.post('/api/auth/register', { name: 'تکراری', phone: '+989131112233', password: PW });
  assert.equal(r.status, 409, 'ثبت‌نام تکراری باید رد شود');
  const me = await student.get('/api/auth/me');
  assert.equal(me.data.user.phone, '09131112233');
  assert.equal(me.data.user.role, 'student');
});

test('ورود ناموفق، ورود موفق، خروج و نشست', async () => {
  const c = client(app.base);
  let r = await c.post('/api/auth/login', { identifier: '09131112233', password: 'wrongpass1' });
  assert.equal(r.status, 401);
  r = await c.post('/api/auth/login', { identifier: '09131112233', password: PW });
  assert.equal(r.status, 200);
  assert.ok(c.cookie.startsWith('session='));
  assert.equal((await c.get('/api/auth/me')).data.user.name, 'سارا رضایی');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('کد OTP اشتباه و محدودیت تلاش', async () => {
  const c = client(app.base);
  await c.post('/api/auth/register', { name: 'امیر', phone: '09125550000', password: PW });
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/verify', { phone: '09125550000', code: '000000' })).status, 400);
  const code = app.sms.sentMessages.filter((m) => m.phone === '09125550000').at(-1).code;
  const r = await c.post('/api/auth/verify', { phone: '09125550000', code });
  assert.equal(r.status, 400, 'پس از ۵ تلاش اشتباه حتی کد درست هم باید رد شود');
  // ورود قبل از تأیید ممنوع
  const l = await c.post('/api/auth/login', { identifier: '09125550000', password: PW });
  assert.equal(l.status, 403); assert.equal(l.data.needsVerification, true);
});

test('بازیابی رمز عبور با OTP', async () => {
  const c = client(app.base);
  app.sec.resetRateLimits(); // کد ثبت‌نام کمتر از یک دقیقه پیش ارسال شده بود
  const s = await c.post('/api/auth/otp', { phone: '09131112233', purpose: 'reset' });
  assert.equal(s.status, 200);
  const code = app.sms.sentMessages.filter((m) => m.phone === '09131112233').at(-1).code;
  const r = await c.post('/api/auth/reset', { phone: '09131112233', code, password: 'NewPass9876' });
  assert.equal(r.status, 200);
  assert.equal((await c.post('/api/auth/login', { identifier: '09131112233', password: PW })).status, 401);
  assert.equal((await student.get('/api/auth/me')).data.user, null, 'نشست‌های قبلی باید باطل شوند');
  assert.equal((await student.post('/api/auth/login', { identifier: '09131112233', password: 'NewPass9876' })).status, 200);
});

test('CSRF: درخواست بدون هدر یا از مبدأ دیگر رد می‌شود', async () => {
  const r = await fetch(app.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  const r2 = await fetch(app.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'academy-web', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r2.status, 403);
});

test('دسترسی: دانش‌آموز به پنل مدیریت راه ندارد', async () => {
  assert.equal((await student.get('/api/admin/stats')).status, 403);
  assert.equal((await client(app.base).get('/api/admin/stats')).status, 401);
  assert.equal((await admin.post('/api/auth/login', { identifier: '09120000000', password: PW })).status, 200);
  const s = await admin.get('/api/admin/stats');
  assert.equal(s.status, 200);
  assert.equal(s.data.revenue.net, 0, 'آمار باید واقعی باشد (هنوز فروشی نداریم)');
});

let course; let lessons;
test('مدیر: ساخت پکیج با تعداد دلخواه ویدیو و مرتب‌سازی', async () => {
  const r = await admin.post('/api/admin/courses', { title: 'پکیج تست شش‌جلسه‌ای', slug: 'test-package-6', kind: 'package', price: 500000, discountPrice: 400000, status: 'draft', categoryId: null });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const bad = await admin.post('/api/admin/courses', { title: 'نامعتبر', slug: 'bad-x', price: 100, discountPrice: 200 });
  assert.equal(bad.status, 400);
  const ch = await admin.post(`/api/admin/courses/${r.data.id}/chapters`, { title: 'فصل اول' });
  for (let i = 1; i <= 6; i++) {
    const l = await admin.post(`/api/admin/chapters/${ch.data.id}/lessons`, { title: `جلسه ${i}`, access: i === 1 ? 'free' : i === 2 ? 'preview' : 'paid', durationSeconds: 600 });
    assert.equal(l.status, 200);
  }
  const full = await admin.get(`/api/admin/courses/${r.data.id}`);
  lessons = full.data.course.chapters[0].lessons;
  assert.equal(lessons.length, 6);
  const reversed = lessons.map((l) => l.id).reverse();
  await admin.post(`/api/admin/chapters/${ch.data.id}/lessons/reorder`, { ids: reversed });
  const after2 = await admin.get(`/api/admin/courses/${r.data.id}`);
  assert.equal(after2.data.course.chapters[0].lessons[0].title, 'جلسه 6');
  // پیش‌نویس برای عموم قابل مشاهده نیست
  assert.equal((await student.get('/api/courses/test-package-6')).status, 404);
  const pub = await admin.put(`/api/admin/courses/${r.data.id}`, { ...full.data.course, slug: 'test-package-6', title: 'پکیج تست شش‌جلسه‌ای', price: 500000, discountPrice: 400000, status: 'published', kind: 'package' });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  course = (await student.get('/api/courses/test-package-6')).data.course;
  assert.equal(course.finalPrice, 400000);
});

let videoId;
test('آپلود چندبخشی ویدیو، ادامه آپلود و اعتبارسنجی نوع فایل', async () => {
  // فایل MP4 ساختگی ۲۳ مگابایتی (سه بخش ۱۰MB) با هدر ftyp معتبر
  const size = 23 * 1024 * 1024;
  const file = Buffer.alloc(size, 7);
  Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(file, 0);
  const rej = await admin.post('/api/admin/videos', { fileName: 'x.exe', size: 100, mime: 'application/x-msdownload' });
  assert.equal(rej.status, 400);
  const tooBig = await admin.post('/api/admin/videos', { fileName: 'big.mp4', size: 100 * 1024 * 1024, mime: 'video/mp4' });
  assert.equal(tooBig.status, 400);
  const init = await admin.post('/api/admin/videos', { fileName: 'lesson1.mp4', size, mime: 'video/mp4', duration: 612 });
  assert.equal(init.status, 200);
  videoId = init.data.id;
  assert.equal(init.data.partCount, 3);
  const urls = (await admin.post(`/api/admin/videos/${videoId}/part-urls`, { parts: [1, 2, 3] })).data.urls;
  const ps = init.data.partSize; const etags = {};
  // آپلود بخش ۱ و ۲، سپس «قطع اتصال»
  for (const u of urls.slice(0, 2)) {
    const r = await fetch(app.base + u.url, { method: 'PUT', body: file.subarray((u.n - 1) * ps, u.n * ps) });
    assert.equal(r.status, 200); etags[u.n] = r.headers.get('etag');
  }
  const listed = await admin.get(`/api/admin/videos/${videoId}/parts`);
  assert.deepEqual(listed.data.parts.map((p) => p.n).sort(), [1, 2], 'باید بخش‌های آپلودشده برای ادامه قابل بازیابی باشند');
  // لینک دست‌کاری‌شده رد می‌شود
  const tampered = await fetch(app.base + urls[2].url.replace(/sig=[^&]+/, 'sig=AAAA'), { method: 'PUT', body: Buffer.alloc(10) });
  assert.equal(tampered.status, 403);
  const r3 = await fetch(app.base + urls[2].url, { method: 'PUT', body: file.subarray(2 * ps) });
  etags[3] = r3.headers.get('etag');
  const incomplete = await admin.post(`/api/admin/videos/${videoId}/complete`, { parts: [{ n: 1, etag: etags[1] }] });
  assert.equal(incomplete.status, 400);
  const done = await admin.post(`/api/admin/videos/${videoId}/complete`, { parts: [1, 2, 3].map((n) => ({ n, etag: etags[n] })) });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const vids = await admin.get('/api/admin/videos');
  assert.equal(vids.data.videos.find((v) => v.id === videoId).status, 'ready');
  // فایل غیرویدیویی با پسوند mp4 رد می‌شود
  const fake = await admin.post('/api/admin/videos', { fileName: 'fake.mp4', size: 1000, mime: 'video/mp4' });
  const fu = (await admin.post(`/api/admin/videos/${fake.data.id}/part-urls`, { parts: [1] })).data.urls[0];
  const fr = await fetch(app.base + fu.url, { method: 'PUT', body: Buffer.alloc(1000, 65) });
  const fc = await admin.post(`/api/admin/videos/${fake.data.id}/complete`, { parts: [{ n: 1, etag: fr.headers.get('etag') }] });
  assert.equal(fc.status, 400);
  // اتصال ویدیو به همه جلسات پکیج
  const full = await admin.get(`/api/admin/courses/${course.id}`);
  for (const l of full.data.course.chapters[0].lessons) {
    const u = await admin.put(`/api/admin/lessons/${l.id}`, { ...l, videoId });
    assert.equal(u.status, 200, JSON.stringify(u.data));
  }
});

test('پخش: درس رایگان/پیش‌نمایش/پولی و لینک امضاشده زمان‌دار', async () => {
  const d = (await student.get('/api/courses/test-package-6')).data.course;
  const all = d.chapters[0].lessons;
  const free = all.find((l) => l.access === 'free'); const preview = all.find((l) => l.access === 'preview'); const paid = all.find((l) => l.access === 'paid');
  const anon = client(app.base);
  assert.equal((await anon.get(`/api/lessons/${free.id}/play`)).status, 200);
  assert.equal((await anon.get(`/api/lessons/${preview.id}/play`)).status, 401);
  assert.equal((await student.get(`/api/lessons/${preview.id}/play`)).status, 200);
  const locked = await student.get(`/api/lessons/${paid.id}/play`);
  assert.equal(locked.status, 403, 'درس پولی بدون خرید نباید باز شود');
  const play = await anon.get(`/api/lessons/${free.id}/play`);
  const media = await fetch(app.base + play.data.video.url, { headers: { Range: 'bytes=0-99' } });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 100);
  const forged = await fetch(app.base + play.data.video.url.replace(/exp=\d+/, 'exp=9999999999'));
  assert.equal(forged.status, 403, 'تغییر زمان انقضا باید امضا را باطل کند');
});

let orderNumber;
test('خرید: لغو در درگاه ← ناموفق و بدون دسترسی', async () => {
  const q1 = await student.post('/api/checkout/quote', { courseIds: [course.id], couponCode: 'MATH20' });
  assert.equal(q1.data.quote.finalAmount, 320000);
  const tamper = await student.post('/api/checkout', { courseIds: [course.id], price: 1, finalAmount: 1 });
  assert.equal(tamper.status, 200);
  const num = tamper.data.orderNumber;
  const authority = new URL(tamper.data.redirectUrl).pathname.split('/').pop();
  assert.equal(gateway.payments.get(authority).amount, 4000000, 'مبلغ باید از سرور (۴۰۰٬۰۰۰ تومان = ۴٬۰۰۰٬۰۰۰ ریال) محاسبه شود');
  const cb = await fetch(`${app.base}/api/payment/zarinpal/callback?Authority=${authority}&Status=NOK`, { redirect: 'manual' });
  assert.equal(cb.status, 302);
  const o = await student.get(`/api/orders/${num}`);
  assert.equal(o.data.order.status, 'failed');
  const paid = course.chapters[0].lessons.find((l) => l.access === 'paid');
  assert.equal((await student.get(`/api/lessons/${paid.id}/play`)).status, 403);
});

test('خرید: Status=OK جعلی بدون پرداخت واقعی ← رد', async () => {
  const r2 = await student.post('/api/checkout', { courseIds: [course.id] });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  const dup = await student.post('/api/checkout', { courseIds: [course.id] });
  assert.equal(dup.status, 409, 'سفارش هم‌زمان تکراری باید رد شود');
  const authority = new URL(r2.data.redirectUrl).pathname.split('/').pop();
  await fetch(`${app.base}/api/payment/zarinpal/callback?Authority=${authority}&Status=OK`, { redirect: 'manual' });
  assert.equal((await student.get(`/api/orders/${r2.data.orderNumber}`)).data.order.status, 'failed');
  assert.equal((await student.get('/api/me/courses')).data.courses.length, 0);
});

test('خرید موفق با کد تخفیف، تأیید سرور، جلوگیری از ثبت تکراری', async () => {
  const { q } = await import('../server/db/index.js');
  await q("UPDATE orders SET created_at = $1 WHERE status IN ('pending','failed')", [new Date(Date.now() - 10 * 60_000).toISOString()]);
  const r = await student.post('/api/checkout', { courseIds: [course.id], couponCode: 'math20' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  orderNumber = r.data.orderNumber;
  const authority = new URL(r.data.redirectUrl).pathname.split('/').pop();
  assert.equal(gateway.payments.get(authority).amount, 3200000);
  gateway.payments.get(authority).paid = true;
  // خطای ارتباطی هنگام verify ← سفارش در انتظار می‌ماند
  gateway.failNext = true;
  await fetch(`${app.base}/api/payment/zarinpal/callback?Authority=${authority}&Status=OK`, { redirect: 'manual' });
  assert.equal((await student.get(`/api/orders/${orderNumber}`)).data.order.status, 'pending');
  // تلاش دوباره (مثلاً رفرش صفحه بازگشت)
  await fetch(`${app.base}/api/payment/zarinpal/callback?Authority=${authority}&Status=OK`, { redirect: 'manual' });
  const o = (await student.get(`/api/orders/${orderNumber}`)).data.order;
  assert.equal(o.status, 'paid');
  assert.equal(o.payments.at(-1).refId, '201');
  const calls = gateway.verifyCalls;
  await fetch(`${app.base}/api/payment/zarinpal/callback?Authority=${authority}&Status=OK`, { redirect: 'manual' });
  assert.equal(gateway.verifyCalls, calls, 'callback تکراری نباید دوباره پردازش شود');
  const mine = (await student.get('/api/me/courses')).data.courses;
  assert.equal(mine.length, 1);
  const paid = course.chapters[0].lessons.find((l) => l.access === 'paid');
  assert.equal((await student.get(`/api/lessons/${paid.id}/play`)).status, 200);
  const coupons = (await admin.get('/api/admin/coupons')).data.coupons;
  assert.equal(coupons.find((c) => c.code === 'MATH20').used_count, 1);
  // خرید دوباره همان دوره ممکن نیست
  const again = await student.post('/api/checkout', { courseIds: [course.id] });
  assert.equal(again.status, 400);
});

test('کاربر دیگر به دوره و سفارش دیگران دسترسی ندارد', async () => {
  await registerAndVerify(other, '09351234567', 'کاربر دیگر');
  const paid = course.chapters[0].lessons.find((l) => l.access === 'paid');
  assert.equal((await other.get(`/api/lessons/${paid.id}/play`)).status, 403);
  assert.equal((await other.get(`/api/orders/${orderNumber}`)).status, 404);
  assert.equal((await other.post('/api/progress', { lessonId: paid.id, position: 10 })).status, 403);
});

test('پیشرفت آموزشی: ذخیره موقعیت و تکمیل', async () => {
  const paid = course.chapters[0].lessons.find((l) => l.access === 'paid');
  assert.equal((await student.post('/api/progress', { lessonId: paid.id, position: 125 })).status, 200);
  assert.equal((await student.get(`/api/lessons/${paid.id}/play`)).data.position, 125);
  await student.post('/api/progress', { lessonId: paid.id, position: 600, completed: true });
  const mine = (await student.get('/api/me/courses')).data.courses[0];
  assert.equal(mine.completedLessons, 1);
});

test('مدیر: آمار واقعی، گزارش CSV، بازگشت وجه و لغو دسترسی', async () => {
  const s = (await admin.get('/api/admin/stats')).data;
  assert.equal(s.revenue.net, 320000);
  assert.equal(s.orders.paid, 1);
  const csv = await admin.get('/api/admin/reports/sales?format=csv');
  assert.ok(String(csv.data).includes(orderNumber));
  const del = await admin.del(`/api/admin/courses/${course.id}`);
  assert.equal(del.data.archived, true, 'دوره دارای فروش نباید حذف شود');
  const ref = await admin.post(`/api/admin/orders/${orderNumber}/refund`, { note: 'درخواست دانش‌آموز طبق قوانین بازپرداخت' });
  assert.equal(ref.status, 200);
  const paid = course.chapters[0].lessons.find((l) => l.access === 'paid');
  assert.equal((await student.get(`/api/lessons/${paid.id}/play`)).status, 403);
  const logs = (await admin.get('/api/admin/logs')).data;
  assert.ok(logs.audit.some((a) => a.action === 'order.refund'));
});

test('مدیر نمی‌تواند نقش خودش را حذف کند؛ مسدودسازی کاربر نشست را باطل می‌کند', async () => {
  const me = (await admin.get('/api/auth/me')).data.user;
  assert.equal((await admin.patch(`/api/admin/users/${me.id}`, { role: 'student' })).status, 403);
  const o = (await other.get('/api/auth/me')).data.user;
  await admin.patch(`/api/admin/users/${o.id}`, { status: 'blocked' });
  assert.equal((await other.get('/api/auth/me')).data.user, null);
});

test('ورودی مخرب ذخیره می‌شود ولی اجرا نمی‌شود (XSS) و SQL Injection بی‌اثر است', async () => {
  const r = await student.post('/api/me/tickets', { subject: '<img src=x onerror=alert(1)>', message: "'; DROP TABLE users; --" });
  assert.equal(r.status, 200);
  const t = (await student.get('/api/me/tickets')).data.tickets[0];
  assert.equal(t.subject, '<img src=x onerror=alert(1)>'); // متن خام؛ فرانت آن را escape می‌کند
  assert.equal((await student.get("/api/courses?q=' OR 1=1 --")).data.courses.length, 0);
  const l = await client(app.base).post('/api/auth/login', { identifier: "09131112233' --", password: 'x' });
  assert.ok([400, 401].includes(l.status));
});

test('دستیار: بدون کلید سرور به موتور محلی برمی‌گردد', async () => {
  const r = await student.post('/api/ai/chat', { messages: [{ role: 'user', content: '2x+5=17' }], mode: 'step' });
  assert.equal(r.status, 200);
  assert.equal(r.data.fallback, true);
});
