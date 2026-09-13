"""WebSocket connection manager and publish helper for real-time updates."""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()
        self._boards: dict[WebSocket, set[str]] = defaultdict(set)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._sockets.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._sockets.discard(ws)
        self._boards.pop(ws, None)

    def subscribe(self, ws: WebSocket, board_id: str) -> None:
        self._boards[ws].add(board_id)

    async def send(self, ws: WebSocket, message: dict) -> None:
        try:
            await ws.send_json(message)
        except Exception:
            self.disconnect(ws)

    async def broadcast(self, payload: dict) -> None:
        if payload["kind"] == "board":
            targets = [ws for ws in self._sockets if payload["board_id"] in self._boards[ws]]
        else:
            targets = list(self._sockets)
        for ws in targets:
            await self.send(ws, payload)


manager = ConnectionManager()


async def publish(kind: str, board_id: str | None = None, op: str | None = None) -> None:
    payload: dict = {"kind": kind, "at": int(time.time() * 1000)}
    if board_id is not None:
        payload["board_id"] = board_id
    if op is not None:
        payload["op"] = op
    await manager.broadcast(payload)