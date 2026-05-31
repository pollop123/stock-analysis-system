"""Market data intake seam.

One interface — ``MarketDataSource`` — for every external Taiwan-stock fact the
app needs: the security list, historical prices, and real-time quotes. The real
adapter (``TwstockYFinanceSource``) owns the entire twstock/yfinance coupling and
returns normalized domain values; the in-memory adapter (``InMemoryMarketData``)
backs tests with no network and no library internals to patch.

Callers (``app.services.stock_data``) depend on the interface, never on twstock
or yfinance directly. Library row shapes (twstock namedtuples, yfinance
DataFrames, the realtime ``rt`` dict) stop at this seam and never leak past it.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Protocol

import requests
import twstock
import twstock.proxy as _twstock_proxy
from twstock.stock import TPEXFetcher, TWSEFetcher

from app.config import settings

logger = logging.getLogger(__name__)

# Monkey-patch twstock to reuse a single requests.Session with connection pooling.
# The default get_session() creates a new Session per call -> no keep-alive.
_shared_session = requests.Session()
_shared_session.mount("https://", _twstock_proxy._LegacyCertAdapter(pool_connections=20, pool_maxsize=20))
_shared_session.mount("http://", _twstock_proxy._LegacyCertAdapter(pool_connections=20, pool_maxsize=20))
_twstock_proxy.get_session = lambda: _shared_session


# ─── Normalized domain values (the seam's vocabulary) ─────

@dataclass(frozen=True)
class SecurityInfo:
    """A listed security, normalized away from twstock's ``codes`` entries."""

    symbol: str
    name: str
    market: str  # "TWSE" | "TPEx"
    industry: Optional[str]


@dataclass(frozen=True)
class PriceRow:
    """One day of OHLCV history, normalized across twstock and yfinance rows."""

    date: date
    open: object
    high: object
    low: object
    close: object
    volume: object
    change: object = None


@dataclass
class HistoryResult:
    """Historical rows plus which adapter source produced them."""

    rows: list[PriceRow] = field(default_factory=list)
    source: Optional[str] = None


# Security types that twstock.realtime supports and we want to expose.
_SUPPORTED_TYPES = {
    "股票",
    "ETF",
    "特別股",
    "臺灣存託憑證(TDR)",
    "受益證券-不動產投資信託",
    "創新板",
}

_MARKET_MAP = {"上市": "TWSE", "上櫃": "TPEx"}


def _to_decimal(value, precision=2) -> Optional[Decimal]:
    if value is None or value == "-":
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return None


def _to_int(value) -> Optional[int]:
    if value is None or value == "-":
        return None
    try:
        return int(str(value).replace(",", ""))
    except Exception:
        return None


# ─── The interface ────────────────────────────────────────

class MarketDataSource(Protocol):
    """Everything the app must know to obtain external stock data."""

    def list_securities(self) -> list[SecurityInfo]:
        """Return the supported TWSE/TPEx securities, already filtered."""
        ...

    def fetch_history(self, symbol: str, market: str, start: date, end: date) -> HistoryResult:
        """Return OHLCV rows for ``symbol`` between ``start`` and ``end`` (inclusive)."""
        ...

    def fetch_quote(self, symbol: str) -> Optional[dict]:
        """Return a normalized real-time quote dict, or None when unavailable.

        The dict keys match ``StockQuoteRead``: symbol, name, price, open, high,
        low, close, volume, change, change_percent, last_updated.
        """
        ...


# ─── Real adapter: twstock + yfinance ─────────────────────

class TwstockYFinanceSource:
    """Production adapter. Owns the twstock/yfinance coupling end to end."""

    def list_securities(self) -> list[SecurityInfo]:
        securities: list[SecurityInfo] = []
        for code, info in twstock.codes.items():
            # Only TWSE / TPEx listed securities of a supported type.
            if info.market not in _MARKET_MAP:
                continue
            if info.type not in _SUPPORTED_TYPES:
                continue
            securities.append(
                SecurityInfo(
                    symbol=code,
                    name=info.name,
                    market=_MARKET_MAP[info.market],
                    industry=info.group if info.group else None,
                )
            )
        return securities

    def fetch_history(self, symbol: str, market: str, start: date, end: date) -> HistoryResult:
        # Fast path: Yahoo Finance fetches all history in one request.
        rows = self._fetch_yfinance(symbol, market, start, end)
        if rows:
            return HistoryResult(rows=rows, source="yfinance")

        # Fallback: twstock month-by-month fetch.
        rows = self._fetch_twstock(symbol, start, end)
        return HistoryResult(rows=rows, source="twstock")

    def fetch_quote(self, symbol: str) -> Optional[dict]:
        try:
            rt = twstock.realtime.get(symbol)
        except Exception:
            logger.debug("Real-time quote fetch failed for %s", symbol)
            return None
        if not rt.get("success"):
            return None
        info = rt.get("info", {})
        realtime = rt.get("realtime", {})

        price = _to_decimal(realtime.get("latest_trade_price"))
        open_p = _to_decimal(realtime.get("open"))
        high_p = _to_decimal(realtime.get("high"))
        low_p = _to_decimal(realtime.get("low"))
        close_p = _to_decimal(realtime.get("latest_trade_price"))
        volume = _to_int(realtime.get("accumulate_trade_volume"))
        change = _to_decimal(realtime.get("price_change"))
        change_percent = _to_decimal(realtime.get("price_change_percent"))

        # Calculate change_percent if missing.
        if change_percent is None and change is not None and open_p and open_p > 0:
            change_percent = (change / open_p * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        if None in (price, open_p, high_p, low_p):
            return None

        return {
            "symbol": info.get("code", symbol),
            "name": info.get("name", ""),
            "price": price,
            "open": open_p,
            "high": high_p,
            "low": low_p,
            "close": close_p,
            "volume": volume or 0,
            "change": change,
            "change_percent": change_percent,
            "last_updated": datetime.now(timezone.utc),
        }

    # ── internal twstock/yfinance plumbing ──

    def _fetch_yfinance(self, symbol: str, market: str, start: date, end: date) -> list[PriceRow]:
        try:
            import yfinance as yf
        except ImportError:
            logger.debug("yfinance not installed, skipping fast path")
            return []

        yf_symbol = f"{symbol}.TW" if market == "TWSE" else f"{symbol}.TWO"
        try:
            # yfinance end date is exclusive, so add one day.
            end_exclusive = end + timedelta(days=1)
            ticker = yf.Ticker(yf_symbol)
            df = ticker.history(start=start.isoformat(), end=end_exclusive.isoformat(), auto_adjust=False)
        except Exception as exc:
            logger.warning("Yahoo Finance fetch failed for %s: %s", yf_symbol, exc)
            return []

        if df.empty:
            logger.debug("Yahoo Finance returned no data for %s", yf_symbol)
            return []

        rows: list[PriceRow] = []
        prev_close = None
        for idx, row in df.iterrows():
            row_date = idx.date() if hasattr(idx, "date") else idx

            open_p = row.get("Open")
            high_p = row.get("High")
            low_p = row.get("Low")
            close_p = row.get("Close")
            volume = row.get("Volume")

            if None in (open_p, high_p, low_p, close_p):
                continue
            try:
                o_val = float(open_p)
                h_val = float(high_p)
                l_val = float(low_p)
                c_val = float(close_p)
            except Exception:
                continue

            change = None
            if prev_close is not None:
                try:
                    change = round(c_val - prev_close, 2)
                except Exception:
                    pass

            try:
                vol_int = int(volume) if volume == volume else 0  # NaN check
            except Exception:
                vol_int = 0

            rows.append(
                PriceRow(
                    date=row_date,
                    open=o_val,
                    high=h_val,
                    low=l_val,
                    close=c_val,
                    volume=vol_int,
                    change=change,
                )
            )
            prev_close = c_val

        logger.info("Yahoo Finance returned %d rows for %s", len(rows), yf_symbol)
        return rows

    def _fetch_twstock(self, symbol: str, start: date, end: date) -> list[PriceRow]:
        code_info = twstock.codes.get(symbol)
        data_source = getattr(code_info, "data_source", "twse") if code_info else "twse"
        fetcher = TWSEFetcher() if data_source == "twse" else TPEXFetcher()

        months = list(_iter_months(start, end))
        raw_rows: list = []
        if len(months) == 1:
            raw_rows.extend(self._fetch_month(fetcher, symbol, months[0][0], months[0][1]))
        else:
            with ThreadPoolExecutor(max_workers=settings.stock_sync_max_concurrent) as executor:
                futures = {
                    executor.submit(self._fetch_month, fetcher, symbol, year, month): (year, month)
                    for year, month in months
                }
                for future in as_completed(futures):
                    raw_rows.extend(future.result())

        return [
            PriceRow(
                date=r.date,
                open=r.open,
                high=r.high,
                low=r.low,
                close=r.close,
                volume=r.capacity,
                change=r.change,
            )
            for r in raw_rows
        ]

    @staticmethod
    def _fetch_month(fetcher, symbol: str, year: int, month: int) -> list:
        """Synchronous month fetch using a reusable fetcher."""
        time.sleep(settings.stock_sync_rate_limit_seconds)
        result = fetcher.fetch(year, month, symbol)
        return result.get("data", [])


# ─── In-memory adapter (tests) ────────────────────────────

class InMemoryMarketData:
    """Test adapter. Holds canned data; no network, no library patching."""

    def __init__(
        self,
        *,
        securities: Optional[list[SecurityInfo]] = None,
        history: Optional[dict[str, list[PriceRow]]] = None,
        quotes: Optional[dict[str, dict]] = None,
        history_source: str = "memory",
        history_error: Optional[Exception] = None,
    ):
        self.securities = securities or []
        self.history = history or {}
        self.quotes = quotes or {}
        self.history_source = history_source
        self.history_error = history_error

    def list_securities(self) -> list[SecurityInfo]:
        return list(self.securities)

    def fetch_history(self, symbol: str, market: str, start: date, end: date) -> HistoryResult:
        if self.history_error is not None:
            raise self.history_error
        rows = list(self.history.get(symbol, []))
        return HistoryResult(rows=rows, source=self.history_source)

    def fetch_quote(self, symbol: str) -> Optional[dict]:
        return self.quotes.get(symbol)


def _iter_months(start: date, end: date) -> Iterable[tuple[int, int]]:
    current = date(start.year, start.month, 1)
    final = date(end.year, end.month, 1)
    while current <= final:
        yield current.year, current.month
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
