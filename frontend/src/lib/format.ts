/**
 * Display formatting + number coercion seam.
 *
 * The backend sends numeric fields as strings. Coerce them to numbers in ONE
 * place (`toNumber`) and route every price / percent / large-number / date
 * through these helpers so precision and locale are decided here, not scattered
 * across components as ad-hoc `parseFloat(...).toFixed(...)`.
 */

export type Numeric = string | number | null | undefined;

const DEFAULT_FALLBACK = "—";

/** Coerce a backend numeric string (or number) to a finite number, else null. */
export function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

interface PriceOptions {
  digits?: number;
  fallback?: string;
}

/** Fixed-decimal price/number, e.g. 805 -> "805.00". */
export function formatPrice(value: Numeric, options: PriceOptions = {}): string {
  const { digits = 2, fallback = DEFAULT_FALLBACK } = options;
  const n = toNumber(value);
  return n === null ? fallback : n.toFixed(digits);
}

interface PercentOptions {
  /** Multiply before formatting: backend ratios (0.0215) use 100; already-% use 1. */
  multiplier?: number;
  digits?: number;
  fallback?: string;
}

/** Percentage with a trailing "%", e.g. (0.0215, {multiplier:100}) -> "2.15%". */
export function formatPercent(value: Numeric, options: PercentOptions = {}): string {
  const { multiplier = 1, digits = 2, fallback = DEFAULT_FALLBACK } = options;
  const n = toNumber(value);
  return n === null ? fallback : `${(n * multiplier).toFixed(digits)}%`;
}

interface NumberOptions {
  fallback?: string;
  locale?: string;
}

/** Thousands-separated integer/decimal, e.g. 1234567 -> "1,234,567". */
export function formatNumber(value: Numeric, options: NumberOptions = {}): string {
  const { fallback = DEFAULT_FALLBACK, locale = "en-US" } = options;
  const n = toNumber(value);
  return n === null ? fallback : n.toLocaleString(locale);
}

interface DateOptions {
  locale?: string;
  fallback?: string;
}

/** Locale date string from an ISO timestamp. */
export function formatDate(value: string | null | undefined, options: DateOptions = {}): string {
  const { locale = "zh-TW", fallback = DEFAULT_FALLBACK } = options;
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString(locale);
}
