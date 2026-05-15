import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { getMe } from "@/api/auth";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const StockSearchPage = lazy(() => import("@/pages/StockSearchPage").then((m) => ({ default: m.StockSearchPage })));
const StockDetailPage = lazy(() => import("@/pages/StockDetailPage").then((m) => ({ default: m.StockDetailPage })));
const WatchlistsPage = lazy(() => import("@/pages/WatchlistsPage").then((m) => ({ default: m.WatchlistsPage })));
const WatchlistDetailPage = lazy(() => import("@/pages/WatchlistDetailPage").then((m) => ({ default: m.WatchlistDetailPage })));

function PageLoader() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
    </div>
  );
}

function App() {
  const { setUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((user) => setUser(user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [setUser, setLoading, logout]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 公開路由 - 不需要登入 */}
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/stocks" element={<StockSearchPage />} />
          <Route path="/stocks/:symbol" element={<StockDetailPage />} />
        </Route>

        {/* 受保護的路由 - 需要登入 */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/watchlists" element={<WatchlistsPage />} />
            <Route path="/watchlists/:id" element={<WatchlistDetailPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
