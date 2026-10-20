// روتر سبک مبتنی بر History API (بدون وابستگی)
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);
export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false, keepScroll = false } = {}) => {
    if (/^https?:\/\//.test(to)) { location.href = to; return; }
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    const u = new URL(to, location.origin);
    setLoc({ path: u.pathname, search: u.search });
    if (!keepScroll) scrollTo({ top: 0 });
  }, []);
  return <Ctx.Provider value={{ ...loc, query: Object.fromEntries(new URLSearchParams(loc.search)), navigate }}>{children}</Ctx.Provider>;
}
export const useRouter = () => useContext(Ctx);

export function matchPath(pattern, path) {
  const ps = pattern.split('/').filter(Boolean), xs = path.split('/').filter(Boolean);
  const out = {};
  for (let i = 0; i < Math.max(ps.length, xs.length); i++) {
    const p = ps[i], x = xs[i];
    if (p === undefined) return null;
    if (p.startsWith(':')) {
      const opt = p.endsWith('?'); const k = p.slice(1).replace('?', '');
      if (x === undefined) { if (opt) continue; return null; }
      out[k] = decodeURIComponent(x);
    } else if (p !== x) return null;
  }
  return out;
}

export function Link({ to, children, className, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a href={to} className={className} {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || rest.target) return;
        e.preventDefault(); navigate(to);
      }}>{children}</a>
  );
}
