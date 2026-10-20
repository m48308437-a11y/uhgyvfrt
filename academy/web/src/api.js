// لایه ارتباط با API: کوکی HttpOnly به صورت خودکار ارسال می‌شود؛ هیچ توکنی در JS نگه‌داری نمی‌شود.
export class ApiError extends Error {
  constructor(status, data) { super(data?.error || 'خطای ارتباط با سرور'); this.status = status; this.data = data || {}; }
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, signal, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'academy-web', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'اتصال اینترنت برقرار نیست یا سرور پاسخ نمی‌دهد؛ دوباره تلاش کنید.' });
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const get = (p, o) => api(p, o);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
