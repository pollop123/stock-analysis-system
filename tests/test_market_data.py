"""Tests for the market data intake seam.

The real adapter owns the twstock/yfinance coupling, so patching twstock here is
patching the adapter's own dependency — the appropriate seam for an adapter test.
The in-memory adapter needs no patching at all.
"""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.market_data import (
    HistoryResult,
    InMemoryMarketData,
    PriceRow,
    SecurityInfo,
    TwstockYFinanceSource,
)


class TestTwstockYFinanceSourceListSecurities:
    def _info(self, **kw):
        base = dict(market="上市", name="測試股", group="測試業", type="股票")
        base.update(kw)
        return SimpleNamespace(**base)

    def test_includes_supported_twse(self):
        source = TwstockYFinanceSource()
        with patch.dict("app.services.market_data.twstock.codes", {"9999": self._info()}, clear=True):
            secs = source.list_securities()
        assert SecurityInfo(symbol="9999", name="測試股", market="TWSE", industry="測試業") in secs

    def test_maps_tpex_market(self):
        source = TwstockYFinanceSource()
        with patch.dict("app.services.market_data.twstock.codes", {"6666": self._info(market="上櫃")}, clear=True):
            secs = source.list_securities()
        assert secs[0].market == "TPEx"

    def test_skips_unsupported_market(self):
        source = TwstockYFinanceSource()
        with patch.dict("app.services.market_data.twstock.codes", {"9998": self._info(market="興櫃")}, clear=True):
            assert source.list_securities() == []

    def test_skips_unsupported_type(self):
        source = TwstockYFinanceSource()
        with patch.dict("app.services.market_data.twstock.codes", {"03000": self._info(type="權證")}, clear=True):
            assert source.list_securities() == []


class TestTwstockYFinanceSourceFetchQuote:
    def _rt(self, **realtime_overrides):
        realtime = {
            "latest_trade_price": "850.00",
            "open": "845.00",
            "high": "855.00",
            "low": "840.00",
            "accumulate_trade_volume": "50000",
            "price_change": "10.00",
            "price_change_percent": "1.19",
        }
        realtime.update(realtime_overrides)
        return {"success": True, "info": {"code": "2330", "name": "台積電"}, "realtime": realtime}

    def test_success(self):
        source = TwstockYFinanceSource()
        with patch("app.services.market_data.twstock.realtime.get", return_value=self._rt()):
            quote = source.fetch_quote("2330")
        assert quote["symbol"] == "2330"
        assert quote["name"] == "台積電"
        assert quote["price"] == Decimal("850.00")
        assert quote["volume"] == 50000

    def test_source_failure_returns_none(self):
        source = TwstockYFinanceSource()
        with patch("app.services.market_data.twstock.realtime.get", return_value={"success": False}):
            assert source.fetch_quote("2330") is None

    def test_exception_returns_none(self):
        source = TwstockYFinanceSource()
        with patch("app.services.market_data.twstock.realtime.get", side_effect=RuntimeError("boom")):
            assert source.fetch_quote("2330") is None

    def test_calculates_change_percent_when_missing(self):
        source = TwstockYFinanceSource()
        with patch("app.services.market_data.twstock.realtime.get", return_value=self._rt(price_change_percent="-")):
            quote = source.fetch_quote("2330")
        assert quote["change_percent"] is not None

    def test_missing_required_price_fields_returns_none(self):
        source = TwstockYFinanceSource()
        rt = self._rt(latest_trade_price="-", open="-", high="-", low="-")
        with patch("app.services.market_data.twstock.realtime.get", return_value=rt):
            assert source.fetch_quote("006203") is None


class TestTwstockYFinanceSourceFetchHistory:
    def test_yfinance_fast_path_used_when_available(self):
        source = TwstockYFinanceSource()
        rows = [PriceRow(date=date(2024, 1, 5), open=800.0, high=810.0, low=795.0, close=805.0, volume=1000, change=5.0)]
        with patch.object(source, "_fetch_yfinance", return_value=rows):
            result = source.fetch_history("2330", "TWSE", date(2024, 1, 1), date(2024, 1, 31))
        assert result.source == "yfinance"
        assert result.rows == rows

    def test_falls_back_to_twstock(self):
        source = TwstockYFinanceSource()
        Data = MagicMock()
        Data.date = date(2024, 1, 5)
        Data.open, Data.high, Data.low, Data.close, Data.capacity, Data.change = 800.0, 810.0, 795.0, 805.0, 1000, 5.0
        fetcher = MagicMock()
        fetcher.fetch.return_value = {"data": [Data]}
        with patch.object(source, "_fetch_yfinance", return_value=[]), \
             patch("app.services.market_data.TWSEFetcher", return_value=fetcher), \
             patch("app.services.market_data.twstock.codes", {}), \
             patch("app.services.market_data.time.sleep"):
            result = source.fetch_history("2330", "TWSE", date(2024, 1, 1), date(2024, 1, 31))
        assert result.source == "twstock"
        assert len(result.rows) == 1
        assert result.rows[0].volume == 1000


class TestInMemoryMarketData:
    def test_list_securities(self):
        sec = SecurityInfo(symbol="2330", name="TSMC", market="TWSE", industry="半導體業")
        assert InMemoryMarketData(securities=[sec]).list_securities() == [sec]

    def test_fetch_history_returns_configured_rows(self):
        row = PriceRow(date=date(2024, 1, 5), open=1, high=2, low=0, close=1, volume=10)
        src = InMemoryMarketData(history={"2330": [row]}, history_source="memory")
        result = src.fetch_history("2330", "TWSE", date(2024, 1, 1), date(2024, 1, 31))
        assert isinstance(result, HistoryResult)
        assert result.rows == [row]
        assert result.source == "memory"

    def test_fetch_history_raises_configured_error(self):
        src = InMemoryMarketData(history_error=ValueError("down"))
        try:
            src.fetch_history("2330", "TWSE", date(2024, 1, 1), date(2024, 1, 31))
            assert False, "expected error"
        except ValueError as exc:
            assert "down" in str(exc)

    def test_fetch_quote(self):
        src = InMemoryMarketData(quotes={"2330": {"price": Decimal("1")}})
        assert src.fetch_quote("2330") == {"price": Decimal("1")}
        assert src.fetch_quote("0000") is None
