// راه‌اندازی سرور واقعی روی SQLite در حافظه + Mock رسمی‌نما از API زرین‌پال (فقط برای تست)
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const gateway = { payments: new Map(), verifyCalls: 0, failNext: false };

export async function startMockZarinpal() {
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/pg/v4/payment/request.json') {
      if (data.merchant_id !== 'test-merchant-0000') return res.end(JSON.stringify({ data: [], errors: { code: -9, message: 'merchant invalid' } }));
      const authority = 'A' + String(Math.random()).slice(2, 14).padEnd(35, '0');
      gateway.payments.set(authority, { amount: data.amount, paid: false, verified: false });
      return res.end(JSON.stringify({ data: { code: 100, message: 'Success', authority, fee: 0 }, errors: [] }));
    }
    if (req.url === '/pg/v4/payment/verify.json') {
      gateway.verifyCalls++;
      if (gateway.failNext) { gateway.failNext = false; req.socket.destroy(); return; }
      const p = gateway.payments.get(data.authority);
      if (!p || !p.paid) return res.end(JSON.stringify({ data: [], errors: { code: -51, message: 'Session is not valid' } }));
      if (p.amount !== data.amount) return res.end(JSON.stringify({ data: [], errors: { code: -50, message: 'amount mismatch' } }));
      const code = p.verified ? 101 : 100; p.verified = true;
      return res.end(JSON.stringify({ data: { code, message: 'Paid', ref_id: 201, card_pan: '502229******5995' }, errors: [] }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(0, r));
  return srv;
}

export async function startApp() {
  const zp = await startMockZarinpal();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '0', SQLITE_PATH: path.join(dir, 'test.sqlite'), APP_SECRET: 'test-secret-'.padEnd(48, 'x'), SMS_PROVIDER: 'memory',
    ZARINPAL_MERCHANT_ID: 'test-merchant-0000', ZARINPAL_BASE_URL: `http://127.0.0.1:${zp.address().port}`, STORAGE_PROVIDER: 'local',
    LOCAL_STORAGE_DIR: path.join(dir, 'storage'), MAX_VIDEO_SIZE_MB: '64', DATABASE_URL: '',
  });
  const { start } = await import('../server/index.js');
  const { seedContent } = await import('../server/db/seed-content.js');
  const sms = await import('../server/lib/sms.js');
  const sec = await import('../server/lib/security.js');
  const server = await start();
  await seedContent({ withDevCoupons: true });
  const port = server.address().port;
  process.env.APP_ORIGIN = `http://127.0.0.1:${port}`;
  const { config } = await import('../server/config.js');
  config.origin = `http://127.0.0.1:${port}`;
  return { server, zp, base: `http://127.0.0.1:${port}`, sms, sec, dir };
}

/** کلاینت ساده با نگه‌داری کوکی */
export function client(base) {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'academy-web', ...(cookie ? { Cookie: cookie } : {}), ...(extra.headers || {}) };
    if (body !== undefined && !(body instanceof Buffer)) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + url, { method, headers, body: body instanceof Buffer ? body : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const set = r.headers.getSetCookie?.() || [];
    for (const s of set) { const [kv] = s.split(';'); const [k, v] = kv.split('='); if (k === 'session') cookie = v ? `session=${v}` : ''; }
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  return { get: (u, o) => call('GET', u, undefined, o), post: (u, b, o) => call('POST', u, b ?? {}, o), put: (u, b, o) => call('PUT', u, b, o), patch: (u, b) => call('PATCH', u, b), del: (u) => call('DELETE', u), raw: call, get cookie() { return cookie; } };
}
