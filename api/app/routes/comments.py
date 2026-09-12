"""Task comments."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..authdeps import current_user
from ..db import db, uid, now_iso
from ..errors import ApiError
from ..realtime import publish
from ..schemas import CommentInput
from ..services import board_access, can_edit, find_board_id_for_task, log_activity, user_pure

router = APIRouter(tags=["comments"])


@router.post("/tasks/{task_id}/comments")
async def comments_create(task_id: str, body: CommentInput, user: dict = Depends(current_user)):
    board_id = find_board_id_for_task(task_id)
    board, role = board_access(user["id"], board_id)
    if not can_edit(role):
        raise ApiError(403, "Viewers cannot comment")
    clean = body.content.strip()
    if not clean:
        raise ApiError(400, "Comment cannot be empty")
    now = now_iso()
    comment = {
        "id": uid(),
        "task_id": task_id,
        "user_id": user["id"],
        "content": clean,
        "created_at": now,
        "updated_at": now,
    }
    db.comments.append(comment)
    log_activity(db, task_id, user["id"], "comment.added", {}, "added a comment")
    await publish("board", board_id, "comment_added")
    return {**comment, "user": user_pure(user)}


@router.patch("/comments/{comment_id}")
async def comments_update(comment_id: str, body: CommentInput, user: dict = Depends(current_user)):
    comment = next((c for c in db.comments if c["id"] == comment_id), None)
    if not comment:
        raise ApiError(404, "Comment not found")
    board_id = find_board_id_for_task(comment["task_id"])
    board, role = board_access(user["id"], board_id)
    is_owner = role == "owner"
    if comment["user_id"] != user["id"] and not is_owner and not user["is_admin"]:
        raise ApiError(403, "You can only edit your own comments")
    if not can_edit(role):
        raise ApiError(403, "Viewers cannot edit comments")
    clean = body.content.strip()
    if not clean:
        raise ApiError(400, "Comment cannot be empty")
    comment["content"] = clean
    comment["updated_at"] = now_iso()
    log_activity(db, comment["task_id"], user["id"], "comment.edited", {}, "edited a comment")
    await publish("board", board_id, "comment_edited")
    author = next((u for u in db.users if u["id"] == comment["user_id"]), user)
    return {**comment, "user": user_pure(author)}


@router.delete("/comments/{comment_id}", status_code=204)
async def comments_delete(comment_id: str, user: dict = Depends(current_user)):
    comment = next((c for c in db.comments if c["id"] == comment_id), None)
    if not comment:
        raise ApiError(404, "Comment not found")
    board_id = find_board_id_for_task(comment["task_id"])
    board, role = board_access(user["id"], board_id)
    is_owner = role == "owner"
    if comment["user_id"] != user["id"] and not is_owner and not user["is_admin"]:
        raise ApiError(403, "You can only delete your own comments")
    db.comments = [c for c in db.comments if c["id"] != comment_id]
    log_activity(db, comment["task_id"], user["id"], "comment.deleted", {}, "deleted a comment")
    await publish("board", board_id, "comment_deleted")