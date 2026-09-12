from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth, login


def test_search_requires_auth(client: TestClient) -> None:
    assert client.get("/users/search").status_code == 401


def test_search_excludes_self_and_board_members(client: TestClient, admin: str) -> None:
    r = client.get("/users/search", headers=auth(admin), params={"board_id": "b-launch"})
    assert r.status_code == 200
    result = r.json()
    emails = [u["email"] for u in result]
    assert "admin@cadence.dev" not in emails
    assert "alice@cadence.dev" not in emails
    assert "bob@cadence.dev" not in emails
    assert "carol@cadence.dev" in emails


def test_search_all_active_excluding_self(client: TestClient, alice: str) -> None:
    r = client.get("/users/search", headers=auth(alice))
    emails = [u["email"] for u in r.json()]
    assert emails == ["admin@cadence.dev", "bob@cadence.dev", "carol@cadence.dev"]


def test_search_by_substring(client: TestClient, admin: str) -> None:
    r = client.get("/users/search", headers=auth(admin), params={"query": "bob"})
    emails = [u["email"] for u in r.json()]
    assert emails == ["bob@cadence.dev"]


def test_search_excludes_inactive(client: TestClient, admin: str) -> None:
    r = client.patch("/admin/users/u-bob/active", json={"active": False}, headers=auth(admin))
    assert r.status_code == 204
    r = client.get("/users/search", headers=auth(admin), params={"query": "bob"})
    assert r.json() == []