import { Info } from "lucide-react";
import { RSIGauge } from "./RSIGauge";
import { VolumeAnalysisCard } from "./VolumeAnalysisCard";
import { macdState, maTrend } from "@/lib/signals";
import type { StockRecommendation } from "@/types";
import type { VolumeAnalysisProps } from "@/types/stock";

interface TechnicalIndicatorsProps {
  recommendation?: StockRecommendation | null;
  volumeAnalysis?: VolumeAnalysisProps;
}

export function TechnicalIndicators({
  recommendation,
  volumeAnalysis,
}: TechnicalIndicatorsProps) {
  if (!recommendation) return null;

  const { indicators } = recommendation;
  const close = indicators.close;
  const ma5 = indicators.ma5;
  const ma20 = indicators.ma20;
  const ma60 = indicators.ma60;

  const trend = maTrend(ma5, ma20, ma60);
  const maBullish = trend === "bullish";
  const maBearish = trend === "bearish";

  const maStatus = maBullish ? "偏多" : maBearish ? "偏空" : "震盪";
  const maBadgeClass = maBullish
    ? "bg-emerald-50 text-emerald-600"
    : maBearish
      ? "bg-red-50 text-danger"
      : "bg-amber-50 text-amber-600";

  const macd = indicators.macd_dif
    ? {
        dif: indicators.macd_dif,
        macd: indicators.macd_signal ?? "—",
        histogram: indicators.macd_histogram ?? "—",
      }
    : null;

  const histogramState = macdState(indicators.macd_histogram);
  const macdStatus =
    histogramState === "expanding"
      ? "柱狀體擴張"
      : histogramState === "contracting"
        ? "柱狀體收斂"
        : histogramState === "flat"
          ? "柱狀體持平"
          : "計算中";

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm animate-fade-in-up delay-300">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-bold text-lg">技術指標詳情</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* MA Comparison */}
          <div className="p-4 rounded-xl bg-muted border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-primary">
                均線對比
              </span>
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${maBadgeClass}`}
              >
                {maStatus}
              </span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "CLOSE", value: close, color: "bg-emerald-500" },
                { label: "MA5", value: ma5 ?? "—", color: "bg-blue-500" },
                { label: "MA20", value: ma20 ?? "—", color: "bg-orange-500" },
                { label: "MA60", value: ma60 ?? "—", color: "bg-purple-500" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-0.5 ${item.color} rounded-full`}
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                {maBullish
                  ? "均線呈多頭排列，短期、中期、長期趨勢一致向上。"
                  : maBearish
                    ? "均線呈空頭排列，短期、中期、長期趨勢一致向下。"
                    : "均線交錯，趨勢方向不明，建議觀望。"}
              </p>
            </div>
          </div>

          {/* RSI */}
          <div className="p-4 rounded-xl bg-muted border border-border">
            <RSIGauge value={indicators.rsi14} />
          </div>

          {/* MACD */}
          <div className="p-4 rounded-xl bg-muted border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-primary">
                MACD (12,26,9)
              </span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-semibold rounded-full">
                {macdStatus}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">DIF</span>
                <span className="text-sm font-semibold">
                  {macd?.dif ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">MACD</span>
                <span className="text-sm font-semibold">
                  {macd?.macd ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Histogram
                </span>
                <span
                  className={`text-sm font-semibold ${
                    macd && histogramState === "contracting"
                      ? "text-danger"
                      : ""
                  }`}
                >
                  {macd?.histogram ?? "—"}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                {macd
                  ? histogramState === "expanding"
                    ? "柱狀體為正，多頭動能持續。"
                    : histogramState === "contracting"
                      ? "柱狀體為負，空頭動能增強，留意趨勢轉折。"
                      : "DIF與MACD交錯，動能轉換中。"
                  : "MACD數據計算中，請稍後再試。"}
              </p>
            </div>
          </div>

          {/* Volume Analysis */}
          <div className="p-4 rounded-xl bg-muted border border-border">
            <VolumeAnalysisCard
              volume={volumeAnalysis?.volume}
              avgVolume20d={volumeAnalysis?.avgVolume20d}
              volumeRatio={volumeAnalysis?.volumeRatio}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
