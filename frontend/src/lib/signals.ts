/**
 * Stock signal interpretation seam.
 *
 * Every threshold and banding rule the UI uses — RSI zones, moving-average
 * trend, MACD state, recommendation tone, fundamental health, the 0-100 health
 * bar scores — lives here as a pure function. Presentational components consume
 * the decision (a label, a tone, a score) and only map it to their own Tailwind
 * classes. The rules are defined once and unit-tested without rendering.
 */

import type { IndicatorSignals, StockFundamental } from "@/types";
import { toNumber, type Numeric } from "./format";

export type Signal = "buy" | "hold" | "sell";
export type Tone = "positive" | "neutral" | "caution";
export type Trend = "bullish" | "bearish" | "neutral";

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

// ─── RSI ──────────────────────────────────────────────────

export type RsiZone = "overbought" | "oversold" | "neutral" | "leanBull" | "leanBear";

/** Band an RSI(14) value. Missing input is treated as neutral (50). */
export function rsiBand(value: Numeric): { zone: RsiZone; label: string } {
  const v = toNumber(value) ?? 50;
  if (v > 70) return { zone: "overbought", label: "超買" };
  if (v < 30) return { zone: "oversold", label: "超賣" };
  if (v >= 45 && v <= 55) return { zone: "neutral", label: "中性" };
  if (v > 55) return { zone: "leanBull", label: "中性偏多" };
  return { zone: "leanBear", label: "中性偏空" };
}

// ─── Moving averages ──────────────────────────────────────

/** Trend from the 5/20/60-day moving-average ordering. */
export function maTrend(ma5: Numeric, ma20: Numeric, ma60: Numeric): Trend {
  const a = toNumber(ma5);
  const b = toNumber(ma20);
  const c = toNumber(ma60);
  if (a === null || b === null || c === null) return "neutral";
  if (a > b && b > c) return "bullish";
  if (a < b && b < c) return "bearish";
  return "neutral";
}

// ─── MACD ─────────────────────────────────────────────────

export type MacdState = "expanding" | "contracting" | "flat" | "unknown";

/** Classify the MACD histogram. */
export function macdState(histogram: Numeric): MacdState {
  const h = toNumber(histogram);
  if (h === null) return "unknown";
  if (h > 0) return "expanding";
  if (h < 0) return "contracting";
  return "flat";
}

// ─── Recommendations & signals ────────────────────────────

export function recommendationTone(rec?: Signal | null): Tone {
  if (rec === "buy") return "positive";
  if (rec === "sell") return "caution";
  return "neutral";
}

/** Badge variant used by StockHeader. */
export function recommendationVariant(rec?: Signal | null): "success" | "danger" | "warning" {
  if (rec === "buy") return "success";
  if (rec === "sell") return "danger";
  return "warning";
}

export function signalLabel(signal: Signal): "BUY" | "SELL" | "HOLD" {
  if (signal === "buy") return "BUY";
  if (signal === "sell") return "SELL";
  return "HOLD";
}

export function countSignals(
  signals?: IndicatorSignals | null
): { buy: number; sell: number; hold: number } {
  const values = Object.values(signals ?? {}) as Signal[];
  return {
    buy: values.filter((s) => s === "buy").length,
    sell: values.filter((s) => s === "sell").length,
    hold: values.filter((s) => s === "hold").length,
  };
}

// ─── AI action ────────────────────────────────────────────

export function aiTone(action: -1 | 0 | 1): Tone {
  if (action > 0) return "positive";
  if (action < 0) return "caution";
  return "neutral";
}

export function aiActionLabel(action: -1 | 0 | 1): string {
  if (action > 0) return "AI 偏多";
  if (action < 0) return "AI 偏空";
  return "AI 中性";
}

// ─── Securities ───────────────────────────────────────────

/** Whether a symbol is an ETF (explicit flag, "00" prefix, or 5+ digit code). */
export function isEtf(symbol: string, stock?: { is_etf?: boolean | null } | null): boolean {
  if (stock?.is_etf === true) return true;
  return symbol.startsWith("00") || symbol.length >= 5;
}

// ─── Fundamental health ───────────────────────────────────

export interface FundamentalHealth {
  /** Number of healthy signals out of 4 (revenue growth, margin, ROE, P/E). */
  score: number;
  tone: Tone;
}

export function fundamentalHealth(f?: StockFundamental | null): FundamentalHealth | null {
  if (!f) return null;
  const pe = toNumber(f.pe_ratio);
  const revenueGrowth = toNumber(f.revenue_growth);
  const margin = toNumber(f.profit_margins);
  const roe = toNumber(f.return_on_equity);
  const score = [
    revenueGrowth !== null && revenueGrowth > 0,
    margin !== null && margin > 0.1,
    roe !== null && roe > 0.1,
    pe !== null && pe > 0 && pe < 25,
  ].filter(Boolean).length;
  const tone: Tone = score >= 3 ? "positive" : score <= 1 ? "caution" : "neutral";
  return { score, tone };
}

// ─── Financial health bar scores (0-100) ──────────────────

/** Where the price sits within its 52-week range, as a percentage. */
export function score52WeekRange(price: Numeric, low52: Numeric, high52: Numeric): number | null {
  const p = toNumber(price);
  const lo = toNumber(low52);
  const hi = toNumber(high52);
  if (p === null || lo === null || hi === null || hi === lo) return null;
  return ((p - lo) / (hi - lo)) * 100;
}

/** Momentum from RSI distance to the neutral midpoint (peaks at RSI 50). */
export function scoreRsiMomentum(rsi: Numeric): number | null {
  const v = toNumber(rsi);
  if (v === null) return null;
  return Math.max(0, 100 - Math.abs(v - 50) * 2);
}

export function scoreRevenueGrowth(value: Numeric): number {
  const v = toNumber(value);
  return v === null ? 0 : clamp((v + 0.5) * 100);
}

export function scoreEps(value: Numeric): number {
  const v = toNumber(value);
  return v === null ? 0 : clamp(v * 20 + 50);
}

export function scoreMargin(value: Numeric): number {
  const v = toNumber(value);
  return v === null ? 0 : clamp(v * 200);
}

export function scoreRoe(value: Numeric): number {
  const v = toNumber(value);
  return v === null ? 0 : clamp(v * 100);
}

export function scorePe(value: Numeric): number {
  const v = toNumber(value);
  return v === null ? 0 : clamp((50 - v) * 2 + 50);
}
