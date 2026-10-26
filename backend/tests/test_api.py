from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import create_app

ALEX = "11111111-1111-4111-8111-111111111111"
SAM = "22222222-2222-4222-8222-222222222222"


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path / "test.db"))


def _name(client: TestClient, user_id: str, name: str) -> None:
    response = client.put("/me", headers={"X-User-Id": user_id}, json={"display_name": name})
    assert response.status_code == 200


def test_shared_group_split_settlement_and_export(tmp_path: Path):
    with _client(tmp_path) as client:
        _name(client, ALEX, "Alex")
        _name(client, SAM, "Sam")

        created = client.post(
            "/groups",
            headers={"X-User-Id": ALEX},
            json={"name": "Lisbon", "kind": "trip", "currency": "EUR"},
        )
        assert created.status_code == 201
        group = created.json()
        group_id = group["id"]

        joined = client.post("/groups/join", headers={"X-User-Id": SAM}, json={"code": group["invite_code"]})
        assert joined.status_code == 200
        assert joined.json()["id"] == group_id

        expense = client.post(
            f"/groups/{group_id}/expenses",
            headers={"X-User-Id": ALEX},
            json={
                "description": "Dinner",
                "amount_cents": 100,
                "payer_id": ALEX,
                "split_type": "equal",
                "participants": [{"user_id": ALEX}, {"user_id": SAM}],
            },
        )
        assert expense.status_code == 201
        detail = expense.json()
        balances = {member["display_name"]: member["balance_cents"] for member in detail["members"]}
        assert balances == {"Alex": 50, "Sam": -50}
        assert detail["transfers"] == [
            {
                "from_user_id": SAM,
                "from_name": "Sam",
                "to_user_id": ALEX,
                "to_name": "Alex",
                "amount_cents": 50,
            }
        ]

        settled = client.post(
            f"/groups/{group_id}/settlements",
            headers={"X-User-Id": SAM},
            json={"from_user_id": SAM, "to_user_id": ALEX, "amount_cents": 50},
        )
        assert settled.status_code == 201
        assert settled.json()["transfers"] == []

        exported = client.get(f"/groups/{group_id}/export.csv", headers={"X-User-Id": ALEX})
        assert exported.status_code == 200
        assert "Dinner" in exported.text
        assert "0.50" in exported.text
        assert "settlement" in exported.text


def test_exact_split_is_rejected_when_it_does_not_add_up(tmp_path: Path):
    with _client(tmp_path) as client:
        _name(client, ALEX, "Alex")
        created = client.post(
            "/groups",
            headers={"X-User-Id": ALEX},
            json={"name": "Flat", "kind": "house"},
        )
        group_id = created.json()["id"]
        response = client.post(
            f"/groups/{group_id}/expenses",
            headers={"X-User-Id": ALEX},
            json={
                "description": "Rent",
                "amount_cents": 100,
                "payer_id": ALEX,
                "split_type": "exact",
                "participants": [{"user_id": ALEX, "amount_cents": 40}],
            },
        )
        assert response.status_code == 400
        assert "sum" in response.json()["detail"]
