import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWatchlist,
  getWatchlistQuotes,
  removeWatchlistItem,
  addWatchlistItem,
} from "@/api/watchlists";
import { searchStocks } from "@/api/stocks";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  Trash2,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
} from "lucide-react";

export function WatchlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const watchlistId = Number(id);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const watchlistQuery = useQuery({
    queryKey: ["watchlist", watchlistId],
    queryFn: () => getWatchlist(watchlistId),
    enabled: !!watchlistId,
  });

  const quotesQuery = useQuery({
    queryKey: ["watchlist-quotes", watchlistId],
    queryFn: () => getWatchlistQuotes(watchlistId),
    enabled: !!watchlistId,
    refetchInterval: 30000,
  });

  const searchMutation = useQuery({
    queryKey: ["stock-search-add", searchQuery],
    queryFn: () => searchStocks(searchQuery),
    enabled: searchQuery.length > 1 && showSearch,
  });

  const removeMutation = useMutation({
    mutationFn: (symbol: string) => removeWatchlistItem(watchlistId, symbol),
    onSuccess: () => {
      toast.success("Removed from watchlist");
      queryClient.invalidateQueries({ queryKey: ["watchlist", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist-quotes", watchlistId] });
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to remove");
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
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to add");
    },
  });

  const watchlist = watchlistQuery.data;
  const quotes = quotesQuery.data?.quotes ?? [];

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/watchlists"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{watchlist?.name || "Watchlist"}</h1>
          <p className="text-sm text-muted-foreground">
            {watchlist?.items.length ?? 0} stock{watchlist?.items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          {showSearch ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showSearch ? "Close" : "Add Stock"}
        </button>
      </div>

      {showSearch && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search stock symbol or name..."
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
            <p className="text-sm text-muted-foreground text-center py-2">No results found.</p>
          )}
        </div>
      )}

      {watchlistQuery.isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      )}

      {!watchlistQuery.isLoading && watchlist && watchlist.items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>This watchlist is empty.</p>
          <button
            onClick={() => setShowSearch(true)}
            className="mt-2 text-accent text-sm font-medium hover:underline"
          >
            Add your first stock
          </button>
        </div>
      )}

      {watchlist && watchlist.items.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Symbol</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Change</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Volume</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Range</th>
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
          {quotesQuery.isFetching && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/50 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-accent" />
              Refreshing quotes...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
