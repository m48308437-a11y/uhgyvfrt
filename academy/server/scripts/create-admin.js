// ساخت یا ارتقای حساب مدیر از خط فرمان (هیچ رمز پیش‌فرضی در کد وجود ندارد)
// استفاده: npm run create-admin -- --phone 09120000000 --name "استاد علایی‌نسب"
// رمز عبور به صورت تعاملی و بدون نمایش روی صفحه پرسیده می‌شود.
import readline from 'node:readline';
import { initDb, migrate, one, q, closeDb } from '../db/index.js';
import { hashPassword, uuid } from '../lib/security.js';
import { normalizePhone, password as validatePassword } from '../lib/validate.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const phone = normalizePhone(arg('--phone') || '');
const name = arg('--name') || 'مدیر سیستم';
if (!phone) { console.error('شماره موبایل معتبر با --phone وارد کنید.'); process.exit(1); }

function askHidden(question) {
  return new Promise((resolve) => {
    if (process.env.ADMIN_PASSWORD) return resolve(process.env.ADMIN_PASSWORD);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

await initDb(); await migrate();
const pw = await askHidden('رمز عبور مدیر (حداقل ۸ کاراکتر، حرف و عدد): ');
try { validatePassword(pw); } catch (e) { console.error(e.message); process.exit(1); }
const now = new Date().toISOString();
const existing = await one('SELECT id FROM users WHERE phone = $1', [phone]);
if (existing) {
  await q("UPDATE users SET role = 'admin', status = 'active', password_hash = $1, phone_verified_at = COALESCE(phone_verified_at, $2), updated_at = $2 WHERE id = $3", [await hashPassword(pw), now, existing.id]);
  console.log('✔ حساب موجود به مدیر ارتقا یافت.');
} else {
  await q("INSERT INTO users (id, name, phone, password_hash, role, status, phone_verified_at, created_at, updated_at) VALUES ($1,$2,$3,$4,'admin','active',$5,$5,$5)", [uuid(), name, phone, await hashPassword(pw), now]);
  console.log('✔ حساب مدیر ساخته شد.');
}
await closeDb();
