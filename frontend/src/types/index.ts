export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  new_password: string;
}

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockPrice {
  date: string;
  open_price: string;
  high_price: string;
  low_price: string;
  close_price: string;
  volume: number;
  change?: string | null;
  change_percent?: string | null;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: string;
  open: string;
  high: string;
  low: string;
  close?: string | null;
  volume: number;
  change?: string | null;
  change_percent?: string | null;
  last_updated: string;
}

export interface StockSyncStatus {
  symbol: string;
  status: string;
  synced_from?: string | null;
  synced_to?: string | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  records_upserted: number;
}

export interface StockSyncJob {
  id: number;
  symbol: string;
  status: string;
  start?: string | null;
  end?: string | null;
  message?: string | null;
  error?: string | null;
  records_upserted: number;
  records_skipped: number;
  months_requested: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface Watchlist {
  id: number;
  name: string;
  user_id: number;
  items: Stock[];
  created_at: string;
  updated_at: string;
}

export interface WatchlistCreate {
  name: string;
}

export interface WatchlistWithQuotes {
  id: number;
  name: string;
  quotes: StockQuote[];
}
