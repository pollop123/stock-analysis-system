import { describe, expect, it } from "vitest";

import type { IndicatorSignals, StockFundamental } from "@/types";
import {
  aiActionLabel,
  aiTone,
  countSignals,
  fundamentalHealth,
  isEtf,
  macdState,
  maTrend,
  recommendationTone,
  recommendationVariant,
  rsiBand,
  score52WeekRange,
  scoreEps,
  scoreMargin,
  scorePe,
  scoreRoe,
  scoreRsiMomentum,
  signalLabel,
} from "./signals";

describe("rsiBand", () => {
  it("bands across the RSI range", () => {
    expect(rsiBand("80").zone).toBe("overbought");
    expect(rsiBand("20").zone).toBe("oversold");
    expect(rsiBand("50").zone).toBe("neutral");
    expect(rsiBand("60").zone).toBe("leanBull");
    expect(rsiBand("40").zone).toBe("leanBear");
  });

  it("defaults missing input to neutral (50)", () => {
    expect(rsiBand(null).zone).toBe("neutral");
  });
});

describe("maTrend", () => {
  it("detects bullish / bearish alignment", () => {
    expect(maTrend("30", "20", "10")).toBe("bullish");
    expect(maTrend("10", "20", "30")).toBe("bearish");
    expect(maTrend("20", "10", "30")).toBe("neutral");
  });

  it("is neutral when any MA is missing", () => {
    expect(maTrend("30", null, "10")).toBe("neutral");
  });
});

describe("macdState", () => {
  it("classifies the histogram", () => {
    expect(macdState("1")).toBe("expanding");
    expect(macdState("-1")).toBe("contracting");
    expect(macdState("0")).toBe("flat");
    expect(macdState(null)).toBe("unknown");
  });
});

describe("recommendation helpers", () => {
  it("maps tone", () => {
    expect(recommendationTone("buy")).toBe("positive");
    expect(recommendationTone("sell")).toBe("caution");
    expect(recommendationTone("hold")).toBe("neutral");
  });

  it("maps badge variant", () => {
    expect(recommendationVariant("buy")).toBe("success");
    expect(recommendationVariant("sell")).toBe("danger");
    expect(recommendationVariant(null)).toBe("warning");
  });
});

describe("signals", () => {
  it("labels a signal", () => {
    expect(signalLabel("buy")).toBe("BUY");
    expect(signalLabel("sell")).toBe("SELL");
    expect(signalLabel("hold")).toBe("HOLD");
  });

  it("counts buy/sell/hold", () => {
    const s: IndicatorSignals = {
      ma: "buy",
      rsi: "buy",
      macd: "sell",
      volume: "hold",
      bollinger: "buy",
      kd: "hold",
    };
    expect(countSignals(s)).toEqual({ buy: 3, sell: 1, hold: 2 });
  });

  it("handles missing signals", () => {
    expect(countSignals(null)).toEqual({ buy: 0, sell: 0, hold: 0 });
  });
});

describe("ai action", () => {
  it("maps tone and label", () => {
    expect(aiTone(1)).toBe("positive");
    expect(aiTone(-1)).toBe("caution");
    expect(aiTone(0)).toBe("neutral");
    expect(aiActionLabel(1)).toBe("AI 偏多");
  });
});

describe("isEtf", () => {
  it("uses the explicit flag, prefix, or code length", () => {
    expect(isEtf("2330", { is_etf: false })).toBe(false);
    expect(isEtf("2330", { is_etf: true })).toBe(true);
    expect(isEtf("0050")).toBe(true);
    expect(isEtf("00878")).toBe(true);
    expect(isEtf("2330")).toBe(false);
  });
});

describe("fundamentalHealth", () => {
  it("returns null without fundamentals", () => {
    expect(fundamentalHealth(null)).toBeNull();
  });

  it("scores healthy fundamentals as positive", () => {
    const f = {
      pe_ratio: "20",
      revenue_growth: "0.1",
      profit_margins: "0.2",
      return_on_equity: "0.2",
    } as StockFundamental;
    const health = fundamentalHealth(f);
    expect(health?.score).toBe(4);
    expect(health?.tone).toBe("positive");
  });

  it("scores weak fundamentals as caution", () => {
    const f = {
      pe_ratio: "60",
      revenue_growth: "-0.1",
      profit_margins: "0.01",
      return_on_equity: "0.01",
    } as StockFundamental;
    expect(fundamentalHealth(f)?.tone).toBe("caution");
  });
});

describe("health bar scores", () => {
  it("scores 52-week range position", () => {
    expect(score52WeekRange("150", "100", "200")).toBe(50);
    expect(score52WeekRange("100", "100", "100")).toBeNull();
    expect(score52WeekRange(null, "100", "200")).toBeNull();
  });

  it("peaks RSI momentum at 50", () => {
    expect(scoreRsiMomentum("50")).toBe(100);
    expect(scoreRsiMomentum("0")).toBe(0);
    expect(scoreRsiMomentum(null)).toBeNull();
  });

  it("clamps the other scores to 0-100", () => {
    expect(scoreMargin("1")).toBe(100); // 1 * 200 clamped
    expect(scoreRoe("0.5")).toBe(50);
    expect(scorePe("50")).toBe(50);
    expect(scoreEps("0")).toBe(50);
    expect(scoreMargin(null)).toBe(0);
  });
});
