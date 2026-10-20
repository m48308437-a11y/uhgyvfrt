// نقطه ورود سرور: API + فایل‌های استاتیک فرانت‌اند + هدرهای امنیتی
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT, assertProductionConfig } from './config.js';
import { initDb, migrate } from './db/index.js';
import { Router, HttpError, parseCookies, send } from './lib/http.js';
import { loadUser } from './lib/auth.js';
import { logError } from './lib/log.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import checkoutRoutes from './routes/checkout.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';
import { serveMedia, receivePart } from './routes/media.js';

const router = new Router();
authRoutes(router); catalogRoutes(router); checkoutRoutes(router); adminRoutes(router); aiRoutes(router);
router.get('/media/:id', serveMedia);
router.put('/api/upload-parts/:videoId/:n', receivePart);
router.get('/api/health', async () => ({ ok: true }));

const DIST = path.join(ROOT, 'web', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

function cspHeader() {
  const s3 = config.storage.provider === 's3' && config.storage.s3.endpoint ? (() => { const u = new URL(config.storage.s3.endpoint); return ` ${u.protocol}//${u.host} ${u.protocol}//*.${u.host}`; })() : '';
  return [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
    "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:", `media-src 'self' blob:${s3}`, `connect-src 'self'${s3}`,
  ].join('; ');
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin',
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.includes('\0')) return false;
  let file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return false;
  let isIndex = false;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(rel)) return false; // فایل ناموجود ← 404
    file = path.join(DIST, 'index.html'); isIndex = true; // SPA fallback
    if (!fs.existsSync(file)) { send(res, 503, 'Frontend build not found. Run: npm run build'); return true; }
  }
  const ext = path.extname(file);
  const ae = String(req.headers['accept-encoding'] || '');
  let serve = file; const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', Vary: 'Accept-Encoding' };
  if (/\bbr\b/.test(ae) && fs.existsSync(file + '.br')) { serve = file + '.br'; headers['Content-Encoding'] = 'br'; }
  else if (/\bgzip\b/.test(ae) && fs.existsSync(file + '.gz')) { serve = file + '.gz'; headers['Content-Encoding'] = 'gzip'; }
  headers['Cache-Control'] = isIndex || ext === '.html' ? 'no-cache' : /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  res.writeHead(200, headers);
  fs.createReadStream(serve).pipe(res);
  return true;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = (config.isProd ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.setHeader('Content-Security-Policy', cspHeader());
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    const cookies = [];
    const ctx = { req, res, ip, query: Object.fromEntries(url.searchParams), cookies: parseCookies(req.headers.cookie), setCookie: (c) => { cookies.push(c); res.setHeader('Set-Cookie', cookies); } };
    try {
      const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/');
      if (!isApi) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
        if (!serveStatic(req, res, url.pathname)) send(res, 404, 'Not found');
        return;
      }
      // محافظت CSRF: درخواست‌های تغییردهنده فقط از همین Origin و با هدر سفارشی پذیرفته می‌شوند
      const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const isUploadPart = url.pathname.startsWith('/api/upload-parts/');
      if (mutating && !isUploadPart) {
        const origin = req.headers.origin;
        if (origin && origin !== config.origin) throw new HttpError(403, 'درخواست از مبدأ نامعتبر.');
        if (req.headers['x-requested-with'] !== 'academy-web') throw new HttpError(403, 'درخواست نامعتبر.');
      }
      const match = router.match(req.method, url.pathname);
      if (!match) throw new HttpError(404, 'مسیر API پیدا نشد.');
      ctx.params = match.params;
      ctx.user = await loadUser(ctx);
      let result;
      for (const h of match.handlers) result = await h(ctx);
      if (result !== undefined && !res.headersSent) send(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      await logError('http', e.message, { path: url.pathname, stack: config.isProd ? undefined : e.stack?.split('\n').slice(0, 4) });
      send(res, 500, { error: 'خطای داخلی سرور؛ لطفاً دوباره تلاش کنید.' });
    }
  });
}

export async function start() {
  assertProductionConfig();
  await initDb();
  await migrate();
  const server = createServer();
  server.requestTimeout = 0; // آپلودهای حجیم
  server.headersTimeout = 60_000;
  await new Promise((r) => server.listen(config.port, r));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'server', 'index.js')) {
  start().then((s) => console.log(`✔ سرور روی ${config.origin} (پورت ${s.address().port}) اجرا شد — محیط: ${config.env}`)).catch((e) => { console.error(e.message); process.exit(1); });
}
