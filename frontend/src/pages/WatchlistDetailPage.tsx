import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import {
  getWatchlist,
  getWatchlistAnalysis,
  getWatchlistQuotes,
  removeWatchlistItem,
  addWatchlistItem,
} from "@/api/watchlists";
import { searchStocks } from "@/api/stocks";
import { getStockAIAnalysis } from "@/api/stocks";
import { useSSEQuotes } from "@/hooks/useSSEQuotes";
import { getApiErrorMessage } from "@/api/client";
import {
  getResolvedAIAnalysis,
  isActiveAIAnalysisJob,
} from "@/lib/aiAnalysis";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  Loader2,
  PieChart,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

const aiActionLabels = {
  1: "買入",
  0: "觀望",
  [-1]: "賣出",
} as const;

const aiActionBadge = {
  1: "success",
  0: "warning",
  [-1]: "danger",
} as const;

const riskBadge = {
  low: "success",
  medium: "warning",
  high: "danger",
} as const;

const riskLabels = {
  low: "低風險",
  medium: "中等風險",
  high: "高風險",
} as const;

export function WatchlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const watchlistId = Number(id);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [runWatchlistAI, setRunWatchlistAI] = useState(false);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);

  const watchlistQuery = useQuery({
    queryKey: ["watchlist", watchlistId],
    queryFn: () => getWatchlist(watchlistId),
    enabled: !!watchlistId,
  });

  const symbols = useMemo(() => {
    return watchlistQuery.data?.items.map((s) => s.symbol) ?? [];
  }, [watchlistQuery.data]);

  const { quotes: liveQuotes, connected: sseConnected } = useSSEQuotes(symbols);

  const quotesQuery = useQuery({
    queryKey: ["watchlist-quotes", watchlistId],
    queryFn: () => getWatchlistQuotes(watchlistId),
    enabled: !!watchlistId && symbols.length > 0 && !sseConnected,
  });

  const analysisQuery = useQuery({
    queryKey: ["watchlist-analysis", watchlistId],
    queryFn: () => getWatchlistAnalysis(watchlistId),
    enabled: !!watchlistId,
  });

  const searchMutation = useQuery({
    queryKey: ["stock-search-add", searchQuery],
    queryFn: () => searchStocks(searchQuery),
    enabled: searchQuery.length > 1 && showSearch,
  });

  const aiAnalysisQueries = useQueries({
    queries: symbols.map((stockSymbol) => ({
      queryKey: ["stock-ai-analysis", stockSymbol],
      queryFn: () => getStockAIAnalysis(stockSymbol),
      enabled: runWatchlistAI,
      retry: false,
      refetchInterval: (query: { state: { data: unknown } }) =>
        isActiveAIAnalysisJob(query.state.data as never) ? 5000 : false,
    })),
  });

  const removeMutation = useMutation({
    mutationFn: (symbol: string) => removeWatchlistItem(watchlistId, symbol),
    onSuccess: () => {
      toast.success("Removed from watchlist");
      queryClient.invalidateQueries({ queryKey: ["watchlist", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist-quotes", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist-analysis", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Failed to remove"));
    },
  });

  const addMutation = useMutation({
    mutationFn: (symbol: string) => addWatchlistItem(watchlistId, symbol),
    onSuccess: () => {
      toast.success("Added to watchlist");
      setSearchQuery("");
      setShowSearch(false);
      queryClient.invalidateQueries({ queryKey: ["watchlist", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist-quotes", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist-analysis", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Failed to add"));
    },
  });

  const watchlist = watchlistQuery.data;
  const analysis = analysisQuery.data;

  const aiRows = useMemo(() => {
    return symbols.map((stockSymbol, index) => {
      const stock = watchlist?.items.find((item) => item.symbol === stockSymbol);
      const query = aiAnalysisQueries[index];
      const analysis = getResolvedAIAnalysis(query?.data);
      return {
        symbol: stockSymbol,
        name: stock?.name ?? "",
        analysis,
        isLoading: query?.isLoading || isActiveAIAnalysisJob(query?.data),
        isFetching: query?.isFetching,
        error: query?.error,
      };
    });
  }, [aiAnalysisQueries, symbols, watchlist]);

  const aiSummary = useMemo(() => {
    return aiRows.reduce(
      (acc, row) => {
        if (row.analysis?.action === 1) acc.buy += 1;
        if (row.analysis?.action === 0) acc.hold += 1;
        if (row.analysis?.action === -1) acc.sell += 1;
        if (row.isLoading) acc.pending += 1;
        if (row.error) acc.failed += 1;
        return acc;
      },
      { buy: 0, hold: 0, sell: 0, pending: 0, failed: 0 }
    );
  }, [aiRows]);

  const isAnalyzingWatchlist = aiAnalysisQueries.some((query) => query.isLoading || query.isFetching);

  const quoteMap = useMemo(() => {
    const map = new Map();
    if (sseConnected) {
      liveQuotes.forEach((q, symbol) => map.set(symbol, q));
    } else if (quotesQuery.data) {
      quotesQuery.data.quotes.forEach((q) => map.set(q.symbol, q));
    }
    return map;
  }, [sseConnected, liveQuotes, quotesQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/watchlists"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">{watchlist?.name || "Watchlist"}</h1>
            {sseConnected && (
              <Badge variant="success" className="flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {watchlist?.items.length ?? 0} 檔股票
          </p>
        </div>
        <Button onClick={() => setShowSearch(!showSearch)}>
          {showSearch ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showSearch ? "關閉" : "新增股票"}
        </Button>
      </div>

      {showSearch && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜尋股票代號或名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>
          {searchMutation.isLoading && (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
            </div>
          )}
          {searchMutation.data && searchMutation.data.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {searchMutation.data.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => addMutation.mutate(s.symbol)}
                  disabled={addMutation.isPending}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{s.symbol}</p>
                    <p className="text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  <Plus className="w-4 h-4 text-accent" />
                </button>
              ))}
            </div>
          )}
          {searchQuery.length > 1 && searchMutation.data?.length === 0 && !searchMutation.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-2">找不到符合的股票。</p>
          )}
        </div>
      )}

      {watchlistQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {analysis && watchlist && watchlist.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChart className="h-4 w-4 text-accent" />
                  清單分析
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  以等權重觀察，不含真實股數、成本與持股權重。
                </p>
              </div>
              <Badge variant={riskBadge[analysis.concentration.risk_level]}>
                {riskLabels[analysis.concentration.risk_level]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">分散分數</p>
                <p className="text-xl font-semibold text-primary">
                  {analysis.concentration.diversification_score}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">最大產業</p>
                <p className="text-xl font-semibold text-primary">
                  {analysis.concentration.top_industry?.percentage ?? 0}%
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {analysis.concentration.top_industry?.label ?? "未分類"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">技術訊號</p>
                <p className="text-sm font-semibold text-primary">
                  買 {analysis.signal_distribution.buy} / 觀望 {analysis.signal_distribution.hold} / 賣{" "}
                  {analysis.signal_distribution.sell}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-primary">
                {analysis.concentration.top_industry?.label ?? "未分類"}佔{" "}
                {analysis.concentration.top_industry?.percentage ?? 0}%，
                清單目前屬於{riskLabels[analysis.concentration.risk_level]}觀察。
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">主要提醒</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {analysis.risks[0] ?? "目前沒有明顯的集中風險。"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">下一步</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {analysis.recommended_actions[0] ?? "新增股票時持續留意產業分散度。"}
                  </p>
                </div>
              </div>
            </div>

            {showAnalysisDetails && (
              <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">產業分布</p>
                  <div className="space-y-2">
                    {analysis.industry_allocation.slice(0, 4).map((bucket) => (
                      <div key={bucket.key}>
                        <div className="mb-1 flex justify-between gap-2 text-xs">
                          <span className="truncate text-primary">{bucket.label}</span>
                          <span className="text-muted-foreground">{bucket.percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${bucket.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">資產類型</p>
                  <div className="space-y-2">
                    {analysis.asset_mix.map((bucket) => (
                      <div
                        key={bucket.key}
                        className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"
                      >
                        <span className="text-primary">
                          {bucket.key === "etf" ? "ETF" : "個股"}
                        </span>
                        <span className="text-muted-foreground">
                          {bucket.count} 檔 ({bucket.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 text-accent" />
                <span>
                  個股 AI：買 {aiSummary.buy} / 觀望 {aiSummary.hold} / 賣 {aiSummary.sell}
                </span>
                {(aiSummary.pending > 0 || aiSummary.failed > 0) && (
                  <span>
                    / 處理中 {aiSummary.pending} / 失敗 {aiSummary.failed}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAnalysisDetails((value) => !value)}>
                  {showAnalysisDetails ? "收合細節" : "顯示細節"}
                </Button>
                <Button
                  onClick={() => {
                    setRunWatchlistAI(true);
                    aiAnalysisQueries.forEach((query) => query.refetch());
                  }}
                  disabled={isAnalyzingWatchlist}
                >
                  {isAnalyzingWatchlist ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  分析個股
                </Button>
              </div>
            </div>

            {runWatchlistAI && (
              <div className="space-y-2 border-t border-border pt-4">
                {aiRows.map((row) => {
                  const action = row.analysis?.action;
                  return (
                    <div key={row.symbol} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Link
                            to={`/stocks/${row.symbol}`}
                            className="font-semibold text-primary hover:text-accent"
                          >
                            {row.symbol}
                          </Link>
                          <span className="ml-2 text-sm text-muted-foreground">{row.name}</span>
                        </div>
                        {row.isLoading ? (
                          <Badge variant="secondary" className="gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            分析中
                          </Badge>
                        ) : action !== undefined ? (
                          <Badge variant={aiActionBadge[action]}>
                            {aiActionLabels[action]}
                          </Badge>
                        ) : row.error ? (
                          <Badge variant="danger">失敗</Badge>
                        ) : (
                          <Badge variant="secondary">等待中</Badge>
                        )}
                      </div>

                      {row.analysis ? (
                        <p className="mt-2 text-sm leading-5 text-muted-foreground">
                          {row.analysis.summary.short_sentence}
                        </p>
                      ) : row.error ? (
                        <p className="mt-2 text-sm text-danger">
                          {getApiErrorMessage(row.error, "AI 分析失敗")}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!watchlistQuery.isLoading && watchlist && watchlist.items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>這份觀察清單目前沒有股票。</p>
          <button
            onClick={() => setShowSearch(true)}
            className="mt-2 text-accent text-sm font-medium hover:underline"
          >
            新增第一檔股票
          </button>
        </div>
      )}

      {watchlist && watchlist.items.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">代號</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">名稱</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">價格</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">漲跌</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">成交量</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">區間</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {watchlist.items.map((stock) => {
                  const q = quoteMap.get(stock.symbol);
                  const isUp = q?.change ? parseFloat(q.change) >= 0 : true;
                  return (
                    <tr key={stock.symbol} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/stocks/${stock.symbol}`}
                          className="font-semibold text-primary hover:text-accent"
                        >
                          {stock.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{stock.name}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary">
                        {q?.price ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {q ? (
                          <div className={`flex items-center justify-end gap-1 ${isUp ? "text-success" : "text-danger"}`}>
                            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            <span>{q.change ?? "-"}</span>
                            <span className="text-xs">({q.change_percent ?? "-"}%)</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {q ? q.volume.toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {q ? `${q.low} - ${q.high}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${stock.symbol}?`)) removeMutation.mutate(stock.symbol);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-danger hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {quotesQuery.isFetching && !sseConnected && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/50 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-accent" />
              更新報價中...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
