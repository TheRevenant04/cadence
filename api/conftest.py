from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.app import create_app
from app.db import db

DEMO_PASSWORD = "Password123!"


@pytest.fixture()
def client() -> TestClient:
    db.reset()
    with TestClient(create_app()) as c:
        yield c


def login(client: TestClient, email: str, password: str = DEMO_PASSWORD) -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin(client) -> str:
    return login(client, "admin@cadence.dev")


@pytest.fixture()
def alice(client) -> str:
    return login(client, "alice@cadence.dev")


@pytest.fixture()
def bob(client) -> str:
    return login(client, "bob@cadence.dev")


@pytest.fixture()
def carol(client) -> str:
    return login(client, "carol@cadence.dev")