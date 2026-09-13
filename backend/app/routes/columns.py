"""Custom board columns."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..db import uid
from ..errors import ApiError
from ..models import ActivityLog, Column, Comment, Task, TaskTag, User
from ..realtime import publish
from ..schemas import ColumnNameInput
from ..services import board_access, column_pure, require_role

router = APIRouter(tags=["columns"])


async def _create_column(session: AsyncSession, board_id: str, name: str) -> Column:
    current_max = await session.scalar(
        select(func.max(Column.position)).where(Column.board_id == board_id)
    )
    now = datetime.now(timezone.utc)
    column = Column(id=uid(), board_id=board_id, name=name, position=current_max + 1 if current_max is not None else 0,
                    created_at=now, updated_at=now)
    session.add(column)
    return column


@router.post("/boards/{board_id}/columns")
async def columns_add(
    board_id: str, body: ColumnNameInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "add columns")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Column name is required")
    column = await _create_column(session, board_id, clean)
    await publish("board", board_id, "columns_changed")
    return column_pure(column)


@router.patch("/boards/{board_id}/columns/{column_id}", status_code=204)
async def columns_rename(
    board_id: str,
    column_id: str,
    body: ColumnNameInput,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    column = await session.get(Column, column_id)
    if not column:
        raise ApiError(404, "Column not found")
    board, role = await board_access(session, user.id, column.board_id)
    require_role(role, "owner", "rename columns")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Column name is required")
    column.name = clean
    column.updated_at = datetime.now(timezone.utc)
    await publish("board", column.board_id, "columns_changed")


@router.delete("/boards/{board_id}/columns/{column_id}", status_code=204)
async def columns_remove(
    board_id: str,
    column_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    column = await session.get(Column, column_id)
    if not column:
        raise ApiError(404, "Column not found")
    board, role = await board_access(session, user.id, column.board_id)
    require_role(role, "owner", "remove columns")

    task_ids = list((await session.scalars(select(Task.id).where(Task.column_id == column_id))).all())
    if task_ids:
        await session.execute(delete(TaskTag).where(TaskTag.task_id.in_(task_ids)))
        await session.execute(delete(Comment).where(Comment.task_id.in_(task_ids)))
        await session.execute(delete(ActivityLog).where(ActivityLog.task_id.in_(task_ids)))
    await session.execute(delete(Task).where(Task.column_id == column_id))
    await session.execute(delete(Column).where(Column.id == column_id))

    later = list((await session.scalars(
        select(Column).where(Column.board_id == column.board_id, Column.position > column.position)
    )).all())
    for c in later:
        c.position -= 1
    await publish("board", column.board_id, "columns_changed")