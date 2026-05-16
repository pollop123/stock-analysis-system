import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listWatchlists, createWatchlist, deleteWatchlist } from "@/api/watchlists";
import { toast } from "sonner";
import { Plus, Trash2, List, ChevronRight } from "lucide-react";

export function WatchlistsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["watchlists"],
    queryFn: listWatchlists,
  });

  const createMutation = useMutation({
    mutationFn: createWatchlist,
    onSuccess: () => {
      toast.success("Watchlist created");
      setNewName("");
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to create");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWatchlist,
    onSuccess: () => {
      toast.success("Watchlist deleted");
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to delete");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Watchlists</h1>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Watchlist
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
            autoFocus
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No watchlists yet.</p>
          <p className="text-sm">Create one to start tracking stocks.</p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((wl) => (
            <div
              key={wl.id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <Link to={`/watchlists/${wl.id}`} className="flex-1">
                  <h3 className="text-lg font-semibold text-primary hover:text-accent transition-colors">
                    {wl.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {wl.items.length} stock{wl.items.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {wl.items.slice(0, 5).map((s) => (
                      <span
                        key={s.symbol}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                      >
                        {s.symbol}
                      </span>
                    ))}
                    {wl.items.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        +{wl.items.length - 5}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2 ml-4">
                  <Link
                    to={`/watchlists/${wl.id}`}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this watchlist?")) deleteMutation.mutate(wl.id);
                    }}
                    className="p-2 text-muted-foreground hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
