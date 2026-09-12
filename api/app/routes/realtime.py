"""WebSocket real-time endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db import db
from ..realtime import manager
from ..services import board_access


router = APIRouter(tags=["realtime"])


@router.websocket("/realtime")
async def realtime_socket(ws: WebSocket) -> None:
    await manager.connect(ws)
    me: dict[str, Any] | None = None
    try:
        while True:
            message = await ws.receive_json()
            msg_type = message.get("type")
            if msg_type == "auth":
                token = message.get("token", "")
                user_id = db.sessions.get(token)
                me = next((u for u in db.users if u["id"] == user_id and u["is_active"]), None)
                if me is None:
                    await ws.close(code=4401)
                    manager.disconnect(ws)
                    return
                await ws.send_json({"type": "authed", "ok": True})
            elif msg_type == "subscribe" and me is not None:
                board_id = message.get("board_id")
                try:
                    board_access(me["id"], board_id)
                except Exception:
                    await ws.close(code=4403)
                    manager.disconnect(ws)
                    return
                manager.subscribe(ws, board_id)
                await ws.send_json({"type": "subscribed", "board_id": board_id})
            elif me is None:
                await ws.close(code=4401)
                manager.disconnect(ws)
                return
    except WebSocketDisconnect:
        manager.disconnect(ws)