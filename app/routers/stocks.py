from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import Stock, StockPrice, StockSyncJob, StockSyncStatus, User
from app.schemas import (
    StockPriceRead,
    StockQuoteRead,
    StockRead,
    StockSyncJobCreate,
    StockSyncJobRead,
    StockSyncStatusRead,
)
from app.services.stock_data import async_get_realtime_quote, sync_historical_prices

router = APIRouter(prefix="/stocks", tags=["Stocks"])
sync_jobs_router = APIRouter(prefix="/stock-sync-jobs", tags=["Stock Sync Jobs"])


def _read_stock_sync_job(job: StockSyncJob) -> StockSyncJobRead:
    return StockSyncJobRead(
        id=job.id,
        symbol=job.stock.symbol,
        status=job.status,
        start=job.requested_from,
        end=job.requested_to,
        message=job.message,
        error=job.last_error,
        records_upserted=job.records_upserted,
        records_skipped=job.records_skipped,
        months_requested=job.months_requested,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.get("", response_model=List[StockRead])
def list_stocks(
    q: Optional[str] = Query(None, min_length=1, description="Optional search query for stock name or symbol"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=3000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List available stocks, optionally filtered by symbol or name."""
    query = db.query(Stock).filter(Stock.is_active == True)
    if q:
        query = query.filter((Stock.symbol.ilike(f"%{q}%")) | (Stock.name.ilike(f"%{q}%")))
    
    # Sort by symbol by default for consistent ordering
    stocks = query.order_by(Stock.symbol).offset(offset).limit(limit).all()
    return stocks


@router.get("/{symbol}", response_model=StockRead)
def get_stock(
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a stock resource."""
    stock = db.query(Stock).filter(Stock.symbol == symbol, Stock.is_active == True).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {symbol} not found",
        )
    return stock


@router.get("/{symbol}/quotes/latest", response_model=StockQuoteRead)
async def get_stock_quote(
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get real-time quote for a stock (delayed data from twstock)."""
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {symbol} not found",
        )

    quote = await async_get_realtime_quote(symbol)
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch real-time quote from data source",
        )

    return StockQuoteRead(**quote)


@router.get("/{symbol}/prices", response_model=List[StockPriceRead])
def get_stock_history(
    symbol: str,
    start: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get cached historical prices for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {symbol} not found",
        )

    query = db.query(StockPrice).filter(StockPrice.stock_id == stock.id)

    if start:
        query = query.filter(StockPrice.date >= start)
    if end:
        query = query.filter(StockPrice.date <= end)

    prices = query.order_by(StockPrice.date.desc()).all()
    return prices


@router.get("/{symbol}/sync-status", response_model=StockSyncStatusRead)
def get_stock_sync_status(
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get historical price sync status for a stock."""
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {symbol} not found",
        )

    sync_status = db.query(StockSyncStatus).filter(StockSyncStatus.stock_id == stock.id).first()
    if not sync_status:
        return StockSyncStatusRead(symbol=symbol, status="pending", records_upserted=0)

    return StockSyncStatusRead(
        symbol=symbol,
        status=sync_status.status,
        synced_from=sync_status.synced_from,
        synced_to=sync_status.synced_to,
        last_attempt_at=sync_status.last_attempt_at,
        last_success_at=sync_status.last_success_at,
        last_error=sync_status.last_error,
        records_upserted=sync_status.records_upserted,
    )


@sync_jobs_router.post("", response_model=StockSyncJobRead, status_code=status.HTTP_201_CREATED)
def create_stock_sync_job(
    job_in: StockSyncJobCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a stock historical price sync job."""
    if job_in.start and job_in.end and job_in.start > job_in.end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after end date",
        )

    stock = db.query(Stock).filter(Stock.symbol == job_in.symbol).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock {job_in.symbol} not found",
        )

    now = datetime.now(timezone.utc)
    job = StockSyncJob(
        stock_id=stock.id,
        status="running",
        requested_from=job_in.start,
        requested_to=job_in.end,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        result = sync_historical_prices(db, job_in.symbol, start=job_in.start, end=job_in.end)
    except Exception as e:
        job.status = "failed"
        job.last_error = f"Failed to sync prices: {str(e)}"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
    else:
        job.status = "success"
        job.requested_from = result.start
        job.requested_to = result.end
        job.message = result.message
        job.records_upserted = result.records_upserted
        job.records_skipped = result.records_skipped
        job.months_requested = result.months_requested
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)

    response.headers["Location"] = f"/api/v1/stock-sync-jobs/{job.id}"
    return _read_stock_sync_job(job)


@sync_jobs_router.get("/{job_id}", response_model=StockSyncJobRead)
def get_stock_sync_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a stock sync job resource."""
    job = db.query(StockSyncJob).filter(StockSyncJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock sync job not found",
        )
    return _read_stock_sync_job(job)
