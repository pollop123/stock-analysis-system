import { Brain, ChartNoAxesCombined, CircleAlert, Landmark, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type {
  Stock,
  StockFundamental,
  StockQuote,
  StockRecommendation,
} from "@/types";

type Tone = "positive" | "neutral" | "caution";

interface StockInsightCardsProps {
  stock?: Stock | null;
  recommendation?: StockRecommendation | null;
  fundamentals?: StockFundamental | null;
  quote?: StockQuote | null;
}

function formatPercent(value?: string | null, multiplier = 1) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${(numeric * multiplier).toFixed(2)}%`;
}

function toneClasses(tone: Tone) {
  if (tone === "positive") return "bg-success/10 text-success border-success/20";
  if (tone === "caution") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function recommendationText(value?: "buy" | "hold" | "sell") {
  if (value === "buy") return "偏多追蹤";
  if (value === "sell") return "偏空保守";
  return "中性觀望";
}

function isEtfStock(stock?: Stock | null) {
  if (!stock) return false;
  return stock.is_etf === true || stock.symbol.startsWith("00") || stock.symbol.length >= 5;
}

function getTechnicalInsight(recommendation?: StockRecommendation | null) {
  if (!recommendation) {
    return {
      tone: "neutral" as Tone,
      label: "資料不足",
      summary: "目前沒有足夠的價格歷史可整理技術面解讀。",
      points: ["同步更多歷史價格後，系統會重新整理趨勢、動能與量能。"],
    };
  }

  const signals = Object.values(recommendation.indicator_signals || {});
  const buySignals = signals.filter((signal) => signal === "buy").length;
  const sellSignals = signals.filter((signal) => signal === "sell").length;
  const tone: Tone =
    recommendation.recommendation === "buy"
      ? "positive"
      : recommendation.recommendation === "sell"
        ? "caution"
        : "neutral";

  return {
    tone,
    label: recommendationText(recommendation.recommendation),
    summary:
      buySignals > sellSignals
        ? "技術訊號偏向正面，但仍需留意是否已經接近短線高檔。"
        : sellSignals > buySignals
          ? "技術訊號偏弱，短線追價風險較高。"
          : "技術訊號分歧，現階段比較適合觀察趨勢是否延續。",
    points: [
      `正向訊號 ${buySignals} 個，負向訊號 ${sellSignals} 個。`,
      recommendation.reasons[0] ?? "目前以均線、動能與量能資料做綜合判斷。",
    ],
  };
}

function getFundamentalInsight(fundamentals?: StockFundamental | null) {
  if (!fundamentals) {
    return {
      tone: "neutral" as Tone,
      label: "資料不足",
      summary: "目前尚未取得完整基本面資料，先不要用估值或獲利能力做重判斷。",
      points: ["可先看價格趨勢；等基本面資料同步後，再補估值與財務品質解讀。"],
    };
  }

  const pe = fundamentals.pe_ratio ? Number(fundamentals.pe_ratio) : null;
  const revenueGrowth = fundamentals.revenue_growth
    ? Number(fundamentals.revenue_growth)
    : null;
  const margin = fundamentals.profit_margins ? Number(fundamentals.profit_margins) : null;
  const roe = fundamentals.return_on_equity ? Number(fundamentals.return_on_equity) : null;
  const healthySignals = [
    revenueGrowth !== null && revenueGrowth > 0,
    margin !== null && margin > 0.1,
    roe !== null && roe > 0.1,
    pe !== null && pe > 0 && pe < 25,
  ].filter(Boolean).length;

  const tone: Tone = healthySignals >= 3 ? "positive" : healthySignals <= 1 ? "caution" : "neutral";

  return {
    tone,
    label: tone === "positive" ? "品質較佳" : tone === "caution" ? "需再確認" : "大致中性",
    summary:
      tone === "positive"
        ? "基本面訊號相對完整，獲利、成長或估值至少有多項支持。"
        : tone === "caution"
          ? "基本面支持度不足，投資判斷不宜只看短線價格。"
          : "基本面訊號沒有明顯單邊結論，適合搭配產業與價格趨勢一起看。",
    points: [
      `本益比 ${fundamentals.pe_ratio ?? "—"}，營收成長 ${formatPercent(fundamentals.revenue_growth, 100) ?? "—"}。`,
      `利潤率 ${formatPercent(fundamentals.profit_margins, 100) ?? "—"}，ROE ${formatPercent(fundamentals.return_on_equity, 100) ?? "—"}。`,
    ],
  };
}

function getEtfInsight(stock?: Stock | null) {
  const label = stock?.industry ? `${stock.industry} ETF` : "ETF";

  return {
    tone: "neutral" as Tone,
    label: "結構優先",
    summary: "ETF 不適合用單一公司的本益比或獲利率判斷，重點應放在追蹤標的、持股結構與交易成本。",
    points: [
      `目前分類為 ${label}，建議搭配成分股、費用率與折溢價一起看。`,
      "短線漲跌可參考技術面，但中長期仍要回到指數或主題本身。",
    ],
  };
}

function getInvestmentInsight(
  recommendation?: StockRecommendation | null,
  quote?: StockQuote | null
) {
  if (!recommendation) {
    return {
      tone: "neutral" as Tone,
      label: "等待資料",
      summary: "目前還不能形成完整投資建議，先避免過度解讀單一價格。",
      points: ["同步價格歷史與基本面後，再產生可讀的綜合建議。"],
    };
  }

  const tone: Tone =
    recommendation.recommendation === "buy"
      ? "positive"
      : recommendation.recommendation === "sell"
        ? "caution"
        : "neutral";
  const currentPrice = quote?.price ?? recommendation.indicators.close;
  const target = recommendation.support_resistance?.target_price;
  const stop = recommendation.support_resistance?.stop_loss;

  return {
    tone,
    label: recommendationText(recommendation.recommendation),
    summary:
      recommendation.recommendation === "buy"
        ? "綜合訊號偏正面，可列入追蹤，但仍需設定風險界線。"
        : recommendation.recommendation === "sell"
          ? "綜合訊號偏保守，除非資料改善，否則不適合積極追價。"
          : "目前沒有強烈方向，較適合等待更明確的價格或基本面訊號。",
    points: [
      `目前價格 ${currentPrice ?? "—"}，信心分數 ${recommendation.confidence}%。`,
      `目標價 ${target ?? "—"}，停損參考 ${stop ?? "—"}。`,
    ],
  };
}

export function StockInsightCards({
  stock,
  recommendation,
  fundamentals,
  quote,
}: StockInsightCardsProps) {
  const isETF = isEtfStock(stock);
  const fundamentalTitle = isETF ? "ETF 摘要" : "基本面";
  const fallbackLabel = isETF ? "ETF 規則摘要" : "本地規則摘要";
  const cards = [
    {
      title: "技術面",
      icon: ChartNoAxesCombined,
      ...getTechnicalInsight(recommendation),
    },
    {
      title: fundamentalTitle,
      icon: Landmark,
      ...(isETF ? getEtfInsight(stock) : getFundamentalInsight(fundamentals)),
    },
    {
      title: "綜合建議",
      icon: Sparkles,
      ...getInvestmentInsight(recommendation, quote),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-primary">AI 解讀</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {fallbackLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="rounded-xl">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-accent/10 p-2">
                      <Icon className="h-4 w-4 text-accent" />
                    </div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className={toneClasses(card.tone)}>
                    {card.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-primary">{card.summary}</p>
                <div className="space-y-2">
                  {card.points.map((point) => (
                    <div key={point} className="flex gap-2 text-xs text-muted-foreground">
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="leading-5">{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
