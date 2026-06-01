from collections import Counter

from sqlalchemy.orm import Session

from app.models import Stock, Watchlist
from app.schemas import (
    WatchlistAllocationBucket,
    WatchlistAnalysisRead,
    WatchlistAnalysisSummary,
    WatchlistConcentrationRead,
    WatchlistSignalDistribution,
)
from app.services.recommendations import get_stock_recommendation


def _percentage(count: int, total: int) -> float:
    if total <= 0:
        return 0
    return round(count / total * 100, 1)


def _bucketize(
    counter: Counter[str],
    labels: dict[str, str],
    total: int,
) -> list[WatchlistAllocationBucket]:
    buckets = [
        WatchlistAllocationBucket(
            key=key,
            label=labels.get(key, key),
            count=count,
            percentage=_percentage(count, total),
        )
        for key, count in counter.items()
    ]
    return sorted(buckets, key=lambda bucket: (-bucket.count, bucket.label))


def _risk_level(max_bucket_percentage: float, total: int) -> str:
    if total <= 1 or max_bucket_percentage >= 70:
        return "high"
    if max_bucket_percentage >= 50 or total <= 3:
        return "medium"
    return "low"


def _diversification_score(max_bucket_percentage: float, total: int) -> int:
    if total <= 0:
        return 0
    size_score = min(40, total * 8)
    concentration_score = max(0, 60 - int(max_bucket_percentage * 0.6))
    return min(100, size_score + concentration_score)


def _signal_distribution(db: Session, stocks: list[Stock]) -> WatchlistSignalDistribution:
    signals = WatchlistSignalDistribution()
    for stock in stocks:
        try:
            recommendation = get_stock_recommendation(db, stock).recommendation
        except Exception:
            signals.unavailable += 1
            continue

        if recommendation == "buy":
            signals.buy += 1
        elif recommendation == "sell":
            signals.sell += 1
        else:
            signals.hold += 1
    return signals


def analyze_watchlist(db: Session, watchlist: Watchlist) -> WatchlistAnalysisRead:
    stocks = [item.stock for item in watchlist.items if item.stock]
    total = len(stocks)

    if total == 0:
        empty_bucket = WatchlistConcentrationRead(
            diversification_score=0,
            risk_level="low",
        )
        return WatchlistAnalysisRead(
            id=watchlist.id,
            name=watchlist.name,
            total_stocks=0,
            summary=WatchlistAnalysisSummary(
                short_sentence="這份觀察清單目前沒有股票。",
                long_sentence=(
                    "加入股票後，系統會整理產業分布、集中度與技術訊號。"
                ),
            ),
            signal_distribution=WatchlistSignalDistribution(),
            concentration=empty_bucket,
            recommended_actions=[
                "先加入不同產業的股票，再把它當作觀察籃子來比較。"
            ],
        )

    asset_counter = Counter("etf" if stock.is_etf else "stock" for stock in stocks)
    industry_counter = Counter(stock.industry or "未分類" for stock in stocks)
    market_counter = Counter(stock.market for stock in stocks)

    asset_mix = _bucketize(asset_counter, {"etf": "ETF", "stock": "個股"}, total)
    industry_allocation = _bucketize(industry_counter, {}, total)
    market_allocation = _bucketize(market_counter, {}, total)
    signal_distribution = _signal_distribution(db, stocks)

    top_industry = industry_allocation[0] if industry_allocation else None
    top_market = market_allocation[0] if market_allocation else None
    max_bucket_percentage = top_industry.percentage if top_industry else 0
    risk_level = _risk_level(max_bucket_percentage, total)
    diversification_score = _diversification_score(max_bucket_percentage, total)

    risks: list[str] = []
    opportunities: list[str] = []
    recommended_actions: list[str] = []

    if top_industry and top_industry.percentage >= 50:
        risks.append(
            f"{top_industry.label}佔 {top_industry.percentage}%，清單集中度偏高。"
        )
        recommended_actions.append(
            "若目標是擴大觀察範圍，可加入不同產業或低相關標的。"
        )
    else:
        opportunities.append(
            "產業分布沒有明顯由單一類別主導。"
        )

    etf_bucket = next((bucket for bucket in asset_mix if bucket.key == "etf"), None)
    if not etf_bucket:
        risks.append(
            "清單內沒有 ETF，每檔都需要個別追蹤公司風險。"
        )
        recommended_actions.append(
            "可加入大盤或產業 ETF，作為比較基準或降低個股追蹤成本。"
        )
    elif etf_bucket.percentage >= 50:
        opportunities.append("ETF 比重較高，適合拿來和個股題材互相比較。")

    if signal_distribution.sell > signal_distribution.buy:
        risks.append("清單內技術訊號偏弱的標的多於偏強標的。")
        recommended_actions.append("新增相似曝險前，先檢查賣出訊號較多的標的。")
    elif signal_distribution.buy > signal_distribution.sell:
        opportunities.append("清單內技術訊號整體偏正向。")

    if total <= 3:
        risks.append("清單檔數偏少，單一股票會明顯影響整體判斷。")
        recommended_actions.append(
            "可把它當成聚焦研究清單；若要看籃子風險，建議再加入更多標的。"
        )

    if not recommended_actions:
        recommended_actions.append(
            "新增股票時持續檢查產業分布與訊號是否改變。"
        )

    summary = WatchlistAnalysisSummary(
        short_sentence=(
            f"{watchlist.name} 共有 {total} 檔股票，等權觀察下集中風險為 {risk_level}。"
        ),
        long_sentence=(
            "此分析不使用股數、成本或真實持股權重。最大產業為 "
            f"{top_industry.label if top_industry else '未分類'}，佔 {max_bucket_percentage}%，"
            f"分散分數為 {diversification_score}/100。"
        ),
    )

    return WatchlistAnalysisRead(
        id=watchlist.id,
        name=watchlist.name,
        total_stocks=total,
        summary=summary,
        asset_mix=asset_mix,
        industry_allocation=industry_allocation,
        market_allocation=market_allocation,
        signal_distribution=signal_distribution,
        concentration=WatchlistConcentrationRead(
            top_industry=top_industry,
            top_market=top_market,
            max_bucket_percentage=max_bucket_percentage,
            diversification_score=diversification_score,
            risk_level=risk_level,
        ),
        risks=risks,
        opportunities=opportunities,
        recommended_actions=recommended_actions,
    )
