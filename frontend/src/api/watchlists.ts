import { apiClient } from "./client";
import type {
  Watchlist,
  WatchlistCreate,
  WatchlistWithQuotes,
} from "@/types";

export async function listWatchlists(): Promise<Watchlist[]> {
  const res = await apiClient.get<Watchlist[]>("watchlists");
  return res.data;
}

export async function createWatchlist(data: WatchlistCreate): Promise<Watchlist> {
  const res = await apiClient.post<Watchlist>("watchlists", data);
  return res.data;
}

export async function getWatchlist(id: number): Promise<Watchlist> {
  const res = await apiClient.get<Watchlist>(`watchlists/${id}`);
  return res.data;
}

export async function deleteWatchlist(id: number): Promise<void> {
  await apiClient.delete(`watchlists/${id}`);
}

export async function updateWatchlist(id: number, data: Partial<WatchlistCreate>): Promise<Watchlist> {
  const res = await apiClient.patch<Watchlist>(`watchlists/${id}`, data);
  return res.data;
}

export async function addWatchlistItem(watchlistId: number, symbol: string): Promise<Watchlist> {
  const res = await apiClient.put<Watchlist>(`watchlists/${watchlistId}/items/${symbol}`);
  return res.data;
}

export async function removeWatchlistItem(
  watchlistId: number,
  symbol: string
): Promise<void> {
  await apiClient.delete(`watchlists/${watchlistId}/items/${symbol}`);
}

export async function getWatchlistQuotes(watchlistId: number): Promise<WatchlistWithQuotes> {
  const res = await apiClient.get<WatchlistWithQuotes>(`watchlists/${watchlistId}/quotes`);
  return res.data;
}
