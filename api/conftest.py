from __future__ import annotations

import asyncio
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.app import create_app
from app.database import dispose_engine, set_database_url

DEMO_PASSWORD = "Password123!"

# One throwaway SQLite file per test: the app lifespan creates the schema and
# seeds demo data on startup, so each test starts from a clean known state.
_TEST_DB_ROOT = Path(tempfile.gettempdir()) / "cadence-tests"


@pytest.fixture()
def client() -> TestClient:
    _TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = _TEST_DB_ROOT / f"test_{uuid.uuid4().hex}.db"
    set_database_url(f"sqlite+aiosqlite:///{db_path}")
    with TestClient(create_app()) as c:
        yield c
    try:
        asyncio.run(dispose_engine())
    except Exception:
        pass


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