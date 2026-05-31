import { useEffect, useRef, useState } from "react";
import { formatPercent, formatPrice } from "@/lib/format";
import {
  score52WeekRange,
  scoreEps,
  scoreMargin,
  scorePe,
  scoreRoe,
  scoreRsiMomentum,
  scoreRevenueGrowth,
} from "@/lib/signals";
import type { StockFundamental, StockRecommendation } from "@/types";

interface FinancialHealthScoresProps {
  fundamentals?: StockFundamental | null;
  recommendation?: StockRecommendation | null;
  currentPrice?: string;
}

function AnimatedBar({ value, max = 100, colorClass = "bg-accent" }: { value: number; max?: number; colorClass?: string }) {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWidth(Math.min(100, Math.max(0, (value / max) * 100)));
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, max]);

  return (
    <div ref={ref} className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full ${colorClass} rounded-full transition-all duration-1000 ease-out`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function FinancialHealthScores({ fundamentals, recommendation, currentPrice }: FinancialHealthScoresProps) {
  if (!fundamentals) return null;

  const rangeScore = score52WeekRange(
    currentPrice,
    fundamentals.fifty_two_week_low,
    fundamentals.fifty_two_week_high
  );
  const momentumScore = scoreRsiMomentum(recommendation?.indicators.rsi14);

  const categories = [
    {
      title: "成長性",
      color: "bg-blue-500",
      metrics: [
        { label: "營收成長率", display: formatPercent(fundamentals.revenue_growth, { multiplier: 100, digits: 1 }), score: scoreRevenueGrowth(fundamentals.revenue_growth) },
        { label: "EPS", display: fundamentals.eps ?? "—", score: scoreEps(fundamentals.eps) },
      ],
    },
    {
      title: "獲利能力",
      color: "bg-emerald-500",
      metrics: [
        { label: "利潤率", display: formatPercent(fundamentals.profit_margins, { multiplier: 100, digits: 1 }), score: scoreMargin(fundamentals.profit_margins) },
        { label: "ROE", display: formatPercent(fundamentals.return_on_equity, { multiplier: 100, digits: 1 }), score: scoreRoe(fundamentals.return_on_equity) },
      ],
    },
    {
      title: "動能",
      color: "bg-purple-500",
      metrics: [
        { label: "52週位置", display: formatPercent(rangeScore, { digits: 1 }), score: rangeScore ?? 0 },
        { label: "RSI動能", display: formatPrice(momentumScore, { digits: 0 }), score: momentumScore ?? 0 },
      ],
    },
    {
      title: "估值",
      color: "bg-amber-500",
      metrics: [
        { label: "本益比", display: fundamentals.pe_ratio ?? "—", score: scorePe(fundamentals.pe_ratio) },
        { label: "Forward P/E", display: fundamentals.forward_pe ?? "—", score: scorePe(fundamentals.forward_pe) },
      ],
    },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm animate-fade-in-up delay-400">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-bold text-lg">財務健康度</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {categories.map((cat) => (
            <div key={cat.title} className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${cat.color}`} />
                <h4 className="font-semibold text-sm">{cat.title}</h4>
              </div>
              {cat.metrics.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <span className="text-xs font-semibold">{m.display}</span>
                  </div>
                  <AnimatedBar value={m.score} colorClass={cat.color} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
