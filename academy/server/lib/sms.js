// ارسال کد یکبارمصرف از طریق سرویس پیامک واقعی (کاوه‌نگار یا SMS.ir)
import { config } from '../config.js';

export const sentMessages = []; // فقط برای provider=memory در تست خودکار

async function kavenegar(phone, code) {
  const { kavenegarKey, kavenegarTemplate } = config.sms;
  const url = `https://api.kavenegar.com/v1/${encodeURIComponent(kavenegarKey)}/verify/lookup.json?` +
    new URLSearchParams({ receptor: phone, token: code, template: kavenegarTemplate });
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.return?.status !== 200) throw new Error(`Kavenegar: ${body?.return?.message || r.status}`);
}

async function smsir(phone, code) {
  const r = await fetch('https://api.sms.ir/v1/send/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': config.sms.smsirKey },
    body: JSON.stringify({ mobile: phone, templateId: Number(config.sms.smsirTemplateId), parameters: [{ name: 'CODE', value: code }] }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.status !== 1) throw new Error(`SMS.ir: ${body?.message || r.status}`);
}

export async function sendOtp(phone, code) {
  switch (config.sms.provider) {
    case 'kavenegar': return kavenegar(phone, code);
    case 'smsir': return smsir(phone, code);
    case 'memory':
      if (!config.isTest) throw new Error('memory SMS provider فقط در تست مجاز است');
      sentMessages.push({ phone, code }); return;
    case 'console':
      if (config.isProd) throw new Error('console SMS provider در production مجاز نیست');
      console.log(`\n[DEV SMS] کد تأیید برای ${phone}: ${code}\n`); return;
    default: throw new Error('SMS_PROVIDER نامعتبر است');
  }
}
