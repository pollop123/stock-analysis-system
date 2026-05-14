import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { getStockQuote, getStockHistory, getStockSyncStatus, syncStockPrices } from "@/api/stocks";
import { listWatchlists, addWatchlistItem } from "@/api/watchlists";
import type { StockPrice } from "@/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Calendar,
  BarChart3,
  Info,
  ChevronDown,
  Loader2,
} from "lucide-react";

type Resolution = "day" | "week" | "year";

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); 
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return monday.toISOString().split("T")[0];
}

function aggregatePrices(prices: StockPrice[], resolution: Resolution): StockPrice[] {
  if (resolution === "day") return prices;
  const groups = new Map<string, StockPrice[]>();
  for (const p of prices) {
    let key: string;
    if (resolution === "week") {
      key = getMonday(p.date);
    } else {
      key = p.date.substring(0, 4) + "-01-01";
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const sortedKeys = Array.from(groups.keys()).sort();
  const result: StockPrice[] = [];
  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    group.sort((a, b) => a.date.localeCompare(b.date));
    const open = group[0].open_price;
    const close = group[group.length - 1].close_price;
    const high = Math.max(...group.map((p) => parseFloat(p.high_price))).toFixed(2);
    const low = Math.min(...group.map((p) => parseFloat(p.low_price))).toFixed(2);
    const volume = group.reduce((sum, p) => sum + p.volume, 0);
    result.push({ date: key, open_price: open, high_price: high, low_price: low, close_price: close, volume });
  }
  return result;
}

function generateMockHistory(symbol: string): StockPrice[] {
  const data: StockPrice[] = [];
  const now = new Date();
  let price = (parseInt(symbol) % 500) + 100 || 500;
  if (symbol === "2330") price = 700;
  
  for (let i = 150; i >= 0; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const volatility = price * 0.02;
    const change = (Math.random() * volatility * 2 - volatility);
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(Math.random() * 1000000) + 200000;
    
    data.push({
      date: date.toISOString().split("T")[0],
      open_price: open.toFixed(2),
      high_price: high.toFixed(2),
      low_price: low.toFixed(2),
      close_price: close.toFixed(2),
      volume,
    });
    price = close;
  }
  return data;
}

export function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const queryClient = useQueryClient();

  const startDate = "";
  const endDate = "";
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("day");

  const quoteQuery = useQuery({
    queryKey: ["stock-quote", symbol],
    queryFn: () => getStockQuote(symbol!),
    enabled: !!symbol,
    refetchInterval: 30000,
  });

  const historyQuery = useQuery({
    queryKey: ["stock-history", symbol, startDate, endDate],
    queryFn: () => getStockHistory(symbol!, startDate || undefined, endDate || undefined),
    enabled: !!symbol,
  });

  const isMocking = !historyQuery.isLoading && (!historyQuery.data || historyQuery.data.length === 0);

  const syncStatusQuery = useQuery({
    queryKey: ["stock-sync-status", symbol],
    queryFn: () => getStockSyncStatus(symbol!),
    enabled: !!symbol,
  });

  const watchlistsQuery = useQuery({
    queryKey: ["watchlists"],
    queryFn: listWatchlists,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncStockPrices(symbol!, startDate || undefined, endDate || undefined),
    onSuccess: (data) => {
      if (data.status === "failed") {
        toast.error(data.error || "Sync failed");
      } else {
        toast.success("Historical data requested!");
      }
      queryClient.invalidateQueries({ queryKey: ["stock-history", symbol] });
      queryClient.invalidateQueries({ queryKey: ["stock-sync-status", symbol] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ watchlistId, symbol: s }: { watchlistId: number; symbol: string }) =>
      addWatchlistItem(watchlistId, s),
    onSuccess: () => {
      toast.success("Added to watchlist");
      setShowAddMenu(false);
    },
  });

  const chartData = useMemo(() => {
    if (historyQuery.isLoading) return [];
    const prices = historyQuery.data || [];
    if (prices.length === 0) {
      return aggregatePrices(generateMockHistory(symbol || "STOCK"), resolution);
    }
    return aggregatePrices(prices, resolution);
  }, [historyQuery.data, historyQuery.isLoading, resolution, symbol]);

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderColor: "#f1f5f9" },
      timeScale: { borderColor: "#f1f5f9" },
      autoSize: true,
    });

    const upColor = "#ef4444";
    const downColor = "#22c55e";

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor, downColor, borderUpColor: upColor, borderDownColor: downColor,
      wickUpColor: upColor, wickDownColor: downColor,
    });
    
    const sortedHistory = [...chartData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    candleSeries.setData(sortedHistory.map((p) => ({
      time: p.date as Time,
      open: parseFloat(p.open_price),
      high: parseFloat(p.high_price),
      low: parseFloat(p.low_price),
      close: parseFloat(p.close_price),
    })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(sortedHistory.map((p) => ({
      time: p.date as Time,
      value: p.volume,
      color: parseFloat(p.close_price) >= parseFloat(p.open_price) ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)",
    })));

    chart.timeScale().fitContent();
    chartRef.current = chart;
    return () => chart.remove();
  }, [chartData]);

  const quote = quoteQuery.data;
  const isUp = quote?.change ? parseFloat(quote.change) >= 0 : true;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/stocks" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Market
        </Link>
        {isMocking && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <Info className="w-3 h-3" /> Demo Data Mode
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black text-primary tracking-tight">{symbol}</h1>
            <div className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-bold rounded">
              {(symbol?.startsWith("00") || (symbol && symbol.length >= 5)) ? "ETF" : "TWSE"}
            </div>
          </div>
          <h2 className="text-xl font-medium text-muted-foreground">{quote?.name || "Loading Stock Details..."}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-foreground rounded-xl text-sm font-bold hover:shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add to Watchlist <ChevronDown className="w-4 h-4 opacity-50" />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-2 space-y-1">
                  {watchlistsQuery.data?.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">No watchlists found. <Link to="/watchlists" className="text-accent font-bold">Create one</Link></p>
                  ) : (
                    watchlistsQuery.data?.map((wl) => (
                      <button
                        key={wl.id}
                        onClick={() => addItemMutation.mutate({ watchlistId: wl.id, symbol: symbol! })}
                        className="w-full text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-muted transition-colors flex items-center justify-between group"
                      >
                        {wl.name}
                        <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 border border-border bg-card rounded-xl text-sm font-bold hover:bg-muted transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} /> Sync Market Data
          </button>
        </div>
      </div>

      {quote && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Current Price", value: quote.price, highlight: true },
            { label: "Daily Change", value: quote.change, sub: `${quote.change_percent}%`, trend: isUp },
            { label: "Trading Volume", value: quote.volume.toLocaleString() },
            { label: "Day Range", value: `${quote.low} - ${quote.high}`, footer: `Open: ${quote.open}` },
          ].map((stat, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-2xl font-black ${stat.highlight ? "text-accent" : "text-primary"}`}>{stat.value}</p>
                {stat.sub && (
                  <p className={`text-sm font-bold ${stat.trend ? "text-danger" : "text-success"}`}>
                    {stat.trend ? "+" : ""}{stat.sub}
                  </p>
                )}
              </div>
              {stat.footer && <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.footer}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent/10 rounded-lg"><BarChart3 className="w-5 h-5 text-accent" /></div>
            <div>
              <h2 className="text-lg font-bold text-primary">Technical Chart</h2>
              <p className="text-xs text-muted-foreground font-medium">OHLCV Analysis</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-muted p-1 rounded-xl border border-border">
              {["day", "week", "year"].map((v) => (
                <button
                  key={v}
                  onClick={() => setResolution(v as Resolution)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    resolution === v ? "bg-card text-accent shadow-sm" : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground bg-muted px-3 py-2 rounded-xl border border-border">
              <Calendar className="w-3.5 h-3.5" />
              <span>History Data Period</span>
            </div>
          </div>
        </div>

        <div className="p-6 relative">
          {historyQuery.isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 backdrop-blur-sm">
              <Loader2 className="animate-spin h-10 w-10 text-accent" />
            </div>
          )}
          <div ref={chartContainerRef} className="w-full" style={{ height: 500 }} />
        </div>
        
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-between items-center">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-4">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-danger"></div> Bullish</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success"></div> Bearish</div>
          </div>
          {syncStatusQuery.data && (
            <p className="text-[10px] font-medium text-muted-foreground italic">
              Last Synced: {syncStatusQuery.data.synced_from || "N/A"} ~ {syncStatusQuery.data.synced_to || "N/A"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
