import csv
import io
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

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

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cents_to_decimal(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    absolute = abs(cents)
    return f"{sign}{absolute // 100}.{absolute % 100:02d}"


def upsert_user(conn: sqlite3.Connection, user_id: str, display_name: str) -> None:
    existing = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if existing:
        conn.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))
        return
    conn.execute(
        "INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)",
        (user_id, display_name, utc_now()),
    )


def get_user(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT id, display_name FROM users WHERE id = ?", (user_id,)).fetchone()


def require_user(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row:
    user = get_user(conn, user_id)
    if user is None:
        raise HTTPException(status_code=403, detail="Set your name before using groups")
    return user


def _invite_code(conn: sqlite3.Connection) -> str:
    for _ in range(8):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        taken = conn.execute("SELECT 1 FROM groups WHERE invite_code = ?", (code,)).fetchone()
        if taken is None:
            return code
    raise HTTPException(status_code=500, detail="Could not create a group code")


def create_group(conn: sqlite3.Connection, user_id: str, name: str, kind: str, currency: str) -> str:
    group_id = str(uuid.uuid4())
    now = utc_now()
    conn.execute(
        """
        INSERT INTO groups (id, name, kind, currency, invite_code, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (group_id, name, kind, currency, _invite_code(conn), user_id, now),
    )
    conn.execute(
        "INSERT INTO memberships (group_id, user_id, joined_at) VALUES (?, ?, ?)",
        (group_id, user_id, now),
    )
    return group_id


def join_group(conn: sqlite3.Connection, user_id: str, code: str) -> str:
    group = conn.execute("SELECT id FROM groups WHERE invite_code = ?", (code,)).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="No group uses that code")
    group_id = str(group["id"])
    existing = conn.execute(
        "SELECT 1 FROM memberships WHERE group_id = ? AND user_id = ?",
        (group_id, user_id),
    ).fetchone()
    if existing is None:
        conn.execute(
            "INSERT INTO memberships (group_id, user_id, joined_at) VALUES (?, ?, ?)",
            (group_id, user_id, utc_now()),
        )
    return group_id


def list_groups(conn: sqlite3.Connection, user_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT g.id, g.name, g.kind, g.currency, g.invite_code, g.created_at,
               (SELECT COUNT(*) FROM memberships m WHERE m.group_id = g.id) AS member_count
        FROM groups g
        JOIN memberships mine ON mine.group_id = g.id AND mine.user_id = ?
        ORDER BY g.created_at DESC
        """,
        (user_id,),
    ).fetchall()
    summaries = []
    for row in rows:
        nets = _nets_for_group(conn, str(row["id"]))
        summaries.append(
            {
                "id": row["id"],
                "name": row["name"],
                "kind": row["kind"],
                "currency": row["currency"],
                "invite_code": row["invite_code"],
                "member_count": row["member_count"],
                "my_balance_cents": nets.get(user_id, 0),
            }
        )
    return summaries


def group_detail(conn: sqlite3.Connection, group_id: str, user_id: str) -> dict:
    group = _require_member(conn, group_id, user_id)
    members = _members(conn, group_id)
    nets = _nets_for_group(conn, group_id, [member["id"] for member in members])
    names = {member["id"]: member["display_name"] for member in members}
    for member in members:
        member["balance_cents"] = nets.get(member["id"], 0)
    transfers = [
        {
            "from_user_id": debtor,
            "from_name": names.get(debtor, "Someone"),
            "to_user_id": creditor,
            "to_name": names.get(creditor, "Someone"),
            "amount_cents": amount,
        }
        for debtor, creditor, amount in simplify(nets)
    ]
    return {
        "id": group["id"],
        "name": group["name"],
        "kind": group["kind"],
        "currency": group["currency"],
        "invite_code": group["invite_code"],
        "members": members,
        "transfers": transfers,
        "activity": _activity(conn, group_id, names),
    }


def add_expense(conn: sqlite3.Connection, group_id: str, user_id: str, payload) -> dict:
    _require_member(conn, group_id, user_id)
    member_ids = _member_ids(conn, group_id)
    if payload.payer_id not in member_ids:
        raise HTTPException(status_code=400, detail="The person who paid is not in this group")
    participant_ids = [participant.user_id for participant in payload.participants]
    if any(participant_id not in member_ids for participant_id in participant_ids):
        raise HTTPException(status_code=400, detail="Every person on the split must be in the group")

    try:
        shares = _resolve_shares(payload)
    except SplitError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    expense_id = str(uuid.uuid4())
    created_at = utc_now()
    conn.execute(
        """
        INSERT INTO expenses (id, group_id, payer_id, description, amount_cents, split_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            expense_id,
            group_id,
            payload.payer_id,
            payload.description,
            payload.amount_cents,
            payload.split_type,
            created_at,
        ),
    )
    conn.executemany(
        """
        INSERT INTO expense_shares (expense_id, user_id, amount_cents, shares)
        VALUES (?, ?, ?, ?)
        """,
        [(expense_id, share.user_id, share.amount_cents, share.shares) for share in shares],
    )
    return group_detail(conn, group_id, user_id)


def add_settlement(conn: sqlite3.Connection, group_id: str, user_id: str, payload) -> dict:
    _require_member(conn, group_id, user_id)
    if payload.from_user_id == payload.to_user_id:
        raise HTTPException(status_code=400, detail="A settlement needs two different people")
    member_ids = _member_ids(conn, group_id)
    if payload.from_user_id not in member_ids or payload.to_user_id not in member_ids:
        raise HTTPException(status_code=400, detail="Both people must be in the group")
    conn.execute(
        """
        INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount_cents, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            group_id,
            payload.from_user_id,
            payload.to_user_id,
            payload.amount_cents,
            utc_now(),
        ),
    )
    return group_detail(conn, group_id, user_id)


def export_csv(conn: sqlite3.Connection, group_id: str, user_id: str) -> tuple[str, str]:
    detail = group_detail(conn, group_id, user_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["date", "type", "description", "paid_by", "amount", "currency", "split_type", "detail"])
    for item in sorted(detail["activity"], key=lambda activity: activity["created_at"]):
        if item["type"] == "expense":
            detail_text = "; ".join(
                _share_detail(share) for share in sorted(item["shares"], key=lambda share: share["display_name"])
            )
            writer.writerow(
                [
                    item["created_at"],
                    "expense",
                    item["description"],
                    item["payer_name"],
                    cents_to_decimal(item["amount_cents"]),
                    detail["currency"],
                    item["split_type"],
                    detail_text,
                ]
            )
        else:
            writer.writerow(
                [
                    item["created_at"],
                    "settlement",
                    "Settlement",
                    item["from_name"],
                    cents_to_decimal(item["amount_cents"]),
                    detail["currency"],
                    "",
                    f"to {item['to_name']}",
                ]
            )
    slug = re.sub(r"[^A-Za-z0-9]+", "-", detail["name"]).strip("-").lower() or "group"
    return buffer.getvalue(), f"{slug}-history.csv"


def _share_detail(share: dict) -> str:
    amount = cents_to_decimal(share["amount_cents"])
    if share["shares"] is None:
        return f"{share['display_name']} {amount}"
    label = "share" if share["shares"] == 1 else "shares"
    return f"{share['display_name']} {share['shares']} {label} = {amount}"


def _resolve_shares(payload) -> list[ShareResult]:
    if payload.split_type == "equal":
        return split_equal(payload.amount_cents, [participant.user_id for participant in payload.participants])
    if payload.split_type == "exact":
        parts: list[tuple[str, int]] = []
        for participant in payload.participants:
            if participant.amount_cents is None:
                raise SplitError("Each person needs an exact amount")
            parts.append((participant.user_id, participant.amount_cents))
        return split_exact(payload.amount_cents, parts)
    parts = []
    for participant in payload.participants:
        if participant.shares is None:
            raise SplitError("Each person needs a share count")
        parts.append((participant.user_id, participant.shares))
    return split_shares(payload.amount_cents, parts)


def _require_member(conn: sqlite3.Connection, group_id: str, user_id: str) -> sqlite3.Row:
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    member = conn.execute(
        "SELECT 1 FROM memberships WHERE group_id = ? AND user_id = ?",
        (group_id, user_id),
    ).fetchone()
    if member is None:
        raise HTTPException(status_code=403, detail="You are not in this group")
    return group


def _member_ids(conn: sqlite3.Connection, group_id: str) -> set[str]:
    rows = conn.execute("SELECT user_id FROM memberships WHERE group_id = ?", (group_id,)).fetchall()
    return {str(row["user_id"]) for row in rows}


def _members(conn: sqlite3.Connection, group_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT u.id, u.display_name
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.group_id = ?
        ORDER BY u.display_name COLLATE NOCASE, u.id
        """,
        (group_id,),
    ).fetchall()
    return [{"id": row["id"], "display_name": row["display_name"], "balance_cents": 0} for row in rows]


def _nets_for_group(
    conn: sqlite3.Connection, group_id: str, member_ids: list[str] | None = None
) -> dict[str, int]:
    if member_ids is None:
        member_ids = list(_member_ids(conn, group_id))
    expenses = []
    for expense in conn.execute(
        "SELECT id, payer_id, amount_cents FROM expenses WHERE group_id = ?",
        (group_id,),
    ):
        share_rows = conn.execute(
            "SELECT user_id, amount_cents, shares FROM expense_shares WHERE expense_id = ?",
            (expense["id"],),
        ).fetchall()
        expenses.append(
            ExpenseEntry(
                payer_id=str(expense["payer_id"]),
                amount_cents=int(expense["amount_cents"]),
                shares=tuple(
                    ShareResult(str(share["user_id"]), int(share["amount_cents"]), share["shares"])
                    for share in share_rows
                ),
            )
        )
    settlements = [
        SettlementEntry(str(row["from_user_id"]), str(row["to_user_id"]), int(row["amount_cents"]))
        for row in conn.execute(
            "SELECT from_user_id, to_user_id, amount_cents FROM settlements WHERE group_id = ?",
            (group_id,),
        )
    ]
    return compute_nets(expenses, settlements, member_ids)


def _activity(conn: sqlite3.Connection, group_id: str, names: dict[str, str]) -> list[dict]:
    items: list[dict] = []
    expenses = conn.execute(
        """
        SELECT id, payer_id, description, amount_cents, split_type, created_at
        FROM expenses
        WHERE group_id = ?
        """,
        (group_id,),
    ).fetchall()
    for expense in expenses:
        shares = conn.execute(
            "SELECT user_id, amount_cents, shares FROM expense_shares WHERE expense_id = ?",
            (expense["id"],),
        ).fetchall()
        items.append(
            {
                "type": "expense",
                "id": expense["id"],
                "description": expense["description"],
                "amount_cents": expense["amount_cents"],
                "payer_id": expense["payer_id"],
                "payer_name": names.get(expense["payer_id"], "Someone"),
                "split_type": expense["split_type"],
                "created_at": expense["created_at"],
                "shares": [
                    {
                        "user_id": share["user_id"],
                        "display_name": names.get(share["user_id"], "Someone"),
                        "amount_cents": share["amount_cents"],
                        "shares": share["shares"],
                    }
                    for share in sorted(shares, key=lambda share: names.get(share["user_id"], ""))
                ],
            }
        )
    settlements = conn.execute(
        """
        SELECT id, from_user_id, to_user_id, amount_cents, created_at
        FROM settlements
        WHERE group_id = ?
        """,
        (group_id,),
    ).fetchall()
    for settlement in settlements:
        items.append(
            {
                "type": "settlement",
                "id": settlement["id"],
                "from_user_id": settlement["from_user_id"],
                "from_name": names.get(settlement["from_user_id"], "Someone"),
                "to_user_id": settlement["to_user_id"],
                "to_name": names.get(settlement["to_user_id"], "Someone"),
                "amount_cents": settlement["amount_cents"],
                "created_at": settlement["created_at"],
            }
        )
    items.sort(key=lambda item: item["created_at"], reverse=True)
    return items
