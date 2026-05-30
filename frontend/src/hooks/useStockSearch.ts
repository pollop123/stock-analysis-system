import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchStocks, listStocks, getStockSummaries } from "@/api/stocks";
import { useSSEQuotes } from "./useSSEQuotes";
import type { StockSummary } from "@/types";

export type AssetType = "all" | "stocks" | "etfs";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function isEtf(stock: { symbol: string; is_etf?: boolean | null }) {
  return stock.is_etf === true || stock.symbol.startsWith("00") || stock.symbol.length >= 5;
}

export function useStockSearch() {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse initial state from URL
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get("q") ?? "";
  const initialType = (params.get("type") as AssetType) || "all";
  const initialIndustry = params.get("industry") || null;

  const [query, setQueryState] = useState(initialQuery);
  const [assetType, setAssetType] = useState<AssetType>(initialType);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(
    initialIndustry
  );
  const [sortBy, setSortBy] = useState<
    "symbol" | "price_desc" | "price_asc" | "change_desc" | "change_asc" | "score"
  >("symbol");
  const [visibleCount, setVisibleCount] = useState(40);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Sync state to URL
  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (debouncedQuery) nextParams.set("q", debouncedQuery);
    if (assetType !== "all") nextParams.set("type", assetType);
    if (selectedIndustry) nextParams.set("industry", selectedIndustry);

    const nextSearch = nextParams.toString();
    const currentSearch = location.search.replace(/^\?/, "");

    if (nextSearch !== currentSearch) {
      navigate(
        { pathname: location.pathname, search: nextSearch },
        { replace: true }
      );
    }
  }, [debouncedQuery, assetType, selectedIndustry, navigate, location.pathname, location.search]);

  // Fetch data
  const searchQuery = useQuery({
    queryKey: ["stock-search", debouncedQuery],
    queryFn: () => searchStocks(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 60_000,
  });

  const allQuery = useQuery({
    queryKey: ["stocks-all"],
    queryFn: () => listStocks(0, 500),
    enabled: debouncedQuery.length === 0,
    staleTime: 300_000,
  });

  const rawResults = useMemo(
    () =>
      debouncedQuery.length > 0
        ? (searchQuery.data ?? [])
        : (allQuery.data ?? []),
    [allQuery.data, debouncedQuery, searchQuery.data]
  );
  const isLoading =
    debouncedQuery.length > 0 ? searchQuery.isLoading : allQuery.isLoading;

  // Industries derived from current results
  const industries = useMemo(() => {
    const set = new Set<string>();
    rawResults.forEach((s) => {
      if (s.industry) set.add(s.industry);
    });
    return Array.from(set).sort();
  }, [rawResults]);

  // Client-side filtering
  const filteredResults = useMemo(() => {
    return rawResults.filter((stock) => {
      if (assetType === "etfs" && !isEtf(stock)) return false;
      if (assetType === "stocks" && isEtf(stock)) return false;
      if (selectedIndustry && stock.industry !== selectedIndustry) return false;
      return true;
    });
  }, [rawResults, assetType, selectedIndustry]);

  const visibleResults = useMemo(
    () => filteredResults.slice(0, visibleCount),
    [filteredResults, visibleCount]
  );

  // Fetch batch summaries for visible stocks
  const visibleSymbols = useMemo(
    () => visibleResults.map((s) => s.symbol),
    [visibleResults]
  );

  const summariesQuery = useQuery({
    queryKey: ["stock-summaries", visibleSymbols.join(",")],
    queryFn: () => getStockSummaries(visibleSymbols),
    enabled: visibleSymbols.length > 0 && visibleSymbols.length <= 50,
    staleTime: 60_000,
  });

  const summariesMap = useMemo(() => {
    const map = new Map<string, StockSummary>();
    summariesQuery.data?.forEach((s) => map.set(s.symbol, s));
    return map;
  }, [summariesQuery.data]);

  // Live SSE quotes for visible cards (cap at 50 symbols)
  const sseSymbols = useMemo(
    () => visibleSymbols.slice(0, 50),
    [visibleSymbols]
  );
  const { quotes: liveQuotes, connected: sseConnected } = useSSEQuotes(sseSymbols);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= filteredResults.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => n + 40);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, filteredResults.length]);

  const hasActiveFilters =
    debouncedQuery.length > 0 || assetType !== "all" || !!selectedIndustry;

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setSelectedIndustry(null);
    setVisibleCount(40);
  }, []);

  const handleSetAssetType = useCallback((value: AssetType) => {
    setAssetType(value);
    setVisibleCount(40);
  }, []);

  const handleSetSelectedIndustry = useCallback((value: string | null) => {
    setSelectedIndustry(value);
    setVisibleCount(40);
  }, []);

  const clearFilters = useCallback(() => {
    setQueryState("");
    setAssetType("all");
    setSelectedIndustry(null);
    setVisibleCount(40);
  }, []);

  return {
    query,
    setQuery,
    assetType,
    setAssetType: handleSetAssetType,
    selectedIndustry,
    setSelectedIndustry: handleSetSelectedIndustry,
    sortBy,
    setSortBy,
    visibleResults,
    filteredResults,
    isLoading,
    industries,
    visibleCount,
    sentinelRef,
    hasActiveFilters,
    clearFilters,
    summariesMap,
    summariesLoading: summariesQuery.isLoading,
    liveQuotes,
    sseConnected,
  };
}
