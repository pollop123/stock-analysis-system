from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.models import StockTargetPrice, User
from app.schemas import StockTargetPriceCreate, StockTargetPriceRead
from app.services.lookups import get_stock_or_404

router = APIRouter(prefix="/stocks", tags=["Target Prices"])


@router.get("/{symbol}/target-prices", response_model=List[StockTargetPriceRead])
def list_target_prices(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get analyst target prices for a stock."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    targets = (
        db.query(StockTargetPrice)
        .filter(StockTargetPrice.stock_id == stock.id)
        .order_by(StockTargetPrice.report_date.desc())
        .all()
    )
    return targets


@router.post("/{symbol}/target-prices", response_model=StockTargetPriceRead, status_code=status.HTTP_201_CREATED)
def create_target_price(
    symbol: str,
    data: StockTargetPriceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Add a target price for a stock (admin-only)."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    target = StockTargetPrice(
        stock_id=stock.id,
        analyst=data.analyst,
        target_price=data.target_price,
        rating=data.rating,
        report_date=data.report_date,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{symbol}/target-prices/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target_price(
    symbol: str,
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a target price (admin-only)."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    target = (
        db.query(StockTargetPrice)
        .filter(StockTargetPrice.id == target_id, StockTargetPrice.stock_id == stock.id)
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target price not found",
        )

    db.delete(target)
    db.commit()
    return None
