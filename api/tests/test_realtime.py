from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import auth, login


def test_realtime_receives_task_created(client: TestClient) -> None:
    token = login(client, "alice@cadence.dev")
    with client.websocket_connect("/realtime") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "authed", "ok": True}

        ws.send_json({"type": "subscribe", "board_id": "b-launch"})
        assert ws.receive_json() == {"type": "subscribed", "board_id": "b-launch"}

        r = client.post(
            "/boards/b-launch/tasks",
            headers=auth(token),
            json={"column_id": "c-b1", "title": "Live task"},
        )
        assert r.status_code == 200

        event = ws.receive_json()
        assert event["kind"] == "board"
        assert event["board_id"] == "b-launch"
        assert event["op"] == "task_created"


def test_realtime_ignores_other_boards(client: TestClient) -> None:
    token = login(client, "alice@cadence.dev")
    with client.websocket_connect("/realtime") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.receive_json()
        ws.send_json({"type": "subscribe", "board_id": "b-launch"})
        ws.receive_json()

        client.post(
            "/boards/b-engine/tasks",
            headers=auth(token),
            json={"column_id": "c-e1", "title": "On another board"},
        )
        # No event for b-launch subscribers; server should not deliver anything.
        # Feed a second subscribe to prove the socket stays open and silent.
        ws.send_json({"type": "subscribe", "board_id": "b-engine"})
        assert ws.receive_json()["type"] == "subscribed"


def test_realtime_rejects_bad_token(client: TestClient) -> None:
    with client.websocket_connect("/realtime") as ws:
        ws.send_json({"type": "auth", "token": "bogus"})
        import pytest  # noqa: PLC0415

        with pytest.raises(Exception):
            ws.receive_json()


def test_realtime_requires_auth_before_subscribe(client: TestClient) -> None:
    with client.websocket_connect("/realtime") as ws:
        import pytest  # noqa: PLC0415

        ws.send_json({"type": "subscribe", "board_id": "b-launch"})
        with pytest.raises(Exception):
            ws.receive_json()