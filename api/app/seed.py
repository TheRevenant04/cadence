"""Database bootstrap: create the schema and seed demo data once.

Runs on app startup (see `app.py` lifespan). Seeding is idempotent — it only
inserts when the `users` table is empty, so data survives restarts.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from .database import get_engine
from .db import _seed
from .models import (
    ActivityLog,
    Base,
    Board,
    BoardMember,
    Column,
    Comment,
    PasswordResetToken,
    Tag,
    Task,
    TaskTag,
    User,
)


def parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


async def init_db() -> None:
    """Create tables if needed and seed demo data on first boot."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_if_empty(engine)


async def seed_if_empty(engine: AsyncEngine) -> None:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        count = await session.scalar(select(func.count()).select_from(User))
        if count:
            return
        await insert_seed(session)
        await session.commit()


async def insert_seed(session: AsyncSession) -> None:
    data = _seed()
    for row in data["users"]:
        session.add(User(
            id=row["id"], email=row["email"], password_hash=row["password_hash"],
            is_admin=row["is_admin"], is_active=row["is_active"],
            created_at=parse_dt(row["created_at"]), updated_at=parse_dt(row["updated_at"]),
        ))
    # Flush users FIRST, before any boards reference them. Postgres validates
    # each FK immediately, and our models have no relationship() definitions, so
    # SQLAlchemy cannot guarantee `users` precedes `boards` in a single flush.
    await session.flush()
    for row in data["boards"]:
        session.add(Board(
            id=row["id"], name=row["name"], owner_id=row["owner_id"], is_archived=row["is_archived"],
            created_at=parse_dt(row["created_at"]), updated_at=parse_dt(row["updated_at"]),
        ))
    for row in data["members"]:
        session.add(BoardMember(id=row["id"], board_id=row["board_id"], user_id=row["user_id"], role=row["role"]))
    # Persist users/boards/members (parents) before any row referencing them.
    # Postgres enforces FKs on each INSERT, and SQLAlchemy's flush order is not
    # guaranteed to keep `users` ahead of `boards`/`board_members`; SQLite
    # tolerates out-of-order inserts only because FKs are off there.
    await session.flush()
    # Flush after each child layer so parents are already persisted before any
    # row that references them. SQLite tolerates any order (FKs off by default),
    # but Postgres enforces them immediately, and relying on SQLAlchemy's
    # implicit flush order alone is not guaranteed to place `tasks` ahead of
    # `comments`/`activity_logs` on a fresh database.
    for row in data["columns"]:
        session.add(Column(
            id=row["id"], board_id=row["board_id"], name=row["name"], position=row["position"],
            created_at=parse_dt(row["created_at"]), updated_at=parse_dt(row["updated_at"]),
        ))
    for row in data["tags"]:
        session.add(Tag(id=row["id"], board_id=row["board_id"], name=row["name"], color=row["color"]))
    await session.flush()
    for row in data["tasks"]:
        session.add(Task(
            id=row["id"], column_id=row["column_id"], title=row["title"],
            description=row["description"], due_date=parse_date(row["due_date"]),
            assignee_id=row["assignee_id"], rank=row["rank"],
            created_at=parse_dt(row["created_at"]), updated_at=parse_dt(row["updated_at"]),
        ))
    await session.flush()
    for row in data["task_tags"]:
        session.add(TaskTag(task_id=row["task_id"], tag_id=row["tag_id"]))
    for row in data["comments"]:
        session.add(Comment(
            id=row["id"], task_id=row["task_id"], user_id=row["user_id"], content=row["content"],
            created_at=parse_dt(row["created_at"]), updated_at=parse_dt(row["updated_at"]),
        ))
    for row in data["activity"]:
        session.add(ActivityLog(
            id=row["id"], task_id=row["task_id"], user_id=row["user_id"],
            action_type=row["action_type"], action_details=row["action_details"],
            human_readable_message=row["human_readable_message"],
            created_at=parse_dt(row["created_at"]),
        ))
    await session.flush()
    for row in data["resets"]:
        session.add(PasswordResetToken(
            id=row["id"], user_id=row["user_id"], token=row["token"],
            expires_at=parse_dt(row["expires_at"]), used=row["used"],
            created_at=parse_dt(row["created_at"]),
        ))


if __name__ == "__main__":
    import asyncio

    asyncio.run(init_db())