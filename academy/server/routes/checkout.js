import { q, one, all, tx } from '../db/index.js';
import { readJson, bad, notFound, redirect, HttpError, conflict } from '../lib/http.js';
import { buildQuote } from '../lib/domain.js';
import { requireUser, requireVerified } from '../lib/auth.js';
import { uuid, rateLimit } from '../lib/security.js';
import { requestPayment, verifyPayment } from '../lib/zarinpal.js';
import { audit, logError } from '../lib/log.js';
import { config } from '../config.js';

const orderNumber = () => {
  const d = new Date();
  return `AL-${d.getUTCFullYear().toString().slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${uuid().slice(0, 8).toUpperCase()}`;
};

/** نهایی‌سازی سفارش پرداخت‌شده: idempotent و داخل تراکنش */
export async function fulfillOrder(orderId, { source = 'purchase' } = {}) {
  const order = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!order) throw new Error('order not found');
  if (order.status === 'paid') return false;
  const now = new Date().toISOString();
  const upd = await q("UPDATE orders SET status = 'paid', paid_at = $1, updated_at = $1 WHERE id = $2 AND status IN ('pending','failed','cancelled')", [now, orderId]);
  if (upd.rowCount !== 1) return false;
  const items = await all('SELECT course_id FROM order_items WHERE order_id = $1', [orderId]);
  for (const it of items) {
    await q(`INSERT INTO enrollments (id, user_id, course_id, source, order_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (user_id, course_id) DO UPDATE SET revoked_at = NULL, order_id = EXCLUDED.order_id, source = EXCLUDED.source`,
      [uuid(), order.user_id, it.course_id, source, orderId, now]);
  }
  if (order.coupon_id) {
    const c = await q('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND used_count < max_usage', [order.coupon_id]);
    if (c.rowCount === 0) await logError('checkout', 'coupon capacity exceeded after payment', { orderId }, 'warning');
  }
  return true;
}

export const serializeOrder = (o, items = [], payments = []) => ({
  id: o.id, number: o.order_number, status: o.status, subtotal: o.subtotal, discountAmount: o.discount_amount, finalAmount: o.final_amount,
  couponCode: o.coupon_code, createdAt: o.created_at, paidAt: o.paid_at,
  items: items.map((i) => ({ courseId: i.course_id, title: i.title_snapshot, listPrice: i.list_price, unitPrice: i.unit_price, slug: i.slug })),
  payments: payments.map((p) => ({ gateway: p.gateway, status: p.status, refId: p.ref_id, cardPan: p.card_pan, createdAt: p.created_at, verifiedAt: p.verified_at, message: p.gateway_message })),
});

async function startGatewayPayment(order, user) {
  const amountRial = order.final_amount * 10; // تومان ← ریال
  const paymentId = uuid();
  await q('INSERT INTO payments (id, order_id, gateway, amount_rial, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [paymentId, order.id, 'zarinpal', amountRial, 'initiated', new Date().toISOString()]);
  try {
    const { authority, redirectUrl } = await requestPayment({
      amountRial, description: `خرید دوره — سفارش ${order.order_number}`, callbackUrl: `${config.origin}/api/payment/zarinpal/callback`,
      mobile: user.phone, orderNumber: order.order_number,
    });
    await q('UPDATE payments SET authority = $1 WHERE id = $2', [authority, paymentId]);
    return redirectUrl;
  } catch (e) {
    await q("UPDATE payments SET status = 'failed', gateway_message = $1, gateway_code = $2 WHERE id = $3", [e.message.slice(0, 300), e.gatewayCode ?? null, paymentId]);
    await logError('zarinpal.request', e.message, { order: order.order_number });
    throw new HttpError(502, 'اتصال به درگاه پرداخت برقرار نشد؛ سفارش شما ذخیره شد و می‌توانید چند دقیقه دیگر از «سفارش‌های من» دوباره پرداخت کنید.', { orderNumber: order.order_number });
  }
}

export default function checkoutRoutes(r) {
  r.post('/api/checkout/quote', async (ctx) => {
    const b = await readJson(ctx.req);
    const rl = rateLimit(`quote:${ctx.ip}`, 60, 60_000);
    if (!rl.ok) throw new HttpError(429, 'درخواست‌ها زیاد است.');
    return { quote: await buildQuote(b.courseIds, b.couponCode, ctx.user?.id) };
  });

  r.post('/api/checkout', async (ctx) => {
    const user = requireVerified(ctx);
    const b = await readJson(ctx.req);
    const rl = rateLimit(`checkout:${user.id}`, 10, 10 * 60_000);
    if (!rl.ok) throw new HttpError(429, 'تعداد تلاش‌های پرداخت زیاد است؛ کمی صبر کنید.');
    const quote = await buildQuote(b.courseIds, b.couponCode, user.id);
    if (quote.couponError) throw bad(quote.couponError);
    if (!quote.items.length) throw bad(quote.warnings[0]?.message || 'هیچ دوره قابل خریدی در سبد نیست.');
    if (quote.finalAmount > 0 && quote.finalAmount < 1000) throw bad('حداقل مبلغ قابل پرداخت در درگاه ۱٬۰۰۰ تومان است.');
    // جلوگیری از سفارش تکراری هم‌زمان برای همان دوره‌ها
    const pending = await one(`SELECT o.order_number FROM orders o JOIN order_items i ON i.order_id = o.id
                               WHERE o.user_id = $1 AND o.status = 'pending' AND o.created_at > $2 AND i.course_id = $3 LIMIT 1`,
      [user.id, new Date(Date.now() - 2 * 60_000).toISOString(), quote.items[0].courseId]);
    if (pending) throw conflict(`یک سفارش در حال پرداخت برای همین دوره دارید (${pending.order_number}). از «سفارش‌های من» ادامه دهید یا ۲ دقیقه بعد دوباره تلاش کنید.`);

    const order = { id: uuid(), order_number: orderNumber(), final_amount: quote.finalAmount };
    const now = new Date().toISOString();
    await tx(async () => {
      await q(`INSERT INTO orders (id, order_number, user_id, status, subtotal, discount_amount, final_amount, coupon_id, coupon_code, created_at, updated_at)
               VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$9)`,
        [order.id, order.order_number, user.id, quote.subtotal, quote.discountAmount, quote.finalAmount, quote.coupon?.id || null, quote.coupon?.code || null, now]);
      for (const it of quote.items) {
        await q('INSERT INTO order_items (id, order_id, course_id, title_snapshot, list_price, unit_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), order.id, it.courseId, it.title, it.listPrice, it.unitPrice]);
      }
    });
    await audit(user.id, 'order.create', 'order', order.order_number, { final: quote.finalAmount }, ctx.ip);

    if (quote.finalAmount === 0) {
      // سفارش رایگان (دوره رایگان یا کد ۱۰۰٪): بدون درگاه، چون مبلغی دریافت نمی‌شود
      await tx(async () => {
        await q('INSERT INTO payments (id, order_id, gateway, amount_rial, status, created_at, verified_at) VALUES ($1,$2,$3,0,$4,$5,$5)', [uuid(), order.id, 'free', 'verified', now]);
        await fulfillOrder(order.id, { source: 'free' });
      });
      return { ok: true, orderNumber: order.order_number, redirectUrl: `/payment/result?order=${order.order_number}` };
    }
    const redirectUrl = await startGatewayPayment(order, user);
    return { ok: true, orderNumber: order.order_number, redirectUrl };
  });

  // پرداخت مجدد سفارش در انتظار/ناموفق (با همان مبلغ قفل‌شده هنگام ثبت سفارش)
  r.post('/api/orders/:number/pay', async (ctx) => {
    const user = requireVerified(ctx);
    const order = await one('SELECT * FROM orders WHERE order_number = $1 AND user_id = $2', [ctx.params.number, user.id]);
    if (!order) throw notFound('سفارش پیدا نشد.');
    if (!['pending', 'failed'].includes(order.status)) throw bad('این سفارش قابل پرداخت نیست.');
    if (Date.now() - new Date(order.created_at).getTime() > 3 * 86400_000) throw bad('مهلت پرداخت این سفارش گذشته است؛ سفارش جدید ثبت کنید.');
    const items = await all('SELECT i.course_id, c.status FROM order_items i JOIN courses c ON c.id = i.course_id WHERE i.order_id = $1', [order.id]);
    for (const it of items) {
      if (it.status !== 'published') throw bad('یکی از دوره‌های این سفارش دیگر فروخته نمی‌شود؛ سفارش جدید ثبت کنید.');
      if (await one('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND revoked_at IS NULL', [user.id, it.course_id])) throw bad('یکی از دوره‌های این سفارش را قبلاً خریده‌اید؛ سفارش جدید ثبت کنید.');
    }
    await q("UPDATE orders SET status = 'pending', updated_at = $1 WHERE id = $2", [new Date().toISOString(), order.id]);
    return { ok: true, redirectUrl: await startGatewayPayment(order, user) };
  });

  // بازگشت از درگاه: فقط تأیید سرور-به-سرور با API رسمی معتبر است
  r.get('/api/payment/zarinpal/callback', async (ctx) => {
    const authority = String(ctx.query.Authority || '').slice(0, 64);
    const status = String(ctx.query.Status || '');
    const payment = authority ? await one('SELECT * FROM payments WHERE authority = $1', [authority]) : null;
    if (!payment) return redirect(ctx.res, '/payment/result?error=unknown');
    const order = await one('SELECT * FROM orders WHERE id = $1', [payment.order_id]);
    const dest = `/payment/result?order=${encodeURIComponent(order.order_number)}`;
    if (payment.status !== 'initiated') return redirect(ctx.res, dest); // قبلاً پردازش شده (جلوگیری از ثبت تکراری)

    if (status !== 'OK') {
      await tx(async () => {
        const p = await one('SELECT status FROM payments WHERE id = $1 FOR UPDATE', [payment.id]);
        if (p.status !== 'initiated') return;
        await q("UPDATE payments SET status = 'cancelled', gateway_message = $1 WHERE id = $2", ['لغو توسط کاربر یا ناموفق در درگاه', payment.id]);
        await q("UPDATE orders SET status = 'failed', updated_at = $1 WHERE id = $2 AND status = 'pending'", [new Date().toISOString(), order.id]);
      });
      return redirect(ctx.res, dest);
    }

    let result;
    try { result = await verifyPayment({ amountRial: Number(payment.amount_rial), authority }); }
    catch (e) {
      // خطای ارتباطی: وضعیت را تغییر نمی‌دهیم تا بعداً با «بررسی مجدد» قابل تأیید باشد
      await logError('zarinpal.verify', e.message, { order: order.order_number });
      return redirect(ctx.res, dest + '&pending=1');
    }
    await settleVerification(payment.id, result);
    return redirect(ctx.res, dest);
  });

  r.get('/api/orders', async (ctx) => {
    const u = requireUser(ctx);
    const orders = await all('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [u.id]);
    const out = [];
    for (const o of orders) out.push(serializeOrder(o, await all('SELECT i.*, c.slug FROM order_items i JOIN courses c ON c.id = i.course_id WHERE i.order_id = $1', [o.id]), await all('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at', [o.id])));
    return { orders: out };
  });

  r.get('/api/orders/:number', async (ctx) => {
    const u = requireUser(ctx);
    const o = await one('SELECT * FROM orders WHERE order_number = $1', [ctx.params.number]);
    if (!o || (o.user_id !== u.id && u.role !== 'admin')) throw notFound('سفارش پیدا نشد.');
    return { order: serializeOrder(o, await all('SELECT i.*, c.slug FROM order_items i JOIN courses c ON c.id = i.course_id WHERE i.order_id = $1', [o.id]), await all('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at', [o.id])) };
  });

  r.post('/api/orders/:number/cancel', async (ctx) => {
    const u = requireUser(ctx);
    const o = await one('SELECT * FROM orders WHERE order_number = $1 AND user_id = $2', [ctx.params.number, u.id]);
    if (!o) throw notFound('سفارش پیدا نشد.');
    const r2 = await q("UPDATE orders SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND status IN ('pending','failed')", [new Date().toISOString(), o.id]);
    if (!r2.rowCount) throw bad('فقط سفارش‌های پرداخت‌نشده قابل لغو هستند.');
    await q("UPDATE payments SET status = 'cancelled' WHERE order_id = $1 AND status = 'initiated'", [o.id]);
    return { ok: true };
  });
}

/** ثبت نتیجه تأیید درگاه (مشترک بین callback و بررسی مجدد مدیر) */
export async function settleVerification(paymentId, result) {
  return tx(async () => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    if (p.status !== 'initiated') return p.status;
    const now = new Date().toISOString();
    if (result.ok) {
      await q("UPDATE payments SET status = 'verified', ref_id = $1, card_pan = $2, gateway_code = $3, gateway_message = $4, verified_at = $5 WHERE id = $6",
        [result.refId, result.cardPan, result.code, result.message || null, now, p.id]);
      await fulfillOrder(p.order_id);
      await audit(null, 'payment.verified', 'order', p.order_id, { refId: result.refId });
      return 'verified';
    }
    await q("UPDATE payments SET status = 'failed', gateway_code = $1, gateway_message = $2 WHERE id = $3", [result.code ?? null, result.message || 'تأیید نشد', p.id]);
    await q("UPDATE orders SET status = 'failed', updated_at = $1 WHERE id = $2 AND status = 'pending'", [now, p.order_id]);
    return 'failed';
  });
}
