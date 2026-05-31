"""Tests for the owned-resource lookup seam."""

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import selectinload

from app.models import Stock, User, Watchlist, WatchlistItem
from app.services.lookups import get_owned_or_404, get_stock_or_404


class TestGetStockOr404:
    def test_returns_stock(self, db_session, sample_stocks):
        stock = get_stock_or_404(db_session, "2330")
        assert stock.symbol == "2330"

    def test_missing_raises_404_with_symbol_detail(self, db_session):
        with pytest.raises(HTTPException) as exc:
            get_stock_or_404(db_session, "9999")
        assert exc.value.status_code == 404
        assert "Stock 9999 not found" in exc.value.detail

    def test_active_only_excludes_inactive(self, db_session):
        db_session.add(Stock(symbol="DEAD", name="Delisted", market="TWSE", is_active=False))
        db_session.commit()
        # default: inactive is found
        assert get_stock_or_404(db_session, "DEAD").symbol == "DEAD"
        # active_only: inactive is a 404
        with pytest.raises(HTTPException):
            get_stock_or_404(db_session, "DEAD", active_only=True)


class TestGetOwnedOr404:
    def _user(self, db_session, username):
        user = User(username=username, email=f"{username}@example.com", hashed_password="x")
        db_session.add(user)
        db_session.commit()
        return user

    def test_returns_owned_row(self, db_session):
        user = self._user(db_session, "owner")
        wl = Watchlist(user_id=user.id, name="Tech")
        db_session.add(wl)
        db_session.commit()
        found = get_owned_or_404(db_session, Watchlist, wl.id, user.id, detail="Watchlist not found")
        assert found.id == wl.id

    def test_other_users_row_is_404(self, db_session):
        owner = self._user(db_session, "owner2")
        intruder = self._user(db_session, "intruder")
        wl = Watchlist(user_id=owner.id, name="Tech")
        db_session.add(wl)
        db_session.commit()
        with pytest.raises(HTTPException) as exc:
            get_owned_or_404(db_session, Watchlist, wl.id, intruder.id, detail="Watchlist not found")
        assert exc.value.status_code == 404
        assert exc.value.detail == "Watchlist not found"

    def test_options_eager_load_items(self, db_session, sample_stocks):
        user = self._user(db_session, "owner3")
        wl = Watchlist(user_id=user.id, name="Tech")
        db_session.add(wl)
        db_session.commit()
        db_session.add(WatchlistItem(watchlist_id=wl.id, stock_id=sample_stocks[0].id))
        db_session.commit()
        found = get_owned_or_404(
            db_session,
            Watchlist,
            wl.id,
            user.id,
            options=[selectinload(Watchlist.items).selectinload(WatchlistItem.stock)],
        )
        assert [i.stock.symbol for i in found.items] == ["2330"]
