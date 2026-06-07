export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  role: string;
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

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry?: string | null;
  is_etf?: boolean | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockSummary {
  symbol: string;
  name: string;
  market: string;
  industry?: string | null;
  is_etf?: boolean | null;
  price?: string | null;
  change?: string | null;
  change_percent?: string | null;
  recommendation?: "buy" | "hold" | "sell" | null;
  confidence?: number | null;
  composite_score?: number | null;
  sparkline_data?: number[];
}

export interface StockFundamental {
  market_cap: string | null;
  pe_ratio: string | null;
  dividend_yield: string | null;
  eps: string | null;
  book_value: string | null;
  shares_outstanding: string | null;
  fifty_two_week_high: string | null;
  fifty_two_week_low: string | null;
  revenue_growth: string | null;
  profit_margins: string | null;
  debt_to_equity: string | null;
  return_on_equity: string | null;
  free_cashflow: string | null;
  beta: string | null;
  forward_pe: string | null;
  sector: string | null;
  website: string | null;
  long_business_summary: string | null;
  updated_at: string;
}

export interface StockProfile {
  symbol: string;
  name: string;
  market: string;
  industry?: string | null;
  sector?: string | null;
  website?: string | null;
  long_business_summary?: string | null;
  pe_ratio?: string | null;
  dividend_yield?: string | null;
  market_cap?: string | null;
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
  data_source?: string | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  records_upserted: number;
}

export interface RecommendationIndicators {
  close: string;
  ma5?: string | null;
  ma20?: string | null;
  ma60?: string | null;
  rsi14?: string | null;
  volume_ratio?: string | null;
  avg_volume_20d?: string | null;
  macd_dif?: string | null;
  macd_signal?: string | null;
  macd_histogram?: string | null;
  bollinger_upper?: string | null;
  bollinger_middle?: string | null;
  bollinger_lower?: string | null;
  kd_k?: string | null;
  kd_d?: string | null;
  atr14?: string | null;
  volatility_20d?: string | null;
}

export interface IndicatorSignals {
  ma: "buy" | "hold" | "sell";
  rsi: "buy" | "hold" | "sell";
  macd: "buy" | "hold" | "sell";
  volume: "buy" | "hold" | "sell";
  bollinger: "buy" | "hold" | "sell";
  kd: "buy" | "hold" | "sell";
}

export interface RiskMetrics {
  risk_level: "low" | "medium" | "high";
  volatility_risk: number;
  liquidity_risk: number;
  fx_risk: number;
  systemic_risk: number;
}

export interface SupportResistanceLevels {
  r2?: string | null;
  r1?: string | null;
  s1?: string | null;
  s2?: string | null;
  stop_loss?: string | null;
  target_price?: string | null;
  potential_return?: string | null;
}

export interface StockRecommendation {
  symbol: string;
  recommendation: "buy" | "hold" | "sell";
  confidence: number;
  as_of?: string | null;
  indicators: RecommendationIndicators;
  reasons: string[];
  disclaimer: string;
  indicator_signals: IndicatorSignals;
  composite_score: number;
  technical_score?: number;
  fundamental_score?: number | null;
  data_quality_score?: number;
  risk_metrics: RiskMetrics;
  support_resistance: SupportResistanceLevels;
}

export interface AIAnalysisSummary {
  short_sentence: string;
  long_sentence: string;
}

export interface AIAnalysisReasons {
  technical: string;
  fundamental: string;
  comprehensive: string;
}

export interface AIAnalysisResponse {
  request_id: string;
  action: -1 | 0 | 1;
  summary: AIAnalysisSummary;
  reasons: AIAnalysisReasons;
}

export interface AIAnalysisJob {
  id: number;
  symbol: string;
  status: "queued" | "running" | "success" | "failed" | string;
  result?: AIAnalysisResponse | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export type AIAnalysisResult = AIAnalysisResponse | AIAnalysisJob;

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

export interface StockTargetPrice {
  id: number;
  analyst: string;
  target_price: string;
  rating: string;
  report_date: string;
  created_at: string;
  updated_at: string;
}

export interface PriceAlert {
  id: number;
  symbol: string;
  condition: "above" | "below";
  target_price: string;
  is_active: boolean;
  triggered_at?: string | null;
  created_at: string;
  updated_at: string;
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

export interface WatchlistAllocationBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface WatchlistSignalDistribution {
  buy: number;
  hold: number;
  sell: number;
  unavailable: number;
}

export interface WatchlistAnalysis {
  id: number;
  name: string;
  total_stocks: number;
  equal_weight_assumption: boolean;
  summary: {
    short_sentence: string;
    long_sentence: string;
  };
  asset_mix: WatchlistAllocationBucket[];
  industry_allocation: WatchlistAllocationBucket[];
  market_allocation: WatchlistAllocationBucket[];
  signal_distribution: WatchlistSignalDistribution;
  concentration: {
    top_industry?: WatchlistAllocationBucket | null;
    top_market?: WatchlistAllocationBucket | null;
    max_bucket_percentage: number;
    diversification_score: number;
    risk_level: "low" | "medium" | "high";
  };
  risks: string[];
  opportunities: string[];
  recommended_actions: string[];
}

export interface PortfolioTransaction {
  id: number;
  symbol: string;
  transaction_type: "buy" | "sell";
  shares: string;
  price: string;
  transaction_date: string;
  created_at: string;
}

export interface PortfolioPosition {
  symbol: string;
  name: string;
  shares: string;
  avg_price: string;
  current_price?: string | null;
  market_value?: string | null;
  unrealized_pnl?: string | null;
  unrealized_pnl_percent?: string | null;
}

export interface ContentVisibility {
  id: number;
  content_key: string;
  is_visible: boolean;
  scope: string;
  user_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVisibilityEffective {
  content_key: string;
  is_visible: boolean;
}

export interface PasswordResetRequest { email: string; }
export interface PasswordResetConfirmRequest { token: string; new_password: string; }

export interface UserUpdate {
  username?: string;
  email?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
