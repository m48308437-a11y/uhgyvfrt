// بارگذاری و اعتبارسنجی متغیرهای محیطی. هیچ کلید محرمانه‌ای در کد قرار نمی‌گیرد.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// بارگذاری ساده فایل .env (بدون وابستگی خارجی). متغیرهای واقعی محیط اولویت دارند.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const env = process.env;
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));
const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: int(env.PORT, 3000),
  origin: (env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL || '',
  databaseSsl: bool(env.DATABASE_SSL),
  sqlitePath: env.SQLITE_PATH || path.join(ROOT, 'data', 'dev.sqlite'),
  secret: env.APP_SECRET || '',
  sessionDays: int(env.SESSION_DAYS, 30),
  sms: {
    provider: env.SMS_PROVIDER || 'console',
    kavenegarKey: env.KAVENEGAR_API_KEY || '',
    kavenegarTemplate: env.KAVENEGAR_TEMPLATE || 'verify',
    smsirKey: env.SMSIR_API_KEY || '',
    smsirTemplateId: env.SMSIR_TEMPLATE_ID || '',
  },
  zarinpal: {
    merchantId: env.ZARINPAL_MERCHANT_ID || '',
    sandbox: bool(env.ZARINPAL_SANDBOX, true),
    // فقط برای تست خودکار (Mock). در production نادیده گرفته می‌شود.
    baseUrlOverride: env.NODE_ENV === 'production' ? '' : env.ZARINPAL_BASE_URL || '',
  },
  storage: {
    provider: env.STORAGE_PROVIDER || 'local',
    localDir: path.resolve(ROOT, env.LOCAL_STORAGE_DIR || './storage-private'),
    maxVideoBytes: int(env.MAX_VIDEO_SIZE_MB, 4096) * 1024 * 1024,
    s3: {
      endpoint: (env.S3_ENDPOINT || '').replace(/\/$/, ''),
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || '',
      accessKey: env.S3_ACCESS_KEY || '',
      secretKey: env.S3_SECRET_KEY || '',
      forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, true),
    },
    videoUrlTtl: int(env.VIDEO_URL_TTL, 7200),
  },
  ai: { url: env.AI_API_URL || '', key: env.AI_API_KEY || '', model: env.AI_MODEL || '' },
};

// بررسی‌های سخت‌گیرانه در production: سرور بدون تنظیمات امن بالا نمی‌آید.
export function assertProductionConfig() {
  const errors = [];
  if (!config.secret || config.secret.length < 32) errors.push('APP_SECRET باید حداقل ۳۲ کاراکتر باشد.');
  if (config.isProd) {
    if (!config.databaseUrl.startsWith('postgres')) errors.push('در production باید DATABASE_URL به PostgreSQL اشاره کند.');
    if (!config.origin.startsWith('https://')) errors.push('APP_ORIGIN در production باید https باشد.');
    if (config.sms.provider === 'console' || config.sms.provider === 'memory') errors.push('SMS_PROVIDER در production باید kavenegar یا smsir باشد.');
    if (!config.zarinpal.merchantId) errors.push('ZARINPAL_MERCHANT_ID تنظیم نشده است.');
    if (config.storage.provider === 's3') {
      const s = config.storage.s3;
      if (!s.endpoint || !s.bucket || !s.accessKey || !s.secretKey) errors.push('تنظیمات S3 ناقص است.');
    }
  }
  if (errors.length) {
    const msg = 'پیکربندی نامعتبر:\n - ' + errors.join('\n - ');
    if (config.isProd || !config.secret) throw new Error(msg);
    console.warn(msg);
  }
}
