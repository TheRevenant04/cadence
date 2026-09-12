"""Custom board columns."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, uid, now_iso
from ..errors import ApiError
from ..realtime import publish
from ..schemas import ColumnNameInput
from ..services import board_access, require_role

router = APIRouter(tags=["columns"])


def _create_column(board_id: str, name: str) -> dict:
    max_pos = max((c["position"] for c in db.columns if c["board_id"] == board_id), default=-1)
    now = now_iso()
    column = {
        "id": uid(),
        "board_id": board_id,
        "name": name,
        "position": max_pos + 1,
        "created_at": now,
        "updated_at": now,
    }
    db.columns.append(column)
    return column


@router.post("/boards/{board_id}/columns")
async def columns_add(board_id: str, body: ColumnNameInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "add columns")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Column name is required")
    column = _create_column(board_id, clean)
    await publish("board", board_id, "columns_changed")
    return column


@router.patch("/boards/{board_id}/columns/{column_id}", status_code=204)
async def columns_rename(board_id: str, column_id: str, body: ColumnNameInput, user: dict = Depends(current_user)):
    column = next((c for c in db.columns if c["id"] == column_id), None)
    if not column:
        raise ApiError(404, "Column not found")
    board, role = board_access(user["id"], column["board_id"])
    require_role(role, "owner", "rename columns")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Column name is required")
    column["name"] = clean
    column["updated_at"] = now_iso()
    await publish("board", column["board_id"], "columns_changed")


@router.delete("/boards/{board_id}/columns/{column_id}", status_code=204)
async def columns_remove(board_id: str, column_id: str, user: dict = Depends(current_user)):
    column = next((c for c in db.columns if c["id"] == column_id), None)
    if not column:
        raise ApiError(404, "Column not found")
    board, role = board_access(user["id"], column["board_id"])
    require_role(role, "owner", "remove columns")
    task_ids = [t["id"] for t in db.tasks if t["column_id"] == column_id]
    db.tasks = [t for t in db.tasks if t["column_id"] != column_id]
    db.task_tags = [pt for pt in db.task_tags if pt["task_id"] not in task_ids]
    db.comments = [c for c in db.comments if c["task_id"] not in task_ids]
    db.activity = [a for a in db.activity if a["task_id"] not in task_ids]
    db.columns = [c for c in db.columns if c["id"] != column_id]
    for c in db.columns:
        if c["board_id"] == column["board_id"] and c["position"] > column["position"]:
            c["position"] -= 1
    await publish("board", column["board_id"], "columns_changed")