"""Task comments."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_user
from ..database import get_session
from ..db import uid
from ..errors import ApiError
from ..models import Comment, User
from ..realtime import publish
from ..schemas import CommentInput
from ..services import board_access, can_edit, dt_iso, find_board_id_for_task, log_activity, user_pure

router = APIRouter(tags=["comments"])


def _comment_pure(c: Comment) -> dict:
    return {
        "id": c.id,
        "task_id": c.task_id,
        "user_id": c.user_id,
        "content": c.content,
        "created_at": dt_iso(c.created_at),
        "updated_at": dt_iso(c.updated_at),
    }


@router.post("/tasks/{task_id}/comments")
async def comments_create(
    task_id: str, body: CommentInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    board_id = await find_board_id_for_task(session, task_id)
    board, role = await board_access(session, user.id, board_id)
    if not can_edit(role):
        raise ApiError(403, "Viewers cannot comment")
    clean = body.content.strip()
    if not clean:
        raise ApiError(400, "Comment cannot be empty")
    now = datetime.now(timezone.utc)
    comment = Comment(id=uid(), task_id=task_id, user_id=user.id, content=clean, created_at=now, updated_at=now)
    session.add(comment)
    await log_activity(session, task_id, user.id, "comment.added", {}, "added a comment")
    await publish("board", board_id, "comment_added")
    return {**_comment_pure(comment), "user": user_pure(user)}


@router.patch("/comments/{comment_id}")
async def comments_update(
    comment_id: str, body: CommentInput, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> Any:
    comment = await session.get(Comment, comment_id)
    if not comment:
        raise ApiError(404, "Comment not found")
    board_id = await find_board_id_for_task(session, comment.task_id)
    board, role = await board_access(session, user.id, board_id)
    is_owner = role == "owner"
    if comment.user_id != user.id and not is_owner and not user.is_admin:
        raise ApiError(403, "You can only edit your own comments")
    if not can_edit(role):
        raise ApiError(403, "Viewers cannot edit comments")
    clean = body.content.strip()
    if not clean:
        raise ApiError(400, "Comment cannot be empty")
    comment.content = clean
    comment.updated_at = datetime.now(timezone.utc)
    await log_activity(session, comment.task_id, user.id, "comment.edited", {}, "edited a comment")
    await publish("board", board_id, "comment_edited")
    author = await session.get(User, comment.user_id) or user
    return {**_comment_pure(comment), "user": user_pure(author)}


@router.delete("/comments/{comment_id}", status_code=204)
async def comments_delete(
    comment_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> None:
    comment = await session.get(Comment, comment_id)
    if not comment:
        raise ApiError(404, "Comment not found")
    board_id = await find_board_id_for_task(session, comment.task_id)
    board, role = await board_access(session, user.id, board_id)
    is_owner = role == "owner"
    if comment.user_id != user.id and not is_owner and not user.is_admin:
        raise ApiError(403, "You can only delete your own comments")
    await session.execute(delete(Comment).where(Comment.id == comment_id))
    await log_activity(session, comment.task_id, user.id, "comment.deleted", {}, "deleted a comment")
    await publish("board", board_id, "comment_deleted")