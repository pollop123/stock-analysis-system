import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { logout as apiLogout } from "@/api/auth";
import { clearTokens, getAccessToken } from "@/api/client";
import { toast } from "sonner";
import {
  Search,
  List,
  LogOut,
  TrendingUp,
  User,
  AlertCircle,
} from "lucide-react";

export function Navbar() {
  const { user, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      const token = getAccessToken();
      if (token) await apiLogout(token);
    } catch {
      // ignore
    } finally {
      clearTokens();
      storeLogout();
      toast.success("Logged out successfully");
      navigate("/");
    }
  };

  const navLinkClass = (path: string) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === path || location.pathname.startsWith(path + "/")
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:text-primary hover:bg-muted"
    }`;

  return (
    <div className="sticky top-0 z-50 w-full">
      {/* 頂部投資警語 */}
      <div className="bg-card border-b border-border py-1.5 px-4 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 font-medium leading-none">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
          <span>本網站內容僅供參考，不構成任何投資建議。投資人應審慎評估並自負風險。</span>
        </p>
      </div>

      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 text-primary font-bold text-lg">
              <TrendingUp className="w-5 h-5 text-accent" />
              <span>TW Stock</span>
            </Link>

            <div className="flex items-center gap-1">
              <Link to="/stocks" className={navLinkClass("/stocks")}>
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Stocks</span>
              </Link>
              <Link to="/watchlists" className={navLinkClass("/watchlists")}>
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Watchlists</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">{user.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-sm text-danger hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 text-sm bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-2 rounded-lg transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Login</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
