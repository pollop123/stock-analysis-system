import asyncio
import logging
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Stock, StockPrice, StockSyncStatus
from app.services.market_data import (
    MarketDataSource,
    TwstockYFinanceSource,
    _iter_months,  # re-exported: tested as app.services.stock_data._iter_months
    _to_decimal,  # re-exported: tested as app.services.stock_data._to_decimal
    _to_int,  # re-exported: tested as app.services.stock_data._to_int
)

logger = logging.getLogger(__name__)


# ─── Market data source (the swappable seam) ──────────────

_market_data_source: Optional[MarketDataSource] = None


def get_market_data_source() -> MarketDataSource:
    """Return the active market data adapter (defaults to twstock/yfinance)."""
    global _market_data_source
    if _market_data_source is None:
        _market_data_source = TwstockYFinanceSource()
    return _market_data_source


def set_market_data_source(source: Optional[MarketDataSource]) -> None:
    """Swap the market data adapter. Pass an in-memory adapter in tests; pass
    None to reset to the production twstock/yfinance adapter."""
    global _market_data_source
    _market_data_source = source


# ─── Helpers ──────────────────────────────────────────────

_rate_limit_lock: Optional[threading.Lock] = None


def set_rate_limit_lock(lock: Optional[threading.Lock]) -> None:
    """Set a global lock to coordinate rate limiting across threads."""
    global _rate_limit_lock
    _rate_limit_lock = lock


def _rate_limit():
    """Throttle real-time quote requests."""
    if _rate_limit_lock is not None:
        with _rate_limit_lock:
            time.sleep(settings.stock_sync_rate_limit_seconds)
    else:
        time.sleep(settings.stock_sync_rate_limit_seconds)


def _taipei_today() -> date:
    return datetime.now(ZoneInfo("Asia/Taipei")).date()


def _parse_date(value: Optional[str], fallback: date) -> date:
    if not value:
        return fallback
    return date.fromisoformat(value)


@dataclass
class StockSyncResult:
    symbol: str
    start: date
    end: date
    records_upserted: int
    records_skipped: int
    months_requested: int

    @property
    def message(self) -> str:
        return (
            f"Synced {self.records_upserted} price records for {self.symbol} "
            f"from {self.start.isoformat()} to {self.end.isoformat()}"
        )


def _get_or_create_sync_status(db: Session, stock: Stock) -> StockSyncStatus:
    status = db.query(StockSyncStatus).filter(StockSyncStatus.stock_id == stock.id).first()
    if status:
        return status

    status = StockSyncStatus(stock_id=stock.id, status="pending", records_upserted=0)
    db.add(status)
    db.flush()
    return status


# ─── Stock List Sync ──────────────────────────────────────

def sync_stock_list(db: Session) -> int:
    """Sync stocks table from the market data source. Returns count changed."""
    changed = 0
    seen_symbols = set()
    for sec in get_market_data_source().list_securities():
        values = {
            "name": sec.name,
            "market": sec.market,
            "industry": sec.industry,
            "is_active": True,
        }
        seen_symbols.add(sec.symbol)
        existing = db.query(Stock).filter(Stock.symbol == sec.symbol).first()
        if existing:
            if any(getattr(existing, key) != value for key, value in values.items()):
                for key, value in values.items():
                    setattr(existing, key, value)
                changed += 1
            continue

        db.add(Stock(symbol=sec.symbol, **values))
        changed += 1

    inactive_count = (
        db.query(Stock)
        .filter(Stock.is_active == True, Stock.symbol.notin_(seen_symbols))
        .update({Stock.is_active: False}, synchronize_session=False)
        if seen_symbols
        else 0
    )
    changed += inactive_count
    db.commit()
    return changed


# ─── Historical Price Sync ────────────────────────────────

def sync_historical_prices(
    db: Session,
    symbol: str,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> StockSyncResult:
    """Fetch (via the market data source) and cache historical prices for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    if not stock:
        raise ValueError(f"Stock {symbol} not found")

    today = _taipei_today()
    status = _get_or_create_sync_status(db, stock)
    if end is None:
        end = today
    if start is None:
        latest_price_date = (
            db.query(StockPrice.date)
            .filter(StockPrice.stock_id == stock.id)
            .order_by(StockPrice.date.desc())
            .limit(1)
            .scalar()
        )
        if latest_price_date:
            start = max(
                latest_price_date - timedelta(days=settings.stock_daily_sync_lookback_days),
                date(1900, 1, 1),
            )
        else:
            start = _parse_date(settings.stock_history_start_date, date(2010, 1, 1))
    if start > end:
        raise ValueError("Start date cannot be after end date")

    status.status = "running"
    status.last_attempt_at = datetime.now(timezone.utc)
    status.last_error = None
    db.commit()

    months_requested = len(list(_iter_months(start, end)))

    insert_stmt = (
        postgresql_insert
        if db.get_bind().dialect.name == "postgresql"
        else sqlite_insert
    )

    try:
        t0 = time.perf_counter()

        history = get_market_data_source().fetch_history(symbol, stock.market, start, end)
        all_rows = history.rows
        fetcher_used = history.source

        t1 = time.perf_counter()

        seen_dates = set()
        upserted = 0
        skipped = 0
        values_batch = []

        for row in all_rows:
            row_date = row.date.date() if isinstance(row.date, datetime) else row.date
            if row_date < start or row_date > end:
                continue
            if row_date in seen_dates:
                skipped += 1
                continue
            seen_dates.add(row_date)

            open_price = _to_decimal(row.open)
            high_price = _to_decimal(row.high)
            low_price = _to_decimal(row.low)
            close_price = _to_decimal(row.close)
            if None in (open_price, high_price, low_price, close_price):
                skipped += 1
                continue

            values_batch.append(dict(
                stock_id=stock.id,
                date=row_date,
                open_price=open_price,
                high_price=high_price,
                low_price=low_price,
                close_price=close_price,
                volume=_to_int(row.volume) or 0,
                change=_to_decimal(row.change),
            ))

        if values_batch:
            stmt = insert_stmt(StockPrice).values(values_batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["stock_id", "date"],
                set_={
                    "open_price": stmt.excluded.open_price,
                    "high_price": stmt.excluded.high_price,
                    "low_price": stmt.excluded.low_price,
                    "close_price": stmt.excluded.close_price,
                    "volume": stmt.excluded.volume,
                    "change": stmt.excluded.change,
                },
            )
            result = db.execute(stmt)
            upserted = result.rowcount or 0

        t2 = time.perf_counter()
        logger.info(
            "[%s] synced %d months → %d rows via %s (fetch %.2fs | db %.2fs | total %.2fs)",
            symbol,
            months_requested,
            upserted,
            fetcher_used,
            t1 - t0,
            t2 - t1,
            t2 - t0,
        )

        status.status = "success"
        status.synced_from = start if status.synced_from is None else min(status.synced_from, start)
        status.synced_to = end if status.synced_to is None else max(status.synced_to, end)
        status.data_source = fetcher_used
        status.last_success_at = datetime.now(timezone.utc)
        status.last_error = None
        status.records_upserted = upserted
        db.commit()
    except Exception as exc:
        # Re-query stock to avoid detached instance error after rollback
        stock = db.query(Stock).filter(Stock.symbol == symbol).first()
        if stock:
            status = _get_or_create_sync_status(db, stock)
            status.status = "failed"
            status.last_attempt_at = datetime.now(timezone.utc)
            status.last_error = str(exc)[:500]
            status.data_source = None
            db.commit()
        raise

    return StockSyncResult(
        symbol=symbol,
        start=start,
        end=end,
        records_upserted=upserted,
        records_skipped=skipped,
        months_requested=months_requested,
    )


def sync_recent_prices_for_active_stocks(db: Session, lookback_days: Optional[int] = None) -> int:
    """Refresh recent history for all active stocks after market close (parallel)."""
    if lookback_days is None:
        lookback_days = settings.stock_daily_sync_lookback_days
    end = _taipei_today()
    start = end - timedelta(days=lookback_days)

    stocks = db.query(Stock).filter(Stock.is_active == True).all()
    total = 0

    from concurrent.futures import ThreadPoolExecutor, as_completed

    from app.database import SessionLocal

    def _sync_one(symbol: str) -> int:
        db_thread = SessionLocal()
        try:
            result = sync_historical_prices(db_thread, symbol, start=start, end=end)
            return result.records_upserted
        except Exception:
            return 0
        finally:
            db_thread.close()

    with ThreadPoolExecutor(max_workers=settings.stock_sync_max_concurrent) as executor:
        futures = {
            executor.submit(_sync_one, stock.symbol): stock.symbol
            for stock in stocks
        }
        for future in as_completed(futures):
            total += future.result()

    return total


# ─── Real-time Quote ──────────────────────────────────────

def get_realtime_quote(symbol: str) -> Optional[dict]:
    """Get a normalized real-time quote via the market data source, or None."""
    _rate_limit()
    return get_market_data_source().fetch_quote(symbol)


# ─── Async Wrappers ───────────────────────────────────────

async def async_get_realtime_quote(symbol: str) -> Optional[dict]:
    """Async wrapper for get_realtime_quote using thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_realtime_quote, symbol)


async def async_sync_stock_list(db: Session) -> int:
    """Async wrapper for sync_stock_list using thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, sync_stock_list, db)
