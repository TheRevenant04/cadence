"""Request body models, matching `openapi.yaml` component schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

BoardRole = Literal["owner", "editor", "viewer"]
InviteRole = Literal["editor", "viewer"]


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class BoardCreateInput(BaseModel):
    name: str
    column_names: list[str] | None = None


class BoardRenameInput(BaseModel):
    name: str


class InviteInput(BaseModel):
    email: str
    role: InviteRole


class MemberRoleInput(BaseModel):
    role: BoardRole


class ColumnNameInput(BaseModel):
    name: str


class TagCreateInput(BaseModel):
    name: str
    color: str | None = None


class TagIdsInput(BaseModel):
    tag_ids: list[str] = Field(default_factory=list)


class TaskCreateInput(BaseModel):
    column_id: str
    title: str
    description: str | None = None
    due_date: str | None = None
    assignee_id: str | None = None
    tag_ids: list[str] | None = None


class TaskUpdateInput(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: str | None = None
    assignee_id: str | None = None


class TaskMoveInput(BaseModel):
    column_id: str
    before_task_id: str | None = None
    after_task_id: str | None = None


class CommentInput(BaseModel):
    content: str


class UserActiveInput(BaseModel):
    active: bool