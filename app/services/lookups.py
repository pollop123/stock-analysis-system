"""Owned-resource lookup seam.

One place for the two patterns the routers were copy-pasting: "find this stock by
symbol (optionally active-only) or 404" and "find this user-owned row by id or
404". Concentrating them here keeps the not-found semantics and the ``is_active``
filter from drifting between routers.
"""

from __future__ import annotations

from typing import Optional, Sequence, Type, TypeVar

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Stock

T = TypeVar("T")


def get_stock_or_404(db: Session, symbol: str, *, active_only: bool = False) -> Stock:
    """Return the stock for ``symbol`` or raise 404.

    ``active_only`` mirrors the per-endpoint choice: discovery endpoints
    (recommendation, fundamentals, peers) require an active listing; raw data
    endpoints (quote, history, sync status) accept any known symbol.
    """
    query = db.query(Stock).filter(Stock.symbol == symbol)
    if active_only:
        query = query.filter(Stock.is_active == True)
    stock = query.first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {symbol} not found",
        )
    return stock


def get_owned_or_404(
    db: Session,
    model: Type[T],
    resource_id: int,
    user_id: int,
    *,
    detail: str = "Not found",
    options: Optional[Sequence] = None,
) -> T:
    """Return the ``model`` row owned by ``user_id`` or raise 404.

    ``options`` accepts SQLAlchemy loader options (e.g. ``selectinload(...)``) so
    callers that need eager loading still go through the one ownership check.
    """
    query = db.query(model).filter(model.id == resource_id, model.user_id == user_id)
    if options:
        query = query.options(*options)
    obj = query.first()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return obj
