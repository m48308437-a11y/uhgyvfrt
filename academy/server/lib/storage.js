// لایه ذخیره‌سازی ویدیو. ویدیوها هرگز در پوشه عمومی، HTML یا دیتابیس قرار نمی‌گیرند.
//  local: پوشه خصوصی روی سرور + لینک‌های امضاشده HMAC و زمان‌دار
//  s3:    Object Storage سازگار با S3 + آپلود چندبخشی مستقیم از مرورگر + Presigned URL برای پخش
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { hmac, safeEqual } from './security.js';
import * as s3 from './s3.js';

export const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
const MiB = 1024 * 1024;
export const partSizeFor = (size) => Math.max(10 * MiB, Math.ceil(size / 9000 / MiB) * MiB);

export function sniffVideo(buf) {
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}

const localDir = () => config.storage.localDir;
const safeId = (id) => { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('bad id'); return id; };
const partsDir = (id) => path.join(localDir(), 'uploads', safeId(id));
const videoPath = (key) => path.join(localDir(), 'videos', path.basename(key));

export function signLocal(kind, id, extra, exp) { return hmac(`${kind}:${id}:${extra}:${exp}`); }
export function checkLocalSig(kind, id, extra, exp, sig) {
  if (!exp || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signLocal(kind, id, extra, exp), sig || '');
}

export const providerName = () => config.storage.provider;

export async function initUpload(video) {
  if (video.storage_provider === 's3') return { uploadId: await s3.createMultipart(config.storage.s3, video.storage_key, video.mime) };
  await fsp.mkdir(partsDir(video.id), { recursive: true });
  return { uploadId: null };
}

export function partUrls(video, numbers) {
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  return numbers.map((n) => {
    if (video.storage_provider === 's3') {
      return { n, url: s3.presign(config.storage.s3, { method: 'PUT', key: video.storage_key, expires: 6 * 3600, query: { partNumber: String(n), uploadId: video.upload_id } }) };
    }
    return { n, url: `/api/upload-parts/${video.id}/${n}?exp=${exp}&sig=${signLocal('part', video.id, n, exp)}` };
  });
}

export async function listUploadedParts(video) {
  if (video.storage_provider === 's3') return s3.listParts(config.storage.s3, video.storage_key, video.upload_id);
  const dir = partsDir(video.id);
  if (!fs.existsSync(dir)) return [];
  const files = (await fsp.readdir(dir)).filter((f) => /^\d+\.part$/.test(f));
  return Promise.all(files.map(async (f) => {
    const st = await fsp.stat(path.join(dir, f));
    const meta = await fsp.readFile(path.join(dir, f + '.etag'), 'utf8').catch(() => '');
    return { n: Number(f.split('.')[0]), size: st.size, etag: meta };
  }));
}

/** ذخیره یک بخش در حالت local (فراخوانی از مسیر PUT امضاشده) */
export async function writeLocalPart(videoId, n, buf, etag) {
  const dir = partsDir(videoId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${n}.part`), buf);
  await fsp.writeFile(path.join(dir, `${n}.part.etag`), etag);
}

export async function completeUpload(video, parts) {
  const total = Math.ceil(video.size_bytes / video.part_size);
  const sorted = [...parts].sort((a, b) => a.n - b.n);
  if (sorted.length !== total || sorted.some((p, i) => p.n !== i + 1 || !p.etag)) throw new Error('همه بخش‌های فایل آپلود نشده‌اند.');
  if (video.storage_provider === 's3') {
    await s3.completeMultipart(config.storage.s3, video.storage_key, video.upload_id, sorted);
    const head = await s3.readHead(config.storage.s3, video.storage_key);
    if (!sniffVideo(head)) { await s3.deleteObject(config.storage.s3, video.storage_key); throw new Error('محتوای فایل ویدیوی معتبر نیست.'); }
    return;
  }
  const dir = partsDir(video.id);
  const stored = await listUploadedParts(video);
  const byN = new Map(stored.map((p) => [p.n, p]));
  let sum = 0;
  for (const p of sorted) {
    const s = byN.get(p.n);
    if (!s || s.etag !== p.etag) throw new Error(`بخش ${p.n} ناقص یا نامعتبر است.`);
    sum += s.size;
  }
  if (sum !== video.size_bytes) throw new Error('حجم فایل نهایی با حجم اعلام‌شده برابر نیست.');
  const first = await fsp.readFile(path.join(dir, '1.part'));
  if (!sniffVideo(first.subarray(0, 64))) throw new Error('محتوای فایل ویدیوی معتبر نیست (فقط MP4/MOV/WebM/MKV).');
  await fsp.mkdir(path.dirname(videoPath(video.storage_key)), { recursive: true });
  const out = fs.createWriteStream(videoPath(video.storage_key));
  for (const p of sorted) {
    await new Promise((res, rej) => {
      const rs = fs.createReadStream(path.join(dir, `${p.n}.part`));
      rs.on('error', rej); rs.on('end', res); rs.pipe(out, { end: false });
    });
  }
  await new Promise((res) => out.end(res));
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function abortUpload(video) {
  if (video.storage_provider === 's3') { if (video.upload_id) await s3.abortMultipart(config.storage.s3, video.storage_key, video.upload_id); return; }
  await fsp.rm(partsDir(video.id), { recursive: true, force: true }).catch(() => {});
}

export async function deleteVideoFile(video) {
  if (video.storage_provider === 's3') return s3.deleteObject(config.storage.s3, video.storage_key);
  await fsp.rm(videoPath(video.storage_key), { force: true }).catch(() => {});
}

/** لینک پخش امضاشده و زمان‌دار؛ فقط پس از بررسی مجوز در سرور صادر می‌شود. */
export function playbackUrl(video, userId) {
  const ttl = config.storage.videoUrlTtl;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  if (video.storage_provider === 's3') return { url: s3.presign(config.storage.s3, { method: 'GET', key: video.storage_key, expires: ttl }), expiresAt: exp };
  const u = userId || 'public';
  return { url: `/media/${video.id}?u=${u}&exp=${exp}&sig=${signLocal('media', video.id, u, exp)}`, expiresAt: exp };
}

export const localVideoPath = (video) => videoPath(video.storage_key);
