// وضعیت سراسری: کاربر، اطلاعات سایت، سبد خرید (فقط شناسه دوره‌ها در localStorage) و اعلان‌ها
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { get, post } from './api.js';

const Ctx = createContext(null);
const CART_KEY = 'academy_cart_v1';

export function StoreProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = در حال بارگذاری
  const [site, setSite] = useState(null);
  const [siteError, setSiteError] = useState(null);
  const [cart, setCart] = useState(() => { try { const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : []; } catch { return []; } });
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const refreshUser = useCallback(() => get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)), []);
  const loadSite = useCallback(() => { setSiteError(null); get('/api/site').then(setSite).catch((e) => setSiteError(e.message)); }, []);
  useEffect(() => { refreshUser(); loadSite(); }, [refreshUser, loadSite]);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} }, [cart]);

  const logout = useCallback(async () => { await post('/api/auth/logout').catch(() => {}); setUser(null); toast('از حساب خارج شدی.'); }, [toast]);
  const addToCart = useCallback((c) => {
    if (c.enrolled) return toast('این دوره را قبلاً خریده‌ای؛ از «پنل من» واردش شو.', 'warning');
    setCart((x) => { if (x.includes(c.id)) { toast('این دوره در سبد خریدت هست.'); return x; } toast(`«${c.title}» به سبد اضافه شد.`); return [...x, c.id]; });
  }, [toast]);
  const removeFromCart = useCallback((id) => setCart((x) => x.filter((i) => i !== id)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo(() => ({ user, setUser, refreshUser, logout, site, siteError, loadSite, cart, addToCart, removeFromCart, clearCart, toast, toasts }),
    [user, refreshUser, logout, site, siteError, loadSite, cart, addToCart, removeFromCart, clearCart, toast, toasts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);

/** هوک بارگذاری داده با وضعیت loading/error */
export function useFetch(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    if (!path) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    get(path, { signal: ac.signal }).then((data) => setState({ loading: false, data, error: null })).catch((e) => { if (e.name !== 'AbortError') setState({ loading: false, data: null, error: e }); });
    return () => ac.abort();
  }, [path]);
  useEffect(reload, [reload, ...deps]);
  return { ...state, reload };
}
