// فقط توسعه: اعمال اسکیما + محتوای اصلی + کدهای تخفیف نمونه
import { config } from '../config.js';
if (config.isProd) { console.error('seed:dev در production اجرا نمی‌شود.'); process.exit(1); }
process.argv.push('--seed', '--dev-coupons');
await import('./migrate.js');
