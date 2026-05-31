from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import PortfolioTransaction, User
from app.schemas import PortfolioPositionRead, PortfolioTransactionCreate, PortfolioTransactionRead
from app.services.lookups import get_stock_or_404
from app.services.portfolio import (
    PendingTransaction,
    calculate_position,
    calculate_positions,
    can_apply_pending,
    position_pnl,
)
from app.services.stock_data import async_get_realtime_quote

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


def _get_user_transactions(
    db: Session,
    user_id: int,
    stock_id: Optional[int] = None,
) -> list[PortfolioTransaction]:
    query = db.query(PortfolioTransaction).filter(PortfolioTransaction.user_id == user_id)
    if stock_id is not None:
        query = query.filter(PortfolioTransaction.stock_id == stock_id)

    return query.order_by(
        PortfolioTransaction.transaction_date,
        PortfolioTransaction.id,
    ).all()


@router.post("/transactions", response_model=PortfolioTransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    data: PortfolioTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Record a buy or sell transaction."""
    stock = get_stock_or_404(db, data.symbol)

    transaction_date = data.transaction_date or datetime.now(timezone.utc)

    if data.transaction_type == "sell":
        existing_transactions = _get_user_transactions(db, current_user.id, stock.id)
        pending = PendingTransaction(
            transaction_type=data.transaction_type,
            shares=data.shares,
            price=data.price,
            transaction_date=transaction_date,
            id=2**31 - 1,
        )
        if not can_apply_pending(existing_transactions, stock, pending):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient shares to sell {data.shares} of {stock.symbol}",
            )

    tx = PortfolioTransaction(
        user_id=current_user.id,
        stock_id=stock.id,
        transaction_type=data.transaction_type,
        shares=data.shares,
        price=data.price,
        transaction_date=transaction_date,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    return PortfolioTransactionRead(
        id=tx.id,
        symbol=stock.symbol,
        transaction_type=tx.transaction_type,
        shares=tx.shares,
        price=tx.price,
        transaction_date=tx.transaction_date,
        created_at=tx.created_at,
    )


@router.get("/positions", response_model=List[PortfolioPositionRead])
async def get_positions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current portfolio positions with P&L."""
    transactions = _get_user_transactions(db, current_user.id)
    positions = calculate_positions(transactions)

    result = []
    for pos in positions.values():
        if pos.total_shares <= 0:
            continue

        stock = pos.stock
        quote = await async_get_realtime_quote(stock.symbol)
        current_price = Decimal(str(quote["price"])) if quote else None
        pnl = position_pnl(pos, current_price)

        result.append(
            PortfolioPositionRead(
                symbol=stock.symbol,
                name=stock.name,
                shares=pos.total_shares,
                avg_price=pnl.avg_price,
                current_price=current_price,
                market_value=pnl.market_value,
                unrealized_pnl=pnl.unrealized_pnl,
                unrealized_pnl_percent=pnl.unrealized_pnl_percent,
            )
        )

    return result


@router.get("/positions/{symbol}", response_model=PortfolioPositionRead)
async def get_position(
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a single stock position."""
    stock = get_stock_or_404(db, symbol)

    transactions = _get_user_transactions(db, current_user.id, stock.id)
    position = calculate_position(stock, transactions)

    if position.total_shares <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No position found for {symbol}",
        )

    quote = await async_get_realtime_quote(stock.symbol)
    current_price = Decimal(str(quote["price"])) if quote else None
    pnl = position_pnl(position, current_price)

    return PortfolioPositionRead(
        symbol=stock.symbol,
        name=stock.name,
        shares=position.total_shares,
        avg_price=pnl.avg_price,
        current_price=current_price,
        market_value=pnl.market_value,
        unrealized_pnl=pnl.unrealized_pnl,
        unrealized_pnl_percent=pnl.unrealized_pnl_percent,
    )
