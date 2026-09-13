"""Task CRUD, movement and tagging."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..db import uid
from ..errors import ApiError
from ..models import ActivityLog, BoardMember, Column, Comment, Tag, Task, TaskTag, User
from ..realtime import publish
from ..schemas import TagIdsInput, TaskCreateInput, TaskMoveInput, TaskUpdateInput
from ..services import (
    board_access,
    can_edit,
    date_iso,
    log_activity,
    mid_rank,
    rank_to_number,
    sort_by_rank,
    task_detail,
    task_full,
)

router = APIRouter(tags=["tasks"])


def _require_edit(role: str, action: str) -> None:
    if not can_edit(role):
        raise ApiError(403, action)


async def _load_task(session: AsyncSession, task_id: str) -> Task:
    task = await session.get(Task, task_id)
    if not task:
        raise ApiError(404, "Task not found")
    return task


@router.post("/boards/{board_id}/tasks")
async def tasks_create(
    board_id: str, body: TaskCreateInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    _require_edit(role, "Viewers cannot create tasks")
    title = body.title.strip()
    if not title:
        raise ApiError(400, "Task title is required")
    column = await session.scalar(
        select(Column).where(Column.id == body.column_id, Column.board_id == board_id)
    )
    if not column:
        raise ApiError(400, "Choose a valid column")

    if body.assignee_id:
        is_member = await session.scalar(
            select(BoardMember).where(BoardMember.board_id == board_id, BoardMember.user_id == body.assignee_id)
        )
        if not is_member and body.assignee_id != user.id:
            raise ApiError(400, "Assignee must be a member of this board")
    if body.tag_ids:
        valid_tags = set((await session.scalars(select(Tag.id).where(Tag.board_id == board_id))).all())
        if not all(gid in valid_tags for gid in body.tag_ids):
            raise ApiError(400, "One or more tags are not part of this board")

    column_tasks = sort_by_rank(list((await session.scalars(
        select(Task).where(Task.column_id == column.id)
    )).all()))
    last_rank = rank_to_number(column_tasks[-1].rank) if column_tasks else 0
    now = datetime.now(timezone.utc)
    task = Task(
        id=uid(),
        column_id=column.id,
        title=title,
        description=body.description.strip() if body.description else None,
        due_date=date.fromisoformat(body.due_date) if body.due_date else None,
        assignee_id=body.assignee_id or None,
        rank=str(last_rank + 1000).zfill(10),
        created_at=now,
        updated_at=now,
    )
    session.add(task)
    # Postgres enforces FKs on each INSERT and SQLAlchemy's implicit flush order
    # is not guaranteed to keep `tasks` ahead of `task_tags`/`activity_logs`;
    # persist the parent first (same rationale as in seed.py).
    await session.flush()
    if body.tag_ids:
        for gid in body.tag_ids:
            session.add(TaskTag(task_id=task.id, tag_id=gid))
    await log_activity(session, task.id, user.id, "task.created", {}, "created this task")
    if body.assignee_id:
        assignee = await session.get(User, body.assignee_id)
        if assignee:
            await log_activity(
                session, task.id, user.id, "task.assignee_changed",
                {"to": assignee.email}, f"assigned this task to {assignee.email}",
            )
    if task.due_date:
        await log_activity(
            session, task.id, user.id, "task.due_date_changed",
            {"to": date_iso(task.due_date)}, f"set the due date to {date_iso(task.due_date)}",
        )
    await publish("board", board_id, "task_created")
    return await task_full(session, task)


@router.get("/boards/{board_id}/tasks/{task_id}")
async def tasks_get(
    board_id: str, task_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board, _ = await board_access(session, user.id, board_id)
    task = await _load_task(session, task_id)
    return await task_detail(session, task)


@router.patch("/boards/{board_id}/tasks/{task_id}")
async def tasks_update(
    board_id: str,
    task_id: str,
    body: TaskUpdateInput,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    _require_edit(role, "Viewers cannot edit tasks")
    task = await _load_task(session, task_id)

    provided = body.model_fields_set
    if "title" in provided:
        title = (body.title or "").strip()
        if not title:
            raise ApiError(400, "Task title is required")
        if title != task.title:
            await log_activity(session, task.id, user.id, "task.title_changed",
                               {"from": task.title, "to": title}, "changed the title")
            task.title = title
    if "description" in provided:
        next_desc = body.description.strip() if body.description else None
        if next_desc != task.description:
            await log_activity(session, task.id, user.id, "task.description_changed", {}, "edited the description")
            task.description = next_desc
    if "due_date" in provided:
        next_due = body.due_date or None
        if next_due != date_iso(task.due_date):
            message = f"set the due date to {next_due}" if next_due else "removed the due date"
            await log_activity(session, task.id, user.id, "task.due_date_changed",
                               {"from": date_iso(task.due_date), "to": next_due}, message)
            task.due_date = date.fromisoformat(next_due) if next_due else None
    if "assignee_id" in provided:
        next_assignee = body.assignee_id or None
        if next_assignee != task.assignee_id:
            to_user = await session.get(User, next_assignee) if next_assignee else None
            if next_assignee and not to_user:
                raise ApiError(400, "Assignee must be a member of this board")
            if next_assignee and to_user:
                message = f"assigned this task to {to_user.email}"
            else:
                from_user = await session.get(User, task.assignee_id) if task.assignee_id else None
                message = f"unassigned this task from {from_user.email if from_user else 'this task'}"
            await log_activity(session, task.id, user.id, "task.assignee_changed",
                               {"from": task.assignee_id, "to": next_assignee}, message)
            task.assignee_id = next_assignee

    task.updated_at = datetime.now(timezone.utc)
    await publish("board", board_id, "task_updated")
    return await task_full(session, task)


@router.post("/boards/{board_id}/tasks/{task_id}/move")
async def tasks_move(
    board_id: str,
    task_id: str,
    body: TaskMoveInput,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    _require_edit(role, "Viewers cannot move tasks")
    task = await _load_task(session, task_id)
    to_column = await session.scalar(
        select(Column).where(Column.id == body.column_id, Column.board_id == board_id)
    )
    if not to_column:
        raise ApiError(400, "Target column not found on this board")
    from_column = await session.get(Column, task.column_id)
    assert from_column is not None

    others = sort_by_rank(list((await session.scalars(
        select(Task).where(Task.column_id == to_column.id, Task.id != task_id)
    )).all()))

    prev_rank: str | None = None
    next_rank: str | None = None
    if body.before_task_id:
        idx = next((i for i, t in enumerate(others) if t.id == body.before_task_id), -1)
        if idx >= 0:
            prev_rank = others[idx - 1].rank if idx > 0 else None
            next_rank = others[idx].rank
    elif body.after_task_id:
        idx = next((i for i, t in enumerate(others) if t.id == body.after_task_id), -1)
        if idx >= 0:
            prev_rank = others[idx].rank
            next_rank = others[idx + 1].rank if idx < len(others) - 1 else None
    else:
        prev_rank = others[-1].rank if others else None
        next_rank = None

    rank = mid_rank(prev_rank, next_rank)
    if rank is None:
        base = 100_000_000
        step = base // (len(others) + 1)
        for i, other in enumerate(others):
            other.rank = str(step * (i + 1)).zfill(10)
        prev_idx = 0
        if body.before_task_id:
            idx = next((i for i, t in enumerate(others) if t.id == body.before_task_id), -1)
            if idx >= 0:
                prev_idx = idx
        elif body.after_task_id:
            idx = next((i for i, t in enumerate(others) if t.id == body.after_task_id), -1)
            if idx >= 0:
                prev_idx = idx + 1
        else:
            prev_idx = len(others)
        lo = 0 if prev_idx == 0 else rank_to_number(others[prev_idx - 1].rank)
        hi = 0 if prev_idx >= len(others) else rank_to_number(others[prev_idx].rank)
        rank = mid_rank(None if prev_idx == 0 else str(lo), None if prev_idx >= len(others) else str(hi))
        if rank is None:
            rank = str(lo + step // 2).zfill(10)

    moved_between = from_column.id != to_column.id
    task.column_id = to_column.id
    task.rank = rank
    task.updated_at = datetime.now(timezone.utc)
    if moved_between:
        await log_activity(
            session, task.id, user.id, "task.moved",
            {"from": from_column.name, "to": to_column.name},
            f"moved this task from '{from_column.name}' to '{to_column.name}'",
        )
    else:
        await log_activity(session, task.id, user.id, "task.reordered", {}, "reordered this task")
    await publish("board", board_id, "task_moved")
    return await task_full(session, task)


@router.delete("/boards/{board_id}/tasks/{task_id}", status_code=204)
async def tasks_delete(
    board_id: str, task_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> None:
    board, role = await board_access(session, user.id, board_id)
    _require_edit(role, "Viewers cannot delete tasks")
    task = await _load_task(session, task_id)
    await log_activity(session, task.id, user.id, "task.deleted", {"title": task.title}, "deleted this task")
    await session.execute(delete(TaskTag).where(TaskTag.task_id == task_id))
    await session.execute(delete(Comment).where(Comment.task_id == task_id))
    await session.execute(delete(ActivityLog).where(ActivityLog.task_id == task_id))
    await session.delete(task)
    await publish("board", board_id, "task_deleted")


@router.put("/boards/{board_id}/tasks/{task_id}/tags")
async def tasks_set_tags(
    board_id: str,
    task_id: str,
    body: TagIdsInput,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    _require_edit(role, "Viewers cannot change tags")
    task = await _load_task(session, task_id)
    valid_tag_ids = set((await session.scalars(select(Tag.id).where(Tag.board_id == board_id))).all())
    clean = list(dict.fromkeys(gid for gid in body.tag_ids if gid in valid_tag_ids))

    existing = list((await session.scalars(
        select(TaskTag.tag_id).where(TaskTag.task_id == task_id)
    )).all())
    added = [gid for gid in clean if gid not in existing]
    removed = [gid for gid in existing if gid not in clean]

    name_of = {t.id: t.name for t in (await session.scalars(
        select(Tag).where(Tag.board_id == board_id)
    )).all()}
    if added:
        for gid in added:
            session.add(TaskTag(task_id=task_id, tag_id=gid))
        names = [name_of.get(gid, gid) for gid in added]
        await log_activity(
            session, task_id, user.id, "task.tags_changed", {"added": names},
            f"added tag{'s' if len(names) > 1 else ''} " + ", ".join(f"'{n}'" for n in names),
        )
    if removed:
        await session.execute(delete(TaskTag).where(TaskTag.task_id == task_id, TaskTag.tag_id.in_(removed)))
        names = [name_of.get(gid, gid) for gid in removed]
        await log_activity(
            session, task_id, user.id, "task.tags_changed", {"removed": names},
            f"removed tag{'s' if len(names) > 1 else ''} " + ", ".join(f"'{n}'" for n in names),
        )
    task.updated_at = datetime.now(timezone.utc)
    await publish("board", board_id, "task_updated")
    return await task_full(session, task)