"""Board lifecycle, members and statistics."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, uid, now_iso, DEFAULT_COLUMNS
from ..errors import ApiError
from ..realtime import publish
from ..schemas import BoardCreateInput, BoardRenameInput, InviteInput, MemberRoleInput
from ..services import (
    board_access,
    board_detail,
    board_stats,
    board_summary,
    member_pure,
    require_role,
)

router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("")
async def boards_list(user: dict = Depends(current_user)):
    visible = {m["board_id"] for m in db.members if m["user_id"] == user["id"]}
    boards = [
        b for b in db.boards
        if not b["is_archived"] and (b["id"] in visible or b["owner_id"] == user["id"])
    ]
    boards.sort(key=lambda b: b["name"].lower())
    return [board_summary(b, user["id"]) for b in boards]


@router.get("/archived")
async def boards_list_archived(user: dict = Depends(current_user)):
    boards = [
        b for b in db.boards
        if b["is_archived"]
        and (b["owner_id"] == user["id"] or
             next((m["role"] for m in db.members if m["board_id"] == b["id"] and m["user_id"] == user["id"]), None) == "owner" or
             user["is_admin"])
    ]
    boards.sort(key=lambda b: b["created_at"], reverse=True)
    return [board_summary(b, user["id"]) for b in boards]


@router.post("")
async def boards_create(body: BoardCreateInput, user: dict = Depends(current_user)):
    name = body.name.strip()
    if not name:
        raise ApiError(400, "Board name is required")
    now = now_iso()
    board = {
        "id": uid(),
        "name": name,
        "owner_id": user["id"],
        "is_archived": False,
        "created_at": now,
        "updated_at": now,
    }
    db.boards.append(board)
    db.members.append({"board_id": board["id"], "user_id": user["id"], "role": "owner"})
    default_cols = body.column_names if body.column_names else DEFAULT_COLUMNS
    last_position = -1
    for raw in default_cols:
        clean = raw.strip()
        last_position += 1
        db.columns.append({
            "id": uid(),
            "board_id": board["id"],
            "name": clean,
            "position": last_position,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    await publish("global", op="board_created")
    return board_summary(board, user["id"])


@router.get("/{board_id}")
async def boards_get(board_id: str, user: dict = Depends(current_user)):
    board, _ = board_access(user["id"], board_id)
    return board_detail(board, user["id"])


@router.patch("/{board_id}", status_code=204)
async def boards_rename(board_id: str, body: BoardRenameInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "rename this board")
    clean = body.name.strip()
    if not clean:
        raise ApiError(400, "Board name is required")
    board["name"] = clean
    board["updated_at"] = now_iso()
    await publish("board", board_id, "updated")


@router.delete("/{board_id}", status_code=204)
async def boards_delete(board_id: str, user: dict = Depends(current_user)):
    if not user["is_admin"]:
        board, role = board_access(user["id"], board_id)
        require_role(role, "owner", "delete this board")
    col_ids = [c["id"] for c in db.columns if c["board_id"] == board_id]
    task_ids = [t["id"] for t in db.tasks if t["column_id"] in col_ids]
    db.columns = [c for c in db.columns if c["board_id"] != board_id]
    db.tags = [t for t in db.tags if t["board_id"] != board_id]
    db.tasks = [t for t in db.tasks if t["column_id"] not in col_ids]
    db.task_tags = [pt for pt in db.task_tags if pt["task_id"] not in task_ids]
    db.comments = [c for c in db.comments if c["task_id"] not in task_ids]
    db.activity = [a for a in db.activity if a["task_id"] not in task_ids]
    db.members = [m for m in db.members if m["board_id"] != board_id]
    db.boards = [b for b in db.boards if b["id"] != board_id]
    await publish("global", op="board_deleted")


@router.post("/{board_id}/archive", status_code=204)
async def boards_archive(board_id: str, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "archive this board")
    board["is_archived"] = True
    board["updated_at"] = now_iso()
    await publish("global", op="board_archived")


@router.post("/{board_id}/unarchive", status_code=204)
async def boards_unarchive(board_id: str, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "restore this board")
    board["is_archived"] = False
    board["updated_at"] = now_iso()
    await publish("global", op="board_unarchived")


@router.get("/{board_id}/stats")
async def boards_stats(board_id: str, user: dict = Depends(current_user)):
    board, _ = board_access(user["id"], board_id)
    return board_stats(board)


@router.post("/{board_id}/members")
async def boards_invite(board_id: str, body: InviteInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "invite members")
    if body.role not in ("editor", "viewer"):
        raise ApiError(400, "Choose a role (editor or viewer)")
    clean_email = body.email.strip().lower()
    target = next((u for u in db.users if u["email"].lower() == clean_email), None)
    if not target:
        raise ApiError(404, f'No user found for "{body.email.strip()}"')
    if target["id"] == user["id"]:
        raise ApiError(400, "You already own this board")
    existing = next((m for m in db.members if m["board_id"] == board_id and m["user_id"] == target["id"]), None)
    if existing:
        if existing["role"] != "owner":
            existing["role"] = body.role
    else:
        db.members.append({"board_id": board_id, "user_id": target["id"], "role": body.role})
    await publish("board", board_id, "members_changed")
    members = [member_pure(m) for m in db.members if m["board_id"] == board_id]
    return members


@router.patch("/{board_id}/members/{user_id}", status_code=204)
async def boards_update_member_role(board_id: str, user_id: str, body: MemberRoleInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "change member roles")
    membership = next((m for m in db.members if m["board_id"] == board_id and m["user_id"] == user_id), None)
    if not membership:
        raise ApiError(404, "Member not found")
    if membership["role"] == "owner":
        raise ApiError(400, "The owner role cannot be changed")
    membership["role"] = body.role
    await publish("board", board_id, "members_changed")


@router.delete("/{board_id}/members/{user_id}", status_code=204)
async def boards_remove_member(board_id: str, user_id: str, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    require_role(role, "owner", "remove members")
    membership = next((m for m in db.members if m["board_id"] == board_id and m["user_id"] == user_id), None)
    if not membership:
        raise ApiError(404, "Member not found")
    if membership["role"] == "owner":
        raise ApiError(400, "The owner cannot be removed")
    db.members = [m for m in db.members if not (m["board_id"] == board_id and m["user_id"] == user_id)]
    col_ids = {c["id"] for c in db.columns if c["board_id"] == board_id}
    for task in db.tasks:
        if task["column_id"] in col_ids and task["assignee_id"] == user_id:
            task["assignee_id"] = None
    await publish("board", board_id, "members_changed")