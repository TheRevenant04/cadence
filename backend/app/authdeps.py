"""Authentication dependencies: bearer session tokens."""

from __future__ import annotations

import secrets

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .database import SESSIONS, get_session
from .errors import ApiError
from .models import User


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
    SESSIONS[token] = user_id
    return token


def revoke_token(token: str) -> None:
    SESSIONS.pop(token, None)


async def current_user(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    token = get_bearer(request)
    if not token or token not in SESSIONS:
        raise ApiError(401, "You are not signed in")
    user = await session.get(User, SESSIONS[token])
    if not user or not user.is_active:
        raise ApiError(403, "Your account has been deactivated")
    return user


def current_token(request: Request) -> str:
    token = get_bearer(request)
    if not token or token not in SESSIONS:
        raise ApiError(401, "You are not signed in")
    return token


async def optional_current_user(request: Request, session: AsyncSession = Depends(get_session)) -> User | None:
    token = get_bearer(request)
    if not token or token not in SESSIONS:
        return None
    user = await session.get(User, SESSIONS[token])
    return user if user and user.is_active else None