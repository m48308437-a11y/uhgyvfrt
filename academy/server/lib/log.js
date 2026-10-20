import { q } from '../db/index.js';
import { uuid } from './security.js';

export async function audit(actorId, action, entity, entityId, details, ip) {
  try {
    await q('INSERT INTO audit_log (id, actor_id, action, entity, entity_id, details, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uuid(), actorId || null, action, entity || null, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, ip || null, new Date().toISOString()]);
  } catch (e) { console.error('audit failed', e.message); }
}
export async function logError(source, message, details, level = 'error') {
  console.error(`[${level}] ${source}: ${message}`);
  try {
    await q('INSERT INTO error_log (id, level, source, message, details, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [uuid(), level, source, String(message).slice(0, 1000), details ? JSON.stringify(details).slice(0, 4000) : null, new Date().toISOString()]);
  } catch {}
}
