"""In-memory mock database for Cadence v1.

Mirrors the seed data and record shapes of `frontend/src/api/db.ts` so the
behaviour of the HTTP API matches the frontend's mock backend. Records are
plain dicts; timestamps are ISO-8601 strings. Sessions and reset tokens are
kept in this store too. This module will be replaced by PostgreSQL later.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

DEMO_PASSWORD = "Password123!"
DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"]
TAG_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"]


def uid() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def iso_offset(offset_ms: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(milliseconds=offset_ms)).isoformat()


def date_only(days_from_now: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days_from_now)).isoformat()


def pad_seed(n: int) -> str:
    return str(n).zfill(10)


def _seed() -> dict[str, Any]:
    def iso(days: int) -> str:
        return iso_offset(-days * 24 * 3600 * 1000)

    users = [
        {"id": "u-admin", "email": "admin@cadence.dev", "is_admin": True, "is_active": True,
         "password_hash": f"mock:{DEMO_PASSWORD}", "created_at": iso(90), "updated_at": iso(90)},
        {"id": "u-alice", "email": "alice@cadence.dev", "is_admin": False, "is_active": True,
         "password_hash": f"mock:{DEMO_PASSWORD}", "created_at": iso(80), "updated_at": iso(80)},
        {"id": "u-bob", "email": "bob@cadence.dev", "is_admin": False, "is_active": True,
         "password_hash": f"mock:{DEMO_PASSWORD}", "created_at": iso(45), "updated_at": iso(45)},
        {"id": "u-carol", "email": "carol@cadence.dev", "is_admin": False, "is_active": True,
         "password_hash": f"mock:{DEMO_PASSWORD}", "created_at": iso(20), "updated_at": iso(20)},
    ]

    boards = [
        {"id": "b-launch", "name": "Product Launch", "owner_id": "u-admin", "is_archived": False, "created_at": iso(30), "updated_at": iso(30)},
        {"id": "b-engine", "name": "Engineering Sprint", "owner_id": "u-alice", "is_archived": False, "created_at": iso(14), "updated_at": iso(14)},
        {"id": "b-archive", "name": "Q3 Planning", "owner_id": "u-admin", "is_archived": True, "created_at": iso(120), "updated_at": iso(120)},
    ]

    members = [
        {"board_id": "b-launch", "user_id": "u-admin", "role": "owner"},
        {"board_id": "b-launch", "user_id": "u-alice", "role": "editor"},
        {"board_id": "b-launch", "user_id": "u-bob", "role": "viewer"},
        {"board_id": "b-engine", "user_id": "u-alice", "role": "owner"},
        {"board_id": "b-engine", "user_id": "u-admin", "role": "editor"},
        {"board_id": "b-engine", "user_id": "u-bob", "role": "viewer"},
        {"board_id": "b-engine", "user_id": "u-carol", "role": "editor"},
        {"board_id": "b-archive", "user_id": "u-admin", "role": "owner"},
    ]

    def col(cid: str, board_id: str, name: str, position: int) -> dict[str, Any]:
        return {"id": cid, "board_id": board_id, "name": name, "position": position,
                "created_at": iso(29), "updated_at": iso(29)}

    columns = [
        col("c-b1", "b-launch", "Backlog", 0),
        col("c-b2", "b-launch", "In Progress", 1),
        col("c-b3", "b-launch", "Review", 2),
        col("c-b4", "b-launch", "Done", 3),
        col("c-e1", "b-engine", "To Do", 0),
        col("c-e2", "b-engine", "Doing", 1),
        col("c-e3", "b-engine", "Done", 2),
    ]

    def tag(gid: str, board_id: str, name: str, color: str) -> dict[str, Any]:
        return {"id": gid, "board_id": board_id, "name": name, "color": color}

    tags = [
        tag("g-b1", "b-launch", "frontend", "#6366f1"),
        tag("g-b2", "b-launch", "backend", "#0ea5e9"),
        tag("g-b3", "b-launch", "design", "#ec4899"),
        tag("g-b4", "b-launch", "urgent", "#ef4444"),
        tag("g-b5", "b-launch", "docs", "#10b981"),
        tag("g-e1", "b-engine", "api", "#0ea5e9"),
        tag("g-e2", "b-engine", "frontend", "#6366f1"),
        tag("g-e3", "b-engine", "tests", "#f59e0b"),
    ]

    def task(tid: str, column_id: str, title: str, rank_idx: int,
             opts: dict[str, Any] | None = None) -> dict[str, Any]:
        o = opts or {}
        ts = iso_offset(-(6 * 24 * 3600 + rank_idx * 3600) * 1000)
        return {
            "id": tid, "column_id": column_id, "title": title,
            "description": o.get("description"),
            "due_date": o.get("due"),
            "assignee_id": o.get("assignee"),
            "rank": pad_seed(rank_idx),
            "created_at": ts,
            "updated_at": ts,
        }

    tasks = [
        task("t-1", "c-b2", "Drag & drop between columns", 1, {
            "description": "Tasks should move **within** and **between** columns with a slick drop indicator.",
            "due": date_only(-1),
            "assignee": "u-admin",
        }),
        task("t-2", "c-b1", "Migrate auth to JWT cookies", 1, {
            "description": "Store the JWT in an HttpOnly cookie and enable CSRF protection.",
            "due": date_only(5),
            "assignee": "u-alice",
        }),
        task("t-3", "c-b1", "Design invite flow screens", 3, {
            "description": "Invite editors/viewers by searching existing users.",
            "assignee": "u-alice",
        }),
        task("t-4", "c-b1", "Set up pgvector extension", 5, {
            "description": "Enable the extension in migrations; unused in v1 but required for compatibility.",
        }),
        task("t-5", "c-b2", "Lexorank position model", 2, {
            "description": "Use sparse lexorank-style ranks for task ordering.",
            "assignee": "u-admin",
        }),
        task("t-6", "c-b3", "Onboarding tour copy", 1, {
            "description": "Write the one-time guided tour steps. Include a persistent help button.",
            "due": date_only(2),
            "assignee": "u-alice",
        }),
        task("t-7", "c-b4", "Docker compose skeleton", 1, {
            "description": "api, web, db and backup services with dev/prod profiles.",
        }),
        task("t-8", "c-b3", "Board stats summary panel", 3, {
            "description": "Total, overdue, per-column, per-assignee and per-tag breakdowns.",
            "due": date_only(-3),
        }),
        task("t-9", "c-e1", "Integration tests for tasks API", 1, {
            "description": "Cover create, edit, move, delete and tag changes against the activity log.",
            "assignee": "u-carol",
        }),
        task("t-10", "c-e1", "Search + filter endpoint", 4, {
            "description": "Text search on titles and descriptions plus tag/assignee filters.",
            "due": date_only(4),
        }),
        task("t-11", "c-e2", "Comment edit/delete", 2, {
            "description": "Allow authors to edit and remove their own comments.",
            "assignee": "u-carol",
        }),
        task("t-12", "c-e2", "Mock password reset flow", 5, {
            "description": "Produce reset tokens and log the reset link.",
        }),
        task("t-13", "c-e3", "Project scaffold", 1, {}),
        task("t-14", "c-e3", "CI pipeline config", 2, {"assignee": "u-admin"}),
    ]

    task_tags = [
        {"task_id": "t-1", "tag_id": "g-b1"},
        {"task_id": "t-1", "tag_id": "g-b4"},
        {"task_id": "t-2", "tag_id": "g-b2"},
        {"task_id": "t-2", "tag_id": "g-b4"},
        {"task_id": "t-3", "tag_id": "g-b3"},
        {"task_id": "t-4", "tag_id": "g-b2"},
        {"task_id": "t-5", "tag_id": "g-b2"},
        {"task_id": "t-6", "tag_id": "g-b3"},
        {"task_id": "t-7", "tag_id": "g-b2"},
        {"task_id": "t-8", "tag_id": "g-b5"},
        {"task_id": "t-9", "tag_id": "g-e1"},
        {"task_id": "t-9", "tag_id": "g-e3"},
        {"task_id": "t-10", "tag_id": "g-e1"},
        {"task_id": "t-11", "tag_id": "g-e1"},
        {"task_id": "t-13", "tag_id": "g-e2"},
        {"task_id": "t-13", "tag_id": "g-e1"},
    ]

    def comment(cid: str, task_id: str, user_id: str, content: str, days_ago: int) -> dict[str, Any]:
        ts = iso(days_ago)
        return {"id": cid, "task_id": task_id, "user_id": user_id, "content": content,
                "created_at": ts, "updated_at": ts}

    comments = [
        comment("cm-1", "t-1", "u-alice", "Can we show a **ghost card** while dragging? Feels much more polished.", 5),
        comment("cm-2", "t-1", "u-admin", "Yes — plan is to use a translucent card with a drop line **before/after** the hovered card.", 4),
        comment("cm-3", "t-1", "u-bob", "E2E for drag-drop is deferred, but happy to review the interactions.", 2),
    ]

    def ml(task_ids, user_id, action_type, details, message, mins_ago: int) -> list[dict[str, Any]]:
        ids = task_ids if isinstance(task_ids, list) else [task_ids]
        out = []
        for i, tid in enumerate(ids):
            out.append({
                "id": uid(), "task_id": tid, "user_id": user_id, "action_type": action_type,
                "action_details": details, "human_readable_message": message,
                "created_at": iso_offset(-mins_ago * 60 * 1000 - i * 60 * 1000),
            })
        return out

    activity = [
        *ml(["t-2", "t-3", "t-4", "t-5", "t-6", "t-7", "t-8", "t-1"], "u-admin", "task.created", {}, "created this task", 8640),
        *ml("t-1", "u-admin", "task.moved", {"from": "Backlog", "to": "In Progress"}, "moved this task from 'Backlog' to 'In Progress'", 7200),
        *ml("t-1", "u-admin", "task.assignee_changed", {"from": None, "to": "admin@cadence.dev"}, "assigned this task to admin@cadence.dev", 7000),
        *ml("t-1", "u-admin", "task.due_date_changed", {"from": None, "to": date_only(-1)}, f"set the due date to {date_only(-1)}", 6980),
        *ml("t-1", "u-admin", "task.tags_changed", {"added": ["urgent"]}, "added tag 'urgent'", 6900),
        *ml("t-1", "u-alice", "comment.added", {}, "added a comment", 7200),
        *ml("t-1", "u-admin", "task.edited", {"fields": ["description"]}, "edited the description", 6800),
        *ml("t-1", "u-bob", "comment.added", {}, "added a comment", 2880),
        *ml("t-1", "u-alice", "comment.added", {}, "added a comment", 100),
    ]

    return {
        "version": 1,
        "users": users,
        "boards": boards,
        "members": members,
        "columns": columns,
        "tags": tags,
        "tasks": tasks,
        "task_tags": task_tags,
        "comments": comments,
        "activity": activity,
        "resets": [],
        "sessions": {},
        "seq": 100,
    }


class Database:
    """A single mutable in-memory store shared by all route handlers."""

    def __init__(self) -> None:
        self.data: dict[str, Any] = _seed()

    def reset(self) -> None:
        self.data = _seed()

    # Convenience accessors -------------------------------------------------
    @property
    def users(self) -> list[dict[str, Any]]:
        return self.data["users"]

    @users.setter
    def users(self, value: list[dict[str, Any]]) -> None:
        self.data["users"] = value

    @property
    def boards(self) -> list[dict[str, Any]]:
        return self.data["boards"]

    @boards.setter
    def boards(self, value: list[dict[str, Any]]) -> None:
        self.data["boards"] = value

    @property
    def members(self) -> list[dict[str, Any]]:
        return self.data["members"]

    @members.setter
    def members(self, value: list[dict[str, Any]]) -> None:
        self.data["members"] = value

    @property
    def columns(self) -> list[dict[str, Any]]:
        return self.data["columns"]

    @columns.setter
    def columns(self, value: list[dict[str, Any]]) -> None:
        self.data["columns"] = value

    @property
    def tags(self) -> list[dict[str, Any]]:
        return self.data["tags"]

    @tags.setter
    def tags(self, value: list[dict[str, Any]]) -> None:
        self.data["tags"] = value

    @property
    def tasks(self) -> list[dict[str, Any]]:
        return self.data["tasks"]

    @tasks.setter
    def tasks(self, value: list[dict[str, Any]]) -> None:
        self.data["tasks"] = value

    @property
    def task_tags(self) -> list[dict[str, Any]]:
        return self.data["task_tags"]

    @task_tags.setter
    def task_tags(self, value: list[dict[str, Any]]) -> None:
        self.data["task_tags"] = value

    @property
    def comments(self) -> list[dict[str, Any]]:
        return self.data["comments"]

    @comments.setter
    def comments(self, value: list[dict[str, Any]]) -> None:
        self.data["comments"] = value

    @property
    def activity(self) -> list[dict[str, Any]]:
        return self.data["activity"]

    @activity.setter
    def activity(self, value: list[dict[str, Any]]) -> None:
        self.data["activity"] = value

    @property
    def resets(self) -> list[dict[str, Any]]:
        return self.data["resets"]

    @property
    def sessions(self) -> dict[str, str]:
        return self.data["sessions"]


db = Database()