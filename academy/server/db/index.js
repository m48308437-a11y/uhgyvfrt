// لایه دسترسی به پایگاه داده با دو درایور:
//  - PostgreSQL (پکیج pg) برای production
//  - SQLite داخلی Node (node:sqlite) برای توسعه و تست خودکار بدون نصب سرور دیتابیس
// کوئری‌ها با پارامترهای $1, $2 ... نوشته می‌شوند و همیشه پارامتری‌اند (ضد SQL Injection).
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config, ROOT } from '../config.js';

const txStore = new AsyncLocalStorage();
let driver = null;

function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

async function makePg() {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v) => Number(v)); // bigint → number (اندازه فایل و COUNT)
  pg.types.setTypeParser(1700, (v) => Number(v)); // numeric → number (SUM)
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  const run = async (client, sql, params) => {
    const r = await client.query(sql, params);
    return { rows: r.rows.map(normalizeRow), rowCount: r.rowCount };
  };
  return {
    kind: 'pg',
    query: (sql, params = []) => run(pool, sql, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await txStore.run({ q: (s, p = []) => run(client, s, p) }, fn);
        await client.query('COMMIT');
        return res;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async exec(sql) { await pool.query(sql); },
    async close() { await pool.end(); },
  };
}

async function makeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const file = config.sqlitePath;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // صف سریال برای جلوگیری از تداخل تراکنش‌ها روی یک اتصال
  let chain = Promise.resolve();
  const lock = (fn) => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
  const conv = (sql) => sql.replace(/\bFOR UPDATE\b/gi, '').replace(/\$(\d+)/g, '?$1').replace(/::\w+/g, '').replace(/\bILIKE\b/g, 'LIKE');
  const runSync = (sql, params) => {
    const p = params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
    const stmt = db.prepare(conv(sql));
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = stmt.all(...p);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    const r = stmt.run(...p);
    return { rows: [], rowCount: Number(r.changes) };
  };
  return {
    kind: 'sqlite',
    query(sql, params = []) {
      const ctx = txStore.getStore();
      if (ctx) return Promise.resolve(runSync(sql, params));
      return lock(() => runSync(sql, params));
    },
    tx(fn) {
      return lock(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const res = await txStore.run({ q: async (s, p = []) => runSync(s, p) }, fn);
          db.exec('COMMIT');
          return res;
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch {}
          throw e;
        }
      });
    },
    async exec(sql) { await lock(() => db.exec(sql)); },
    async close() { db.close(); },
  };
}

export async function initDb() {
  if (driver) return driver;
  if (config.databaseUrl.startsWith('postgres')) driver = await makePg();
  else driver = await makeSqlite();
  return driver;
}

/** اجرای کوئری؛ اگر داخل تراکنش باشیم روی همان اتصال اجرا می‌شود. */
export async function q(sql, params = []) {
  const ctx = txStore.getStore();
  if (ctx) return ctx.q(sql, params);
  return driver.query(sql, params);
}
export const one = async (sql, params) => (await q(sql, params)).rows[0] || null;
export const all = async (sql, params) => (await q(sql, params)).rows;
export const tx = (fn) => driver.tx(fn);
export const dbKind = () => driver?.kind;
export const closeDb = async () => { if (driver) await driver.close(); driver = null; };

export async function migrate() {
  await initDb();
  const file = path.join(ROOT, 'server', 'db', driver.kind === 'pg' ? 'schema.pg.sql' : 'schema.sqlite.sql');
  await driver.exec(fs.readFileSync(file, 'utf8'));
}

// تبدیل‌های کمکی برای فیلدهای JSON متنی و boolean (سازگار با هر دو درایور)
export const j = (v, d = []) => { try { return v == null ? d : typeof v === 'string' ? JSON.parse(v) : v; } catch { return d; } };
export const b = (v) => v === true || v === 1 || v === '1' || v === 't';
