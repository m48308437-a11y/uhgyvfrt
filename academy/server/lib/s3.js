// امضای AWS Signature V4 برای فضای ذخیره‌سازی سازگار با S3 (ابرآروان، لیارا، MinIO، AWS)
// پیاده‌سازی مستقل با node:crypto؛ با بردار تست رسمی AWS بررسی شده (tests/s3.test.js).
import crypto from 'node:crypto';

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (k) => k.split('/').map(enc).join('/');
const sha = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

function signingKey(secret, date, region) {
  return hm(hm(hm(hm('AWS4' + secret, date), region), 's3'), 'aws4_request');
}

export function objectUrl(cfg, key) {
  const u = new URL(cfg.endpoint);
  if (cfg.forcePathStyle) return { host: u.host, path: `/${cfg.bucket}/${encKey(key)}`, origin: `${u.protocol}//${u.host}` };
  return { host: `${cfg.bucket}.${u.host}`, path: `/${encKey(key)}`, origin: `${u.protocol}//${cfg.bucket}.${u.host}` };
}

const canonicalQuery = (params) => Object.keys(params).sort().map((k) => `${enc(k)}=${enc(String(params[k]))}`).join('&');
const amzDate = (now) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** ساخت URL امضاشده و زمان‌دار (Query-string auth) */
export function presign(cfg, { method, key, expires = 3600, query = {}, now = new Date() }) {
  const { host, path, origin } = objectUrl(cfg, key);
  const dt = amzDate(now); const date = dt.slice(0, 8);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const params = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKey}/${scope}`,
    'X-Amz-Date': dt,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const cq = canonicalQuery(params);
  const canonical = [method, path, cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', dt, scope, sha(canonical)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(cfg.secretKey, date, cfg.region)).update(sts).digest('hex');
  return `${origin}${path}?${cq}&X-Amz-Signature=${sig}`;
}

/** درخواست امضاشده با هدر Authorization (برای عملیات مدیریتی سمت سرور) */
export async function signedFetch(cfg, { method, key, query = {}, body = '', headers = {} }) {
  const { host, path, origin } = objectUrl(cfg, key);
  const now = new Date(); const dt = amzDate(now); const date = dt.slice(0, 8);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const payloadHash = sha(body);
  const h = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': dt, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
  const names = Object.keys(h).sort();
  const cq = canonicalQuery(query);
  const canonical = [method, path, cq, names.map((n) => `${n}:${String(h[n]).trim()}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const sts = ['AWS4-HMAC-SHA256', dt, scope, sha(canonical)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(cfg.secretKey, date, cfg.region)).update(sts).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  const { host: _h, ...sendHeaders } = h;
  const r = await fetch(`${origin}${path}${cq ? '?' + cq : ''}`, { method, headers: { ...sendHeaders, Authorization: auth }, body: body || undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`S3 ${method} ${r.status}: ${text.slice(0, 300)}`);
  return text;
}

const tag = (xml, name) => (xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1];

export async function createMultipart(cfg, key, mime) {
  const xml = await signedFetch(cfg, { method: 'POST', key, query: { uploads: '' }, headers: { 'content-type': mime } });
  const id = tag(xml, 'UploadId');
  if (!id) throw new Error('S3: UploadId دریافت نشد');
  return id;
}
export async function listParts(cfg, key, uploadId) {
  const xml = await signedFetch(cfg, { method: 'GET', key, query: { uploadId, 'max-parts': '10000' } });
  return [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({ n: Number(tag(m[1], 'PartNumber')), etag: tag(m[1], 'ETag')?.replace(/&quot;/g, '"'), size: Number(tag(m[1], 'Size')) }));
}
export async function completeMultipart(cfg, key, uploadId, parts) {
  const body = '<CompleteMultipartUpload>' + parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${String(p.etag).replace(/[<>&]/g, '')}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
  const xml = await signedFetch(cfg, { method: 'POST', key, query: { uploadId }, body, headers: { 'content-type': 'application/xml' } });
  if (/<Error>/.test(xml)) throw new Error('S3 complete failed: ' + tag(xml, 'Message'));
}
export const abortMultipart = (cfg, key, uploadId) => signedFetch(cfg, { method: 'DELETE', key, query: { uploadId } }).catch(() => {});
export const deleteObject = (cfg, key) => signedFetch(cfg, { method: 'DELETE', key }).catch(() => {});
export async function readHead(cfg, key, bytes = 64) {
  const r = await fetch(presign(cfg, { method: 'GET', key, expires: 300 }), { headers: { Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(15000) });
  return Buffer.from(await r.arrayBuffer());
}
