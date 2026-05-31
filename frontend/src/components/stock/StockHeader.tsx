import { Link } from "react-router-dom";
import { Share2, Star, MoreHorizontal, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { isEtf, recommendationVariant } from "@/lib/signals";
import type { StockHeaderProps } from "@/types/stock";

export function StockHeader({
  symbol,
  stock,
  quote,
  recommendation,
  isUp,
  onShare,
}: StockHeaderProps) {
  const recVariant = recommendationVariant(recommendation?.recommendation);

  const recText: Record<string, string> = {
    buy: "買入",
    hold: "持有",
    sell: "賣出",
  };

  const isETF = isEtf(symbol, stock);
  const marketLabel =
    stock?.market === "TWSE" ? "上市" : stock?.market === "TPEx" ? "上櫃" : "—";

  const suffix = symbol.length > 2 ? symbol.slice(-2) : symbol;

  return (
    <div className="animate-fade-in-up">
      {/* Back link */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/stocks"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Market
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="flex items-start gap-3 md:gap-4">
          {/* Gradient icon */}
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-success to-emerald-700 flex items-center justify-center text-white font-bold text-base md:text-lg shadow-lg shadow-success/20 shrink-0">
            {suffix}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">
                {symbol} {stock?.name || quote?.name || ""}
              </h1>
              {isETF && (
                <Badge variant="secondary" className="text-xs">
                  ETF
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="text-xs bg-slate-100 text-slate-600"
              >
                {marketLabel}
              </Badge>
              {recommendation && (
                <Badge variant={recVariant} className="text-xs uppercase">
                  {recText[recommendation.recommendation]}
                </Badge>
              )}
            </div>

            <p className="text-muted-foreground text-sm">
              {stock?.industry
                ? `${stock.industry}${isETF ? " ETF" : ""}`
                : isETF
                  ? "ETF"
                  : ""}
            </p>

            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {marketLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
          <div className="text-left sm:text-right">
            <div className="flex items-baseline gap-2 sm:justify-end">
              <span className="text-3xl md:text-4xl font-bold tracking-tight">
                {quote?.price ?? "—"}
              </span>
              <span className="text-muted-foreground text-lg">TWD</span>
            </div>
            <div className="flex items-center gap-2 sm:justify-end mt-1 flex-wrap">
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-sm font-semibold rounded-md ${
                  isUp
                    ? "bg-red-50 text-danger"
                    : "bg-green-50 text-success"
                }`}
              >
                {isUp ? (
                  <span className="text-danger">▲</span>
                ) : (
                  <span className="text-success">▼</span>
                )}
                {quote?.change ?? "—"} ({quote?.change_percent ?? "—"}%)
              </span>
              <span className="text-xs text-muted-foreground">
                {quote?.last_updated
                  ? new Date(quote.last_updated).toLocaleDateString("zh-TW")
                  : ""}{" "}
                收盤
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              title="加入觀察清單"
            >
              <Star className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              title="分享"
              onClick={onShare}
            >
              <Share2 className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              title="更多選項"
            >
              <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
