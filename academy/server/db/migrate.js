import { migrate, closeDb, dbKind } from './index.js';
import { seedContent } from './seed-content.js';

await migrate();
console.log(`✔ اسکیمای پایگاه داده (${dbKind()}) اعمال شد.`);
if (process.argv.includes('--seed')) {
  const r = await seedContent({ withDevCoupons: process.argv.includes('--dev-coupons') });
  console.log(r.skipped ? 'ℹ محتوا از قبل وجود دارد؛ وارد کردن محتوا رد شد.' : '✔ محتوای اصلی سایت (دوره‌ها، فصل‌ها، جلسات، مقالات) وارد شد.');
}
await closeDb();
