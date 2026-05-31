import csv
import io
import logging
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_active_user
from app.limiter import conditional_limit, get_authenticated_subject_or_address
from app.models import AIAnalysisJob, Stock, StockPrice, StockSyncJob, StockSyncStatus, User
from app.schemas import (
    AIAnalysisJobRead,
    AIAnalysisResponse,
    StockFundamentalRead,
    StockProfileRead,
    StockQuoteRead,
    StockRead,
    StockRecommendationRead,
    StockSummaryRead,
    StockSyncJobCreate,
    StockSyncJobRead,
    StockSyncStatusRead,
)
from app.services.ai_analysis_cache import ai_analysis_cache
from app.services.ai_analysis_jobs import (
    AI_ANALYSIS_BUSY_DETAIL,
    AIAnalysisProviderUnavailable,
    ai_analysis_job_service,
)
from app.services.fundamentals import get_stock_fundamentals
from app.services.lookups import get_stock_or_404
from app.services.recommendations import get_stock_recommendation
from app.services.stock_data import async_get_realtime_quote, sync_historical_prices
from app.services.summaries import get_stock_summaries

router = APIRouter(prefix="/stocks", tags=["Stocks"])
sync_jobs_router = APIRouter(prefix="/stock-sync-jobs", tags=["Stock Sync Jobs"])
logger = logging.getLogger(__name__)


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


def _read_ai_analysis_job(job: AIAnalysisJob) -> AIAnalysisJobRead:
    result = None
    if job.result_json:
        try:
            result = AIAnalysisResponse.model_validate_json(job.result_json)
        except Exception:
            result = None

    return AIAnalysisJobRead(
        id=job.id,
        symbol=job.stock.symbol,
        status=job.status,
        result=result,
        error=AI_ANALYSIS_BUSY_DETAIL if job.status == "failed" else None,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.get("", response_model=List[StockRead])
def list_stocks(
    q: Optional[str] = Query(
        None, min_length=1, description="Optional search query for stock name or symbol"
    ),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List available stocks, optionally filtered by symbol or name."""
    query = db.query(Stock).filter(Stock.is_active == True)
    if q:
        query = query.filter((Stock.symbol.ilike(f"%{q}%")) | (Stock.name.ilike(f"%{q}%")))
    stocks = query.order_by(Stock.symbol).offset(offset).limit(limit).all()
    return stocks


@router.get("/batch/summary", response_model=List[StockSummaryRead])
def get_stock_batch_summary(
    symbols: str = Query(..., description="Comma-separated stock symbols"),
    db: Session = Depends(get_db),
):
    """Get enriched summaries (price, change, recommendation, sparkline) for multiple stocks."""
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No symbols provided",
        )
    if len(symbol_list) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50 symbols allowed per request",
        )
    summaries = get_stock_summaries(db, symbol_list)
    return summaries


@router.get("/{symbol}", response_model=StockRead)
def get_stock(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get a stock resource."""
    return get_stock_or_404(db, symbol, active_only=True)


@router.get("/{symbol}/quotes/latest", response_model=StockQuoteRead)
async def get_stock_quote(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get real-time quote for a stock (delayed data from twstock)."""
    get_stock_or_404(db, symbol)

    quote = await async_get_realtime_quote(symbol)
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch real-time quote from data source",
        )

    return StockQuoteRead(**quote)


@router.get("/{symbol}/prices")
def get_stock_history(
    symbol: str,
    start: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
):
    """Get cached historical prices for a stock (JSON or CSV)."""
    stock = get_stock_or_404(db, symbol)

    query = db.query(StockPrice).filter(StockPrice.stock_id == stock.id)

    if start:
        query = query.filter(StockPrice.date >= start)
    if end:
        query = query.filter(StockPrice.date <= end)

    prices = query.order_by(StockPrice.date.desc()).all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["date", "open", "high", "low", "close", "volume", "change"])
        for p in prices:
            writer.writerow(
                [
                    p.date.isoformat(),
                    p.open_price,
                    p.high_price,
                    p.low_price,
                    p.close_price,
                    p.volume,
                    p.change,
                ]
            )
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{symbol}_prices.csv"'},
        )

    return prices


@router.get("/{symbol}/recommendation", response_model=StockRecommendationRead)
def get_stock_recommendation_endpoint(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get a rule-based technical trading signal for a stock."""
    stock = get_stock_or_404(db, symbol, active_only=True)
    return get_stock_recommendation(db, stock)


@router.get("/{symbol}/sync-status", response_model=StockSyncStatusRead)
def get_stock_sync_status(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get historical price sync status for a stock."""
    stock = get_stock_or_404(db, symbol)

    sync_status = db.query(StockSyncStatus).filter(StockSyncStatus.stock_id == stock.id).first()
    if not sync_status:
        return StockSyncStatusRead(symbol=symbol, status="pending", records_upserted=0)

    return StockSyncStatusRead(
        symbol=symbol,
        status=sync_status.status,
        synced_from=sync_status.synced_from,
        synced_to=sync_status.synced_to,
        data_source=sync_status.data_source,
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

    stock = get_stock_or_404(db, job_in.symbol)

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


@router.get("/{symbol}/peers", response_model=list[StockRead])
def get_stock_peers(
    symbol: str,
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Get peer stocks in the same industry."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    if not stock.industry:
        return []

    peers = (
        db.query(Stock)
        .filter(
            Stock.industry == stock.industry,
            Stock.is_active == True,
            Stock.symbol != symbol,
        )
        .order_by(Stock.symbol)
        .limit(limit)
        .all()
    )
    return peers


@router.get("/{symbol}/fundamentals", response_model=StockFundamentalRead)
def get_stock_fundamentals_endpoint(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get stock fundamentals (P/E, dividend yield, market cap, etc.) from yfinance."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    fundamental = get_stock_fundamentals(db, stock)
    if not fundamental:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch fundamentals data",
        )

    return fundamental


@router.get("/{symbol}/profile", response_model=StockProfileRead)
def get_stock_profile(
    symbol: str,
    db: Session = Depends(get_db),
):
    """Get stock profile with fundamentals merged."""
    stock = get_stock_or_404(db, symbol, active_only=True)

    fundamental = get_stock_fundamentals(db, stock)

    return StockProfileRead(
        symbol=stock.symbol,
        name=stock.name,
        market=stock.market,
        industry=stock.industry,
        sector=fundamental.sector if fundamental else None,
        website=fundamental.website if fundamental else None,
        long_business_summary=fundamental.long_business_summary if fundamental else None,
        pe_ratio=fundamental.pe_ratio if fundamental else None,
        dividend_yield=fundamental.dividend_yield if fundamental else None,
        market_cap=fundamental.market_cap if fundamental else None,
    )


@router.get(
    "/{symbol}/ai-analysis",
    response_model=AIAnalysisResponse | AIAnalysisJobRead,
    responses={
        202: {"model": AIAnalysisJobRead, "description": "AI analysis job accepted or running"},
        503: {"description": "AI provider unavailable"},
    },
)
@conditional_limit("5/minute", key_func=get_authenticated_subject_or_address)
def get_stock_ai_analysis(
    request: Request,
    response: Response,
    symbol: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get AI-generated analysis and summary for a stock using DeepSeek.
    """
    stock = get_stock_or_404(db, symbol, active_only=True)

    cached_analysis = ai_analysis_cache.get(stock.symbol)
    if cached_analysis:
        return cached_analysis

    if not settings.DEEPSEEK_API_KEY:
        logger.warning(
            "AI analysis provider failure",
            extra={
                "event": "ai_analysis.provider_failure",
                "symbol": stock.symbol,
                "provider": "deepseek",
                "failure_category": "missing_api_key",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_ANALYSIS_BUSY_DETAIL,
        )

    recent_analysis = ai_analysis_job_service.get_recent_success(db, stock)
    if recent_analysis:
        return recent_analysis

    active_job = ai_analysis_job_service.get_active_job(db, stock)
    if active_job:
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["Location"] = request.url.path
        return _read_ai_analysis_job(active_job)

    if ai_analysis_job_service.has_recent_failure(db, stock):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_ANALYSIS_BUSY_DETAIL,
        )

    try:
        fundamental = get_stock_fundamentals(db, stock)
    except Exception as exc:
        logger.warning(
            "AI analysis context degraded",
            extra={
                "event": "ai_analysis.context_degraded",
                "symbol": stock.symbol,
                "failure_category": "fundamentals_exception",
                "exception_type": exc.__class__.__name__,
            },
        )
        fundamental = None
    else:
        if fundamental is None:
            logger.warning(
                "AI analysis context degraded",
                extra={
                    "event": "ai_analysis.context_degraded",
                    "symbol": stock.symbol,
                    "failure_category": "fundamentals_unavailable",
                },
            )

    try:
        rec = get_stock_recommendation(db, stock)
        system_action = rec.recommendation
    except Exception:
        system_action = None

    context_data = {
        "industry": stock.industry,
        "pe_ratio": fundamental.pe_ratio if fundamental else None,
        "dividend_yield": fundamental.dividend_yield if fundamental else None,
        "market_cap": fundamental.market_cap if fundamental else None,
        "system_quantitative_action": system_action,
    }

    try:
        job = ai_analysis_job_service.enqueue(
            db,
            stock=stock,
            user_id=current_user.id,
            context_data=context_data,
        )
    except AIAnalysisProviderUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_ANALYSIS_BUSY_DETAIL,
        )

    response.status_code = status.HTTP_202_ACCEPTED
    response.headers["Location"] = request.url.path
    return _read_ai_analysis_job(job)
