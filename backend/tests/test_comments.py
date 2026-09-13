from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth


def test_create_comment(client: TestClient, alice: str) -> None:
    r = client.post("/tasks/t-1/comments", headers=auth(alice), json={"content": "Looks good"})
    assert r.status_code == 200
    comment = r.json()
    assert comment["content"] == "Looks good"
    assert comment["user"]["email"] == "alice@cadence.dev"
    assert comment["user_id"] == "u-alice"
    detail = client.get("/boards/b-launch/tasks/t-1", headers=auth(alice)).json()
    assert detail["comments"][-1]["id"] == comment["id"]


def test_create_comment_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.post("/tasks/t-1/comments", headers=auth(bob), json={"content": "Hello"})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot comment"


def test_create_comment_blank(client: TestClient, alice: str) -> None:
    r = client.post("/tasks/t-1/comments", headers=auth(alice), json={"content": "   "})
    assert r.status_code == 400
    assert r.json()["message"] == "Comment cannot be empty"


def test_create_comment_missing_task(client: TestClient, alice: str) -> None:
    r = client.post("/tasks/t-nope/comments", headers=auth(alice), json={"content": "Hello"})
    assert r.status_code == 404
    assert r.json()["message"] == "Task not found"


def test_update_own_comment(client: TestClient, alice: str) -> None:
    r = client.patch("/comments/cm-1", headers=auth(alice), json={"content": "Updated comment"})
    assert r.status_code == 200
    assert r.json()["content"] == "Updated comment"
    assert r.json()["updated_at"] != r.json()["created_at"]


def test_update_others_comment_as_editor(client: TestClient, alice: str) -> None:
    r = client.patch("/comments/cm-2", headers=auth(alice), json={"content": "Snoop"})
    assert r.status_code == 403
    assert r.json()["message"] == "You can only edit your own comments"


def test_update_comment_as_board_owner(client: TestClient, alice: str) -> None:
    r = client.patch("/comments/cm-1", headers=auth(alice), json={"content": "Edited by owner"})
    assert r.status_code == 200


def test_update_own_comment_as_viewer_forbidden(client: TestClient, bob: str) -> None:
    r = client.patch("/comments/cm-3", headers=auth(bob), json={"content": "My own words"})
    assert r.status_code == 403
    assert r.json()["message"] == "Viewers cannot edit comments"


def test_update_comment_as_admin(client: TestClient, admin: str) -> None:
    r = client.patch("/comments/cm-1", headers=auth(admin), json={"content": "Admin edit"})
    assert r.status_code == 200
    assert r.json()["content"] == "Admin edit"


def test_update_comment_blank(client: TestClient, alice: str) -> None:
    r = client.patch("/comments/cm-1", headers=auth(alice), json={"content": ""})
    assert r.status_code == 400


def test_update_comment_missing(client: TestClient, alice: str) -> None:
    r = client.patch("/comments/cm-nope", headers=auth(alice), json={"content": "Hello"})
    assert r.status_code == 404
    assert r.json()["message"] == "Comment not found"


def test_delete_own_comment(client: TestClient, alice: str) -> None:
    r = client.delete("/comments/cm-1", headers=auth(alice))
    assert r.status_code == 204
    detail = client.get("/boards/b-launch/tasks/t-1", headers=auth(alice)).json()
    assert [c["id"] for c in detail["comments"]] == ["cm-2", "cm-3"]


def test_delete_viewer_own_comment(client: TestClient, bob: str) -> None:
    r = client.delete("/comments/cm-3", headers=auth(bob))
    assert r.status_code == 204


def test_delete_others_comment_as_member(client: TestClient, alice: str) -> None:
    r = client.delete("/comments/cm-3", headers=auth(alice))
    assert r.status_code == 403
    assert r.json()["message"] == "You can only delete your own comments"


def test_delete_comment_as_owner(client: TestClient, alice: str, admin: str) -> None:
    created = client.post("/tasks/t-9/comments", headers=auth(admin), json={"content": "Note"}).json()
    r = client.delete(f"/comments/{created['id']}", headers=auth(alice))
    assert r.status_code == 204


def test_delete_comment_missing(client: TestClient, alice: str) -> None:
    r = client.delete("/comments/cm-nope", headers=auth(alice))
    assert r.status_code == 404
    assert r.json()["message"] == "Comment not found"