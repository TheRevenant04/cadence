from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth, login


def test_login_success(client: TestClient) -> None:
    r = client.post("/auth/login", json={"email": "alice@cadence.dev", "password": "Password123!"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "alice@cadence.dev"
    assert body["user"]["is_admin"] is False
    assert body["token"]


def test_login_email_is_case_insensitive(client: TestClient) -> None:
    r = client.post("/auth/login", json={"email": "  ALICE@CADENCE.DEV ", "password": "Password123!"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "alice@cadence.dev"


def test_login_bad_password(client: TestClient) -> None:
    r = client.post("/auth/login", json={"email": "alice@cadence.dev", "password": "wrong"})
    assert r.status_code == 401
    assert r.json() == {"status": 401, "message": "Invalid email or password"}


def test_login_unknown_email(client: TestClient) -> None:
    r = client.post("/auth/login", json={"email": "nobody@cadence.dev", "password": "Password123!"})
    assert r.status_code == 401


def test_login_deactivated_account(client: TestClient, admin: str) -> None:
    r = client.patch("/admin/users/u-bob/active", json={"active": False}, headers=auth(admin))
    assert r.status_code == 204
    r = client.post("/auth/login", json={"email": "bob@cadence.dev", "password": "Password123!"})
    assert r.status_code == 403
    assert r.json()["message"] == "This account has been deactivated"


def test_signup_creates_user(client: TestClient) -> None:
    r = client.post("/auth/signup", json={"email": "new@cadence.dev", "password": "Password123!"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "new@cadence.dev"
    assert body["user"]["is_admin"] is False
    assert body["user"]["is_active"] is True
    token = body["token"]
    me = client.get("/auth/me", headers=auth(token))
    assert me.json()["user"]["email"] == "new@cadence.dev"


def test_signup_invalid_email(client: TestClient) -> None:
    r = client.post("/auth/signup", json={"email": "not-an-email", "password": "Password123!"})
    assert r.status_code == 400
    assert r.json()["message"] == "Enter a valid email address"


def test_signup_weak_password(client: TestClient) -> None:
    r = client.post("/auth/signup", json={"email": "new@cadence.dev", "password": "short"})
    assert r.status_code == 400
    message = r.json()["message"]
    assert message == "Password does not meet the requirements: at least 12 characters"


def test_signup_duplicate_email(client: TestClient) -> None:
    first = client.post("/auth/signup", json={"email": "dup@cadence.dev", "password": "Password123!"})
    assert first.status_code == 200
    second = client.post("/auth/signup", json={"email": "DUP@cadence.dev", "password": "Password123!"})
    assert second.status_code == 409
    assert second.json()["message"] == "An account with this email already exists"


def test_me_unauthenticated(client: TestClient) -> None:
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json() == {"user": None}


def test_me_with_token(client: TestClient, alice: str) -> None:
    r = client.get("/auth/me", headers=auth(alice))
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "alice@cadence.dev"


def test_logout_invalidates_token(client: TestClient, alice: str) -> None:
    r = client.post("/auth/logout", headers=auth(alice))
    assert r.status_code == 204
    assert client.get("/auth/me", headers=auth(alice)).json() == {"user": None}
    r = client.get("/boards", headers=auth(alice))
    assert r.status_code == 401


def test_logout_requires_auth(client: TestClient) -> None:
    assert client.post("/auth/logout").status_code == 401


def test_change_password(client: TestClient, alice: str) -> None:
    r = client.post("/auth/change-password", headers=auth(alice), json={
        "current_password": "Password123!",
        "new_password": "NewPassword456!",
    })
    assert r.status_code == 204
    old = client.post("/auth/login", json={"email": "alice@cadence.dev", "password": "Password123!"})
    assert old.status_code == 401
    new = client.post("/auth/login", json={"email": "alice@cadence.dev", "password": "NewPassword456!"})
    assert new.status_code == 200


def test_change_password_wrong_current(client: TestClient, alice: str) -> None:
    r = client.post("/auth/change-password", headers=auth(alice), json={
        "current_password": "wrong",
        "new_password": "NewPassword456!",
    })
    assert r.status_code == 400
    assert r.json()["message"] == "Your current password is incorrect"


def test_change_password_same(client: TestClient, alice: str) -> None:
    r = client.post("/auth/change-password", headers=auth(alice), json={
        "current_password": "Password123!",
        "new_password": "Password123!",
    })
    assert r.status_code == 400
    assert r.json()["message"] == "New password must be different from the current one"


def test_change_password_weak_new(client: TestClient, alice: str) -> None:
    r = client.post("/auth/change-password", headers=auth(alice), json={
        "current_password": "Password123!",
        "new_password": "weak",
    })
    assert r.status_code == 400
    assert r.json()["message"] == "New password must meet the requirements: at least 12 characters"


def test_reset_password_flow(client: TestClient) -> None:
    r = client.post("/auth/reset-password/request", json={"email": "bob@cadence.dev"})
    assert r.status_code == 200
    token = r.json()["token"]
    assert r.json()["reset_url"].endswith(f"/reset-password?token={token}")

    confirm = client.post("/auth/reset-password/confirm", json={"token": token, "new_password": "BrandNew789!"})
    assert confirm.status_code == 204

    old = client.post("/auth/login", json={"email": "bob@cadence.dev", "password": "Password123!"})
    assert old.status_code == 401
    new = client.post("/auth/login", json={"email": "bob@cadence.dev", "password": "BrandNew789!"})
    assert new.status_code == 200


def test_reset_unknown_email(client: TestClient) -> None:
    r = client.post("/auth/reset-password/request", json={"email": "ghost@cadence.dev"})
    assert r.status_code == 404
    assert r.json()["message"] == "No account found for that email"


def test_reset_bad_token(client: TestClient) -> None:
    r = client.post("/auth/reset-password/confirm", json={"token": "nope", "new_password": "BrandNew789!"})
    assert r.status_code == 400
    assert r.json()["message"] == "Invalid or expired reset token"