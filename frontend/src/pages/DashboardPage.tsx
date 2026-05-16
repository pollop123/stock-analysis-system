import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Search, List, Sparkles, BrainCircuit, Activity, TrendingUp, TrendingDown, Settings2, ArrowRight } from "lucide-react";
import { listWatchlists } from "@/api/watchlists";
import { useAuthStore } from "@/stores/authStore";

// Deterministic pseudo-random function for fast UI demonstration without hitting rate limits
function getMockPriceData(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  const random = Math.abs(Math.sin(hash));

  // Special case for TSMC
  const basePrice = symbol === "2330" ? 800 : (parseInt(symbol) % 500) + 10 || 50;
  const price = basePrice + random * 10;

  const changePercent = parseFloat((Math.sin(hash + 1) * 5).toFixed(2));
  const change = parseFloat((price * (changePercent / 100)).toFixed(2));

  return {
    price: price.toFixed(2),
    changePercent,
    change: change > 0 ? `+${change}` : change.toString(),
    isUp: changePercent >= 0
  };
}

const MOCK_INDUSTRIES = [
  { name: "半導體業", weight: 6, change: 2.4, colSpan: "col-span-12 md:col-span-4", rowSpan: "row-span-2" },
  { name: "金融保險", weight: 4, change: 0.8, colSpan: "col-span-6 md:col-span-3", rowSpan: "row-span-2" },
  { name: "電腦週邊", weight: 3, change: 3.1, colSpan: "col-span-6 md:col-span-3", rowSpan: "row-span-2" },
  { name: "航運業", weight: 3, change: -1.5, colSpan: "col-span-6 md:col-span-2", rowSpan: "row-span-1" },
  { name: "電子零組", weight: 2, change: -0.5, colSpan: "col-span-6 md:col-span-2", rowSpan: "row-span-1" },
  { name: "通信網路", weight: 2, change: 1.2, colSpan: "col-span-4 md:col-span-4", rowSpan: "row-span-1" },
  { name: "光電業", weight: 2, change: -2.1, colSpan: "col-span-4 md:col-span-4", rowSpan: "row-span-1" },
  { name: "生技醫療", weight: 1, change: 0.3, colSpan: "col-span-4 md:col-span-4", rowSpan: "row-span-1" },
];

export function DashboardPage() {
  const { isAuthenticated } = useAuthStore();

  const { data: watchlists, isLoading } = useQuery({
    queryKey: ["watchlists"],
    queryFn: listWatchlists,
    enabled: isAuthenticated,
  });

  const [primaryWlId, setPrimaryWlId] = useState<string | null>(() => {
    return localStorage.getItem("primaryWatchlistId");
  });

  // Handle manual selection change
  const handleWatchlistChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setPrimaryWlId(newId);
    localStorage.setItem("primaryWatchlistId", newId);
  };

  const activeWatchlist = watchlists?.find(wl => wl.id.toString() === primaryWlId) || watchlists?.[0];

  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate('/stocks', { state: { initialQuery: searchTerm } });
    }
  };

  return (
    <div className="space-y-8">
      <div className="py-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">Market Overview</h1>
          <p className="text-muted-foreground">
            Track your favorite stocks and get real-time AI insights.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Primary Watchlist Performance */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-xl border border-border">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-accent/10 rounded-lg">
                <List className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-lg font-bold text-primary">Main Watchlist</h2>
              {!isAuthenticated && (
                <span className="text-xs font-medium text-muted-foreground ml-1">
                  （登入後即可使用）
                </span>
              )}
            </div>

            {watchlists && watchlists.length > 0 && (
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <select
                  value={primaryWlId || ""}
                  onChange={handleWatchlistChange}
                  className="bg-card border border-border text-primary text-sm font-medium rounded-lg focus:ring-2 focus:ring-accent focus:border-accent block px-3 py-1.5 outline-none cursor-pointer"
                >
                  {watchlists.map(wl => (
                    <option key={wl.id} value={wl.id}>{wl.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="bg-card border border-border rounded-2xl p-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : !activeWatchlist || activeWatchlist.items.length === 0 ? (
            <div className="bg-card border border-border rounded-3xl p-12 lg:p-24 text-center flex flex-col items-center justify-center shadow-sm">
              <div className="w-16 h-16 bg-blue-50 text-accent rounded-full flex items-center justify-center mb-6">
                <Search className="w-8 h-8" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-primary mb-3">探索台股，從這裡開始</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                搜尋超過 2300 檔上市櫃股票、ETF，掌握即時價格與技術指標，建立您的專屬觀察清單。
              </p>
              
              <form onSubmit={handleSearchSubmit} className="w-full max-w-lg relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="輸入股票代碼或名稱 (例如: 2330, 0050)"
                  className="block w-full pl-12 pr-24 py-4 bg-muted/50 border-2 border-border rounded-2xl text-lg font-medium text-primary placeholder:text-muted-foreground/70 focus:outline-none focus:bg-card focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all"
                />
                <button
                  type="submit"
                  className="absolute inset-y-2 right-2 px-4 bg-accent text-accent-foreground rounded-xl font-bold hover:shadow-lg hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-1"
                >
                  搜尋 <ArrowRight className="w-4 h-4 hidden sm:block" />
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeWatchlist.items.map((stock) => {
                const data = getMockPriceData(stock.symbol);
                return (
                  <Link
                    key={stock.symbol}
                    to={`/stocks/${stock.symbol}`}
                    className="bg-card border border-border rounded-2xl p-5 hover:border-accent hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-black text-primary group-hover:text-accent transition-colors">
                          {stock.symbol}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground line-clamp-1">{stock.name}</p>
                      </div>
                      <div className={`p-2 rounded-xl ${data.isUp ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                        {data.isUp ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                    </div>

                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold text-primary">{data.price}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${data.isUp ? "text-danger" : "text-success"}`}>
                          {data.change}
                        </p>
                        <p className={`text-xs font-bold ${data.isUp ? "text-danger" : "text-success"}`}>
                          ({data.changePercent > 0 ? "+" : ""}{data.changePercent}%)
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: AI Insights */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100 rounded-2xl p-6 h-full shadow-sm relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <BrainCircuit className="w-40 h-40 text-indigo-500" />
            </div>

            <div className="relative z-10 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-indigo-500 rounded-lg shadow-sm">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-indigo-950">AI 交易洞察</h2>
              </div>

              <div className="space-y-4 flex-1">
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white shadow-sm">
                  <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> 觀察清單速覽
                  </h3>
                  <p className="text-sm text-indigo-950 leading-relaxed font-medium">
                    根據您目前的<strong className="text-indigo-700">【{activeWatchlist?.name || "預設"}】</strong>清單，半導體相關標的展現強大資金動能。大盤整體趨勢偏多，但需留意高檔震盪。
                  </p>
                </div>

                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white shadow-sm">
                  <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <BrainCircuit className="w-3 h-3" /> 策略建議
                  </h3>
                  <ul className="text-sm text-indigo-950 leading-relaxed space-y-2 list-disc pl-4 font-medium">
                    <li>大型權值股目前接近壓力位，建議持有者可考慮逢高部分獲利了結。</li>
                    <li>部分標的呈量縮整理，建議暫時觀望，等待突破訊號。</li>
                    <li><span className="font-bold text-rose-600">風險提示：</span> 近期外資期貨空單增加，請嚴格設定停損停利點。</li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-auto text-right flex justify-between items-center">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  Updated just now
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded-md border border-indigo-100">
                  <Sparkles className="w-3 h-3" /> AI Demo Mode
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap Section */}
      <div className="bg-card border border-border rounded-2xl p-6 lg:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-xl">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Market Heatmap</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Industry performance overview</p>
            </div>
          </div>
          <Link to="/stocks" className="text-sm font-bold text-accent hover:bg-accent/10 px-4 py-2 rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-accent/20">
            Explore All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="p-2 md:p-3 bg-muted/40 border border-border rounded-2xl">
          <div className="grid grid-cols-12 gap-2 auto-rows-[80px] md:auto-rows-[100px]">
            {MOCK_INDUSTRIES.map((ind) => {
              const isUp = ind.change >= 0;
              // Calculate color intensity based on change magnitude
              const absChange = Math.abs(ind.change);
              let bgColor: string;

              if (isUp) {
                if (absChange > 2) bgColor = "bg-red-600";
                else if (absChange > 1) bgColor = "bg-red-500/80";
                else bgColor = "bg-red-500/60";
              } else {
                if (absChange > 2) bgColor = "bg-green-600";
                else if (absChange > 1) bgColor = "bg-green-500/80";
                else bgColor = "bg-green-500/60";
              }

              return (
                <div
                  key={ind.name}
                  className={`${ind.colSpan} ${ind.rowSpan} ${bgColor} rounded-xl p-3 md:p-4 text-white shadow-sm flex flex-col justify-between hover:brightness-110 hover:scale-[1.01] transition-all cursor-pointer ring-1 ring-white/10`}
                >
                  <div className="font-bold text-sm md:text-base leading-tight drop-shadow-md">
                    {ind.name}
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[10px] md:text-xs font-medium opacity-80">
                      {ind.weight * 10}% Wgt
                    </span>
                    <span className="font-bold text-sm md:text-lg tracking-tight drop-shadow-md">
                      {isUp ? "+" : ""}{ind.change}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
