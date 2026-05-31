from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models import Stock, StockSyncStatus
from app.services.market_data import InMemoryMarketData, PriceRow, SecurityInfo
from app.services.stock_data import (
    StockSyncResult,
    _get_or_create_sync_status,
    _iter_months,
    _parse_date,
    _rate_limit,
    _taipei_today,
    _to_decimal,
    _to_int,
    async_get_realtime_quote,
    get_realtime_quote,
    set_market_data_source,
    sync_historical_prices,
    sync_recent_prices_for_active_stocks,
    sync_stock_list,
)


class TestToDecimal:
    def test_none_returns_none(self):
        assert _to_decimal(None) is None

    def test_dash_returns_none(self):
        assert _to_decimal("-") is None

    def test_invalid_string_returns_none(self):
        assert _to_decimal("abc") is None

    def test_integer_string(self):
        assert _to_decimal("100") == Decimal("100.00")

    def test_float_string(self):
        assert _to_decimal("100.5") == Decimal("100.50")

    def test_precision(self):
        assert _to_decimal("100.555") == Decimal("100.56")


class TestToInt:
    def test_none_returns_none(self):
        assert _to_int(None) is None

    def test_dash_returns_none(self):
        assert _to_int("-") is None

    def test_with_commas(self):
        assert _to_int("1,000,000") == 1_000_000

    def test_invalid_string_returns_none(self):
        assert _to_int("abc") is None

    def test_plain_integer(self):
        assert _to_int(500) == 500


class TestRateLimit:
    def test_sleeps(self):
        with patch("app.services.stock_data.time.sleep") as mock_sleep:
            _rate_limit()
            mock_sleep.assert_called_once()


class TestTaipeiToday:
    def test_returns_date(self):
        result = _taipei_today()
        assert isinstance(result, date)

    def test_is_today_in_taipei(self):
        result = _taipei_today()
        expected = datetime.now(timezone(timedelta(hours=8))).date()
        assert result == expected


class TestParseDate:
    def test_valid_string(self):
        assert _parse_date("2024-01-15", date(2000, 1, 1)) == date(2024, 1, 15)

    def test_none_returns_fallback(self):
        fallback = date(2010, 1, 1)
        assert _parse_date(None, fallback) == fallback

    def test_empty_string_returns_fallback(self):
        fallback = date(2010, 1, 1)
        assert _parse_date("", fallback) == fallback


class TestIterMonths:
    def test_same_month(self):
        result = list(_iter_months(date(2024, 1, 1), date(2024, 1, 15)))
        assert result == [(2024, 1)]

    def test_multiple_months(self):
        result = list(_iter_months(date(2024, 1, 1), date(2024, 3, 1)))
        assert result == [(2024, 1), (2024, 2), (2024, 3)]

    def test_year_boundary(self):
        result = list(_iter_months(date(2023, 11, 1), date(2024, 2, 1)))
        assert result == [(2023, 11), (2023, 12), (2024, 1), (2024, 2)]


class TestStockSyncResult:
    def test_message_format(self):
        result = StockSyncResult(
            symbol="2330",
            start=date(2024, 1, 1),
            end=date(2024, 1, 31),
            records_upserted=10,
            records_skipped=2,
            months_requested=1,
        )
        assert "Synced 10 price records for 2330" in result.message
        assert "2024-01-01" in result.message
        assert "2024-01-31" in result.message


class TestGetOrCreateSyncStatus:
    def test_creates_new(self, db_session, sample_stocks):
        stock = sample_stocks[0]
        status = _get_or_create_sync_status(db_session, stock)
        assert status.stock_id == stock.id
        assert status.status == "pending"

    def test_returns_existing(self, db_session, sample_stocks):
        stock = sample_stocks[0]
        s1 = _get_or_create_sync_status(db_session, stock)
        s1.status = "success"
        db_session.commit()
        s2 = _get_or_create_sync_status(db_session, stock)
        assert s2.id == s1.id
        assert s2.status == "success"


class TestSyncStockList:
    """The service upserts/deactivates from whatever the source lists — no
    twstock internals to patch, just an in-memory adapter."""

    def test_adds_new_stocks(self, db_session):
        set_market_data_source(
            InMemoryMarketData(
                securities=[SecurityInfo(symbol="9999", name="測試股", market="TWSE", industry="測試業")]
            )
        )
        count = sync_stock_list(db_session)
        assert count >= 1
        stock = db_session.query(Stock).filter_by(symbol="9999").first()
        assert stock is not None
        assert stock.name == "測試股"
        assert stock.market == "TWSE"
        assert stock.is_active is True

    def test_updates_changed_stocks(self, db_session):
        db_session.add(Stock(symbol="9999", name="Old", market="TWSE", industry="X", is_active=True))
        db_session.commit()
        set_market_data_source(
            InMemoryMarketData(
                securities=[SecurityInfo(symbol="9999", name="New", market="TWSE", industry="Y")]
            )
        )
        sync_stock_list(db_session)
        stock = db_session.query(Stock).filter_by(symbol="9999").first()
        assert stock.name == "New"
        assert stock.industry == "Y"

    def test_inactivates_missing_stocks(self, db_session):
        stock = Stock(symbol="ZZZZ", name="Old", market="TWSE", industry="X", is_active=True)
        db_session.add(stock)
        db_session.commit()

        set_market_data_source(
            InMemoryMarketData(
                securities=[SecurityInfo(symbol="9999", name="測試股", market="TWSE", industry="測試業")]
            )
        )
        count = sync_stock_list(db_session)
        db_session.refresh(stock)
        assert stock.is_active is False
        assert count >= 1


def _price_row(d: date, **overrides) -> PriceRow:
    base = dict(open=800.0, high=810.0, low=795.0, close=805.0, volume=100000, change=5.0)
    base.update(overrides)
    return PriceRow(date=d, **base)


class TestSyncHistoricalPrices:
    def test_start_after_end_raises(self, db_session, sample_stocks):
        with pytest.raises(ValueError, match="Start date cannot be after end date"):
            sync_historical_prices(db_session, sample_stocks[0].symbol, start=date(2024, 2, 1), end=date(2024, 1, 1))

    def test_stock_not_found_raises(self, db_session):
        with pytest.raises(ValueError, match="Stock 9999 not found"):
            sync_historical_prices(db_session, "9999")

    def test_successful_sync(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        set_market_data_source(
            InMemoryMarketData(history={symbol: [_price_row(date(2024, 1, 5))]}, history_source="twstock")
        )
        result = sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 1, 31))
        assert result.records_upserted >= 1
        assert result.symbol == symbol

    def test_records_data_source_on_status(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        set_market_data_source(
            InMemoryMarketData(history={symbol: [_price_row(date(2024, 1, 5))]}, history_source="yfinance")
        )
        sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 1, 31))
        status = db_session.query(StockSyncStatus).filter_by(stock_id=sample_stocks[0].id).first()
        assert status.status == "success"
        assert status.data_source == "yfinance"

    def test_failed_sync_updates_status(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        stock_id = sample_stocks[0].id
        set_market_data_source(InMemoryMarketData(history_error=Exception("Network error")))
        with pytest.raises(Exception, match="Network error"):
            sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 1, 31))

        status = db_session.query(StockSyncStatus).filter_by(stock_id=stock_id).first()
        assert status is not None
        assert status.status == "failed"
        assert "Network error" in status.last_error

    def test_successful_sync_multiple_rows(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        rows = [
            _price_row(date(2024, 1, 5)),
            _price_row(date(2024, 2, 8), close=815.0),
            _price_row(date(2024, 3, 6), close=820.0),
        ]
        set_market_data_source(InMemoryMarketData(history={symbol: rows}))
        result = sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 3, 31))
        assert result.records_upserted == 3
        assert result.months_requested == 3

    def test_skips_duplicate_dates(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        rows = [_price_row(date(2024, 1, 5)), _price_row(date(2024, 1, 5), close=999.0)]
        set_market_data_source(InMemoryMarketData(history={symbol: rows}))
        result = sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 1, 31))
        assert result.records_upserted == 1
        assert result.records_skipped == 1

    def test_skips_rows_outside_range(self, db_session, sample_stocks):
        symbol = sample_stocks[0].symbol
        rows = [_price_row(date(2023, 12, 31)), _price_row(date(2024, 1, 5))]
        set_market_data_source(InMemoryMarketData(history={symbol: rows}))
        result = sync_historical_prices(db_session, symbol, start=date(2024, 1, 1), end=date(2024, 1, 31))
        assert result.records_upserted == 1


class TestSyncRecentPricesForActiveStocks:
    def test_syncs_all_active_stocks(self, db_session, sample_stocks):
        with patch("app.services.stock_data.sync_historical_prices") as mock_sync:
            mock_sync.return_value = MagicMock(records_upserted=5)
            total = sync_recent_prices_for_active_stocks(db_session)
            assert total == 15  # 3 stocks * 5 records each
            assert mock_sync.call_count == 3

    def test_gracefully_handles_failures(self, db_session, sample_stocks):
        with patch("app.services.stock_data.sync_historical_prices") as mock_sync:
            mock_sync.side_effect = Exception("boom")
            total = sync_recent_prices_for_active_stocks(db_session)
            assert total == 0
            assert mock_sync.call_count == 3


class TestGetRealtimeQuote:
    """get_realtime_quote delegates to the source; parsing lives in the adapter
    (covered by tests/test_market_data.py)."""

    def test_delegates_to_source(self):
        quote = {"symbol": "2330", "name": "台積電", "price": Decimal("850.00"), "volume": 50000}
        set_market_data_source(InMemoryMarketData(quotes={"2330": quote}))
        assert get_realtime_quote("2330") == quote

    def test_returns_none_when_source_has_no_quote(self):
        set_market_data_source(InMemoryMarketData(quotes={}))
        assert get_realtime_quote("2330") is None


class TestAsyncWrappers:
    def test_async_get_realtime_quote(self):
        with patch("app.services.stock_data.get_realtime_quote", return_value={"symbol": "2330"}) as mock_fn:
            import asyncio
            result = asyncio.run(async_get_realtime_quote("2330"))
            assert result == {"symbol": "2330"}
            mock_fn.assert_called_once_with("2330")
