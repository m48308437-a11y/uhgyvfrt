import React, { Suspense, lazy, useEffect, useState, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { RouterProvider, useRouter, matchPath } from './router.jsx';
import { StoreProvider, useStore } from './store.jsx';
import { SiteHeader, MobileDock, SiteFooter, SearchSheet } from './ui/Layout.jsx';
import { Toasts, Spinner, PageShell, ErrorBox, Button } from './ui/kit.jsx';
import { FloatingAssistant } from './ui/Assistant.jsx';
import Home from './pages/Home.jsx';
import { Catalog, CourseDetail, Cart, PaymentResult } from './pages/Store.jsx';
import { Login, Register, Verify, Forgot } from './pages/Auth.jsx';
import { Articles, Article, Support, AssistantPage, NotFound } from './pages/Misc.jsx';

// صفحات سنگین‌تر به صورت جداگانه و در صورت نیاز بارگذاری می‌شوند
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Learn = lazy(() => import('./pages/Learn.jsx'));
const Admin = lazy(() => import('./admin/Admin.jsx'));

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <PageShell><ErrorBox error={{ message: 'مشکلی در نمایش این صفحه پیش آمد.' }} onRetry={() => location.reload()} /></PageShell>;
    return this.props.children;
  }
}

function RequireAuth({ children, admin }) {
  const { user } = useStore();
  const { navigate, path, search } = useRouter();
  useEffect(() => { if (user === null) navigate(`/login?next=${encodeURIComponent(path + search)}`, { replace: true }); }, [user]);
  if (user === undefined || user === null) return <PageShell><Spinner /></PageShell>;
  if (admin && user.role !== 'admin') return <PageShell><ErrorBox error={{ message: 'این بخش مخصوص مدیر است و حساب فعلی دسترسی مدیریت ندارد.' }} /><div className="text-center"><Button variant="secondary" to="/">بازگشت به خانه</Button></div></PageShell>;
  return children;
}

const ROUTES = [
  ['/', () => <Home />],
  ['/courses', () => <Catalog />],
  ['/courses/:slug', (p) => <CourseDetail slug={p.slug} key={p.slug} />],
  ['/cart', () => <Cart />],
  ['/payment/result', () => <RequireAuth><PaymentResult /></RequireAuth>],
  ['/login', () => <Login />], ['/register', () => <Register />], ['/verify', () => <Verify />], ['/forgot', () => <Forgot />],
  ['/dashboard/:tab?', (p) => <RequireAuth><Dashboard tab={p.tab || 'courses'} /></RequireAuth>],
  ['/learn/:slug/:lesson?', (p) => <Learn slug={p.slug} lessonId={p.lesson} key={p.slug} />],
  ['/articles', () => <Articles />], ['/articles/:slug', (p) => <Article slug={p.slug} />],
  ['/support', () => <Support />], ['/assistant', () => <AssistantPage />],
  ['/admin/:section?/:id?', (p) => <RequireAuth admin><Admin section={p.section || 'dashboard'} id={p.id} /></RequireAuth>],
];

function App() {
  const { path } = useRouter();
  const { toasts, siteError, loadSite } = useStore();
  const [search, setSearch] = useState(false);
  let page = <NotFound />;
  for (const [pattern, render] of ROUTES) { const m = matchPath(pattern, path); if (m) { page = render(m); break; } }
  const bare = path.startsWith('/admin');
  return (
    <div dir="rtl" className="relative isolate min-h-[100dvh]">
      <div className="aurora" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /></div>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2">پرش به محتوا</a>
      <SiteHeader onSearch={() => setSearch(true)} />
      <Toasts toasts={toasts} />
      {siteError && <div className="fixed inset-x-0 top-16 z-40 bg-rose-950/90 p-3 text-center text-sm">{siteError} <button onClick={loadSite} className="mr-2 underline">تلاش دوباره</button></div>}
      <div id="content"><ErrorBoundary key={path}><Suspense fallback={<PageShell><Spinner /></PageShell>}>{page}</Suspense></ErrorBoundary></div>
      {!bare && <SiteFooter />}
      <MobileDock onSearch={() => setSearch(true)} />
      <FloatingAssistant />
      <SearchSheet open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<RouterProvider><StoreProvider><App /></StoreProvider></RouterProvider>);
