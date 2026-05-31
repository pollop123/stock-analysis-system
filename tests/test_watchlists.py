from datetime import datetime, timezone
from decimal import Decimal

from fastapi import status

from app.services.market_data import InMemoryMarketData
from app.services.stock_data import set_market_data_source
from tests.conftest import login_user, register_user


def _quote(symbol, name="台積電"):
    return {
        "symbol": symbol,
        "name": name,
        "price": Decimal("850.00"),
        "open": Decimal("845.00"),
        "high": Decimal("855.00"),
        "low": Decimal("840.00"),
        "close": Decimal("850.00"),
        "volume": 50000,
        "change": Decimal("10.00"),
        "change_percent": Decimal("1.19"),
        "last_updated": datetime.now(timezone.utc),
    }

# ─── Auth Requirement ─────────────────────────────────────

class TestWatchlistsAuth:
    def test_list_requires_auth(self, client):
        response = client.get("/api/v1/watchlists")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_auth(self, client):
        response = client.post("/api/v1/watchlists", json={"name": "My List"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_requires_auth(self, client):
        response = client.get("/api/v1/watchlists/1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_requires_auth(self, client):
        response = client.delete("/api/v1/watchlists/1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_add_item_requires_auth(self, client):
        response = client.put("/api/v1/watchlists/1/items/2330")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_remove_item_requires_auth(self, client):
        response = client.delete("/api/v1/watchlists/1/items/2330")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_quotes_requires_auth(self, client):
        response = client.get("/api/v1/watchlists/1/quotes")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── Create ───────────────────────────────────────────────

class TestCreateWatchlist:
    def test_create_success(self, auth_client):
        response = auth_client.post("/api/v1/watchlists", json={"name": "Tech Stocks"})
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Tech Stocks"
        assert data["user_id"] is not None
        assert data["items"] == []

    def test_create_missing_name(self, auth_client):
        response = auth_client.post("/api/v1/watchlists", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_empty_name(self, auth_client):
        response = auth_client.post("/api/v1/watchlists", json={"name": ""})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ─── List ─────────────────────────────────────────────────

class TestListWatchlists:
    def test_list_empty(self, auth_client):
        response = auth_client.get("/api/v1/watchlists")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    def test_list_multiple(self, auth_client):
        auth_client.post("/api/v1/watchlists", json={"name": "List 1"})
        auth_client.post("/api/v1/watchlists", json={"name": "List 2"})
        response = auth_client.get("/api/v1/watchlists")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 2

    def test_list_only_own_watchlists(self, auth_client, client):
        # Create first user and watchlist
        auth_client.post("/api/v1/watchlists", json={"name": "User1 List"})

        # Create second user
        register_user(client, username="user2", email="user2@example.com")
        login_resp = login_user(client, username="user2")
        token = login_resp.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})

        response = client.get("/api/v1/watchlists")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []


# ─── Get ──────────────────────────────────────────────────

class TestGetWatchlist:
    def test_get_success(self, auth_client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")

        response = auth_client.get(f"/api/v1/watchlists/{wl_id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Tech"
        assert len(data["items"]) == 1
        assert data["items"][0]["symbol"] == "2330"

    def test_get_not_found(self, auth_client):
        response = auth_client.get("/api/v1/watchlists/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_other_users_watchlist(self, auth_client, client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Private"})
        wl_id = create_resp.json()["id"]

        register_user(client, username="user2", email="user2@example.com")
        login_resp = login_user(client, username="user2")
        token = login_resp.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})

        response = client.get(f"/api/v1/watchlists/{wl_id}")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Delete ───────────────────────────────────────────────

class TestDeleteWatchlist:
    def test_delete_success(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "To Delete"})
        wl_id = create_resp.json()["id"]

        response = auth_client.delete(f"/api/v1/watchlists/{wl_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.content == b""

        get_resp = auth_client.get(f"/api/v1/watchlists/{wl_id}")
        assert get_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_not_found(self, auth_client):
        response = auth_client.delete("/api/v1/watchlists/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_other_users_watchlist(self, auth_client, client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Private"})
        wl_id = create_resp.json()["id"]

        register_user(client, username="user2", email="user2@example.com")
        login_resp = login_user(client, username="user2")
        token = login_resp.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})

        response = client.delete(f"/api/v1/watchlists/{wl_id}")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestUpdateWatchlist:
    def test_update_name(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Old Name"})
        wl_id = create_resp.json()["id"]

        response = auth_client.patch(f"/api/v1/watchlists/{wl_id}", json={"name": "New Name"})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "New Name"

    def test_update_empty_name(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Old Name"})
        wl_id = create_resp.json()["id"]

        response = auth_client.patch(f"/api/v1/watchlists/{wl_id}", json={"name": ""})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_update_not_found(self, auth_client):
        response = auth_client.patch("/api/v1/watchlists/9999", json={"name": "New Name"})
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Add Item ─────────────────────────────────────────────

class TestAddWatchlistItem:
    def test_add_success(self, auth_client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        response = auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.headers["location"] == f"/api/v1/watchlists/{wl_id}/items/2330"
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["symbol"] == "2330"

    def test_add_duplicate(self, auth_client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")
        response = auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()["items"]) == 1

    def test_add_stock_not_found(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        response = auth_client.put(f"/api/v1/watchlists/{wl_id}/items/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_add_to_other_users_watchlist(self, auth_client, client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Private"})
        wl_id = create_resp.json()["id"]

        register_user(client, username="user2", email="user2@example.com")
        login_resp = login_user(client, username="user2")
        token = login_resp.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})

        response = client.put(f"/api/v1/watchlists/{wl_id}/items/2330")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Remove Item ──────────────────────────────────────────

class TestRemoveWatchlistItem:
    def test_remove_success(self, auth_client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]
        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")

        response = auth_client.delete(f"/api/v1/watchlists/{wl_id}/items/2330")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.content == b""

        get_response = auth_client.get(f"/api/v1/watchlists/{wl_id}")
        assert get_response.status_code == status.HTTP_200_OK
        assert get_response.json()["items"] == []

    def test_remove_stock_not_in_watchlist(self, auth_client, sample_stocks):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        response = auth_client.delete(f"/api/v1/watchlists/{wl_id}/items/2330")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found in watchlist" in response.json()["detail"]

    def test_remove_stock_not_found(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        response = auth_client.delete(f"/api/v1/watchlists/{wl_id}/items/9999")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ─── Quotes ───────────────────────────────────────────────

class TestWatchlistQuotes:
    def test_get_quotes_success(self, auth_client, sample_stocks):
        set_market_data_source(InMemoryMarketData(quotes={"2330": _quote("2330")}))

        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]
        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")

        response = auth_client.get(f"/api/v1/watchlists/{wl_id}/quotes")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == wl_id
        assert data["name"] == "Tech"
        assert len(data["quotes"]) == 1
        assert data["quotes"][0]["symbol"] == "2330"

    def test_get_quotes_source_failure_ignored(self, auth_client, sample_stocks):
        set_market_data_source(InMemoryMarketData(quotes={}))

        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]
        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")

        response = auth_client.get(f"/api/v1/watchlists/{wl_id}/quotes")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["quotes"] == []

    def test_get_quotes_not_found(self, auth_client):
        response = auth_client.get("/api/v1/watchlists/9999/quotes")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_quotes_empty_watchlist(self, auth_client):
        set_market_data_source(InMemoryMarketData(quotes={}))
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Empty"})
        wl_id = create_resp.json()["id"]

        response = auth_client.get(f"/api/v1/watchlists/{wl_id}/quotes")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["quotes"] == []

    def test_get_quotes_partial_failure(self, auth_client, sample_stocks):
        # 2330 has a quote; 2317 does not (source returns None) and is skipped.
        set_market_data_source(InMemoryMarketData(quotes={"2330": _quote("2330")}))

        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]
        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2330")
        auth_client.put(f"/api/v1/watchlists/{wl_id}/items/2317")

        response = auth_client.get(f"/api/v1/watchlists/{wl_id}/quotes")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["quotes"]) == 1
        assert data["quotes"][0]["symbol"] == "2330"


class TestLegacyWatchlistRoutes:
    def test_post_watchlist_items_route_is_removed(self, auth_client):
        create_resp = auth_client.post("/api/v1/watchlists", json={"name": "Tech"})
        wl_id = create_resp.json()["id"]

        response = auth_client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "2330"})
        assert response.status_code == status.HTTP_404_NOT_FOUND
