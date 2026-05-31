# Context

Domain language and architectural seams for the Stock Analysis System. Use these
terms in code and review; the architecture vocabulary follows the "deep module"
language (module · interface · implementation · seam · adapter · leverage · locality).

## Domain glossary

- **Stock** — a listed Taiwan security (TWSE or TPEx), keyed by `symbol`.
- **Quote** — a real-time (delayed) price snapshot. Normalized dict, keys match `StockQuoteRead`.
- **Historical Prices** — daily OHLCV rows (`StockPrice`).
- **Fundamentals** — company financials from Yahoo Finance (`StockFundamental`).
- **Recommendation** — rule-based technical signal (buy/hold/sell) plus indicators and a composite score.
- **AI Analysis** — DeepSeek-generated summary/action for a stock (`AIAnalysisResponse`), produced via async jobs.
- **Watchlist / Portfolio / Position / Transaction / Price Alert / Target Price** — user-owned tracking resources.

## Seams (where behaviour can be swapped without editing in place)

### Backend

- **Market Data intake** — `app/services/market_data.py`. Interface `MarketDataSource`
  (`list_securities`, `fetch_history`, `fetch_quote`) with `TwstockYFinanceSource`
  (prod, owns the twstock/yfinance coupling) and `InMemoryMarketData` (tests).
  `app/services/stock_data.py` orchestrates DB/sync through this seam via
  `get_market_data_source()` / `set_market_data_source()`.
- **AI Analysis provider** — `app/services/ai_provider.py`. Interface
  `AIAnalysisProvider.analyze` with `DeepSeekProvider` (owns the OpenAI/HTTP coupling)
  and `FakeAIProvider` (tests). `AIAnalysisJobService(provider=...)` depends on the interface.
- **Portfolio positions** — `app/services/portfolio.py`. Pure cost-basis state machine
  (`apply_transaction`, `calculate_position(s)`, `can_apply_pending`, `position_pnl`).
  The router is a thin adapter over it.
- **Owned-resource lookup** — `app/services/lookups.py`. `get_stock_or_404` (with
  `active_only`) and `get_owned_or_404` concentrate the not-found / ownership /
  active-filter semantics the routers used to copy-paste.

### Frontend

- **Signal interpretation** — `src/lib/signals.ts`. Pure rules: RSI bands, MA trend,
  MACD state, recommendation tone/variant, signal labels/counts, AI tone, ETF check,
  fundamental health, and the 0-100 health-bar scores. Components consume decisions,
  not thresholds.
- **Display formatting + coercion** — `src/lib/format.ts`. `toNumber` coerces backend
  numeric strings once; `formatPrice` / `formatPercent` / `formatNumber` / `formatDate`
  decide precision and locale in one place.
- **Stock detail view-model** — `src/hooks/useStockDetail.ts`. Composes the nine detail
  queries, the live SSE quote, AI-job polling, and the derived view-model behind one hook.

## Tests

- Backend: `pytest` (an in-memory adapter / fake provider replaces network internals).
- Frontend: `npm run test` (vitest) for the pure logic seams; `npm run lint`; `tsc -b`.
