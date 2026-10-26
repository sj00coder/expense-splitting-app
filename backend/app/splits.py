"""Equal, exact, and share splits, plus who-owes-whom simplification.

Amounts are integer cents. These functions are the source of truth for the API.
"""

from dataclasses import dataclass


class SplitError(ValueError):
    pass


@dataclass(frozen=True)
class ShareResult:
    user_id: str
    amount_cents: int
    shares: int | None


@dataclass(frozen=True)
class ExpenseEntry:
    payer_id: str
    amount_cents: int
    shares: tuple[ShareResult, ...]


@dataclass(frozen=True)
class SettlementEntry:
    from_user_id: str
    to_user_id: str
    amount_cents: int


def split_equal(total_cents: int, user_ids: list[str]) -> list[ShareResult]:
    _require_total(total_cents)
    _require_unique(user_ids)
    ordered = sorted(user_ids)
    base, remainder = divmod(total_cents, len(ordered))
    return [
        ShareResult(
            user_id=user_id,
            amount_cents=base + (1 if index < remainder else 0),
            shares=None,
        )
        for index, user_id in enumerate(ordered)
    ]


def split_exact(total_cents: int, parts: list[tuple[str, int]]) -> list[ShareResult]:
    _require_total(total_cents)
    _require_unique([user_id for user_id, _ in parts])
    for _, amount in parts:
        if amount < 0:
            raise SplitError("Amounts cannot be negative")
    if sum(amount for _, amount in parts) != total_cents:
        raise SplitError("Exact amounts must sum to the total")
    return [
        ShareResult(user_id=user_id, amount_cents=amount, shares=None)
        for user_id, amount in parts
    ]


def split_shares(total_cents: int, parts: list[tuple[str, int]]) -> list[ShareResult]:
    _require_total(total_cents)
    _require_unique([user_id for user_id, _ in parts])
    for _, shares in parts:
        if shares <= 0:
            raise SplitError("Shares must be positive")

    total_shares = sum(shares for _, shares in parts)
    rows: list[dict[str, int | str]] = []
    for user_id, shares in parts:
        rows.append(
            {
                "user_id": user_id,
                "amount": (total_cents * shares) // total_shares,
                "shares": shares,
                "remainder": (total_cents * shares) % total_shares,
            }
        )

    leftover = total_cents - sum(int(row["amount"]) for row in rows)
    order = sorted(range(len(rows)), key=lambda index: (-int(rows[index]["remainder"]), str(rows[index]["user_id"])))
    for index in range(leftover):
        rows[order[index]]["amount"] = int(rows[order[index]]["amount"]) + 1

    return [
        ShareResult(user_id=str(row["user_id"]), amount_cents=int(row["amount"]), shares=int(row["shares"]))
        for row in rows
    ]


def compute_nets(
    expenses: list[ExpenseEntry],
    settlements: list[SettlementEntry],
    member_ids: list[str] | None = None,
) -> dict[str, int]:
    """Positive means the group owes this person."""
    balances: dict[str, int] = {user_id: 0 for user_id in member_ids or []}
    for expense in expenses:
        balances[expense.payer_id] = balances.get(expense.payer_id, 0) + expense.amount_cents
        for share in expense.shares:
            balances[share.user_id] = balances.get(share.user_id, 0) - share.amount_cents
    for settlement in settlements:
        balances[settlement.from_user_id] = balances.get(settlement.from_user_id, 0) + settlement.amount_cents
        balances[settlement.to_user_id] = balances.get(settlement.to_user_id, 0) - settlement.amount_cents
    return balances


def simplify(nets: dict[str, int]) -> list[tuple[str, str, int]]:
    """Greedy largest-debtor to largest-creditor transfers: (from, to, cents)."""
    debtors = [[user_id, -amount] for user_id, amount in nets.items() if amount < 0]
    creditors = [[user_id, amount] for user_id, amount in nets.items() if amount > 0]
    debtors.sort(key=lambda row: (-row[1], row[0]))
    creditors.sort(key=lambda row: (-row[1], row[0]))

    transfers: list[tuple[str, str, int]] = []
    debtor_index = 0
    creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor, debt = debtors[debtor_index]
        creditor, credit = creditors[creditor_index]
        pay = min(debt, credit)
        if pay > 0:
            transfers.append((str(debtor), str(creditor), int(pay)))
        debtors[debtor_index][1] = debt - pay
        creditors[creditor_index][1] = credit - pay
        if debtors[debtor_index][1] == 0:
            debtor_index += 1
        if creditors[creditor_index][1] == 0:
            creditor_index += 1
    return transfers


def _require_total(total_cents: int) -> None:
    if total_cents <= 0:
        raise SplitError("Amount must be positive")


def _require_unique(user_ids: list[str]) -> None:
    if not user_ids:
        raise SplitError("Choose at least one person")
    if len(set(user_ids)) != len(user_ids):
        raise SplitError("Each person can only be listed once")
