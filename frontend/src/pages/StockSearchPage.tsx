import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { searchStocks, listStocks } from "@/api/stocks";
import { Search, ArrowRight, Loader2, Cpu, Landmark, Ship, Pill, Utensils, Monitor, Radio, Settings } from "lucide-react";

const INDUSTRIES = [
  { id: "semiconductor", name: "半導體業", icon: Cpu },
  { id: "computer", name: "電腦及週邊設備業", icon: Monitor },
  { id: "electronic", name: "電子零組件業", icon: Settings },
  { id: "network", name: "通信網路業", icon: Radio },
  { id: "finance", name: "金融保險業", icon: Landmark },
  { id: "shipping", name: "航運業", icon: Ship },
  { id: "medical", name: "生技醫療業", icon: Pill },
  { id: "food", name: "食品工業", icon: Utensils },
];

type AssetType = "all" | "stock" | "etf";
type PerformanceFilter = "none" | "gainers" | "losers";

const BATCH_SIZE = 40;

// Deterministic pseudo-random function based on string seed
function getMockChange(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  const random = Math.abs(Math.sin(hash));
  return parseFloat((random * 10 - 5).toFixed(2));
}

export function StockSearchPage() {
  const location = useLocation();
  const [query, setQuery] = useState(location.state?.initialQuery || "");
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<AssetType>("all");
  const [performance, setPerformance] = useState<PerformanceFilter>("none");
  
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [query, selectedIndustry, assetType, performance]);

  // 1. Search Query (Global Search across all data)
  const searchQuery = useQuery({
    queryKey: ["stock-search", query],
    queryFn: () => searchStocks(query),
    enabled: query.length > 0,
  });

  // 2. Fetch all stocks for client-side filtering
  const allQuery = useQuery({
    queryKey: ["stocks", 0, 3000],
    queryFn: () => listStocks(0, 3000),
    enabled: query.length === 0,
  });

  const rawResults = useMemo(() => {
    if (query.length > 0) return searchQuery.data || [];
    return allQuery.data || [];
  }, [query, searchQuery.data, allQuery.data]);

  const isLoading = query.length > 0 ? searchQuery.isLoading : allQuery.isLoading;

  // Filter & Sort Logic
  const filteredResults = useMemo(() => {
    if (!rawResults) return [];
    
    let filtered = rawResults.map(s => {
      const mockChange = getMockChange(s.symbol);
      const isEtf = s.symbol.startsWith("00") || s.symbol.length >= 5;
      return { ...s, changePercent: mockChange, isEtf };
    });

    if (selectedIndustry) filtered = filtered.filter(s => s.industry === selectedIndustry);
    if (assetType === "stock") filtered = filtered.filter(s => !s.isEtf);
    else if (assetType === "etf") filtered = filtered.filter(s => s.isEtf);

    if (performance === "gainers") {
      filtered = filtered.filter(s => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
    } else if (performance === "losers") {
      filtered = filtered.filter(s => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
    } else {
      filtered = [...filtered].sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    return filtered;
  }, [rawResults, selectedIndustry, assetType, performance]);

  const visibleResults = filteredResults.slice(0, visibleCount);
  const hasMore = visibleCount < filteredResults.length;

  // 3. Automatic Infinite Scroll (Intersection Observer for rendering)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => prev + BATCH_SIZE);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">Explore Market</h1>
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search symbol or name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.length > 0) {
                setSelectedIndustry(null);
                setAssetType("all");
                setPerformance("none");
              }
            }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset Type</span>
            <div className="flex bg-muted p-1 rounded-lg">
              {(["all", "stock", "etf"] as AssetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssetType(t)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    assetType === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {t === "all" ? "All" : t === "stock" ? "Stocks" : "ETFs"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Perf.</span>
            <div className="flex bg-muted p-1 rounded-lg">
              {(["none", "gainers", "losers"] as PerformanceFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPerformance(p)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    performance === p ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {p === "none" ? "Default" : p === "gainers" ? "Gainers" : "Losers"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry Quick Filters</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedIndustry(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedIndustry === null 
                  ? "bg-accent border-accent text-accent-foreground" 
                  : "bg-card border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {INDUSTRIES.map((ind) => {
              const Icon = ind.icon;
              return (
                <button
                  key={ind.id}
                  onClick={() => {
                    setSelectedIndustry(selectedIndustry === ind.name ? null : ind.name);
                    setQuery("");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedIndustry === ind.name 
                      ? "bg-accent border-accent text-accent-foreground" 
                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {ind.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin h-10 w-10 text-accent" />
        </div>
      )}

      {!isLoading && filteredResults && filteredResults.length === 0 && (
        <div className="bg-card border border-border rounded-xl py-16 text-center">
          <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-20" />
          <p className="text-lg font-medium text-primary">No matching stocks found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
        </div>
      )}

      {!isLoading && visibleResults && visibleResults.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleResults.map((stock: any) => (
              <Link
                key={stock.symbol}
                to={`/stocks/${stock.symbol}`}
                className="bg-card border border-border rounded-xl p-4 hover:border-accent hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-primary group-hover:text-accent transition-colors">{stock.symbol}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        stock.isEtf ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {stock.isEtf ? "ETF" : stock.market}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-primary truncate max-w-[120px]">{stock.name}</p>
                    <p className="text-xs text-muted-foreground">{stock.industry || "N/A"}</p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className={`text-sm font-bold px-2 py-1 rounded ${
                      stock.changePercent > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                    }`}>
                      {stock.changePercent > 0 ? "+" : ""}{stock.changePercent}%
                    </div>
                    <div className="bg-muted p-1.5 rounded-lg group-hover:bg-accent/10 transition-colors inline-block">
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Automatic Infinite Scroll Sentinel */}
          {hasMore && (
            <div 
              ref={sentinelRef}
              id="infinite-scroll-sentinel" 
              className="flex justify-center py-12 min-h-[100px]"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin w-4 h-4" />
                Loading more stocks...
              </div>
            </div>
          )}
          
          {!hasMore && visibleResults.length > 0 && (
             <div className="flex justify-center py-8">
                <p className="text-sm text-muted-foreground">You've reached the end of the list.</p>
             </div>
          )}
        </>
      )}
    </div>
  );
}
