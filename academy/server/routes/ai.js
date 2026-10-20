// دستیار ریاضی: درخواست از مرورگر ← سرور ← API هوش مصنوعی. کلید API فقط در متغیر محیطی سرور است.
import { readJson, bad, HttpError } from '../lib/http.js';
import { rateLimit } from '../lib/security.js';
import { getSettings } from '../lib/domain.js';
import { DEFAULT_AI, AI_MODES } from '../db/defaults.js';
import { config } from '../config.js';
import { logError } from '../lib/log.js';

export default function aiRoutes(r) {
  r.post('/api/ai/chat', async (ctx) => {
    const settings = { ...DEFAULT_AI, ...(await getSettings('ai', DEFAULT_AI)) };
    if (settings.enabled === false) throw new HttpError(403, 'دستیار فعلاً غیرفعال است.');
    const key = ctx.user ? `ai:u:${ctx.user.id}` : `ai:ip:${ctx.ip}`;
    const rl = rateLimit(key, ctx.user ? 40 : 10, 3600_000);
    if (!rl.ok) throw new HttpError(429, ctx.user ? 'سقف پرسش ساعتی پر شده؛ کمی بعد دوباره بپرس.' : 'برای پرسش‌های بیشتر وارد حساب کاربری شو.');
    const body = await readJson(ctx.req);
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-10)
      .filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw bad('پیامی برای ارسال وجود ندارد.');
    if (!config.ai.url || !config.ai.key) return { fallback: true };
    const mode = AI_MODES[body.mode] || AI_MODES.step;
    try {
      const res = await fetch(config.ai.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.key}` },
        body: JSON.stringify({ model: config.ai.model, temperature: 0.3, max_tokens: 900, messages: [{ role: 'system', content: `${settings.systemPrompt}\nحالت پاسخ: ${mode}` }, ...msgs] }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json().catch(() => null);
      const text = data?.choices?.[0]?.message?.content;
      if (!res.ok || !text) throw new Error(`AI HTTP ${res.status}: ${JSON.stringify(data?.error || '').slice(0, 200)}`);
      return { text: String(text).slice(0, 8000) };
    } catch (e) {
      await logError('ai', e.message);
      return { fallback: true, error: 'سرویس هوش مصنوعی در دسترس نبود؛ پاسخ با موتور محلی تولید شد.' };
    }
  });
}
