"""Task CRUD, movement and tagging."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, uid, now_iso
from ..errors import ApiError
from ..realtime import publish
from ..schemas import TagIdsInput, TaskCreateInput, TaskMoveInput, TaskUpdateInput
from ..services import (
    board_access,
    can_edit,
    log_activity,
    mid_rank,
    rank_to_number,
    sort_by_rank,
    task_detail,
    task_full,
    today_str,
)

router = APIRouter(tags=["tasks"])


def _require_edit(role: str, action: str) -> None:
    if not can_edit(role):
        raise ApiError(403, action)


@router.post("/boards/{board_id}/tasks")
async def tasks_create(board_id: str, body: TaskCreateInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    _require_edit(role, "Viewers cannot create tasks")
    title = body.title.strip()
    if not title:
        raise ApiError(400, "Task title is required")
    column = next((c for c in db.columns if c["id"] == body.column_id and c["board_id"] == board_id), None)
    if not column:
        raise ApiError(400, "Choose a valid column")

    if body.assignee_id:
        is_member = any(m["board_id"] == board_id and m["user_id"] == body.assignee_id for m in db.members)
        if not is_member and body.assignee_id != user["id"]:
            raise ApiError(400, "Assignee must be a member of this board")
    if body.tag_ids:
        if not any(any(t["id"] == gid and t["board_id"] == board_id for t in db.tags) for gid in body.tag_ids):
            raise ApiError(400, "One or more tags are not part of this board")

    column_tasks = sort_by_rank([t for t in db.tasks if t["column_id"] == column["id"]])
    last_rank = rank_to_number(column_tasks[-1]["rank"]) if column_tasks else 0
    now = now_iso()
    task = {
        "id": uid(),
        "column_id": column["id"],
        "title": title,
        "description": body.description.strip() if body.description else None,
        "due_date": body.due_date or None,
        "assignee_id": body.assignee_id or None,
        "rank": str(last_rank + 1000).zfill(10),
        "created_at": now,
        "updated_at": now,
    }
    db.tasks.append(task)
    if body.tag_ids:
        db.task_tags.extend({"task_id": task["id"], "tag_id": gid} for gid in body.tag_ids)
    log_activity(db, task["id"], user["id"], "task.created", {}, "created this task")
    if body.assignee_id:
        assignee = next((u for u in db.users if u["id"] == body.assignee_id), None)
        if assignee:
            log_activity(
                db, task["id"], user["id"], "task.assignee_changed",
                {"to": assignee["email"]}, f"assigned this task to {assignee['email']}",
            )
    if task["due_date"]:
        log_activity(
            db, task["id"], user["id"], "task.due_date_changed",
            {"to": task["due_date"]}, f"set the due date to {task['due_date']}",
        )
    await publish("board", board_id, "task_created")
    return task_full(task)


@router.get("/boards/{board_id}/tasks/{task_id}")
async def tasks_get(board_id: str, task_id: str, user: dict = Depends(current_user)):
    board, _ = board_access(user["id"], board_id)
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")
    return task_detail(task)


@router.patch("/boards/{board_id}/tasks/{task_id}")
async def tasks_update(board_id: str, task_id: str, body: TaskUpdateInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    _require_edit(role, "Viewers cannot edit tasks")
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")

    provided = body.model_fields_set
    if "title" in provided:
        title = body.title.strip()
        if not title:
            raise ApiError(400, "Task title is required")
        if title != task["title"]:
            log_activity(db, task["id"], user["id"], "task.title_changed",
                         {"from": task["title"], "to": title}, "changed the title")
            task["title"] = title
    if "description" in provided:
        next_desc = body.description.strip() if body.description else None
        if next_desc != task["description"]:
            log_activity(db, task["id"], user["id"], "task.description_changed", {}, "edited the description")
            task["description"] = next_desc
    if "due_date" in provided:
        next_due = body.due_date or None
        if next_due != task["due_date"]:
            message = f"set the due date to {next_due}" if next_due else "removed the due date"
            log_activity(db, task["id"], user["id"], "task.due_date_changed",
                         {"from": task["due_date"], "to": next_due}, message)
            task["due_date"] = next_due
    if "assignee_id" in provided:
        next_assignee = body.assignee_id or None
        if next_assignee != task["assignee_id"]:
            to_user = next((u for u in db.users if u["id"] == next_assignee), None) if next_assignee else None
            if next_assignee and not to_user:
                raise ApiError(400, "Assignee must be a member of this board")
            if next_assignee:
                message = f"assigned this task to {to_user['email']}"
            else:
                from_user = task["assignee_id"]
                from_user_obj = next((u for u in db.users if u["id"] == from_user), None) if from_user else None
                message = f"unassigned this task from {from_user_obj['email'] if from_user_obj else 'this task'}"
            log_activity(db, task["id"], user["id"], "task.assignee_changed",
                         {"from": task["assignee_id"], "to": next_assignee}, message)
            task["assignee_id"] = next_assignee

    task["updated_at"] = now_iso()
    await publish("board", board_id, "task_updated")
    return task_full(task)


@router.post("/boards/{board_id}/tasks/{task_id}/move")
async def tasks_move(board_id: str, task_id: str, body: TaskMoveInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    _require_edit(role, "Viewers cannot move tasks")
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")
    to_column = next((c for c in db.columns if c["id"] == body.column_id and c["board_id"] == board_id), None)
    if not to_column:
        raise ApiError(400, "Target column not found on this board")
    from_column = next((c for c in db.columns if c["id"] == task["column_id"]), None)

    others = sort_by_rank([t for t in db.tasks if t["column_id"] == to_column["id"] and t["id"] != task_id])

    prev_rank: str | None = None
    next_rank: str | None = None
    if body.before_task_id:
        idx = next((i for i, t in enumerate(others) if t["id"] == body.before_task_id), -1)
        if idx >= 0:
            prev_rank = others[idx - 1]["rank"] if idx > 0 else None
            next_rank = others[idx]["rank"]
    elif body.after_task_id:
        idx = next((i for i, t in enumerate(others) if t["id"] == body.after_task_id), -1)
        if idx >= 0:
            prev_rank = others[idx]["rank"]
            next_rank = others[idx + 1]["rank"] if idx < len(others) - 1 else None
    else:
        prev_rank = others[-1]["rank"] if others else None
        next_rank = None

    rank = mid_rank(prev_rank, next_rank)
    if rank is None:
        base = 100_000_000
        step = base // (len(others) + 1)
        for i, other in enumerate(others):
            other["rank"] = str(step * (i + 1)).zfill(10)
        prev_idx = 0
        if body.before_task_id:
            idx = next((i for i, t in enumerate(others) if t["id"] == body.before_task_id), -1)
            if idx >= 0:
                prev_idx = idx
        elif body.after_task_id:
            idx = next((i for i, t in enumerate(others) if t["id"] == body.after_task_id), -1)
            if idx >= 0:
                prev_idx = idx + 1
        else:
            prev_idx = len(others)
        lo = 0 if prev_idx == 0 else rank_to_number(others[prev_idx - 1]["rank"])
        hi = 0 if prev_idx >= len(others) else rank_to_number(others[prev_idx]["rank"])
        rank = mid_rank(None if prev_idx == 0 else str(lo), None if prev_idx >= len(others) else str(hi))
        if rank is None:
            rank = str(lo + step // 2).zfill(10)

    moved_between = from_column["id"] != to_column["id"]
    task["column_id"] = to_column["id"]
    task["rank"] = rank
    task["updated_at"] = now_iso()
    if moved_between:
        log_activity(
            db, task["id"], user["id"], "task.moved",
            {"from": from_column["name"], "to": to_column["name"]},
            f"moved this task from '{from_column['name']}' to '{to_column['name']}'",
        )
    else:
        log_activity(db, task["id"], user["id"], "task.reordered", {}, "reordered this task")
    await publish("board", board_id, "task_moved")
    return task_full(task)


@router.delete("/boards/{board_id}/tasks/{task_id}", status_code=204)
async def tasks_delete(board_id: str, task_id: str, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    _require_edit(role, "Viewers cannot delete tasks")
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")
    log_activity(db, task["id"], user["id"], "task.deleted", {"title": task["title"]}, "deleted this task")
    db.tasks = [t for t in db.tasks if t["id"] != task_id]
    db.task_tags = [pt for pt in db.task_tags if pt["task_id"] != task_id]
    db.comments = [c for c in db.comments if c["task_id"] != task_id]
    db.activity = [a for a in db.activity if a["task_id"] != task_id]
    await publish("board", board_id, "task_deleted")


@router.put("/boards/{board_id}/tasks/{task_id}/tags")
async def tasks_set_tags(board_id: str, task_id: str, body: TagIdsInput, user: dict = Depends(current_user)):
    board, role = board_access(user["id"], board_id)
    _require_edit(role, "Viewers cannot change tags")
    task = next((t for t in db.tasks if t["id"] == task_id), None)
    if not task:
        raise ApiError(404, "Task not found")
    valid_tag_ids = {t["id"] for t in db.tags if t["board_id"] == board_id}
    clean = list(dict.fromkeys(gid for gid in body.tag_ids if gid in valid_tag_ids))

    existing = [pt["tag_id"] for pt in db.task_tags if pt["task_id"] == task_id]
    added = [gid for gid in clean if gid not in existing]
    removed = [gid for gid in existing if gid not in clean]

    name_of = lambda gid: next((t["name"] for t in db.tags if t["id"] == gid), gid)
    if added:
        db.task_tags.extend({"task_id": task_id, "tag_id": gid} for gid in added)
        names = [name_of(gid) for gid in added]
        log_activity(
            db, task_id, user["id"], "task.tags_changed", {"added": names},
            f"added tag{'s' if len(names) > 1 else ''} " + ", ".join(f"'{n}'" for n in names),
        )
    if removed:
        db.task_tags = [pt for pt in db.task_tags if not (pt["task_id"] == task_id and pt["tag_id"] in removed)]
        names = [name_of(gid) for gid in removed]
        log_activity(
            db, task_id, user["id"], "task.tags_changed", {"removed": names},
            f"removed tag{'s' if len(names) > 1 else ''} " + ", ".join(f"'{n}'" for n in names),
        )
    task["updated_at"] = now_iso()
    await publish("board", board_id, "task_updated")
    return task_full(task)