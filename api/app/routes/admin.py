"""Site administration endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, now_iso
from ..errors import ApiError
from ..schemas import UserActiveInput
from ..services import board_summary, is_overdue, today_str, user_pure

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict) -> None:
    if not user["is_admin"]:
        raise ApiError(403, "Admin access required")


@router.get("/users")
async def admin_list_users(user: dict = Depends(current_user)):
    _require_admin(user)
    users = sorted(db.users, key=lambda u: u["email"].lower())
    return [user_pure(u) for u in users]


@router.get("/boards")
async def admin_list_boards(user: dict = Depends(current_user)):
    _require_admin(user)
    today = today_str()
    boards = sorted(db.boards, key=lambda b: b["created_at"], reverse=True)
    result = []
    for board in boards:
        col_ids = {c["id"] for c in db.columns if c["board_id"] == board["id"]}
        board_tasks = [t for t in db.tasks if t["column_id"] in col_ids]
        members = [m for m in db.members if m["board_id"] == board["id"]]
        summary = board_summary(board, user["id"])
        result.append({
            **summary,
            "owner_email": next((u["email"] for u in db.users if u["id"] == board["owner_id"]), ""),
            "total_tasks": len(board_tasks),
            "overdue_tasks": sum(1 for t in board_tasks if is_overdue(t, today)),
            "member_count": len(members),
        })
    return result


@router.patch("/users/{user_id}/active", status_code=204)
async def admin_set_user_active(user_id: str, body: UserActiveInput, user: dict = Depends(current_user)):
    _require_admin(user)
    target = next((u for u in db.users if u["id"] == user_id), None)
    if not target:
        raise ApiError(404, "User not found")
    if target["id"] == user["id"]:
        raise ApiError(400, "You cannot deactivate your own account")
    target["is_active"] = body.active
    target["updated_at"] = now_iso()