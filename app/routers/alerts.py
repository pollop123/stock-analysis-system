from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import PriceAlert, User
from app.schemas import PriceAlertCreate, PriceAlertRead, PriceAlertUpdate
from app.services.lookups import get_owned_or_404, get_stock_or_404

router = APIRouter(prefix="/price-alerts", tags=["Price Alerts"])


@router.get("", response_model=List[PriceAlertRead])
def list_alerts(
    active_only: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List price alerts for the current user."""
    query = db.query(PriceAlert).filter(PriceAlert.user_id == current_user.id)
    if active_only is not None:
        query = query.filter(PriceAlert.is_active == active_only)
    alerts = query.order_by(PriceAlert.created_at.desc()).all()
    return [_enrich_alert(alert) for alert in alerts]


@router.post("", response_model=PriceAlertRead, status_code=status.HTTP_201_CREATED)
def create_alert(
    data: PriceAlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new price alert."""
    stock = get_stock_or_404(db, data.symbol)

    alert = PriceAlert(
        user_id=current_user.id,
        stock_id=stock.id,
        condition=data.condition,
        target_price=data.target_price,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return _enrich_alert(alert)


@router.patch("/{alert_id}", response_model=PriceAlertRead)
def update_alert(
    alert_id: int,
    data: PriceAlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a price alert."""
    alert = get_owned_or_404(db, PriceAlert, alert_id, current_user.id, detail="Alert not found")

    if data.is_active is not None:
        alert.is_active = data.is_active
    if data.target_price is not None:
        alert.target_price = data.target_price
    if data.condition is not None:
        alert.condition = data.condition

    db.commit()
    db.refresh(alert)
    return _enrich_alert(alert)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a price alert."""
    alert = get_owned_or_404(db, PriceAlert, alert_id, current_user.id, detail="Alert not found")

    db.delete(alert)
    db.commit()
    return None


def _enrich_alert(alert: PriceAlert) -> PriceAlertRead:
    return PriceAlertRead(
        id=alert.id,
        symbol=alert.stock.symbol,
        condition=alert.condition,
        target_price=alert.target_price,
        is_active=alert.is_active,
        triggered_at=alert.triggered_at,
        created_at=alert.created_at,
        updated_at=alert.updated_at,
    )
