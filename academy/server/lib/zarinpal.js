// اتصال به API رسمی زرین‌پال نسخه ۴
// مستندات: https://www.zarinpal.com/docs/paymentGateway/
import { config } from '../config.js';

const base = () => config.zarinpal.baseUrlOverride || (config.zarinpal.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com');

async function call(path, body) {
  const r = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => null);
  if (!data) throw new Error(`پاسخ نامعتبر از درگاه (HTTP ${r.status})`);
  return data;
}

/** درخواست ایجاد تراکنش. مبلغ به ریال. */
export async function requestPayment({ amountRial, description, callbackUrl, mobile, orderNumber }) {
  if (!config.zarinpal.merchantId) throw new Error('ZARINPAL_MERCHANT_ID تنظیم نشده است.');
  const data = await call('/pg/v4/payment/request.json', {
    merchant_id: config.zarinpal.merchantId,
    amount: amountRial,
    currency: 'IRR',
    description: description.slice(0, 255),
    callback_url: callbackUrl,
    metadata: { mobile, order_id: orderNumber },
  });
  const code = data?.data?.code;
  if (code !== 100 || !data.data.authority) {
    const err = data?.errors;
    throw Object.assign(new Error(`درگاه درخواست را نپذیرفت: ${err?.message || code}`), { gatewayCode: err?.code ?? code });
  }
  return { authority: data.data.authority, redirectUrl: `${base()}/pg/StartPay/${data.data.authority}` };
}

/** تأیید تراکنش در سمت سرور. code=100 موفق، 101 قبلاً تأیید شده. */
export async function verifyPayment({ amountRial, authority }) {
  const data = await call('/pg/v4/payment/verify.json', {
    merchant_id: config.zarinpal.merchantId,
    amount: amountRial,
    authority,
  });
  const d = data?.data || {};
  const code = typeof d.code === 'number' ? d.code : data?.errors?.code;
  return {
    ok: code === 100 || code === 101,
    code,
    refId: d.ref_id ? String(d.ref_id) : null,
    cardPan: d.card_pan || null,
    message: d.message || data?.errors?.message || '',
  };
}
