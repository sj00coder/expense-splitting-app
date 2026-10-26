import pytest

from backend.app.splits import (
    ExpenseEntry,
    SettlementEntry,
    ShareResult,
    SplitError,
    compute_nets,
    simplify,
    split_equal,
    split_exact,
    split_shares,
)


def test_equal_remainder_goes_to_lowest_user_ids():
    result = split_equal(100, ["c", "a", "b"])
    amounts = {share.user_id: share.amount_cents for share in result}
    assert amounts == {"a": 34, "b": 33, "c": 33}
    assert sum(amounts.values()) == 100


def test_equal_single_cent_among_three():
    result = split_equal(1, ["b", "a", "c"])
    amounts = {share.user_id: share.amount_cents for share in result}
    assert amounts == {"a": 1, "b": 0, "c": 0}


def test_shares_largest_remainder():
    result = split_shares(100, [("a", 1), ("b", 2)])
    amounts = {share.user_id: share.amount_cents for share in result}
    assert amounts == {"a": 33, "b": 67}
    assert result[1].shares == 2


def test_shares_tie_breaks_by_user_id():
    result = split_shares(100, [("c", 1), ("a", 1), ("b", 1)])
    amounts = {share.user_id: share.amount_cents for share in result}
    assert amounts == {"a": 34, "b": 33, "c": 33}


def test_exact_rejects_mismatch():
    with pytest.raises(SplitError, match="sum to the total"):
        split_exact(100, [("a", 40), ("b", 50)])


def test_exact_accepts_a_matching_sum():
    result = split_exact(100, [("a", 40), ("b", 60)])
    assert [share.amount_cents for share in result] == [40, 60]


def test_payer_who_is_also_splitting_keeps_the_difference():
    shares = tuple(split_equal(90, ["a", "b", "c"]))
    nets = compute_nets([ExpenseEntry("a", 90, shares)], [], ["a", "b", "c"])
    assert nets == {"a": 60, "b": -30, "c": -30}
    assert simplify(nets) == [("b", "a", 30), ("c", "a", 30)]


def test_settlement_reduces_what_is_owed():
    expense = ExpenseEntry(
        "a",
        100,
        (ShareResult("b", 50, None), ShareResult("c", 50, None)),
    )
    nets = compute_nets([expense], [SettlementEntry("b", "a", 50)], ["a", "b", "c"])
    assert nets == {"a": 50, "b": 0, "c": -50}
    assert sum(nets.values()) == 0
    assert simplify(nets) == [("c", "a", 50)]


def test_simplify_pays_the_largest_creditor_first():
    transfers = simplify({"a": 30, "b": 20, "c": -50})
    assert transfers == [("c", "a", 30), ("c", "b", 20)]
    assert sum(amount for _, _, amount in transfers) == 50
