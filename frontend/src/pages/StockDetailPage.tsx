import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  syncStockPrices,
  exportStockHistoryCSV,
} from "@/api/stocks";
import { createAlert } from "@/api/alerts";
import { addWatchlistItem } from "@/api/watchlists";
import { getApiErrorMessage } from "@/api/client";
import { useStockDetail } from "@/hooks/useStockDetail";
import { useTheme } from "@/hooks/useTheme";
import { useContentVisibility } from "@/hooks/useContentVisibility";
import { formatPercent } from "@/lib/format";
import { toast } from "sonner";

import { StockHeader } from "@/components/stock/StockHeader";
import { MetricsStrip } from "@/components/stock/MetricsStrip";
import { PriceChart } from "@/components/stock/PriceChart";
import { QuickActions } from "@/components/stock/QuickActions";
import { BuySellModal } from "@/components/stock/BuySellModal";
import { FooterDisclaimer } from "@/components/stock/FooterDisclaimer";
import { StockInsightCards } from "@/components/stock/StockInsightCards";

import {
  RefreshCw,
  Download,
  Bell,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}s`;
  return `${seconds}.${tenths}s`;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { isVisible } = useContentVisibility();

  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [buySellModal, setBuySellModal] = useState<{ type: "buy" | "sell" } | null>(null);
  const [, setLastSyncDuration] = useState<number | null>(null);
  const autoSyncAttemptedRef = useRef(false);
  const syncStartRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  /* -- Data (composed behind one seam) -- */
  const detail = useStockDetail(symbol);
  const {
    isAuthenticated,
    sseConnected,
    stock,
    profile,
    quote,
    isUp,
    history: historyQuery,
    chartData,
    syncStatus,
    recommendation: rec,
    fundamentals,
    aiAnalysis,
    aiIsLoading,
    watchlists,
  } = detail;

  /* -- Mutations -- */
  const syncMutation = useMutation({
    mutationFn: () => {
      setElapsedMs(0);
      syncStartRef.current = Date.now();
      return syncStockPrices(symbol!);
    },
    onSuccess: (data) => {
      if (syncStartRef.current) setLastSyncDuration(Date.now() - syncStartRef.current);
      if (data.status === "failed") toast.error(data.error || "Sync failed");
      else toast.success(data.message || "Sync completed");
      queryClient.invalidateQueries({ queryKey: ["stock-history", symbol] });
      queryClient.invalidateQueries({ queryKey: ["stock-sync-status", symbol] });
    },
    onError: (err: unknown) => {
      if (syncStartRef.current) setLastSyncDuration(Date.now() - syncStartRef.current);
      toast.error(getApiErrorMessage(err, "Sync failed"));
    },
  });

  const alertMutation = useMutation({
    mutationFn: () =>
      createAlert({
        symbol: symbol!,
        condition: alertCondition,
        target_price: alertPrice,
      }),
    onSuccess: () => {
      toast.success("Price alert created");
      setShowAlertForm(false);
      setAlertPrice("");
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Failed to create alert"));
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ watchlistId, symbol: s }: { watchlistId: number; symbol: string }) =>
      addWatchlistItem(watchlistId, s),
    onSuccess: () => {
      toast.success("Added to watchlist");
      setShowAddMenu(false);
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Failed to add to watchlist"));
    },
  });

  /* -- Effects -- */
  useEffect(() => {
    if (!syncMutation.isPending) return;
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [syncMutation.isPending]);

  useEffect(() => {
    if (
      isAuthenticated &&
      !autoSyncAttemptedRef.current &&
      historyQuery.data &&
      historyQuery.data.length === 0 &&
      !historyQuery.isLoading &&
      !syncMutation.isPending &&
      !syncMutation.isSuccess
    ) {
      autoSyncAttemptedRef.current = true;
      syncMutation.mutate();
    }
  }, [isAuthenticated, historyQuery.data, historyQuery.isLoading, syncMutation]);

  /* -- Derived data -- */
  const isDark = theme === "dark";

  /* -- Handlers -- */
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${symbol} Stock Detail`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await exportStockHistoryCSV(symbol!);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${symbol}_prices.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Failed to export CSV");
    }
  };

  /* -- Render -- */
  return (
    <div className="space-y-0">
      {/* Metrics Strip */}
      {isVisible("metrics_strip") && (
        <MetricsStrip
          quote={quote}
          peRatio={profile?.pe_ratio ?? undefined}
          dividendYield={
            profile?.dividend_yield
              ? formatPercent(profile.dividend_yield, { multiplier: 100 })
              : undefined
          }
        />
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 md:px-4 lg:px-8 py-4 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Stock Header */}
            {isVisible("stock_header") && (
              <StockHeader
                symbol={symbol || ""}
                stock={stock}
                quote={quote}
                recommendation={rec || undefined}
                isUp={isUp}
                onShare={handleShare}
              />
            )}

            {/* Price Chart */}
            {isVisible("price_chart") && (
              <PriceChart data={chartData} isLoading={historyQuery.isLoading} isDark={isDark} />
            )}

            <StockInsightCards
              stock={stock || null}
              recommendation={rec || null}
              fundamentals={fundamentals || null}
              quote={quote || null}
              priceHistoryCount={chartData.length}
              aiAnalysis={aiAnalysis}
              aiIsLoading={aiIsLoading}
              isAuthenticated={isAuthenticated}
            />

            {/* Alert Form */}
            {isVisible("alert_form") && showAlertForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="w-4 h-4 text-accent" />
                    Create Price Alert
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      value={alertCondition}
                      onChange={(e) => setAlertCondition(e.target.value as "above" | "below")}
                      className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <Input
                      type="number"
                      placeholder="Target price"
                      value={alertPrice}
                      onChange={(e) => setAlertPrice(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      onClick={() => alertMutation.mutate()}
                      disabled={!alertPrice || alertMutation.isPending}
                    >
                      Create
                    </Button>
                    <Button variant="ghost" onClick={() => setShowAlertForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4 md:space-y-6">
            {/* Quick Actions */}
            {isVisible("quick_actions") && (
              <QuickActions
                onBuy={() => setBuySellModal({ type: "buy" })}
                onSell={() => setBuySellModal({ type: "sell" })}
                onAlert={() => setShowAlertForm(!showAlertForm)}
                onWatchlist={() => setShowAddMenu(!showAddMenu)}
              />
            )}

            {/* Buy/Sell Modal */}
            {buySellModal && (
              <BuySellModal
                symbol={symbol || ""}
                type={buySellModal.type}
                currentPrice={quote?.price}
                onClose={() => setBuySellModal(null)}
              />
            )}

            {/* Watchlist dropdown */}
            {showAddMenu && isAuthenticated && (
              <Card>
                <CardContent className="p-3">
                  {watchlists?.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No watchlists.{" "}
                      <Link to="/watchlists" className="text-accent underline">
                        Create one
                      </Link>
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {watchlists?.map((wl) => (
                        <button
                          key={wl.id}
                          onClick={() =>
                            addItemMutation.mutate({ watchlistId: wl.id, symbol: symbol! })
                          }
                          className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                        >
                          {wl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Sync + CSV Actions */}
            {isVisible("sync_csv_actions") && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Data</span>
                    {sseConnected && (
                      <Badge variant="success" className="flex items-center gap-1 text-xs">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Live
                      </Badge>
                    )}
                  </div>
                  {syncStatus && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Status:{" "}
                        <span className="font-medium text-primary">{syncStatus.status}</span>
                      </p>
                      <p>
                        Synced: {syncStatus.synced_from || "—"} to {syncStatus.synced_to || "—"}
                      </p>
                    </div>
                  )}
                  {isAuthenticated && (
                    <Button
                      variant="outline"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="w-full"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                      {syncMutation.isPending ? `Syncing… ${formatDuration(elapsedMs)}` : "Sync Market Data"}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleExportCSV} className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <FooterDisclaimer />
    </div>
  );
}
