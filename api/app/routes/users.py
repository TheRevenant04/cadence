"""User directory lookups."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..models import BoardMember, User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def users_search(
    query: str = "",
    board_id: str | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, str]]:
    q = query.strip().lower()
    existing = set((await session.scalars(
        select(BoardMember.user_id).where(BoardMember.board_id == board_id)
    )).all()) if board_id else set()

    users = list((await session.scalars(
        select(User).where(User.is_active.is_(True))
    )).all())
    results = [
        {"id": u.id, "email": u.email}
        for u in users
        if u.id != user.id
        and (board_id is None or u.id not in existing)
        and (not q or q in u.email.lower())
    ]
    return results[:6]