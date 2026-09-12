"""Fixed tag set per board."""

from __future__ import annotations

import random

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, uid, TAG_COLORS
from ..errors import ApiError
from ..realtime import publish
from ..schemas import TagCreateInput
from ..services import board_access, require_role

router = APIRouter(tags=["tags"])


@router.post("/boards/{board_id}/tags")
async def tags_add(board_id: str, body: TagCreateInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "manage tags")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Tag name is required")
    if any(t["board_id"] == board_id and t["name"].lower() == clean.lower() for t in db.tags):
        raise ApiError(409, "A tag with this name already exists")
    tag = {
        "id": uid(),
        "board_id": board_id,
        "name": clean,
        "color": body.color or random.choice(TAG_COLORS),
    }
    db.tags.append(tag)
    await publish("board", board_id, "tags_changed")
    return tag


@router.delete("/boards/{board_id}/tags/{tag_id}", status_code=204)
async def tags_remove(board_id: str, tag_id: str, user: dict = Depends(current_user)):
    tag = next((t for t in db.tags if t["id"] == tag_id), None)
    if not tag:
        raise ApiError(404, "Tag not found")
    board, role = board_access(user["id"], tag["board_id"])
    require_role(role, "owner", "manage tags")
    db.task_tags = [pt for pt in db.task_tags if pt["tag_id"] != tag_id]
    db.tags = [t for t in db.tags if t["id"] != tag_id]
    await publish("board", tag["board_id"], "tags_changed")