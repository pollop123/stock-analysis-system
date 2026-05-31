"""Portfolio positions module.

The cost-basis state machine and P&L maths, lifted out of the router so they sit
behind a small interface and can be tested directly — no HTTP, no database. The
functions operate on duck-typed transactions (anything with ``transaction_type``,
``shares``, ``price``, ``transaction_date``, ``id`` and ``stock_id``/``stock``),
so tests pass plain namespaces and never touch the ORM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable, Optional


@dataclass
class PositionState:
    """Running holding for one stock: shares held and their total cost basis."""

    stock: object
    total_shares: Decimal = field(default_factory=lambda: Decimal("0"))
    total_cost: Decimal = field(default_factory=lambda: Decimal("0"))


@dataclass
class PendingTransaction:
    """A not-yet-persisted transaction used to validate sells before committing."""

    transaction_type: str
    shares: Decimal
    price: Decimal
    transaction_date: datetime
    id: int


@dataclass
class PositionPnL:
    """Derived profit-and-loss for a held position at a given market price."""

    avg_price: Decimal
    market_value: Optional[Decimal]
    unrealized_pnl: Optional[Decimal]
    unrealized_pnl_percent: Optional[Decimal]


def apply_transaction(
    position: PositionState,
    transaction_type: str,
    shares: Decimal,
    price: Decimal,
    *,
    reject_oversell: bool = False,
) -> bool:
    """Fold one transaction into ``position`` using weighted-average cost.

    Returns False only when ``reject_oversell`` is set and the sell exceeds the
    held shares; otherwise always returns True (clamping an unguarded oversell
    down to a flat position).
    """
    if transaction_type == "buy":
        position.total_shares += shares
        position.total_cost += shares * price
        return True

    if shares > position.total_shares:
        if reject_oversell:
            return False
        position.total_shares = Decimal("0")
        position.total_cost = Decimal("0")
        return True

    avg_cost = position.total_cost / position.total_shares
    position.total_shares -= shares
    position.total_cost -= shares * avg_cost

    if position.total_shares == 0:
        position.total_cost = Decimal("0")

    return True


def _normalized_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _transaction_sort_key(tx) -> tuple[datetime, int]:
    return _normalized_datetime(tx.transaction_date), tx.id


def calculate_position(stock, transactions: Iterable) -> PositionState:
    """Replay ``transactions`` (already ordered) into a single position."""
    position = PositionState(stock=stock)
    for tx in transactions:
        apply_transaction(position, tx.transaction_type, tx.shares, tx.price)
    return position


def calculate_positions(transactions: Iterable) -> dict[int, PositionState]:
    """Replay a mixed stream of transactions into one position per stock."""
    positions: dict[int, PositionState] = {}
    for tx in transactions:
        if tx.stock_id not in positions:
            positions[tx.stock_id] = PositionState(stock=tx.stock)
        apply_transaction(positions[tx.stock_id], tx.transaction_type, tx.shares, tx.price)
    return positions


def can_apply_pending(
    existing_transactions: Iterable,
    stock,
    pending: PendingTransaction,
) -> bool:
    """Whether ``pending`` (a sell) is valid against the existing transactions."""
    position = PositionState(stock=stock)
    ordered_transactions = sorted(
        [*existing_transactions, pending],
        key=_transaction_sort_key,
    )
    for tx in ordered_transactions:
        if not apply_transaction(
            position,
            tx.transaction_type,
            tx.shares,
            tx.price,
            reject_oversell=True,
        ):
            return False
    return True


def position_pnl(position: PositionState, current_price: Optional[Decimal]) -> PositionPnL:
    """Derive average cost, market value and unrealized P&L for a held position.

    Assumes ``position.total_shares > 0`` (callers skip empty positions).
    """
    avg_price = position.total_cost / position.total_shares
    market_value = current_price * position.total_shares if current_price else None
    unrealized = market_value - position.total_cost if market_value else None
    unrealized_pct = (unrealized / position.total_cost * Decimal("100")) if unrealized else None
    return PositionPnL(
        avg_price=avg_price,
        market_value=market_value,
        unrealized_pnl=unrealized,
        unrealized_pnl_percent=unrealized_pct,
    )
