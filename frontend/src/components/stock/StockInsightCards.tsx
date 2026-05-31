import {
  Activity,
  Brain,
  ChartNoAxesCombined,
  Eye,
  Landmark,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getResolvedAIAnalysis, isActiveAIAnalysisJob } from "@/lib/aiAnalysis";
import { formatPercent } from "@/lib/format";
import {
  aiActionLabel,
  aiTone,
  countSignals,
  fundamentalHealth,
  isEtf,
  recommendationTone,
  type Tone,
} from "@/lib/signals";
import type {
  AIAnalysisResult,
  Stock,
  StockFundamental,
  StockQuote,
  StockRecommendation,
} from "@/types";

type Verdict = "buy" | "hold" | "avoid";

interface StockInsightCardsProps {
  stock?: Stock | null;
  recommendation?: StockRecommendation | null;
  fundamentals?: StockFundamental | null;
  quote?: StockQuote | null;
  priceHistoryCount?: number;
  aiAnalysis?: AIAnalysisResult | null;
  aiIsLoading?: boolean;
  isAuthenticated?: boolean;
}

function toneClasses(tone: Tone) {
  if (tone === "positive") return "bg-success/10 text-success border-success/20";
  if (tone === "caution") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function surfaceClasses(tone: Tone) {
  if (tone === "positive") {
    return "border-success/20 bg-success/5 shadow-success/5";
  }
  if (tone === "caution") {
    return "border-amber-500/20 bg-amber-500/5 shadow-amber-500/5";
  }
  return "border-border bg-card";
}

function verdictClasses(verdict: Verdict) {
  if (verdict === "buy") return "bg-success text-white border-success";
  if (verdict === "avoid") return "bg-amber-500 text-white border-amber-500";
  return "bg-primary text-primary-foreground border-primary";
}

function recommendationText(value?: "buy" | "hold" | "sell") {
  if (value === "buy") return "偏多追蹤";
  if (value === "sell") return "偏空保守";
  return "中性觀望";
}

function verdictText(verdict: Verdict) {
  if (verdict === "buy") return "偏多追蹤";
  if (verdict === "avoid") return "保守避開";
  return "觀望研究";
}

function aiVerdict(action?: -1 | 0 | 1): Verdict {
  if (action === 1) return "buy";
  if (action === -1) return "avoid";
  return "hold";
}

function getToneFromRecommendation(recommendation?: StockRecommendation | null): Tone {
  return recommendationTone(recommendation?.recommendation);
}

function getVerdictFromRecommendation(recommendation?: StockRecommendation | null): Verdict {
  if (recommendation?.recommendation === "buy") return "buy";
  if (recommendation?.recommendation === "sell") return "avoid";
  return "hold";
}

function getDataQuality(
  recommendation?: StockRecommendation | null,
  fundamentals?: StockFundamental | null,
  priceHistoryCount = 0,
  hasAI = false
) {
  const hasLongTrend =
    priceHistoryCount >= 60 ||
    Boolean(recommendation?.indicators.ma20 && recommendation?.indicators.ma60);
  const hasMediumTrend = priceHistoryCount >= 20 || Boolean(recommendation?.indicators.ma20);
  const fundamentalSignalCount = [
    fundamentals?.market_cap,
    fundamentals?.pe_ratio,
    fundamentals?.dividend_yield,
    fundamentals?.return_on_equity,
  ].filter(Boolean).length;
  const hasPartialFundamentalSignal = fundamentalSignalCount > 0;
  const hasStrongFundamentalSignal = fundamentalSignalCount >= 3;

  if (hasLongTrend && (hasStrongFundamentalSignal || hasAI)) {
    return {
      label: "高",
      tone: "positive" as Tone,
      summary: "價格歷史與主要研究資料都有支撐，適合做較完整研究。",
    };
  }

  if (hasLongTrend || (hasMediumTrend && (hasPartialFundamentalSignal || hasAI))) {
    return {
      label: "中",
      tone: "neutral" as Tone,
      summary: "已有足夠價格資料形成技術判讀，但基本面或 AI context 仍不完整。",
    };
  }

  return {
    label: "低",
    tone: "caution" as Tone,
    summary: "目前資料偏少，這份判讀只能作為初步觀察，不適合當成完整研究結論。",
  };
}

function getSignalAlignment(
  aiAction?: -1 | 0 | 1,
  recommendation?: StockRecommendation | null
) {
  const systemVerdict = getVerdictFromRecommendation(recommendation);
  const aiDecision = aiVerdict(aiAction);
  const hasSystemSignal = Boolean(recommendation);

  if (!hasSystemSignal || aiAction === undefined) {
    return {
      tone: "neutral" as Tone,
      label: "資料待補",
      summary: "目前以可用資料形成初步摘要；AI 與系統模型的一致性仍需更多訊號確認。",
    };
  }

  if (systemVerdict === aiDecision) {
    return {
      tone: aiTone(aiAction),
      label: "訊號一致",
      summary: "AI 判讀與系統量化訊號方向一致，結論可信度相對較高。",
    };
  }

  return {
    tone: "caution" as Tone,
    label: "訊號分歧",
    summary: "AI 判讀與系統量化訊號不同步，適合先觀察確認訊號，不宜只看單一結論。",
  };
}

function getKeyRisk(
  tone: Tone,
  recommendation?: StockRecommendation | null,
  fundamentals?: StockFundamental | null,
  isETF = false
) {
  if (isETF) return "ETF 仍需確認追蹤標的、成分股集中度、費用率與折溢價風險。";
  if (!fundamentals && !recommendation) return "價格與基本面資料不足，結論可能只反映少量歷史資訊。";
  if (tone === "positive") return "偏多訊號若缺乏成交量或基本面確認，可能只是短線反彈。";
  if (tone === "caution") return "若價格快速反彈，保守結論可能低估短線動能。";
  return "目前方向不夠明確，過早進場容易被區間震盪消耗。";
}

function getWatchNext(
  recommendation?: StockRecommendation | null,
  quote?: StockQuote | null,
  isETF = false
) {
  const target = recommendation?.support_resistance?.target_price;
  const stop = recommendation?.support_resistance?.stop_loss;
  const currentPrice = quote?.price ?? recommendation?.indicators.close;

  if (target && stop) {
    return `觀察能否往 ${target} 靠近；若跌破 ${stop}，風險應重新評估。`;
  }
  if (target) return `觀察價格是否能突破 ${target} 並伴隨成交量放大。`;
  if (stop) return `留意是否跌破 ${stop}；跌破後不宜只用反彈假設解讀。`;
  if (isETF) return "觀察追蹤指數走勢、成交量與折溢價是否同步改善。";
  if (currentPrice) return `先以 ${currentPrice} 附近的量價變化判斷方向是否轉強。`;
  return "等待更多價格歷史、成交量與基本面資料同步後再評估。";
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

  const { buy: buySignals, sell: sellSignals } = countSignals(recommendation.indicator_signals);
  const tone = recommendationTone(recommendation.recommendation);

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

  const tone = fundamentalHealth(fundamentals)?.tone ?? "neutral";

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
      `本益比 ${fundamentals.pe_ratio ?? "—"}，營收成長 ${formatPercent(fundamentals.revenue_growth, { multiplier: 100 })}。`,
      `利潤率 ${formatPercent(fundamentals.profit_margins, { multiplier: 100 })}，ROE ${formatPercent(fundamentals.return_on_equity, { multiplier: 100 })}。`,
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

  const tone = recommendationTone(recommendation.recommendation);
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
  priceHistoryCount = 0,
  aiAnalysis,
  aiIsLoading,
  isAuthenticated = false,
}: StockInsightCardsProps) {
  const isETF = stock ? isEtf(stock.symbol, stock) : false;
  const fundamentalTitle = isETF ? "ETF 摘要" : "基本面";

  // Resolve PR #17 AI analysis result (handles both direct response and async job).
  const ai = getResolvedAIAnalysis(aiAnalysis);
  const aiActive = isActiveAIAnalysisJob(aiAnalysis);
  const aiPending = isAuthenticated && (Boolean(aiIsLoading) || aiActive) && !ai;

  const headerLabel = ai
    ? "AI 模型分析"
    : aiPending
      ? "AI 分析產生中…"
      : isETF
        ? "ETF 規則摘要"
        : "本地規則摘要";

  // Base cards are always built from local rules so the page works without AI / sign-in.
  const technical = getTechnicalInsight(recommendation);
  const fundamental = isETF ? getEtfInsight(stock) : getFundamentalInsight(fundamentals);
  const investment = getInvestmentInsight(recommendation, quote);

  // When AI results are available, surface them as the headline of each card.
  const decisionTone = ai ? aiTone(ai.action) : getToneFromRecommendation(recommendation);
  const verdict = ai ? aiVerdict(ai.action) : getVerdictFromRecommendation(recommendation);
  const dataQuality = getDataQuality(recommendation, fundamentals, priceHistoryCount, Boolean(ai));
  const alignment = getSignalAlignment(ai?.action, recommendation);
  const decisionSummary = ai?.summary.short_sentence ?? investment.summary;
  const mainReason = ai?.summary.long_sentence ?? investment.points[0] ?? investment.summary;
  const keyRisk = getKeyRisk(decisionTone, recommendation, fundamentals, isETF);
  const watchNext = getWatchNext(recommendation, quote, isETF);

  const cards = [
    {
      title: "技術面",
      icon: ChartNoAxesCombined,
      ...technical,
      ...(ai ? { summary: ai.reasons.technical } : {}),
    },
    {
      title: fundamentalTitle,
      icon: Landmark,
      ...fundamental,
      ...(ai ? { summary: ai.reasons.fundamental } : {}),
    },
    {
      title: "綜合建議",
      icon: Sparkles,
      ...investment,
      ...(ai
        ? {
            tone: aiTone(ai.action),
            label: aiActionLabel(ai.action),
            summary: ai.summary.short_sentence,
            points: [ai.summary.long_sentence, ai.reasons.comprehensive],
          }
        : {}),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-primary">研究判讀</h2>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {aiPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {headerLabel}
        </span>
      </div>

      <Card className={`overflow-hidden rounded-xl shadow-sm ${surfaceClasses(decisionTone)}`}>
        <CardContent className="p-0">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
            <div className="space-y-5 p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={`border px-3 py-1 text-sm ${verdictClasses(verdict)}`}>
                  {verdictText(verdict)}
                </Badge>
                <Badge variant="outline" className={toneClasses(alignment.tone)}>
                  {alignment.label}
                </Badge>
                <Badge variant="outline" className={toneClasses(dataQuality.tone)}>
                  資料可信度：{dataQuality.label}
                </Badge>
              </div>

              <div className="space-y-3">
                <p className="text-xl font-semibold leading-8 text-primary md:text-2xl">
                  {decisionSummary}
                </p>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {mainReason}
                </p>
              </div>
            </div>

            <div className="border-t border-border bg-background/45 p-5 md:p-6 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-amber-500/10 p-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      主要風險
                    </p>
                    <p className="mt-1 text-sm leading-6 text-primary">{keyRisk}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-accent/10 p-2">
                    <Eye className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      下一步觀察
                    </p>
                    <p className="mt-1 text-sm leading-6 text-primary">{watchNext}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-lg bg-accent/10 p-2">
              <Activity className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">訊號一致性</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {alignment.summary}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-0.5 rounded-lg bg-muted p-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">資料可信度</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {dataQuality.summary}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="rounded-xl transition-shadow hover:shadow-sm">
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
                      <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="leading-5">{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
