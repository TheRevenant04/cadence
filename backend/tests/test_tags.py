from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth


def test_add_tag_with_color(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tags", headers=auth(admin), json={"name": "bug", "color": "#123456"})
    assert r.status_code == 200
    tag = r.json()
    assert tag["name"] == "bug"
    assert tag["color"] == "#123456"
    assert tag["board_id"] == "b-launch"


def test_add_tag_default_color(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tags", headers=auth(admin), json={"name": "ops"})
    assert r.status_code == 200
    assert r.json()["color"] is not None


def test_add_duplicate_tag_case_insensitive(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tags", headers=auth(admin), json={"name": "FRONTEND"})
    assert r.status_code == 409
    assert r.json()["message"] == "A tag with this name already exists"


def test_add_tag_requires_owner(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/tags", headers=auth(alice), json={"name": "bug"})
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to manage tags"


def test_add_tag_blank_name(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/tags", headers=auth(admin), json={"name": "  "})
    assert r.status_code == 400
    assert r.json()["message"] == "Tag name is required"


def test_remove_tag_removes_from_tasks(client: TestClient, admin: str) -> None:
    before = client.get("/boards/b-launch/tasks/t-1", headers=auth(admin)).json()
    assert [t["name"] for t in before["tags"]] == ["frontend", "urgent"]

    r = client.delete("/boards/b-launch/tags/g-b1", headers=auth(admin))
    assert r.status_code == 204

    after = client.get("/boards/b-launch/tasks/t-1", headers=auth(admin)).json()
    assert [t["name"] for t in after["tags"]] == ["urgent"]
    detail = client.get("/boards/b-launch", headers=auth(admin)).json()
    assert "g-b1" not in [t["id"] for t in detail["tags"]]


def test_remove_tag_requires_owner(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-launch/tags/g-b1", headers=auth(alice))
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to manage tags"


def test_remove_unknown_tag(client: TestClient, admin: str) -> None:
    r = client.delete("/boards/b-launch/tags/g-nope", headers=auth(admin))
    assert r.status_code == 404
    assert r.json()["message"] == "Tag not found"