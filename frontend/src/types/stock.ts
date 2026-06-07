import type { Stock, StockQuote, StockRecommendation, StockPrice } from "./index";

export interface StockHeaderProps {
  symbol: string;
  stock?: Stock | null;
  quote?: StockQuote | null;
  recommendation?: StockRecommendation | null;
  isUp: boolean;
  onShare?: () => void;
  onWatchlist?: () => void;
}

export interface MetricsStripProps {
  quote?: StockQuote | null;
  peRatio?: string | null;
  dividendYield?: string | null;
}

export interface RecBannerProps {
  recommendation?: StockRecommendation | null;
  targetPrice?: string | null;
  potentialReturn?: string | null;
  stopLoss?: string | null;
}

export interface VolumeAnalysisProps {
  volume?: number;
  avgVolume20d?: string | null;
  volumeRatio?: string | null;
}

export interface RSIGaugeProps {
  value?: string | null;
}

export interface SignalSummaryProps {
  recommendation?: StockRecommendation | null;
  indicatorSignals?: IndicatorSignals;
  compositeScore?: number;
}

export interface IndicatorSignals {
  ma: "buy" | "hold" | "sell";
  rsi: "buy" | "hold" | "sell";
  macd: "buy" | "hold" | "sell";
  volume: "buy" | "hold" | "sell";
  bollinger: "buy" | "hold" | "sell";
  kd: "buy" | "hold" | "sell";
}

export interface RiskAssessmentProps {
  riskLevel?: "low" | "medium" | "high";
  volatilityRisk?: number;
  liquidityRisk?: number;
  fxRisk?: number;
  systemicRisk?: number;
}

export interface SupportResistanceProps {
  currentPrice?: string;
  r2?: string;
  r1?: string;
  s1?: string;
  s2?: string;
  stopLoss?: string;
}

export interface PeerStock {
  symbol: string;
  name: string;
  price: string;
  changePercent: string;
  recommendation: "buy" | "hold" | "sell";
}

export interface PeerComparisonProps {
  peers: PeerStock[];
  currentSymbol: string;
}

export interface AnalysisPoint {
  text: string;
  detail: string;
  type: "bullish" | "bearish" | "neutral" | "caution";
}

export interface AnalysisPointsProps {
  points: AnalysisPoint[];
  updatedAt?: string;
}

export interface PriceChartProps {
  data: StockPrice[];
  isLoading: boolean;
  isDark: boolean;
}

export interface TechnicalIndicatorsProps {
  recommendation?: StockRecommendation | null;
  macd?: { dif: string; macd: string; histogram: string } | null;
  volumeAnalysis?: VolumeAnalysisProps;
}
