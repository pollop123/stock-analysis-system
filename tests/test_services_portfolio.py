"""Unit tests for the Portfolio positions module.

These exercise the cost-basis maths directly through the module's interface —
no HTTP, no database. Transactions are plain namespaces, proving the module no
longer depends on the ORM or the request cycle.
"""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.portfolio import (
    PendingTransaction,
    PositionState,
    apply_transaction,
    calculate_position,
    calculate_positions,
    can_apply_pending,
    position_pnl,
)


def _tx(transaction_type, shares, price, *, day=1, id=1, stock_id=1, stock=None):
    return SimpleNamespace(
        transaction_type=transaction_type,
        shares=Decimal(str(shares)),
        price=Decimal(str(price)),
        transaction_date=datetime(2024, 1, day, tzinfo=timezone.utc),
        id=id,
        stock_id=stock_id,
        stock=stock or SimpleNamespace(symbol="2330", name="TSMC"),
    )


class TestApplyTransaction:
    def test_buy_accumulates_cost(self):
        pos = PositionState(stock=None)
        apply_transaction(pos, "buy", Decimal("10"), Decimal("100"))
        assert pos.total_shares == Decimal("10")
        assert pos.total_cost == Decimal("1000")

    def test_partial_sell_keeps_average_cost(self):
        pos = PositionState(stock=None)
        apply_transaction(pos, "buy", Decimal("10"), Decimal("100"))
        apply_transaction(pos, "buy", Decimal("10"), Decimal("200"))  # avg 150
        apply_transaction(pos, "sell", Decimal("5"), Decimal("999"))  # price irrelevant
        assert pos.total_shares == Decimal("15")
        # cost reduced by 5 * avg(150) = 750 -> 3000 - 750
        assert pos.total_cost == Decimal("2250")

    def test_full_sell_zeroes_cost(self):
        pos = PositionState(stock=None)
        apply_transaction(pos, "buy", Decimal("10"), Decimal("100"))
        apply_transaction(pos, "sell", Decimal("10"), Decimal("100"))
        assert pos.total_shares == Decimal("0")
        assert pos.total_cost == Decimal("0")

    def test_unguarded_oversell_clamps_to_flat(self):
        pos = PositionState(stock=None)
        apply_transaction(pos, "buy", Decimal("5"), Decimal("100"))
        assert apply_transaction(pos, "sell", Decimal("10"), Decimal("100")) is True
        assert pos.total_shares == Decimal("0")
        assert pos.total_cost == Decimal("0")

    def test_guarded_oversell_rejected(self):
        pos = PositionState(stock=None)
        apply_transaction(pos, "buy", Decimal("5"), Decimal("100"))
        assert apply_transaction(pos, "sell", Decimal("10"), Decimal("100"), reject_oversell=True) is False


class TestCalculatePositions:
    def test_groups_by_stock(self):
        a = SimpleNamespace(symbol="2330", name="TSMC")
        b = SimpleNamespace(symbol="2317", name="Hon Hai")
        txs = [
            _tx("buy", 10, 100, stock_id=1, stock=a),
            _tx("buy", 5, 50, stock_id=2, stock=b),
            _tx("buy", 10, 200, stock_id=1, stock=a),
        ]
        positions = calculate_positions(txs)
        assert positions[1].total_shares == Decimal("20")
        assert positions[1].total_cost == Decimal("3000")
        assert positions[2].total_shares == Decimal("5")

    def test_calculate_position_folds_in_order(self):
        txs = [_tx("buy", 10, 100), _tx("sell", 4, 120, day=2, id=2)]
        pos = calculate_position(SimpleNamespace(symbol="2330"), txs)
        assert pos.total_shares == Decimal("6")


class TestCanApplyPending:
    def test_sell_within_holdings_allowed(self):
        existing = [_tx("buy", 10, 100, id=1)]
        pending = PendingTransaction("sell", Decimal("5"), Decimal("120"), datetime(2024, 1, 2, tzinfo=timezone.utc), id=2)
        assert can_apply_pending(existing, SimpleNamespace(symbol="2330"), pending) is True

    def test_sell_exceeding_holdings_rejected(self):
        existing = [_tx("buy", 3, 100, id=1)]
        pending = PendingTransaction("sell", Decimal("5"), Decimal("120"), datetime(2024, 1, 2, tzinfo=timezone.utc), id=2)
        assert can_apply_pending(existing, SimpleNamespace(symbol="2330"), pending) is False

    def test_orders_by_date_then_id(self):
        # A later-dated buy must not retroactively fund an earlier sell.
        existing = [_tx("buy", 10, 100, day=5, id=1)]
        pending = PendingTransaction("sell", Decimal("5"), Decimal("120"), datetime(2024, 1, 1, tzinfo=timezone.utc), id=2)
        assert can_apply_pending(existing, SimpleNamespace(symbol="2330"), pending) is False


class TestPositionPnL:
    def test_computes_pnl(self):
        pos = PositionState(stock=None, total_shares=Decimal("10"), total_cost=Decimal("1000"))
        pnl = position_pnl(pos, Decimal("150"))
        assert pnl.avg_price == Decimal("100")
        assert pnl.market_value == Decimal("1500")
        assert pnl.unrealized_pnl == Decimal("500")
        assert pnl.unrealized_pnl_percent == Decimal("50")

    def test_none_price_yields_none_market_value(self):
        pos = PositionState(stock=None, total_shares=Decimal("10"), total_cost=Decimal("1000"))
        pnl = position_pnl(pos, None)
        assert pnl.avg_price == Decimal("100")
        assert pnl.market_value is None
        assert pnl.unrealized_pnl is None
        assert pnl.unrealized_pnl_percent is None
