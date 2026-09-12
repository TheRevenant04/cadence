from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth, login


def test_admin_list_users(client: TestClient, admin: str) -> None:
    r = client.get("/admin/users", headers=auth(admin))
    assert r.status_code == 200
    users = r.json()
    emails = [u["email"] for u in users]
    assert emails == [
        "admin@cadence.dev",
        "alice@cadence.dev",
        "bob@cadence.dev",
        "carol@cadence.dev",
    ]
    assert all("password_hash" not in u for u in users)


def test_admin_list_users_forbidden(client: TestClient, alice: str) -> None:
    r = client.get("/admin/users", headers=auth(alice))
    assert r.status_code == 403
    assert r.json() == {"status": 403, "message": "Admin access required"}


def test_admin_list_boards(client: TestClient, admin: str) -> None:
    r = client.get("/admin/boards", headers=auth(admin))
    assert r.status_code == 200
    boards = r.json()
    launch = next(b for b in boards if b["id"] == "b-launch")
    assert launch["owner_email"] == "admin@cadence.dev"
    assert launch["total_tasks"] == 8
    assert launch["overdue_tasks"] == 2
    assert launch["member_count"] == 3
    engine = next(b for b in boards if b["id"] == "b-engine")
    assert engine["owner_email"] == "alice@cadence.dev"
    assert engine["total_tasks"] == 6


def test_admin_list_boards_forbidden(client: TestClient, alice: str) -> None:
    r = client.get("/admin/boards", headers=auth(alice))
    assert r.status_code == 403


def test_deactivate_user(client: TestClient, admin: str) -> None:
    bob_token = login(client, "bob@cadence.dev")
    r = client.patch("/admin/users/u-bob/active", headers=auth(admin), json={"active": False})
    assert r.status_code == 204

    assert client.get("/auth/me", headers=auth(bob_token)).json() == {"user": None}
    r = client.get("/boards", headers=auth(bob_token))
    assert r.status_code == 403
    assert r.json()["message"] == "Your account has been deactivated"

    r = client.post("/auth/login", json={"email": "bob@cadence.dev", "password": "Password123!"})
    assert r.status_code == 403
    assert r.json()["message"] == "This account has been deactivated"


def test_reactivate_user(client: TestClient, admin: str) -> None:
    token = login(client, "bob@cadence.dev")
    client.patch("/admin/users/u-bob/active", headers=auth(admin), json={"active": False})
    client.patch("/admin/users/u-bob/active", headers=auth(admin), json={"active": True})
    r = client.get("/boards", headers=auth(token))
    assert r.status_code == 200


def test_cannot_deactivate_self(client: TestClient, admin: str) -> None:
    r = client.patch("/admin/users/u-admin/active", headers=auth(admin), json={"active": False})
    assert r.status_code == 400
    assert r.json()["message"] == "You cannot deactivate your own account"


def test_set_user_active_missing(client: TestClient, admin: str) -> None:
    r = client.patch("/admin/users/u-nope/active", headers=auth(admin), json={"active": False})
    assert r.status_code == 404
    assert r.json()["message"] == "User not found"


def test_set_user_active_not_admin(client: TestClient, alice: str) -> None:
    r = client.patch("/admin/users/u-bob/active", headers=auth(alice), json={"active": False})
    assert r.status_code == 403