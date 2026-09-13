from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth


def _last_column_tasks(client: TestClient, token: str, column_id: str) -> list[dict]:
    board = client.get(
        "/boards/b-launch",
        headers=auth(token),
        params={},
    ).json()
    return sorted(
        (t for t in board["tasks"] if t["column_id"] == column_id),
        key=lambda t: int(t["rank"]),
    )


def test_create_task(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(alice), json={
        "column_id": "c-b1",
        "title": "Write backend tests",
        "description": "Endpoint coverage",
        "tag_ids": ["g-b1"],
    })
    assert r.status_code == 200
    task = r.json()
    assert task["title"] == "Write backend tests"
    assert task["description"] == "Endpoint coverage"
    assert [t["name"] for t in task["tags"]] == ["frontend"]
    assert task["assignee"] is None
    assert len(task["rank"]) == 10 and task["rank"].isdecimal()


def test_create_task_appends_to_end(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(alice), json={"column_id": "c-b1", "title": "Last task"})
    task = r.json()
    ranks = _last_column_tasks(client, alice, "c-b1")
    assert int(task["rank"]) > max(int(t["rank"]) for t in ranks if t["id"] != task["id"])


def test_create_task_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(bob), json={"column_id": "c-b1", "title": "Nope"})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot create tasks"


def test_create_task_blank_title(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(alice), json={"column_id": "c-b1", "title": "   "})
    assert r.status_code == 400
    assert r.json()["message"] == "Task title is required"


def test_create_task_invalid_column(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(alice), json={"column_id": "c-e1", "title": "Cross board"})
    assert r.status_code == 400
    assert r.json()["message"] == "Choose a valid column"


def test_create_task_assignee_not_member(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(admin), json={
        "column_id": "c-b1", "title": "Task", "assignee_id": "u-carol",
    })
    assert r.status_code == 400
    assert r.json()["message"] == "Assignee must be a member of this board"


def test_create_task_assignee_self(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(admin), json={
        "column_id": "c-b1", "title": "Task", "assignee_id": "u-admin",
    })
    assert r.status_code == 200
    assert r.json()["assignee"]["email"] == "admin@cadence.dev"


def test_create_task_foreign_tag(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tasks", headers=auth(alice), json={
        "column_id": "c-b1", "title": "Task", "tag_ids": ["g-e1"],
    })
    assert r.status_code == 400
    assert r.json()["message"] == "One or more tags are not part of this board"


def test_create_task_logs_activity(client: TestClient, alice: str) -> None:
    task = client.post("/boards/b-launch/tasks", headers=auth(alice), json={
        "column_id": "c-b2", "title": "Fresh task", "due_date": "2027-01-01", "assignee_id": "u-admin",
    }).json()
    detail = client.get(f"/boards/b-launch/tasks/{task['id']}", headers=auth(alice)).json()
    messages = [a["human_readable_message"] for a in detail["activity"]]
    assert "created this task" in messages
    assert "assigned this task to admin@cadence.dev" in messages
    assert "set the due date to 2027-01-01" in messages


def test_get_task_detail(client: TestClient, admin: str) -> None:
    detail = client.get("/boards/b-launch/tasks/t-1", headers=auth(admin)).json()
    assert detail["title"] == "Drag & drop between columns"
    assert [t["name"] for t in detail["tags"]] == ["frontend", "urgent"]
    assert detail["assignee"]["email"] == "admin@cadence.dev"
    assert [c["id"] for c in detail["comments"]] == ["cm-1", "cm-2", "cm-3"]
    assert detail["comments"][0]["user"]["email"] == "alice@cadence.dev"
    assert detail["activity"][0]["action_type"] == "comment.added"
    assert detail["activity"][0]["user"]["email"] == "alice@cadence.dev"


def test_get_task_missing(client: TestClient, admin: str) -> None:
    r = client.get("/boards/b-launch/tasks/t-nope", headers=auth(admin))
    assert r.status_code == 404
    assert r.json()["message"] == "Task not found"


def test_get_task_forbidden_without_access(client: TestClient, carol: str) -> None:
    r = client.get("/boards/b-launch/tasks/t-1", headers=auth(carol))
    assert r.status_code == 403


def test_update_title(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-2", headers=auth(alice), json={"title": "JWT auth"})
    assert r.status_code == 200
    assert r.json()["title"] == "JWT auth"
    detail = client.get("/boards/b-launch/tasks/t-2", headers=auth(alice)).json()
    activity = detail["activity"]
    assert activity[0]["action_type"] == "task.title_changed"
    assert activity[0]["action_details"] == {"from": "Migrate auth to JWT cookies", "to": "JWT auth"}


def test_update_description_clears(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(admin), json={"description": None})
    assert r.status_code == 200
    assert r.json()["description"] is None
    detail = client.get("/boards/b-launch/tasks/t-4", headers=auth(admin)).json()
    assert detail["activity"][0]["action_type"] == "task.description_changed"


def test_update_due_date(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(alice), json={"due_date": "2026-12-01"})
    assert r.status_code == 200
    assert r.json()["due_date"] == "2026-12-01"
    detail = client.get("/boards/b-launch/tasks/t-4", headers=auth(alice)).json()
    assert detail["activity"][0]["human_readable_message"] == "set the due date to 2026-12-01"


def test_update_assignee(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(admin), json={"assignee_id": "u-alice"})
    assert r.status_code == 200
    assert r.json()["assignee"]["email"] == "alice@cadence.dev"
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(admin), json={"assignee_id": None})
    assert r.status_code == 200
    assert r.json()["assignee"] is None


def test_update_assignee_preserves_mock_parity(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(admin), json={"assignee_id": "u-carol"})
    assert r.status_code == 200
    assert r.json()["assignee"]["email"] == "carol@cadence.dev"
    r = client.patch("/boards/b-launch/tasks/t-4", headers=auth(admin), json={"assignee_id": "u-nobody"})
    assert r.status_code == 400
    assert r.json()["message"] == "Assignee must be a member of this board"


def test_update_blank_title(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-2", headers=auth(alice), json={"title": " "})
    assert r.status_code == 400


def test_update_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.patch("/boards/b-launch/tasks/t-2", headers=auth(bob), json={"title": "Nope"})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot edit tasks"


def test_move_between_columns(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-1/move", headers=auth(admin), json={"column_id": "c-b1"})
    assert r.status_code == 200
    task = r.json()
    assert task["column_id"] == "c-b1"
    detail = client.get("/boards/b-launch/tasks/t-1", headers=auth(admin)).json()
    top = detail["activity"][0]
    assert top["action_type"] == "task.moved"
    assert top["action_details"] == {"from": "In Progress", "to": "Backlog"}


def test_move_within_column_after(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-2/move", headers=auth(admin), json={
        "column_id": "c-b1", "after_task_id": "t-3",
    })
    assert r.status_code == 200
    detail = client.get("/boards/b-launch/tasks/t-2", headers=auth(admin)).json()
    assert detail["activity"][0]["action_type"] == "task.reordered"
    ranks = {t["id"]: int(t["rank"]) for t in _last_column_tasks(client, admin, "c-b1")}
    assert ranks["t-3"] < ranks["t-2"] < ranks["t-4"]


def test_move_within_column_before(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-2/move", headers=auth(admin), json={
        "column_id": "c-b1", "before_task_id": "t-3",
    })
    assert r.status_code == 200
    ranks = {t["id"]: int(t["rank"]) for t in _last_column_tasks(client, admin, "c-b1")}
    assert ranks["t-2"] < ranks["t-3"]


def test_move_to_invalid_column(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-1/move", headers=auth(admin), json={"column_id": "c-e1"})
    assert r.status_code == 400
    assert r.json()["message"] == "Target column not found on this board"


def test_move_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-1/move", headers=auth(bob), json={"column_id": "c-b1"})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot move tasks"


def test_move_missing_task(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tasks/t-nope/move", headers=auth(admin), json={"column_id": "c-b1"})
    assert r.status_code == 404


def test_delete_task(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-launch/tasks/t-14", headers=auth(alice))
    assert r.status_code == 204
    assert client.get("/boards/b-launch/tasks/t-14", headers=auth(alice)).status_code == 404


def test_delete_task_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.delete("/boards/b-launch/tasks/t-14", headers=auth(bob))
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot delete tasks"


def test_delete_task_missing(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-launch/tasks/t-nope", headers=auth(alice))
    assert r.status_code == 404


def test_set_tags_adds(client: TestClient, alice: str) -> None:
    r = client.put("/boards/b-launch/tasks/t-8/tags", headers=auth(alice), json={"tag_ids": ["g-b5", "g-b4"]})
    assert r.status_code == 200
    assert [t["name"] for t in r.json()["tags"]] == ["docs", "urgent"]
    detail = client.get("/boards/b-launch/tasks/t-8", headers=auth(alice)).json()
    assert detail["activity"][0]["human_readable_message"] == "added tag 'urgent'"


def test_set_tags_removes_and_dedupes(client: TestClient, alice: str) -> None:
    r = client.put("/boards/b-launch/tasks/t-1/tags", headers=auth(alice), json={"tag_ids": []})
    assert r.status_code == 200
    assert r.json()["tags"] == []
    detail = client.get("/boards/b-launch/tasks/t-1", headers=auth(alice)).json()
    assert "removed tags 'frontend', 'urgent'" in [a["human_readable_message"] for a in detail["activity"]]


def test_set_tags_ignores_foreign_ids(client: TestClient, alice: str) -> None:
    r = client.put("/boards/b-launch/tasks/t-8/tags", headers=auth(alice), json={"tag_ids": ["g-e1"]})
    assert r.status_code == 200
    assert r.json()["tags"] == []


def test_set_tags_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.put("/boards/b-launch/tasks/t-8/tags", headers=auth(bob), json={"tag_ids": ["g-b5"]})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot change tags"