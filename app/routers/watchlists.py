from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import User, Watchlist, WatchlistItem
from app.schemas import (
    StockQuoteRead,
    WatchlistAnalysisRead,
    WatchlistCreate,
    WatchlistRead,
    WatchlistUpdate,
    WatchlistWithQuotesRead,
)
from app.services.lookups import get_owned_or_404, get_stock_or_404
from app.services.stock_data import async_get_realtime_quote
from app.services.watchlist_analysis import analyze_watchlist

router = APIRouter(prefix="/watchlists", tags=["Watchlists"])

# Eager-load a watchlist's items and their stocks in one go.
_WITH_ITEMS = [selectinload(Watchlist.items).selectinload(WatchlistItem.stock)]


def _get_watchlist_or_404(db: Session, watchlist_id: int, user_id: int, *, with_items: bool = False) -> Watchlist:
    return get_owned_or_404(
        db,
        Watchlist,
        watchlist_id,
        user_id,
        detail="Watchlist not found",
        options=_WITH_ITEMS if with_items else None,
    )


@router.get("", response_model=List[WatchlistRead])
def list_watchlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all watchlists for the current user."""
    watchlists = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == current_user.id)
        .options(selectinload(Watchlist.items).selectinload(WatchlistItem.stock))
        .all()
    )
    result = []
    for wl in watchlists:
        items = [item.stock for item in wl.items]
        result.append(
            WatchlistRead(
                id=wl.id,
                name=wl.name,
                user_id=wl.user_id,
                items=items,
                created_at=wl.created_at,
                updated_at=wl.updated_at,
            )
        )
    return result


@router.post("", response_model=WatchlistRead, status_code=status.HTTP_201_CREATED)
def create_watchlist(
    watchlist_in: WatchlistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new watchlist."""
    watchlist = Watchlist(
        user_id=current_user.id,
        name=watchlist_in.name,
    )
    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)
    return WatchlistRead(
        id=watchlist.id,
        name=watchlist.name,
        user_id=watchlist.user_id,
        items=[],
        created_at=watchlist.created_at,
        updated_at=watchlist.updated_at,
    )


@router.get("/{watchlist_id}", response_model=WatchlistRead)
def get_watchlist(
    watchlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a specific watchlist with its stocks."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id, with_items=True)
    items = [item.stock for item in watchlist.items]
    return WatchlistRead(
        id=watchlist.id,
        name=watchlist.name,
        user_id=watchlist.user_id,
        items=items,
        created_at=watchlist.created_at,
        updated_at=watchlist.updated_at,
    )


@router.patch("/{watchlist_id}", response_model=WatchlistRead)
def update_watchlist(
    watchlist_id: int,
    watchlist_in: WatchlistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a watchlist resource."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id, with_items=True)
    if watchlist_in.name is not None:
        watchlist.name = watchlist_in.name

    db.commit()
    db.refresh(watchlist)
    items = [item.stock for item in watchlist.items]
    return WatchlistRead(
        id=watchlist.id,
        name=watchlist.name,
        user_id=watchlist.user_id,
        items=items,
        created_at=watchlist.created_at,
        updated_at=watchlist.updated_at,
    )


@router.delete("/{watchlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist(
    watchlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a watchlist."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id)
    db.delete(watchlist)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{watchlist_id}/items/{symbol}", response_model=WatchlistRead)
def put_watchlist_item(
    watchlist_id: int,
    symbol: str,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Ensure a stock exists in a watchlist."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id)
    stock = get_stock_or_404(db, symbol)

    existing = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.watchlist_id == watchlist.id, WatchlistItem.stock_id == stock.id)
        .first()
    )
    if not existing:
        item = WatchlistItem(watchlist_id=watchlist.id, stock_id=stock.id)
        db.add(item)
        db.commit()
        db.refresh(watchlist)
        response.status_code = status.HTTP_201_CREATED
        response.headers["Location"] = f"/api/v1/watchlists/{watchlist_id}/items/{symbol}"

    items = [i.stock for i in watchlist.items]
    return WatchlistRead(
        id=watchlist.id,
        name=watchlist.name,
        user_id=watchlist.user_id,
        items=items,
        created_at=watchlist.created_at,
        updated_at=watchlist.updated_at,
    )


@router.delete("/{watchlist_id}/items/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_watchlist_item(
    watchlist_id: int,
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Remove a stock from a watchlist."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id)
    stock = get_stock_or_404(db, symbol)

    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.watchlist_id == watchlist.id, WatchlistItem.stock_id == stock.id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock not found in watchlist",
        )

    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{watchlist_id}/quotes", response_model=WatchlistWithQuotesRead)
async def get_watchlist_quotes(
    watchlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get real-time quotes for all stocks in a watchlist."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id, with_items=True)

    quotes = []
    for item in watchlist.items:
        quote = await async_get_realtime_quote(item.stock.symbol)
        if quote:
            quotes.append(StockQuoteRead(**quote))

    return WatchlistWithQuotesRead(
        id=watchlist.id,
        name=watchlist.name,
        quotes=quotes,
    )


@router.get("/{watchlist_id}/analysis", response_model=WatchlistAnalysisRead)
def get_watchlist_analysis(
    watchlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Analyze a watchlist as an equal-weight observation basket."""
    watchlist = _get_watchlist_or_404(db, watchlist_id, current_user.id, with_items=True)
    return analyze_watchlist(db, watchlist)
