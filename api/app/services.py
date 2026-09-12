"""Shared helpers: permissions, serialization, activity logging, lexorank.

Behaviour mirrors the frontend mock in `frontend/src/api/mock.ts` (and the
lexorank helpers in `frontend/src/lib/rank.ts`).
"""

from __future__ import annotations

from typing import Any

from .db import db, uid, now_iso
from .errors import ApiError

BOARD_ROLES = ("viewer", "editor", "owner")
ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def today_str() -> str:
    from datetime import date

    return date.today().isoformat()


# Permissions ---------------------------------------------------------------


def role_in(db: Any, user_id: str, board_id: str) -> str | None:
    for m in db.members:
        if m["board_id"] == board_id and m["user_id"] == user_id:
            return m["role"]
    return None


def require_role(role: str, minimum: str, action: str) -> None:
    if ROLE_RANK.get(role, 0) < ROLE_RANK[minimum]:
        raise ApiError(403, f"You need {minimum} permissions to {action}")


def can_edit(role: str) -> bool:
    return role in ("editor", "owner")


def board_access(user_id: str, board_id: str) -> tuple[dict[str, Any], str]:
    """Look up a board and the caller's effective role.

    Returns `(board, role)`. Admins without a membership are treated as
    owners. Archived boards are hidden (404) unless the caller is an owner.
    """
    board = next((b for b in db.boards if b["id"] == board_id), None)
    if not board:
        raise ApiError(404, "Board not found")
    user = next((u for u in db.users if u["id"] == user_id), None)
    role = role_in(db, user_id, board_id)

    if board["owner_id"] == user_id and not role:
        role = "owner"
    if user and user["is_admin"] and not role:
        role = "owner"

    if not role:
        raise ApiError(403, "You do not have access to this board")
    if board["is_archived"] and role != "owner":
        raise ApiError(404, "Board not found")
    return board, role


def find_board_id_for_task(task_id: str) -> str:
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")
    col = next((c for c in db.columns if c["id"] == task["column_id"]), None)
    if not col:
        raise ApiError(404, "Task not found")
    return col["board_id"]


# Activity logging -----------------------------------------------------------


def log_activity(
    db: Any,
    task_id: str,
    user_id: str,
    action_type: str,
    details: dict[str, Any],
    message: str,
) -> None:
    db.activity.insert(0, {
        "id": uid(),
        "task_id": task_id,
        "user_id": user_id,
        "action_type": action_type,
        "action_details": details,
        "human_readable_message": message,
        "created_at": now_iso(),
    })


def user_pure(u: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": u["id"],
        "email": u["email"],
        "is_admin": u["is_admin"],
        "is_active": u["is_active"],
        "created_at": u["created_at"],
        "updated_at": u["updated_at"],
    }


# Lexorank -------------------------------------------------------------------


WIDTH = 10


def pad_rank(n: int) -> str:
    return str(n).zfill(WIDTH)


def rank_to_number(rank: str) -> int:
    return int(rank or 0)


def sort_by_rank(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda t: rank_to_number(t["rank"]))


def mid_rank(prev: str | None, next_: str | None) -> str | None:
    lo = 0 if prev in (None, "") else rank_to_number(prev)
    hi = 0 if next_ in (None, "") else rank_to_number(next_)

    if prev in (None, "") and next_ in (None, ""):
        return pad_rank(1024)
    if prev in (None, ""):
        mid = hi // 2
        if mid <= 0 or mid >= hi:
            return None
        return pad_rank(mid)
    if next_ in (None, ""):
        return pad_rank(lo * 2 + 1024)
    mid = (lo + hi) // 2
    if mid <= lo or mid >= hi:
        return None
    return pad_rank(mid)


def is_overdue(task: dict[str, Any], today: str) -> bool:
    return bool(task["due_date"]) and task["due_date"] < today


# Serializers ----------------------------------------------------------------


def task_full(task: dict[str, Any]) -> dict[str, Any]:
    tags: list[dict[str, Any]] = []
    for pt in db.task_tags:
        if pt["task_id"] != task["id"]:
            continue
        tag = next((t for t in db.tags if t["id"] == pt["tag_id"]), None)
        if tag:
            tags.append(tag)
    assignee = next((u for u in db.users if u["id"] == task["assignee_id"]), None) if task["assignee_id"] else None
    return {
        **task,
        "tags": tags,
        "assignee": user_pure(assignee) if assignee else None,
    }


def task_detail(task: dict[str, Any]) -> dict[str, Any]:
    comments = [
        {**c, "user": user_pure(next((u for u in db.users if u["id"] == c["user_id"]), db.users[0]))}
        for c in sorted(
            (c for c in db.comments if c["task_id"] == task["id"]),
            key=lambda c: c["created_at"],
        )
    ]
    activity = [
        _activity_with_user(a)
        for a in sorted(
            (a for a in db.activity if a["task_id"] == task["id"]),
            key=lambda a: a["created_at"],
            reverse=True,
        )
    ]
    return {**task_full(task), "comments": comments, "activity": activity}


def _activity_with_user(a: dict[str, Any]) -> dict[str, Any]:
    user = next((u for u in db.users if u["id"] == a["user_id"]), db.users[0])
    return {**a, "user": user_pure(user)}


def member_pure(m: dict[str, Any]) -> dict[str, Any]:
    user = next((u for u in db.users if u["id"] == m["user_id"]), None)
    return {"user_id": m["user_id"], "role": m["role"], "email": user["email"] if user else ""}


def board_summary(board: dict[str, Any], user_id: str) -> dict[str, Any]:
    user = next((u for u in db.users if u["id"] == user_id), None)
    role = role_in(db, user_id, board["id"]) or ("owner" if board["owner_id"] == user_id else None)
    effective_role = role or ("owner" if user and user["is_admin"] else "viewer")

    col_ids = {c["id"] for c in db.columns if c["board_id"] == board["id"]}
    board_tasks = [t for t in db.tasks if t["column_id"] in col_ids]
    today = today_str()

    return {
        "id": board["id"],
        "name": board["name"],
        "owner_id": board["owner_id"],
        "is_archived": board["is_archived"],
        "created_at": board["created_at"],
        "updated_at": board["updated_at"],
        "role": effective_role,
        "total_tasks": len(board_tasks),
        "overdue_tasks": sum(1 for t in board_tasks if is_overdue(t, today)),
        "member_count": sum(1 for m in db.members if m["board_id"] == board["id"]),
    }


def board_detail(board: dict[str, Any], user_id: str) -> dict[str, Any]:
    summary = board_summary(board, user_id)
    columns = sorted(
        (c for c in db.columns if c["board_id"] == board["id"]),
        key=lambda c: c["position"],
    )
    board_tags = [t for t in db.tags if t["board_id"] == board["id"]]
    members = sorted(
        (member_pure(m) for m in db.members if m["board_id"] == board["id"]),
        key=lambda m: (m["role"], m["email"]),
    )
    col_ids = {c["id"] for c in columns}
    tasks = sort_by_rank([t for t in db.tasks if t["column_id"] in col_ids])
    return {**summary, "columns": columns, "tags": board_tags, "members": members, "tasks": [task_full(t) for t in tasks]}


def board_stats(board: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in db.columns if c["board_id"] == board["id"]]
    col_ids = {c["id"] for c in cols}
    tasks = [t for t in db.tasks if t["column_id"] in col_ids]
    today = today_str()

    per_column = [
        {"column_id": c["id"], "name": c["name"], "count": sum(1 for t in tasks if t["column_id"] == c["id"])}
        for c in cols
    ]

    per_assignee: dict[str, dict[str, Any]] = {"none": {"user_id": None, "label": "Unassigned", "count": 0}}
    for m in db.members:
        if m["board_id"] != board["id"]:
            continue
        user = next((u for u in db.users if u["id"] == m["user_id"]), None)
        if user:
            per_assignee[user["id"]] = {"user_id": user["id"], "label": user["email"], "count": 0}
    for t in tasks:
        bucket = per_assignee.get("none" if t["assignee_id"] is None else t["assignee_id"])
        if bucket:
            bucket["count"] += 1

    per_tag: dict[str, dict[str, Any]] = {
        "none": {"tag_id": None, "name": None, "color": None, "count": 0},
        **{g["id"]: {"tag_id": g["id"], "name": g["name"], "color": g["color"], "count": 0} for g in db.tags if g["board_id"] == board["id"]},
    }
    for t in tasks:
        ids = [pt["tag_id"] for pt in db.task_tags if pt["task_id"] == t["id"]]
        if not ids:
            per_tag["none"]["count"] += 1
        for gid in ids:
            bucket = per_tag.get(gid)
            if bucket:
                bucket["count"] += 1

    return {
        "total_tasks": len(tasks),
        "overdue_tasks": sum(1 for t in tasks if is_overdue(t, today)),
        "per_column": per_column,
        "per_assignee": [v for v in per_assignee.values() if v["count"] > 0],
        "per_tag": [v for v in per_tag.values() if v["count"] > 0],
    }