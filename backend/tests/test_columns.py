from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth


def test_add_column(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/columns", headers=auth(admin), json={"name": "Ship It"})
    assert r.status_code == 200
    assert r.json()["position"] == 4
    assert r.json()["board_id"] == "b-launch"


def test_add_column_requires_owner(client: TestClient, alice: str) -> None:
    r = client.post("/boards/b-launch/columns", headers=auth(alice), json={"name": "Ship It"})
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to add columns"


def test_add_column_blank_name(client: TestClient, admin: str) -> None:
    r = client.post("/boards/b-launch/columns", headers=auth(admin), json={"name": "   "})
    assert r.status_code == 400
    assert r.json()["message"] == "Column name is required"


def test_rename_column(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/columns/c-b1", headers=auth(admin), json={"name": "Icebox"})
    assert r.status_code == 204
    detail = client.get("/boards/b-launch", headers=auth(admin)).json()
    assert detail["columns"][0]["name"] == "Icebox"


def test_rename_column_requires_owner(client: TestClient, alice: str) -> None:
    r = client.patch("/boards/b-launch/columns/c-b1", headers=auth(alice), json={"name": "Icebox"})
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to rename columns"


def test_rename_unknown_column(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/columns/c-nope", headers=auth(admin), json={"name": "Icebox"})
    assert r.status_code == 404
    assert r.json()["message"] == "Column not found"


def test_rename_column_blank_name(client: TestClient, admin: str) -> None:
    r = client.patch("/boards/b-launch/columns/c-b1", headers=auth(admin), json={"name": ""})
    assert r.status_code == 400


def test_remove_column_deletes_tasks(client: TestClient, admin: str) -> None:
    assert client.get("/boards/b-launch/tasks/t-7", headers=auth(admin)).status_code == 200
    r = client.delete("/boards/b-launch/columns/c-b4", headers=auth(admin))
    assert r.status_code == 204
    assert client.get("/boards/b-launch/tasks/t-7", headers=auth(admin)).status_code == 404
    detail = client.get("/boards/b-launch", headers=auth(admin)).json()
    assert [c["name"] for c in detail["columns"]] == ["Backlog", "In Progress", "Review"]


def test_remove_column_renumbers_positions(client: TestClient, admin: str) -> None:
    client.post("/boards/b-launch/columns", headers=auth(admin), json={"name": "Extra"})
    client.delete("/boards/b-launch/columns/c-b1", headers=auth(admin))
    detail = client.get("/boards/b-launch", headers=auth(admin)).json()
    assert [(c["name"], c["position"]) for c in detail["columns"]] == [
        ("In Progress", 0), ("Review", 1), ("Done", 2), ("Extra", 3),
    ]


def test_remove_column_requires_owner(client: TestClient, alice: str) -> None:
    r = client.delete("/boards/b-launch/columns/c-b4", headers=auth(alice))
    assert r.status_code == 403
    assert r.json()["message"] == "You need owner permissions to remove columns"