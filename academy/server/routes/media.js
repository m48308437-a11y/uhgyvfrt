// پخش ویدیو (حالت local) با پشتیبانی Range و دریافت بخش‌های آپلود از طریق لینک امضاشده
import fs from 'node:fs';
import crypto from 'node:crypto';
import { one } from '../db/index.js';
import { readBody, send, HttpError } from '../lib/http.js';
import * as storage from '../lib/storage.js';

export async function serveMedia(ctx) {
  const id = ctx.params.id;
  const { u, exp, sig } = ctx.query;
  if (!/^[0-9a-f-]{36}$/.test(id) || !storage.checkLocalSig('media', id, u, exp, sig)) throw new HttpError(403, 'لینک پخش نامعتبر یا منقضی است.');
  const v = await one("SELECT * FROM videos WHERE id = $1 AND status = 'ready' AND storage_provider = 'local'", [id]);
  if (!v) throw new HttpError(404, 'ویدیو پیدا نشد.');
  const file = storage.localVideoPath(v);
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) throw new HttpError(404, 'فایل ویدیو پیدا نشد.');
  const range = ctx.req.headers.range;
  const base = { 'Content-Type': v.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' };
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, stat.size - Number(m[2])); end = stat.size - 1; }
    end = Math.min(end, stat.size - 1, start + 8 * 1024 * 1024 - 1);
    if (start > end || start >= stat.size) { ctx.res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); ctx.res.end(); return; }
    ctx.res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(ctx.res);
    return;
  }
  ctx.res.writeHead(200, { ...base, 'Content-Length': stat.size });
  fs.createReadStream(file).pipe(ctx.res);
}

export async function receivePart(ctx) {
  const { videoId, n } = ctx.params;
  const { exp, sig } = ctx.query;
  if (!/^[0-9a-f-]{36}$/.test(videoId) || !/^\d{1,5}$/.test(n) || !storage.checkLocalSig('part', videoId, Number(n), exp, sig)) throw new HttpError(403, 'لینک آپلود نامعتبر یا منقضی است.');
  const v = await one("SELECT * FROM videos WHERE id = $1 AND status = 'uploading' AND storage_provider = 'local'", [videoId]);
  if (!v) throw new HttpError(404, 'آپلود فعال پیدا نشد.');
  const total = Math.ceil(Number(v.size_bytes) / v.part_size);
  const num = Number(n);
  if (num < 1 || num > total) throw new HttpError(400, 'شماره بخش نامعتبر است.');
  const expected = num < total ? v.part_size : Number(v.size_bytes) - v.part_size * (total - 1);
  const buf = await readBody(ctx.req, v.part_size + 1024);
  if (buf.length !== expected) throw new HttpError(400, `اندازه بخش ${num} نادرست است.`);
  const etag = '"' + crypto.createHash('md5').update(buf).digest('hex') + '"';
  await storage.writeLocalPart(videoId, num, buf, etag);
  send(ctx.res, 200, { ok: true, etag }, { ETag: etag });
}
