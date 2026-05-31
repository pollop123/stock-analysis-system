import { Star, StarHalf } from "lucide-react";
import { countSignals, signalLabel } from "@/lib/signals";
import type { StockRecommendation } from "@/types";

interface SignalSummaryProps {
  recommendation?: StockRecommendation | null;
}

export function SignalSummary({ recommendation }: SignalSummaryProps) {
  if (!recommendation) return null;

  const signals = recommendation.indicator_signals || {
    ma: recommendation.recommendation,
    rsi: recommendation.recommendation,
    macd: "hold" as const,
    volume: recommendation.recommendation,
    bollinger: "hold" as const,
    kd: "hold" as const,
  };

  const items = [
    { label: "移動平均線", signal: signals.ma },
    { label: "RSI", signal: signals.rsi },
    { label: "MACD", signal: signals.macd },
    { label: "成交量", signal: signals.volume },
    { label: "布林通道", signal: signals.bollinger },
    { label: "KD指標", signal: signals.kd },
  ];

  const buyCount = countSignals(signals).buy;
  const score = recommendation.composite_score;
  const fullStars = Math.floor(score);
  const hasHalf = score - fullStars >= 0.5;

  const badgeClass = (s: string) => {
    if (s === "buy") return "bg-emerald-50 text-emerald-600";
    if (s === "sell") return "bg-red-50 text-danger";
    return "bg-amber-50 text-amber-600";
  };

  const dotClass = (s: string) => {
    if (s === "buy") return "bg-success";
    if (s === "sell") return "bg-danger";
    return "bg-amber-500";
  };

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm animate-fade-in-up delay-300">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-bold text-base">信號總覽</h3>
      </div>
      <div className="p-6 space-y-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${dotClass(item.signal)}`} />
              <span className="text-sm text-primary">{item.label}</span>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-bold rounded-lg ${badgeClass(
                item.signal
              )}`}
            >
              {signalLabel(item.signal)}
            </span>
          </div>
        ))}

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-primary">綜合評分</span>
            <span className="text-2xl font-bold text-success">
              {score}
              <span className="text-sm text-muted-foreground font-normal">
                /5
              </span>
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => {
              if (i < fullStars) {
                return (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                );
              }
              if (i === fullStars && hasHalf) {
                return (
                  <StarHalf
                    key={i}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                );
              }
              return (
                <Star key={i} className="w-4 h-4 text-muted-foreground" />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {buyCount}/6 項指標顯示買入信號
          </p>
        </div>
      </div>
    </div>
  );
}
