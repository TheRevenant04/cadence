"""Engine, DSN resolution, async session scoping and in-memory session tokens.

Tokens live in a plain in-memory dict (the v1 contract treats them as opaque
bearer strings with no expiry); the rest of the state lives in the database.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

DEFAULT_URL = f"sqlite+aiosqlite:///{(Path(__file__).resolve().parent.parent / 'cadence.dev.db')}"

SESSIONS: dict[str, str] = {}

_current_url: str | None = None
_engine: AsyncEngine | None = None


def database_url() -> str:
    """Resolve the database URL from the environment (with a SQLite fallback).

    `DATABASE_URL` takes precedence; a local async-sqlite file is used so the
    API runs without a Postgres server for quick local development.
    """
    return os.environ.get("DATABASE_URL") or DEFAULT_URL


def set_database_url(url: str) -> None:
    """Point the app at a different database and clear session tokens.

    Used by the test suite to isolate each test against its own database.
    """
    global _engine, _current_url
    _engine = None
    _current_url = url
    SESSIONS.clear()


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(_current_url or database_url())
    return _engine


async def dispose_engine() -> None:
    """Close all pooled connections (used between tests)."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


async def session_scope() -> AsyncIterator[AsyncSession]:
    """Yield a new session bound to the current engine in a transaction.

    The transaction commits on success and rolls back on error, so route
    handlers never need to manage commit/rollback themselves.
    """
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session:
        async with session.begin():
            yield session


async def get_session() -> AsyncIterator[AsyncSession]:
    async for session in session_scope():
        yield session