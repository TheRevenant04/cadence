"""Fixed tag set per board."""

from __future__ import annotations

import random
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..db import uid, TAG_COLORS
from ..errors import ApiError
from ..models import Tag, TaskTag, User
from ..realtime import publish
from ..schemas import TagCreateInput
from ..services import board_access, require_role, tag_pure

router = APIRouter(tags=["tags"])


@router.post("/boards/{board_id}/tags")
async def tags_add(
    board_id: str, body: TagCreateInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board, role = await board_access(session, user.id, board_id)
    require_role(role, "owner", "manage tags")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Tag name is required")
    existing = await session.scalar(
        select(Tag).where(Tag.board_id == board_id, func.lower(Tag.name) == clean.lower())
    )
    if existing:
        raise ApiError(409, "A tag with this name already exists")
    tag = Tag(id=uid(), board_id=board_id, name=clean, color=body.color or random.choice(TAG_COLORS))
    session.add(tag)
    await publish("board", board_id, "tags_changed")
    return tag_pure(tag)


@router.delete("/boards/{board_id}/tags/{tag_id}", status_code=204)
async def tags_remove(
    board_id: str,
    tag_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise ApiError(404, "Tag not found")
    board, role = await board_access(session, user.id, tag.board_id)
    require_role(role, "owner", "manage tags")
    await session.execute(delete(TaskTag).where(TaskTag.tag_id == tag_id))
    await session.delete(tag)
    await publish("board", tag.board_id, "tags_changed")