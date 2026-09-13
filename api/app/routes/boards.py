"""Board lifecycle, members and statistics."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..db import uid, DEFAULT_COLUMNS
from ..errors import ApiError
from ..models import ActivityLog, Board, BoardMember, Column, Comment, Tag, Task, TaskTag, User
from ..realtime import publish
from ..schemas import BoardCreateInput, BoardRenameInput, InviteInput, MemberRoleInput
from ..services import (
    board_access,
    board_detail,
    board_stats,
    board_summary,
    member_pure,
    require_role,
    role_of,
)

router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("")
async def boards_list(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[Any]:
    all_boards = list((await session.scalars(select(Board))).all())
    visible = set((await session.scalars(
        select(BoardMember.board_id).where(BoardMember.user_id == user.id)
    )).all())
    boards = [
        b for b in all_boards
        if not b.is_archived and (b.id in visible or b.owner_id == user.id)
    ]
    boards.sort(key=lambda b: b.name.lower())
    return [await board_summary(session, b, user.id) for b in boards]


@router.get("/archived")
async def boards_list_archived(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[Any]:
    all_boards = list((await session.scalars(select(Board))).all())
    boards = [
        b for b in all_boards
        if b.is_archived
        and (b.owner_id == user.id or await role_of(session, user.id, b.id) == "owner" or user.is_admin)
    ]
    boards.sort(key=lambda b: b.created_at, reverse=True)
    return [await board_summary(session, b, user.id) for b in boards]


@router.post("")
async def boards_create(
    body: BoardCreateInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    name = body.name.strip()
    if not name:
        raise ApiError(400, "Board name is required")
    now = datetime.now(timezone.utc)
    board = Board(id=uid(), name=name, owner_id=user.id, is_archived=False, created_at=now, updated_at=now)
    session.add(board)
    session.add(BoardMember(id=uid(), board_id=board.id, user_id=user.id, role="owner"))
    default_cols = body.column_names if body.column_names else DEFAULT_COLUMNS
    position = -1
    for raw in default_cols:
        clean = raw.strip()
        position += 1
        ts = datetime.now(timezone.utc)
        session.add(Column(id=uid(), board_id=board.id, name=clean, position=position, created_at=ts, updated_at=ts))
    await publish("global", op="board_created")
    return await board_summary(session, board, user.id)


@router.get("/{board_id}")
async def boards_get(board_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> Any:
    board, _ = await board_access(session, user.id, board_id)
    return await board_detail(session, board, user.id)


@router.patch("/{board_id}", status_code=204)
async def boards_rename(
    board_id: str, body: BoardRenameInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> None:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "rename this board")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Board name is required")
    board.name = clean
    board.updated_at = datetime.now(timezone.utc)
    await publish("board", board_id, "updated")


@router.delete("/{board_id}", status_code=204)
async def boards_delete(board_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> None:
    if not user.is_admin:
        board, role = await board_access(session, user.id, board_id)
        require_role(role, "owner", "delete this board")
    col_ids = list((await session.scalars(select(Column.id).where(Column.board_id == board_id))).all())
    task_ids = list((await session.scalars(select(Task.id).where(Task.column_id.in_(col_ids)))).all()) if col_ids else []
    if task_ids:
        await session.execute(delete(TaskTag).where(TaskTag.task_id.in_(task_ids)))
        await session.execute(delete(Comment).where(Comment.task_id.in_(task_ids)))
        await session.execute(delete(ActivityLog).where(ActivityLog.task_id.in_(task_ids)))
    if col_ids:
        await session.execute(delete(Task).where(Task.column_id.in_(col_ids)))
        await session.execute(delete(Column).where(Column.board_id == board_id))
    await session.execute(delete(Tag).where(Tag.board_id == board_id))
    await session.execute(delete(BoardMember).where(BoardMember.board_id == board_id))
    await session.execute(delete(Board).where(Board.id == board_id))
    await publish("global", op="board_deleted")


@router.post("/{board_id}/archive", status_code=204)
async def boards_archive(board_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> None:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "archive this board")
    board.is_archived = True
    board.updated_at = datetime.now(timezone.utc)
    await publish("global", op="board_archived")


@router.post("/{board_id}/unarchive", status_code=204)
async def boards_unarchive(board_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> None:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "restore this board")
    board.is_archived = False
    board.updated_at = datetime.now(timezone.utc)
    await publish("global", op="board_unarchived")


@router.get("/{board_id}/stats")
async def boards_stats(board_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> Any:
    board, _ = await board_access(session, user.id, board_id)
    return await board_stats(session, board)


@router.post("/{board_id}/members")
async def boards_invite(
    board_id: str, body: InviteInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "invite members")
    if body.role not in ("editor", "viewer"):
        raise ApiError(400, "Choose a role (editor or viewer)")
    clean_email = body.email.strip().lower()
    target = await session.scalar(select(User).where(User.email == clean_email))
    if not target:
        raise ApiError(404, f'No user found for "{body.email.strip()}"')
    if target.id == user.id:
        raise ApiError(400, "You already own this board")
    existing = await session.scalar(
        select(BoardMember).where(BoardMember.board_id == board_id, BoardMember.user_id == target.id)
    )
    if existing:
        if existing.role != "owner":
            existing.role = body.role
    else:
        session.add(BoardMember(id=uid(), board_id=board_id, user_id=target.id, role=body.role))
    await publish("board", board_id, "members_changed")
    members = list((await session.scalars(select(BoardMember).where(BoardMember.board_id == board_id))).all())
    return [await member_pure(session, m) for m in members]


@router.patch("/{board_id}/members/{user_id}", status_code=204)
async def boards_update_member_role(
    board_id: str,
    user_id: str,
    body: MemberRoleInput,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "change member roles")
    membership = await session.scalar(
        select(BoardMember).where(BoardMember.board_id == board_id, BoardMember.user_id == user_id)
    )
    if not membership:
        raise ApiError(404, "Member not found")
    if membership.role == "owner":
        raise ApiError(400, "The owner role cannot be changed")
    membership.role = body.role
    await publish("board", board_id, "members_changed")


@router.delete("/{board_id}/members/{user_id}", status_code=204)
async def boards_remove_member(
    board_id: str,
    user_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "remove members")
    membership = await session.scalar(
        select(BoardMember).where(BoardMember.board_id == board_id, BoardMember.user_id == user_id)
    )
    if not membership:
        raise ApiError(404, "Member not found")
    if membership.role == "owner":
        raise ApiError(400, "The owner cannot be removed")
    await session.execute(delete(BoardMember).where(BoardMember.id == membership.id))
    col_ids = select(Column.id).where(Column.board_id == board_id)
    await session.execute(
        update(Task).where(Task.column_id.in_(col_ids), Task.assignee_id == user_id).values(assignee_id=None)
    )
    await publish("board", board_id, "members_changed")