import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getStock,
  getStockAIAnalysis,
  getStockFundamentals,
  getStockHistory,
  getStockProfile,
  getStockQuote,
  getStockRecommendation,
  getStockSyncStatus,
} from "@/api/stocks";
import { listWatchlists } from "@/api/watchlists";
import { isActiveAIAnalysisJob } from "@/lib/aiAnalysis";
import { toNumber } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import { useSSEQuotes } from "./useSSEQuotes";

/**
 * Composes every read the stock detail view needs — nine queries, the live SSE
 * quote, AI-job polling, and the derived view-model (resolved quote, up/down,
 * chart data) — behind one seam. The page consumes the result and renders;
 * query keys, polling intervals and stale times live here, not scattered across
 * the component.
 */
export function useStockDetail(symbol: string | undefined) {
  const { user } = useAuthStore();
  const isAuthenticated = !!user;

  const { quotes: liveQuotes, connected: sseConnected } = useSSEQuotes(symbol ? [symbol] : []);
  const liveQuote = symbol ? liveQuotes.get(symbol) : undefined;

  const stockQuery = useQuery({
    queryKey: ["stock", symbol],
    queryFn: () => getStock(symbol!),
    enabled: !!symbol,
  });

  const profileQuery = useQuery({
    queryKey: ["stock-profile", symbol],
    queryFn: () => getStockProfile(symbol!),
    enabled: !!symbol,
  });

  const quoteQuery = useQuery({
    queryKey: ["stock-quote", symbol],
    queryFn: () => getStockQuote(symbol!),
    enabled: !!symbol && !liveQuote,
    refetchInterval: liveQuote ? false : 30000,
  });

  const historyQuery = useQuery({
    queryKey: ["stock-history", symbol],
    queryFn: () => getStockHistory(symbol!),
    enabled: !!symbol,
  });

  const syncStatusQuery = useQuery({
    queryKey: ["stock-sync-status", symbol],
    queryFn: () => getStockSyncStatus(symbol!),
    enabled: !!symbol,
  });

  const watchlistsQuery = useQuery({
    queryKey: ["watchlists"],
    queryFn: listWatchlists,
    enabled: isAuthenticated,
  });

  const recommendationQuery = useQuery({
    queryKey: ["stock-recommendation", symbol],
    queryFn: () => getStockRecommendation(symbol!),
    enabled: !!symbol,
  });

  const aiAnalysisQuery = useQuery({
    queryKey: ["stock-ai-analysis", symbol],
    queryFn: () => getStockAIAnalysis(symbol!),
    enabled: !!symbol && isAuthenticated,
    retry: false,
    refetchInterval: (query) => (isActiveAIAnalysisJob(query.state.data) ? 5000 : false),
  });

  const fundamentalsQuery = useQuery({
    queryKey: ["stock-fundamentals", symbol],
    queryFn: () => getStockFundamentals(symbol!),
    enabled: !!symbol,
    staleTime: 300000,
  });

  const quote = liveQuote || quoteQuery.data;
  const isUp = quote?.change ? (toNumber(quote.change) ?? 0) >= 0 : true;
  const chartData = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);

  return {
    isAuthenticated,
    sseConnected,
    liveQuote,
    stock: stockQuery.data,
    profile: profileQuery.data,
    quote,
    isUp,
    history: historyQuery,
    chartData,
    syncStatus: syncStatusQuery.data,
    recommendation: recommendationQuery.data,
    fundamentals: fundamentalsQuery.data,
    aiAnalysis: aiAnalysisQuery.data ?? null,
    aiIsLoading: aiAnalysisQuery.isLoading,
    watchlists: watchlistsQuery.data,
  };
}
