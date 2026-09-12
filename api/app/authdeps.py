"""Authentication dependencies: bearer session tokens."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import Request

from .db import db
from .errors import ApiError


def get_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    return value.strip()


def issue_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.sessions[token] = user_id
    return token


def current_user(request: Request) -> dict[str, Any]:
    token = get_bearer(request)
    if not token or token not in db.sessions:
        raise ApiError(401, "You are not signed in")
    user = next((u for u in db.users if u["id"] == db.sessions[token]), None)
    if not user or not user["is_active"]:
        raise ApiError(403, "Your account has been deactivated")
    return user


def current_token(request: Request) -> str:
    token = get_bearer(request)
    if not token or token not in db.sessions:
        raise ApiError(401, "You are not signed in")
    return token


def optional_current_user(request: Request) -> dict[str, Any] | None:
    token = get_bearer(request)
    if not token or token not in db.sessions:
        return None
    user = next((u for u in db.users if u["id"] == db.sessions[token]), None)
    return user if user and user["is_active"] else None