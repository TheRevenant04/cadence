"""User directory lookups."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def users_search(
    query: str = "",
    board_id: str | None = None,
    user: dict = Depends(current_user),
):
    q = query.strip().lower()
    existing = {m["user_id"] for m in db.members if m["board_id"] == board_id}
    results = [
        {"id": u["id"], "email": u["email"]}
        for u in db.users
        if u["id"] != user["id"]
        and u["is_active"]
        and (board_id is None or u["id"] not in existing)
        and (not q or q in u["email"].lower())
    ]
    return results[:6]