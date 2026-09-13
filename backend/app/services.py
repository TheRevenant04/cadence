"""Shared helpers: permissions, serialization, activity logging, lexorank.

Behaviour mirrors the frontend mock in `frontend/src/api/mock.ts` (and the
lexorank helpers in `frontend/src/lib/rank.ts`). Row access is async and
session-scoped; serializers return the same wire shapes as the old in-memory
store (ISO-8601 timestamp strings, zero-padded rank strings).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import uid
from .errors import ApiError
from .models import ActivityLog, Board, BoardMember, Column, Comment, Tag, Task, TaskTag, User

BOARD_ROLES = ("viewer", "editor", "owner")
ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def today_str() -> str:
    return date.today().isoformat()


def dt_iso(value: datetime) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def date_iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


# Permissions ---------------------------------------------------------------


async def role_of(session: AsyncSession, user_id: str, board_id: str) -> str | None:
    memb = await session.scalar(
        select(BoardMember).where(BoardMember.board_id == board_id, BoardMember.user_id == user_id)
    )
    return memb.role if memb else None


def require_role(role: str, minimum: str, action: str) -> None:
    if ROLE_RANK.get(role, 0) < ROLE_RANK[minimum]:
        raise ApiError(403, f"You need {minimum} permissions to {action}")


def can_edit(role: str) -> bool:
    return role in ("editor", "owner")


async def board_access(session: AsyncSession, user_id: str, board_id: str) -> tuple[Board, str]:
    """Look up a board and the caller's effective role.

    Returns `(board, role)`. Admins without a membership are treated as
    owners. Archived boards are hidden (404) unless the caller is an owner.
    """
    board = await session.get(Board, board_id)
    if not board:
        raise ApiError(404, "Board not found")
    user = await session.get(User, user_id)
    role = await role_of(session, user_id, board_id)

    if board.owner_id == user_id and not role:
        role = "owner"
    if user and user.is_admin and not role:
        role = "owner"

    if not role:
        raise ApiError(403, "You do not have access to this board")
    if board.is_archived and role != "owner":
        raise ApiError(404, "Board not found")
    return board, role


async def find_board_id_for_task(session: AsyncSession, task_id: str) -> str:
    task = await session.get(Task, task_id)
    if not task:
        raise ApiError(404, "Task not found")
    col = await session.get(Column, task.column_id)
    if not col:
        raise ApiError(404, "Task not found")
    return col.board_id


# Activity logging -----------------------------------------------------------


async def log_activity(
    session: AsyncSession,
    task_id: str,
    user_id: str,
    action_type: str,
    details: dict,
    message: str,
) -> None:
    session.add(ActivityLog(
        id=uid(),
        task_id=task_id,
        user_id=user_id,
        action_type=action_type,
        action_details=details or {},
        human_readable_message=message,
        created_at=datetime.now(timezone.utc),
    ))


# Serializers ----------------------------------------------------------------


def user_pure(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "email": u.email,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "created_at": dt_iso(u.created_at),
        "updated_at": dt_iso(u.updated_at),
    }


def tag_pure(t: Tag) -> dict:
    return {"id": t.id, "board_id": t.board_id, "name": t.name, "color": t.color}


def column_pure(c: Column) -> dict:
    return {
        "id": c.id,
        "board_id": c.board_id,
        "name": c.name,
        "position": c.position,
        "created_at": dt_iso(c.created_at),
        "updated_at": dt_iso(c.updated_at),
    }


async def member_pure(session: AsyncSession, m: BoardMember) -> dict:
    user = await session.get(User, m.user_id)
    return {"user_id": m.user_id, "role": m.role, "email": user.email if user else ""}


def task_pure(task: Task) -> dict:
    return {
        "id": task.id,
        "column_id": task.column_id,
        "title": task.title,
        "description": task.description,
        "due_date": date_iso(task.due_date),
        "assignee_id": task.assignee_id,
        "rank": task.rank,
        "created_at": dt_iso(task.created_at),
        "updated_at": dt_iso(task.updated_at),
    }


async def task_full(session: AsyncSession, task: Task) -> dict:
    tags = list((await session.scalars(
        select(Tag).join(TaskTag, TaskTag.tag_id == Tag.id)
        .where(TaskTag.task_id == task.id)
        .order_by(TaskTag.id)
    )).all())
    assignee = await session.get(User, task.assignee_id) if task.assignee_id else None
    return {**task_pure(task), "tags": [tag_pure(t) for t in tags], "assignee": user_pure(assignee)}


async def task_detail(session: AsyncSession, task: Task) -> dict:
    comments = list((await session.scalars(
        select(Comment).where(Comment.task_id == task.id)
    )).all())
    comments.sort(key=lambda c: c.created_at)
    activity = list((await session.scalars(
        select(ActivityLog).where(ActivityLog.task_id == task.id)
    )).all())
    activity.sort(key=lambda a: a.created_at, reverse=True)

    result = await task_full(session, task)
    result["comments"] = [
        {
            "id": c.id, "task_id": c.task_id, "user_id": c.user_id, "content": c.content,
            "created_at": dt_iso(c.created_at), "updated_at": dt_iso(c.updated_at),
            "user": user_pure(await session.get(User, c.user_id)) or {},
        }
        for c in comments
    ]
    result["activity"] = [
        {
            "id": a.id, "task_id": a.task_id, "user_id": a.user_id,
            "action_type": a.action_type, "action_details": a.action_details,
            "human_readable_message": a.human_readable_message,
            "created_at": dt_iso(a.created_at),
            "user": user_pure(await session.get(User, a.user_id)) or {},
        }
        for a in activity
    ]
    return result


async def board_tasks(session: AsyncSession, board_id: str) -> list[Task]:
    col_ids = list((await session.scalars(
        select(Column.id).where(Column.board_id == board_id)
    )).all())
    if not col_ids:
        return []
    return list((await session.scalars(
        select(Task).where(Task.column_id.in_(col_ids))
    )).all())


async def board_members(session: AsyncSession, board_id: str) -> list[BoardMember]:
    return list((await session.scalars(
        select(BoardMember).where(BoardMember.board_id == board_id)
    )).all())


async def board_summary(session: AsyncSession, board: Board, user_id: str) -> dict:
    user = await session.get(User, user_id)
    role = await role_of(session, user_id, board.id) or ("owner" if board.owner_id == user_id else None)
    effective_role = role or ("owner" if user and user.is_admin else "viewer")

    tasks = await board_tasks(session, board.id)
    members = await board_members(session, board.id)
    today = today_str()

    return {
        "id": board.id,
        "name": board.name,
        "owner_id": board.owner_id,
        "is_archived": board.is_archived,
        "created_at": dt_iso(board.created_at),
        "updated_at": dt_iso(board.updated_at),
        "role": effective_role,
        "total_tasks": len(tasks),
        "overdue_tasks": sum(1 for t in tasks if is_overdue(t, today)),
        "member_count": len(members),
    }


async def board_detail(session: AsyncSession, board: Board, user_id: str) -> dict:
    summary = await board_summary(session, board, user_id)
    columns = list((await session.scalars(
        select(Column).where(Column.board_id == board.id)
    )).all())
    columns.sort(key=lambda c: c.position)
    board_tags = list((await session.scalars(
        select(Tag).where(Tag.board_id == board.id).order_by(Tag.id)
    )).all())
    members = [await member_pure(session, m) for m in await board_members(session, board.id)]
    members.sort(key=lambda m: (m["role"], m["email"]))

    col_ids = {c.id for c in columns}
    if col_ids:
        tasks = list((await session.scalars(
            select(Task).where(Task.column_id.in_(col_ids))
            .order_by(Task.rank, Task.created_at, Task.id)
        )).all())
    else:
        tasks = []

    result = {**summary, "columns": [column_pure(c) for c in columns], "tags": [tag_pure(t) for t in board_tags]}
    result["members"] = members
    result["tasks"] = [await task_full(session, t) for t in tasks]
    return result


async def board_stats(session: AsyncSession, board: Board) -> dict:
    cols = list((await session.scalars(
        select(Column).where(Column.board_id == board.id)
    )).all())
    cols.sort(key=lambda c: c.position)
    col_ids = {c.id for c in cols}
    tasks = await board_tasks(session, board.id) if col_ids else []
    today = today_str()

    per_column = [
        {"column_id": c.id, "name": c.name, "count": sum(1 for t in tasks if t.column_id == c.id)}
        for c in cols
    ]

    per_assignee: dict[str, dict] = {"none": {"user_id": None, "label": "Unassigned", "count": 0}}
    for m in await board_members(session, board.id):
        user = await session.get(User, m.user_id)
        if user:
            per_assignee[user.id] = {"user_id": user.id, "label": user.email, "count": 0}
    for t in tasks:
        bucket = per_assignee.get("none" if t.assignee_id is None else t.assignee_id)
        if bucket:
            bucket["count"] += 1

    board_tags = list((await session.scalars(
        select(Tag).where(Tag.board_id == board.id)
    )).all())
    per_tag: dict[str, dict] = {
        "none": {"tag_id": None, "name": None, "color": None, "count": 0},
        **{g.id: {"tag_id": g.id, "name": g.name, "color": g.color, "count": 0} for g in board_tags},
    }
    for t in tasks:
        tag_ids = list((await session.scalars(
            select(TaskTag.tag_id).where(TaskTag.task_id == t.id)
        )).all())
        if not tag_ids:
            per_tag["none"]["count"] += 1
        for gid in tag_ids:
            bucket = per_tag.get(gid)
            if bucket:
                bucket["count"] += 1

    return {
        "total_tasks": len(tasks),
        "overdue_tasks": sum(1 for t in tasks if is_overdue(t, today)),
        "per_column": per_column,
        "per_assignee": [v for v in per_assignee.values() if v["count"] > 0],
        "per_tag": [v for v in per_tag.values() if v["count"] > 0],
    }


# Lexorank -------------------------------------------------------------------


WIDTH = 10


def pad_rank(n: int) -> str:
    return str(n).zfill(WIDTH)


def rank_to_number(rank: str) -> int:
    return int(rank or 0)


def sort_by_rank(items: list[Any]) -> list[Any]:
    return sorted(items, key=lambda t: rank_to_number(t.rank))


def mid_rank(prev: str | None, next_: str | None) -> str | None:
    lo = rank_to_number(prev) if prev else 0
    hi = rank_to_number(next_) if next_ else 0

    if prev in (None, "") and next_ in (None, ""):
        return pad_rank(1024)
    if prev in (None, ""):
        mid = hi // 2
        if mid <= 0 or mid >= hi:
            return None
        return pad_rank(mid)
    if next_ in (None, ""):
        return pad_rank(lo * 2 + 1024)
    mid = (lo + hi) // 2
    if mid <= lo or mid >= hi:
        return None
    return pad_rank(mid)


def is_overdue(task: Task, today: str) -> bool:
    return task.due_date is not None and task.due_date.isoformat() < today