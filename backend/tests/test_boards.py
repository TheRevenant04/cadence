from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth, login


def test_boards_require_auth(client: TestClient) -> None:
    assert client.get("/boards").status_code == 401


def test_list_active_boards_for_member(client: TestClient, alice: str) -> None:
    r = client.get("/boards", headers=auth(alice))
    assert r.status_code == 200
    boards = r.json()
    assert [b["name"] for b in boards] == ["Engineering Sprint", "Product Launch"]
    launch = next(b for b in boards if b["id"] == "b-launch")
    assert launch["role"] == "editor"
    assert launch["total_tasks"] == 8
    assert launch["overdue_tasks"] == 2
    assert launch["member_count"] == 3


def test_list_excludes_archived(client: TestClient, admin: str) -> None:
    r = client.get("/boards", headers=auth(admin))
    ids = [b["id"] for b in r.json()]
    assert "b-archive" not in ids


def test_archived_visible_to_owner_and_admin(client: TestClient, admin: str) -> None:
    r = client.get("/boards/archived", headers=auth(admin))
    assert [b["id"] for b in r.json()] == ["b-archive"]


def test_archived_empty_for_non_owners(client: TestClient, alice: str, bob: str) -> None:
    assert client.get("/boards/archived", headers=auth(alice)).json() == []
    assert client.get("/boards/archived", headers=auth(bob)).json() == []


def test_archived_board_403_for_non_member(client: TestClient, alice: str, bob: str) -> None:
    for token in (alice, bob):
        r = client.get("/boards/b-archive", headers=auth(token))
        assert r.status_code == 403
        assert r.json() == {"status": 403, "message": "You do not have access to this board"}


def test_archived_board_visible_to_admin(client: TestClient, admin: str) -> None:
    r = client.get("/boards/b-archive", headers=auth(admin))
    assert r.status_code == 200
    assert r.json()["name"] == "Q3 Planning"


def test_create_board_with_default_columns(client: TestClient) -> None:
    token = login(client, "admin@cadence.dev")
    r = client.post("/boards", headers=auth(token), json={"name": "  New Board  "})
    assert r.status_code == 200
    board = r.json()
    assert board["name"] == "New Board"
    assert board["role"] == "owner"
    board_id = board["id"]
    detail = client.get(f"/boards/{board_id}", headers=auth(token)).json()
    assert [c["name"] for c in detail["columns"]] == ["To Do", "In Progress", "Done"]


def test_create_board_with_custom_columns(client: TestClient) -> None:
    token = login(client, "alice@cadence.dev")
    r = client.post("/boards", headers=auth(token), json={"name": "Custom", "column_names": ["Backlog", "Done"]})
    assert r.status_code == 200
    detail = client.get(f"/boards/{r.json()['id']}", headers=auth(token)).json()
    assert [c["name"] for c in detail["columns"]] == ["Backlog", "Done"]


def test_create_board_blank_name(client: TestClient, alice: str) -> None:
    r = client.post("/boards", headers=auth(alice), json={"name": "   "})
    assert r.status_code == 400
    assert r.json()["message"] == "Board name is required"


def test_board_detail_shape(client: TestClient, alice: str) -> None:
    detail = client.get("/boards/b-launch", headers=auth(alice)).json()
    assert [c["name"] for c in detail["columns"]] == ["Backlog", "In Progress", "Review", "Done"]
    assert [t["name"] for t in detail["tags"]] == ["frontend", "backend", "design", "urgent", "docs"]
    members = [(m["email"], m["role"]) for m in detail["members"]]
    assert ("alice@cadence.dev", "editor") in members
    tasks = detail["tasks"]
    assert len(tasks) == 8
    assert tasks[0]["id"] == "t-1"
    assert tasks[0]["tags"][0]["name"] == "frontend"
    assert tasks[0]["assignee"]["email"] == "admin@cadence.dev"


def test_board_detail_requires_access(client: TestClient, carol: str) -> None:
    r = client.get("/boards/b-launch", headers=auth(carol))
    assert r.status_code == 403
    assert r.json()["message"] == "You do not have access to this board"


def test_rename_board_by_owner(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch", headers=auth(admin), json={"name": "Launch 2026"})
    assert r.status_code == 204
    assert client.get("/boards/b-launch", headers=auth(admin)).json()["name"] == "Launch 2026"


def test_rename_board_by_editor_forbidden(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-launch", headers=auth(alice), json={"name": "Hijacked"})
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to rename this board"


def test_rename_board_blank_name(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch", headers=auth(admin), json={"name": "  "})
    assert r.status_code == 400


def test_archive_and_unarchive(client: TestClient, admin: str, alice: str, bob: str) -> None:
    r = client.post("/boards/b-engine/archive", headers=auth(admin))
    assert r.status_code == 403  # admin is an editor on b-engine

    r = client.post("/boards/b-engine/archive", headers=auth(alice))
    assert r.status_code == 204
    assert client.get("/boards/b-engine", headers=auth(bob)).status_code == 404

    r = client.post("/boards/b-engine/unarchive", headers=auth(alice))
    assert r.status_code == 204
    assert client.get("/boards/b-engine", headers=auth(bob)).status_code == 200


def test_archive_by_editor_forbidden(client: TestClient, carol: str) -> None:
    r = client.post("/boards/b-engine/archive", headers=auth(carol))
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to archive this board"


def test_delete_board_by_owner(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-engine", headers=auth(alice))
    assert r.status_code == 204
    assert client.get("/boards/b-engine", headers=auth(alice)).status_code == 404
    ids = [b["id"] for b in client.get("/boards", headers=auth(alice)).json()]
    assert "b-engine" not in ids


def test_delete_board_by_admin(client: TestClient, admin: str) -> None:
    r = client.delete("/boards/b-engine", headers=auth(admin))
    assert r.status_code == 204


def test_delete_board_by_editor_forbidden(client: TestClient, carol: str) -> None:
    r = client.delete("/boards/b-engine", headers=auth(carol))
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to delete this board"


def test_board_stats(client: TestClient, alice: str) -> None:
    stats = client.get("/boards/b-launch/stats", headers=auth(alice)).json()
    assert stats["total_tasks"] == 8
    assert stats["overdue_tasks"] == 2
    by_name = {c["name"]: c["count"] for c in stats["per_column"]}
    assert by_name == {"Backlog": 3, "In Progress": 2, "Review": 2, "Done": 1}
    assignees = {a["label"]: a["count"] for a in stats["per_assignee"]}
    assert assignees == {"Unassigned": 3, "alice@cadence.dev": 3, "admin@cadence.dev": 2}


def test_invite_new_member(client: TestClient, admin: str, carol: str) -> None:
    r = client.post("/boards/b-launch/members", headers=auth(admin), json={"email": "carol@cadence.dev", "role": "editor"})
    assert r.status_code == 200
    members = r.json()
    assert ("carol@cadence.dev", "editor") in [(m["email"], m["role"]) for m in members]
    assert client.get("/boards/b-launch", headers=auth(carol)).status_code == 200


def test_invite_requires_owner(client: TestClient, bob: str) -> None:
    r = client.post("/boards/b-launch/members", headers=auth(bob), json={"email": "carol@cadence.dev", "role": "viewer"})
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to invite members"


def test_invite_invalid_role(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/members", headers=auth(admin), json={"email": "carol@cadence.dev", "role": "owner"})
    assert r.status_code == 400


def test_invite_unknown_user(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/members", headers=auth(admin), json={"email": "ghost@cadence.dev", "role": "viewer"})
    assert r.status_code == 404
    assert r.json()["message"] == 'No user found for "ghost@cadence.dev"'


def test_invite_self(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/members", headers=auth(admin), json={"email": "admin@cadence.dev", "role": "viewer"})
    assert r.status_code == 400
    assert r.json()["message"] == "You already own this board"


def test_invite_existing_updates_role(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-engine/members", headers=auth(alice), json={"email": "carol@cadence.dev", "role": "viewer"})
    assert r.status_code == 200
    carol = next(m for m in r.json() if m["email"] == "carol@cadence.dev")
    assert carol["role"] == "viewer"


def test_update_member_role(client: TestClient, alice: str, carol: str) -> None:
    r = client.patch("/boards/b-engine/members/u-carol", headers=auth(alice), json={"role": "viewer"})
    assert r.status_code == 204
    detail = client.get("/boards/b-engine", headers=auth(carol)).json()
    role = next(m["role"] for m in detail["members"] if m["user_id"] == "u-carol")
    assert role == "viewer"


def test_update_member_role_forbidden_for_non_owner(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-engine/members/u-carol", headers=auth(admin), json={"role": "viewer"})
    assert r.status_code == 403


def test_update_owner_role_forbidden(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-engine/members/u-alice", headers=auth(alice), json={"role": "viewer"})
    assert r.status_code == 400
    assert r.json()["message"] == "The owner role cannot be changed"


def test_update_member_role_not_found(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-engine/members/u-nobody", headers=auth(alice), json={"role": "viewer"})
    assert r.status_code == 404
    assert r.json()["message"] == "Member not found"


def test_remove_member(client: TestClient, alice: str, carol: str) -> None:
    r = client.delete("/boards/b-engine/members/u-carol", headers=auth(alice))
    assert r.status_code == 204
    r = client.get("/boards/b-engine", headers=auth(carol))
    assert r.status_code == 403
    assert r.json()["message"] == "You do not have access to this board"


def test_remove_member_unassigns_tasks(client: TestClient, alice: str) -> None:
    client.delete("/boards/b-engine/members/u-carol", headers=auth(alice))
    detail = client.get("/boards/b-engine", headers=auth(alice)).json()
    t9 = next(t for t in detail["tasks"] if t["id"] == "t-9")
    assert t9["assignee"] is None


def test_remove_owner_forbidden(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-engine/members/u-alice", headers=auth(alice))
    assert r.status_code == 400
    assert r.json()["message"] == "The owner cannot be removed"