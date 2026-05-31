import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import status

from app.models import Stock, StockFundamental, StockPrice, StockSyncJob
from app.services.market_data import InMemoryMarketData, PriceRow
from app.services.stock_data import set_market_data_source


def _quote(symbol="2330", name="台積電", **overrides):
    """Build a normalized quote dict (the market data seam's contract)."""
    base = dict(
        symbol=symbol,
        name=name,
        price=Decimal("850.00"),
        open=Decimal("845.00"),
        high=Decimal("855.00"),
        low=Decimal("840.00"),
        close=Decimal("850.00"),
        volume=50000,
        change=Decimal("10.00"),
        change_percent=Decimal("1.19"),
        last_updated=datetime.now(timezone.utc),
    )
    base.update(overrides)
    return base


# ─── Public Stock Reads ───────────────────────────────────

class TestStocksPublicReads:
    def test_search_is_public(self, client, sample_stocks):
        response = client.get("/api/v1/stocks?q=台積")
        assert response.status_code == status.HTTP_200_OK

    def test_list_is_public(self, client, sample_stocks):
        response = client.get("/api/v1/stocks")
        assert response.status_code == status.HTTP_200_OK

    def test_quote_is_public(self, client, sample_stocks):
        set_market_data_source(InMemoryMarketData(quotes={"2330": _quote()}))
        response = client.get("/api/v1/stocks/2330/quotes/latest")
        assert response.status_code == status.HTTP_200_OK

    def test_history_is_public(self, client, sample_stocks):
        response = client.get("/api/v1/stocks/2330/prices")
        assert response.status_code == status.HTTP_200_OK

    def test_sync_requires_auth(self, client):
        response = client.post("/api/v1/stock-sync-jobs", json={"symbol": "2330"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_fundamentals_uses_cached_sqlite_datetime(self, client, sample_stocks, db_session):
        stock = sample_stocks[0]
        db_session.add(
            StockFundamental(
                stock_id=stock.id,
                market_cap=Decimal("59514787201024"),
                pe_ratio=Decimal("31.18"),
                dividend_yield=Decimal("0.0104"),
                return_on_equity=Decimal("0.3621"),
                updated_at=datetime.now(timezone.utc),
            )
        )
        db_session.commit()

        response = client.get("/api/v1/stocks/2330/fundamentals")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["pe_ratio"] == "31.18"

    def test_fundamentals_returns_stale_cache_when_refresh_fails(
        self, client, sample_stocks, db_session, monkeypatch
    ):
        class FailingTicker:
            def __init__(self, _symbol):
                pass

            @property
            def info(self):
                raise RuntimeError("rate limited")

        stock = sample_stocks[0]
        db_session.add(
            StockFundamental(
                stock_id=stock.id,
                market_cap=Decimal("59514787201024"),
                pe_ratio=Decimal("31.18"),
                updated_at=datetime.now(timezone.utc) - timedelta(days=3),
            )
        )
        db_session.commit()
        monkeypatch.setitem(
            sys.modules,
            "yfinance",
            SimpleNamespace(Ticker=FailingTicker),
        )

        response = client.get("/api/v1/stocks/2330/fundamentals")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["market_cap"] == "59514787201024.00"


# ─── Search ───────────────────────────────────────────────

class TestStockSearch:
    def test_search_by_symbol(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?q=2330")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["symbol"] == "2330"
        assert data[0]["name"] == "台積電"

    def test_search_by_name(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?q=台積")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["symbol"] == "2330"

    def test_search_no_results(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?q=XYZ")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    def test_search_empty_query(self, auth_client):
        response = auth_client.get("/api/v1/stocks?q=")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_search_case_insensitive(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?q=tsmc")
        assert response.status_code == status.HTTP_200_OK
        # Should not find anything since our sample uses Chinese names
        assert response.json() == []

    def test_search_inactive_stock_not_shown(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        stock.is_active = False
        db_session.commit()
        response = auth_client.get("/api/v1/stocks?q=2330")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []


# ─── List Stocks ──────────────────────────────────────────

class TestListStocks:
    def test_list_stocks(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 3
        symbols = {s["symbol"] for s in data}
        assert symbols == {"2330", "2317", "2454"}

    def test_list_stocks_pagination(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?limit=2")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 2

    def test_list_stocks_offset(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks?offset=1&limit=1")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 1

    def test_list_stocks_sorted_by_symbol(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks")
        assert response.status_code == status.HTTP_200_OK
        symbols = [s["symbol"] for s in response.json()]
        assert symbols == sorted(symbols)


class TestGetStock:
    def test_get_stock(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks/2330")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["symbol"] == "2330"
        assert data["name"] == "台積電"

    def test_get_inactive_stock_not_found(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        stock.is_active = False
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_stock_not_found(self, auth_client):
        response = auth_client.get("/api/v1/stocks/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Quote ────────────────────────────────────────────────

class TestStockQuote:
    def test_get_quote_success(self, auth_client, sample_stocks):
        set_market_data_source(InMemoryMarketData(quotes={"2330": _quote()}))
        response = auth_client.get("/api/v1/stocks/2330/quotes/latest")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["symbol"] == "2330"
        assert data["name"] == "台積電"
        assert Decimal(data["price"]) == Decimal("850.00")
        assert Decimal(data["open"]) == Decimal("845.00")
        assert Decimal(data["high"]) == Decimal("855.00")
        assert Decimal(data["low"]) == Decimal("840.00")
        assert data["volume"] == 50000
        assert Decimal(data["change"]) == Decimal("10.00")

    def test_get_quote_source_failure(self, auth_client, sample_stocks):
        set_market_data_source(InMemoryMarketData(quotes={}))
        response = auth_client.get("/api/v1/stocks/2330/quotes/latest")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_get_quote_stock_not_found(self, auth_client):
        response = auth_client.get("/api/v1/stocks/9999/quotes/latest")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── History ──────────────────────────────────────────────

class TestStockHistory:
    def test_get_history(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        prices = [
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1),
                open_price=Decimal("800.00"),
                high_price=Decimal("810.00"),
                low_price=Decimal("795.00"),
                close_price=Decimal("805.00"),
                volume=100000,
            ),
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 2),
                open_price=Decimal("805.00"),
                high_price=Decimal("815.00"),
                low_price=Decimal("800.00"),
                close_price=Decimal("810.00"),
                volume=120000,
            ),
        ]
        for p in prices:
            db_session.add(p)
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330/prices")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert data[0]["date"] == "2024-01-02"
        assert data[1]["date"] == "2024-01-01"

    def test_get_history_with_date_range(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        prices = [
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1),
                open_price=Decimal("800.00"),
                high_price=Decimal("810.00"),
                low_price=Decimal("795.00"),
                close_price=Decimal("805.00"),
                volume=100000,
            ),
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 15),
                open_price=Decimal("850.00"),
                high_price=Decimal("860.00"),
                low_price=Decimal("845.00"),
                close_price=Decimal("855.00"),
                volume=150000,
            ),
        ]
        for p in prices:
            db_session.add(p)
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330/prices?start=2024-01-01&end=2024-01-10")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["date"] == "2024-01-01"

    def test_get_history_empty(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks/2330/prices")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    def test_get_history_stock_not_found(self, auth_client):
        response = auth_client.get("/api/v1/stocks/9999/prices")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_history_invalid_date_format(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks/2330/prices?start=01-01-2024")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_get_history_start_only(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        prices = [
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1),
                open_price=Decimal("800.00"),
                high_price=Decimal("810.00"),
                low_price=Decimal("795.00"),
                close_price=Decimal("805.00"),
                volume=100000,
            ),
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 15),
                open_price=Decimal("850.00"),
                high_price=Decimal("860.00"),
                low_price=Decimal("845.00"),
                close_price=Decimal("855.00"),
                volume=150000,
            ),
        ]
        for p in prices:
            db_session.add(p)
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330/prices?start=2024-01-10")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["date"] == "2024-01-15"

    def test_get_history_end_only(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        prices = [
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1),
                open_price=Decimal("800.00"),
                high_price=Decimal("810.00"),
                low_price=Decimal("795.00"),
                close_price=Decimal("805.00"),
                volume=100000,
            ),
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 15),
                open_price=Decimal("850.00"),
                high_price=Decimal("860.00"),
                low_price=Decimal("845.00"),
                close_price=Decimal("855.00"),
                volume=150000,
            ),
        ]
        for p in prices:
            db_session.add(p)
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330/prices?end=2024-01-10")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["date"] == "2024-01-01"


# ─── Recommendation ───────────────────────────────────────

class TestStockRecommendation:
    def test_get_recommendation_no_history_returns_hold(self, client, sample_stocks):
        response = client.get("/api/v1/stocks/2330/recommendation")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["symbol"] == "2330"
        assert data["recommendation"] == "hold"
        assert data["confidence"] == 20
        assert data["as_of"] is None
        assert "Not enough historical price data" in data["reasons"]
        assert "not financial advice" in data["disclaimer"]

    def test_get_recommendation_buy(self, client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        for index in range(80):
            close = Decimal(100 + index)
            db_session.add(
                StockPrice(
                    stock_id=stock.id,
                    date=date(2024, 1, 1) + timedelta(days=index),
                    open_price=close,
                    high_price=close,
                    low_price=close,
                    close_price=close,
                    volume=120000,
                )
            )
        db_session.commit()

        response = client.get("/api/v1/stocks/2330/recommendation")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["recommendation"] == "buy"
        assert data["confidence"] >= 70
        assert data["indicators"]["ma20"] is not None

    def test_get_recommendation_stock_not_found(self, client):
        response = client.get("/api/v1/stocks/9999/recommendation")

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Sync ─────────────────────────────────────────────────

class TestStockSync:
    def test_sync_success(self, auth_client, sample_stocks, db_session):
        set_market_data_source(
            InMemoryMarketData(
                history={"2330": [PriceRow(date=date(2024, 1, 1), open=800.0, high=810.0, low=795.0, close=805.0, volume=100000, change=5.0)]}
            )
        )

        response = auth_client.post(
            "/api/v1/stock-sync-jobs",
            json={"symbol": "2330", "start": "2024-01-01", "end": "2024-01-31"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.headers["location"].startswith("/api/v1/stock-sync-jobs/")
        data = response.json()
        assert data["status"] == "success"
        assert "Synced 1 price records for 2330" in data["message"]
        assert data["records_upserted"] == 1

        job_response = auth_client.get(response.headers["location"])
        assert job_response.status_code == status.HTTP_200_OK
        assert job_response.json()["id"] == data["id"]

    def test_sync_ignores_duplicate_prices(self, auth_client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        db_session.add(
            StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1),
                open_price=Decimal("800.00"),
                high_price=Decimal("810.00"),
                low_price=Decimal("795.00"),
                close_price=Decimal("805.00"),
                volume=100000,
            )
        )
        db_session.commit()

        rows = [
            PriceRow(date=date(2024, 1, 1), open=800.0, high=810.0, low=795.0, close=805.0, volume=100000, change=5.0),
            PriceRow(date=date(2024, 1, 2), open=805.0, high=815.0, low=800.0, close=810.0, volume=120000, change=5.0),
            PriceRow(date=date(2024, 1, 2), open=805.0, high=815.0, low=800.0, close=810.0, volume=120000, change=5.0),
        ]
        set_market_data_source(InMemoryMarketData(history={"2330": rows}))

        response = auth_client.post(
            "/api/v1/stock-sync-jobs",
            json={"symbol": "2330", "start": "2024-01-01", "end": "2024-01-31"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "Synced 2 price records for 2330" in response.json()["message"]
        assert response.json()["records_skipped"] == 1
        assert db_session.query(StockPrice).filter(StockPrice.stock_id == stock.id).count() == 2

    def test_sync_status_pending(self, auth_client, sample_stocks):
        response = auth_client.get("/api/v1/stocks/2330/sync-status")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "pending"

    def test_sync_stock_not_found(self, auth_client):
        response = auth_client.post("/api/v1/stock-sync-jobs", json={"symbol": "9999"})
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_sync_bad_date_range(self, auth_client, sample_stocks):
        response = auth_client.post(
            "/api/v1/stock-sync-jobs",
            json={"symbol": "2330", "start": "2024-02-01", "end": "2024-01-01"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("app.routers.stocks.sync_historical_prices")
    def test_sync_generic_exception(self, mock_sync, auth_client, sample_stocks, db_session):
        mock_sync.side_effect = Exception("Network failure")
        response = auth_client.post("/api/v1/stock-sync-jobs", json={"symbol": "2330"})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["status"] == "failed"
        assert "Network failure" in response.json()["error"]

        job = db_session.query(StockSyncJob).filter(StockSyncJob.id == response.json()["id"]).first()
        assert job is not None
        assert job.status == "failed"

    def test_get_sync_job_not_found(self, auth_client):
        response = auth_client.get("/api/v1/stock-sync-jobs/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestStockSyncStatus:
    def test_get_sync_status_existing(self, auth_client, sample_stocks, db_session):
        from app.models import StockSyncStatus
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        status_obj = StockSyncStatus(
            stock_id=stock.id,
            status="success",
            synced_from=date(2024, 1, 1),
            synced_to=date(2024, 1, 31),
            records_upserted=10,
        )
        db_session.add(status_obj)
        db_session.commit()

        response = auth_client.get("/api/v1/stocks/2330/sync-status")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"
        assert data["records_upserted"] == 10
        assert data["synced_from"] == "2024-01-01"
        assert data["synced_to"] == "2024-01-31"

    def test_get_sync_status_stock_not_found(self, auth_client):
        response = auth_client.get("/api/v1/stocks/9999/sync-status")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestLegacyStockRoutes:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/stocks/search?q=2330",
            "/api/v1/stocks/2330/quote",
            "/api/v1/stocks/2330/history",
            "/api/v1/stocks/2330/sync",
        ],
    )
    def test_action_oriented_stock_routes_are_removed(self, auth_client, path):
        response = auth_client.get(path)
        assert response.status_code == status.HTTP_404_NOT_FOUND



class TestStockBatchSummary:
    def test_batch_summary_success(self, client, sample_stocks, db_session):
        stock = db_session.query(Stock).filter(Stock.symbol == "2330").first()
        # Add price history
        for i in range(25):
            price = StockPrice(
                stock_id=stock.id,
                date=date(2024, 1, 1) + timedelta(days=i),
                open_price=Decimal("800.00") + i,
                high_price=Decimal("810.00") + i,
                low_price=Decimal("790.00") + i,
                close_price=Decimal("805.00") + i,
                volume=10000 + i,
                change=Decimal("5.00"),
                change_percent=Decimal("0.50"),
            )
            db_session.add(price)
        db_session.commit()

        response = client.get("/api/v1/stocks/batch/summary?symbols=2330,2317")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

        item = data[0]
        assert item["symbol"] == "2330"
        assert "name" in item
        assert "price" in item
        assert "recommendation" in item
        assert "sparkline_data" in item
        assert len(item["sparkline_data"]) == 20

    def test_batch_summary_empty_symbols(self, client):
        response = client.get("/api/v1/stocks/batch/summary?symbols=")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_batch_summary_too_many_symbols(self, client):
        symbols = ",".join([str(i) for i in range(55)])
        response = client.get(f"/api/v1/stocks/batch/summary?symbols={symbols}")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_batch_summary_invalid_symbol_ignored(self, client, sample_stocks):
        response = client.get("/api/v1/stocks/batch/summary?symbols=FAKE999,2330")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["symbol"] == "2330"
