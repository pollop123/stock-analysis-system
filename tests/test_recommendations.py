from datetime import date, timedelta
from decimal import Decimal

from app.models import Stock, StockFundamental, StockPrice
from app.services.recommendations import build_stock_recommendation


def _prices(closes, *, start=date(2024, 1, 1), volume=100_000):
    rows = []
    for index, close in enumerate(closes):
        close_decimal = Decimal(str(close))
        rows.append(
            StockPrice(
                stock_id=1,
                date=start + timedelta(days=index),
                open_price=close_decimal,
                high_price=close_decimal,
                low_price=close_decimal,
                close_price=close_decimal,
                volume=volume,
            )
        )
    return rows


def _stock_with_fundamentals(
    *,
    is_etf=False,
    pe_ratio="20",
    revenue_growth="0.10",
    profit_margins="0.15",
    return_on_equity="0.15",
):
    stock = Stock(
        id=1,
        symbol="2330",
        name="Test Stock",
        market="TWSE",
        industry="Semiconductor",
        is_etf=is_etf,
    )
    stock.fundamental = StockFundamental(
        stock_id=1,
        pe_ratio=Decimal(pe_ratio) if pe_ratio is not None else None,
        revenue_growth=Decimal(revenue_growth) if revenue_growth is not None else None,
        profit_margins=Decimal(profit_margins) if profit_margins is not None else None,
        return_on_equity=Decimal(return_on_equity) if return_on_equity is not None else None,
    )
    return stock


def test_no_prices_returns_low_confidence_hold():
    result = build_stock_recommendation("2330", [])

    assert result.recommendation == "hold"
    assert result.confidence == 20
    assert result.as_of is None
    assert "Not enough historical price data" in result.reasons


def test_uptrend_without_fundamentals_still_returns_buy_with_lower_confidence():
    closes = list(range(100, 180))
    result = build_stock_recommendation("2330", _prices(closes, volume=120_000))

    assert result.recommendation == "buy"
    assert result.technical_score >= 3
    assert result.fundamental_score is None
    assert result.confidence < 90
    assert "Fundamental data is not available" in result.reasons


def test_weak_fundamentals_cap_technical_buy_at_hold():
    closes = list(range(100, 180))
    stock = _stock_with_fundamentals(
        pe_ratio="60",
        revenue_growth="-0.05",
        profit_margins="-0.02",
        return_on_equity="0.01",
    )

    result = build_stock_recommendation("2330", _prices(closes, volume=120_000), stock)

    assert result.recommendation == "hold"
    assert result.technical_score >= 3
    assert result.fundamental_score == -4
    assert result.data_quality_score >= 90
    assert "weak fundamentals cap the signal at hold" in " ".join(result.reasons)


def test_strong_fundamentals_do_not_override_technical_sell():
    closes = list(range(180, 100, -1))
    stock = _stock_with_fundamentals()

    result = build_stock_recommendation("2330", _prices(closes, volume=120_000), stock)

    assert result.recommendation == "hold"
    assert result.technical_score <= -2
    assert result.fundamental_score == 4
    assert "technical weakness keeps the signal at hold" in " ".join(result.reasons)


def test_etf_skips_company_fundamental_score():
    closes = list(range(100, 180))
    stock = _stock_with_fundamentals(is_etf=True)

    result = build_stock_recommendation("0050", _prices(closes, volume=120_000), stock)

    assert result.recommendation == "buy"
    assert result.fundamental_score is None
    assert "ETF is excluded from company fundamental scoring" in result.reasons
