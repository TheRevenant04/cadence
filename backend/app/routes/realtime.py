"""WebSocket real-time endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import SESSIONS, session_scope
from ..models import User
from ..realtime import manager
from ..services import board_access


router = APIRouter(tags=["realtime"])


@router.websocket("/realtime")
async def realtime_socket(ws: WebSocket) -> None:
    await manager.connect(ws)
    me: User | None = None
    try:
        while True:
            message = await ws.receive_json()
            msg_type = message.get("type")
            if msg_type == "auth":
                token = message.get("token", "")
                user_id = SESSIONS.get(token)
                me = None
                if user_id:
                    async for session in session_scope():
                        user = await session.get(User, user_id)
                        me = user if user and user.is_active else None
                if me is None:
                    await ws.close(code=4401)
                    manager.disconnect(ws)
                    return
                await ws.send_json({"type": "authed", "ok": True})
            elif msg_type == "subscribe" and me is not None:
                board_id = message.get("board_id")
                try:
                    async for session in session_scope():
                        await board_access(session, me.id, board_id)
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