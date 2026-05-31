from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Stock, StockFundamental


def _safe_decimal(value) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ValueError, TypeError):
        return None


def _normalize_dividend_yield(value) -> Optional[Decimal]:
    """yfinance returns dividendYield inconsistently: sometimes as decimal (0.0229),
    sometimes as raw percentage (2.29). Normalize to decimal."""
    d = _safe_decimal(value)
    if d is None:
        return None
    # If > 1, assume it's already a percentage (e.g., 2.29%), convert to decimal
    if d > 1:
        return d / Decimal("100")
    return d


def get_stock_fundamentals(db: Session, stock: Stock) -> Optional[StockFundamental]:
    """Fetch or refresh stock fundamentals from yfinance."""
    existing = db.query(StockFundamental).filter(StockFundamental.stock_id == stock.id).first()

    # Return cached if updated within 24 hours
    if existing and existing.updated_at:
        updated_at = existing.updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - updated_at
        if age.total_seconds() < 86400:
            return existing

    try:
        import yfinance as yf
    except ImportError:
        return existing

    suffix = ".TW" if stock.market == "TWSE" else ".TWO"
    ticker = yf.Ticker(f"{stock.symbol}{suffix}")
    try:
        info = ticker.info or {}
    except Exception:
        return existing

    if not info:
        return existing

    data = {
        "market_cap": _safe_decimal(info.get("marketCap")),
        "pe_ratio": _safe_decimal(info.get("trailingPE")),
        "dividend_yield": _normalize_dividend_yield(info.get("dividendYield")),
        "eps": _safe_decimal(info.get("trailingEps")),
        "book_value": _safe_decimal(info.get("bookValue")),
        "shares_outstanding": _safe_decimal(info.get("sharesOutstanding")),
        "fifty_two_week_high": _safe_decimal(info.get("fiftyTwoWeekHigh")),
        "fifty_two_week_low": _safe_decimal(info.get("fiftyTwoWeekLow")),
        "revenue_growth": _safe_decimal(info.get("revenueGrowth")),
        "profit_margins": _safe_decimal(info.get("profitMargins")),
        "debt_to_equity": _safe_decimal(info.get("debtToEquity")),
        "return_on_equity": _safe_decimal(info.get("returnOnEquity")),
        "free_cashflow": _safe_decimal(info.get("freeCashflow")),
        "beta": _safe_decimal(info.get("beta")),
        "forward_pe": _safe_decimal(info.get("forwardPE")),
        "sector": info.get("sector") or info.get("industry"),
        "website": info.get("website"),
        "long_business_summary": info.get("longBusinessSummary"),
    }

    # Only create/update if we got at least some useful data
    has_useful_data = any(v is not None for k, v in data.items() if k not in ("sector", "website", "long_business_summary"))
    if not has_useful_data:
        return existing

    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
        existing.updated_at = datetime.now(timezone.utc)
    else:
        existing = StockFundamental(stock_id=stock.id, **data)
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing
