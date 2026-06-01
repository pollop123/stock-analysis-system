import re
from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# ─── User Base ───────────────────────────────────────────

def _check_password_complexity(v: str) -> str:
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]~/`\\'\\;]", v):
        raise ValueError("Password must contain at least one special character")
    return v


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class UserRead(UserBase):
    id: int
    is_active: bool
    role: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None


class UserAdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[Literal["user", "admin"]] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


# ─── Token ───────────────────────────────────────────────

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: Optional[int] = None
    jti: Optional[str] = None
    type: Optional[str] = None
    exp: Optional[datetime] = None


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Auth ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordResetRequestCreate(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


# ─── Stock ───────────────────────────────────────────────

class StockBase(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    name: str = Field(..., min_length=1, max_length=100)
    market: str = Field(..., pattern=r"^(TWSE|TPEx)$")
    industry: Optional[str] = Field(None, max_length=50)
    is_etf: Optional[bool] = None


class StockCreate(StockBase):
    pass


class StockRead(StockBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Stock Price ─────────────────────────────────────────

class StockPriceRead(BaseModel):
    date: date
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    volume: int
    change: Optional[Decimal] = None
    change_percent: Optional[Decimal] = None

    model_config = {"from_attributes": True}


class StockSyncStatusRead(BaseModel):
    symbol: str
    status: str
    synced_from: Optional[date] = None
    synced_to: Optional[date] = None
    data_source: Optional[str] = None
    last_attempt_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None
    records_upserted: int


class StockSyncJobCreate(BaseModel):
    symbol: str
    start: Optional[date] = None
    end: Optional[date] = None


class StockSyncJobRead(BaseModel):
    id: int
    symbol: str
    status: str
    start: Optional[date] = None
    end: Optional[date] = None
    message: Optional[str] = None
    error: Optional[str] = None
    records_upserted: int
    records_skipped: int
    months_requested: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class RecommendationIndicators(BaseModel):
    close: Decimal
    ma5: Optional[Decimal] = None
    ma20: Optional[Decimal] = None
    ma60: Optional[Decimal] = None
    rsi14: Optional[Decimal] = None
    volume_ratio: Optional[Decimal] = None
    avg_volume_20d: Optional[Decimal] = None
    macd_dif: Optional[Decimal] = None
    macd_signal: Optional[Decimal] = None
    macd_histogram: Optional[Decimal] = None
    bollinger_upper: Optional[Decimal] = None
    bollinger_middle: Optional[Decimal] = None
    bollinger_lower: Optional[Decimal] = None
    kd_k: Optional[Decimal] = None
    kd_d: Optional[Decimal] = None
    atr14: Optional[Decimal] = None
    volatility_20d: Optional[Decimal] = None


class IndicatorSignal(BaseModel):
    ma: Literal["buy", "hold", "sell"] = "hold"
    rsi: Literal["buy", "hold", "sell"] = "hold"
    macd: Literal["buy", "hold", "sell"] = "hold"
    volume: Literal["buy", "hold", "sell"] = "hold"
    bollinger: Literal["buy", "hold", "sell"] = "hold"
    kd: Literal["buy", "hold", "sell"] = "hold"


class RiskMetrics(BaseModel):
    risk_level: Literal["low", "medium", "high"] = "medium"
    volatility_risk: int = 50
    liquidity_risk: int = 50
    fx_risk: int = 10
    systemic_risk: int = 50


class SupportResistanceLevels(BaseModel):
    r2: Optional[Decimal] = None
    r1: Optional[Decimal] = None
    s1: Optional[Decimal] = None
    s2: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    potential_return: Optional[Decimal] = None


class StockRecommendationRead(BaseModel):
    symbol: str
    recommendation: Literal["buy", "hold", "sell"]
    confidence: int = Field(..., ge=0, le=100)
    as_of: Optional[date] = None
    indicators: RecommendationIndicators
    reasons: List[str]
    disclaimer: str
    indicator_signals: IndicatorSignal = IndicatorSignal()
    composite_score: int = Field(3, ge=1, le=5)
    risk_metrics: RiskMetrics = RiskMetrics()
    support_resistance: SupportResistanceLevels = SupportResistanceLevels()


class StockQuoteRead(BaseModel):
    symbol: str
    name: str
    price: Decimal
    open: Decimal
    high: Decimal
    low: Decimal
    close: Optional[Decimal] = None
    volume: int
    change: Optional[Decimal] = None
    change_percent: Optional[Decimal] = None
    last_updated: datetime

    model_config = {"from_attributes": True}


# ─── Target Price ────────────────────────────────────────

class StockTargetPriceCreate(BaseModel):
    analyst: str = Field(..., min_length=1, max_length=100)
    target_price: Decimal = Field(..., gt=0)
    rating: str = Field(..., pattern=r"^(buy|hold|sell|strong_buy|strong_sell)$")
    report_date: date


class StockTargetPriceRead(BaseModel):
    id: int
    analyst: str
    target_price: Decimal
    rating: str
    report_date: date
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Price Alert ─────────────────────────────────────────

class PriceAlertCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    condition: Literal["above", "below"] = "above"
    target_price: Decimal = Field(..., gt=0)


class PriceAlertRead(BaseModel):
    id: int
    symbol: str
    condition: str
    target_price: Decimal
    is_active: bool
    triggered_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PriceAlertUpdate(BaseModel):
    is_active: Optional[bool] = None
    target_price: Optional[Decimal] = Field(None, gt=0)
    condition: Optional[Literal["above", "below"]] = None


# ─── Watchlist ───────────────────────────────────────────

class WatchlistBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class WatchlistCreate(WatchlistBase):
    pass


class WatchlistUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class WatchlistItemRead(BaseModel):
    id: int
    stock: StockRead
    created_at: datetime

    model_config = {"from_attributes": True}


class WatchlistRead(WatchlistBase):
    id: int
    user_id: int
    items: List[StockRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WatchlistAllocationBucket(BaseModel):
    key: str
    label: str
    count: int
    percentage: float


class WatchlistSignalDistribution(BaseModel):
    buy: int = 0
    hold: int = 0
    sell: int = 0
    unavailable: int = 0


class WatchlistConcentrationRead(BaseModel):
    top_industry: Optional[WatchlistAllocationBucket] = None
    top_market: Optional[WatchlistAllocationBucket] = None
    max_bucket_percentage: float = 0
    diversification_score: int
    risk_level: Literal["low", "medium", "high"]


class WatchlistAnalysisSummary(BaseModel):
    short_sentence: str
    long_sentence: str


class WatchlistAnalysisRead(BaseModel):
    id: int
    name: str
    total_stocks: int
    equal_weight_assumption: bool = True
    summary: WatchlistAnalysisSummary
    asset_mix: List[WatchlistAllocationBucket] = []
    industry_allocation: List[WatchlistAllocationBucket] = []
    market_allocation: List[WatchlistAllocationBucket] = []
    signal_distribution: WatchlistSignalDistribution
    concentration: WatchlistConcentrationRead
    risks: List[str] = []
    opportunities: List[str] = []
    recommended_actions: List[str] = []


class StockFundamentalRead(BaseModel):
    market_cap: Optional[Decimal] = None
    pe_ratio: Optional[Decimal] = None
    dividend_yield: Optional[Decimal] = None
    eps: Optional[Decimal] = None
    book_value: Optional[Decimal] = None
    shares_outstanding: Optional[Decimal] = None
    fifty_two_week_high: Optional[Decimal] = None
    fifty_two_week_low: Optional[Decimal] = None
    revenue_growth: Optional[Decimal] = None
    profit_margins: Optional[Decimal] = None
    debt_to_equity: Optional[Decimal] = None
    return_on_equity: Optional[Decimal] = None
    free_cashflow: Optional[Decimal] = None
    beta: Optional[Decimal] = None
    forward_pe: Optional[Decimal] = None
    sector: Optional[str] = None
    website: Optional[str] = None
    long_business_summary: Optional[str] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class StockProfileRead(BaseModel):
    symbol: str
    name: str
    market: str
    industry: Optional[str] = None
    sector: Optional[str] = None
    website: Optional[str] = None
    long_business_summary: Optional[str] = None
    pe_ratio: Optional[Decimal] = None
    dividend_yield: Optional[Decimal] = None
    market_cap: Optional[Decimal] = None


class StockSummaryRead(BaseModel):
    symbol: str
    name: str
    market: str
    industry: Optional[str] = None
    is_etf: Optional[bool] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    change_percent: Optional[Decimal] = None
    recommendation: Optional[Literal["buy", "hold", "sell"]] = None
    confidence: Optional[int] = None
    composite_score: Optional[int] = None
    sparkline_data: List[Decimal] = []


class PortfolioTransactionCreate(BaseModel):
    symbol: str
    transaction_type: Literal["buy", "sell"]
    shares: Decimal = Field(..., gt=0)
    price: Decimal = Field(..., gt=0)
    transaction_date: Optional[datetime] = None


class PortfolioTransactionRead(BaseModel):
    id: int
    symbol: str
    transaction_type: str
    shares: Decimal
    price: Decimal
    transaction_date: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class PortfolioPositionRead(BaseModel):
    symbol: str
    name: str
    shares: Decimal
    avg_price: Decimal
    current_price: Optional[Decimal] = None
    market_value: Optional[Decimal] = None
    unrealized_pnl: Optional[Decimal] = None
    unrealized_pnl_percent: Optional[Decimal] = None


class WatchlistWithQuotesRead(BaseModel):
    id: int
    name: str
    quotes: List[StockQuoteRead] = []

    model_config = {"from_attributes": True}


# ─── Content Visibility ──────────────────────────────────

class ContentVisibilityRead(BaseModel):
    id: int
    content_key: str
    is_visible: bool
    scope: str
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContentVisibilityUpdate(BaseModel):
    is_visible: bool


class ContentVisibilityEffectiveRead(BaseModel):
    content_key: str
    is_visible: bool

class AIAnalysisSummary(BaseModel):
    short_sentence: str = Field(..., description="短句總結")
    long_sentence: str = Field(..., description="長句詳細說明")

class AIAnalysisReasons(BaseModel):
    technical: str = Field(..., description="技術面理由")
    fundamental: str = Field(..., description="基本面理由")
    comprehensive: str = Field(..., description="綜合理由")

class AIAnalysisResponse(BaseModel):
    request_id: str
    action: Literal[-1, 0, 1] = Field(..., description="1代表買入, 0代表觀望, -1代表賣出")
    summary: AIAnalysisSummary
    reasons: AIAnalysisReasons


class AIAnalysisJobRead(BaseModel):
    id: int
    symbol: str
    status: str
    result: Optional[AIAnalysisResponse] = None
    error: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
