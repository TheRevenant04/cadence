"""Site administration endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..errors import ApiError
from ..models import Board, BoardMember, User
from ..schemas import UserActiveInput
from ..services import board_summary, board_tasks, is_overdue, today_str, user_pure

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise ApiError(403, "Admin access required")


@router.get("/users")
async def admin_list_users(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[Any]:
    _require_admin(user)
    users = sorted((await session.scalars(select(User))).all(), key=lambda u: u.email.lower())
    return [user_pure(u) for u in users]


@router.get("/boards")
async def admin_list_boards(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> list[Any]:
    _require_admin(user)
    today = today_str()
    boards = sorted((await session.scalars(select(Board))).all(), key=lambda b: b.created_at, reverse=True)
    result = []
    for board in boards:
        board_tasks_rows = await board_tasks(session, board.id)
        members = list((await session.scalars(
            select(BoardMember).where(BoardMember.board_id == board.id)
        )).all())
        owner = await session.get(User, board.owner_id)
        summary = await board_summary(session, board, user.id)
        result.append({
            **summary,
            "owner_email": owner.email if owner else "",
            "total_tasks": len(board_tasks_rows),
            "overdue_tasks": sum(1 for t in board_tasks_rows if is_overdue(t, today)),
            "member_count": len(members),
        })
    return result


@router.patch("/users/{user_id}/active", status_code=204)
async def admin_set_user_active(
    user_id: str, body: UserActiveInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> None:
    _require_admin(user)
    target = await session.get(User, user_id)
    if not target:
        raise ApiError(404, "User not found")
    if target.id == user.id:
        raise ApiError(400, "You cannot deactivate your own account")
    target.is_active = body.active
    target.updated_at = datetime.now(timezone.utc)