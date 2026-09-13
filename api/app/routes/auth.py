"""Authentication and password reset endpoints."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..authdeps import current_token, current_user, issue_token, optional_current_user, revoke_token
from ..database import get_session
from ..db import uid
from ..errors import ApiError
from ..models import PasswordResetToken, User
from ..realtime import publish
from ..schemas import ChangePasswordRequest, LoginRequest, ResetPasswordRequest, ResetRequest, SignupRequest
from ..services import user_pure
from ..validation import is_email, password_failures

router = APIRouter(prefix="/auth", tags=["auth"])

WEB_ORIGIN = "http://localhost:5173"


def _verify(password: str, stored_hash: str) -> bool:
    return stored_hash == f"mock:{password}"


def _password_error(action: str, failures: list[str]) -> ApiError:
    return ApiError(400, f"{action} meet the requirements: {failures[0].lower()}")


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)) -> Any:
    email = body.email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    if not user or not _verify(body.password, user.password_hash):
        raise ApiError(401, "Invalid email or password")
    if not user.is_active:
        raise ApiError(403, "This account has been deactivated")
    token = issue_token(user.id)
    await publish("global", op="session")
    return {"user": user_pure(user), "token": token}


@router.post("/signup")
async def signup(body: SignupRequest, session: AsyncSession = Depends(get_session)) -> Any:
    clean_email = body.email.strip().lower()
    if not is_email(clean_email):
        raise ApiError(400, "Enter a valid email address")
    failures = password_failures(body.password)
    if failures:
        raise _password_error("Password does not", failures)
    existing = await session.scalar(select(User).where(User.email == clean_email))
    if existing:
        raise ApiError(409, "An account with this email already exists")
    now = datetime.now(timezone.utc)
    user = User(
        id=uid(),
        email=clean_email,
        is_admin=False,
        is_active=True,
        password_hash=f"mock:{body.password}",
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    token = issue_token(user.id)
    await publish("global", op="session")
    return {"user": user_pure(user), "token": token}


@router.post("/logout", status_code=204)
async def logout(token: str = Depends(current_token)) -> None:
    revoke_token(token)
    await publish("global", op="session")


@router.get("/me")
async def me(user: User | None = Depends(optional_current_user)) -> Any:
    return {"user": user_pure(user) if user else None}


@router.post("/change-password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    if not _verify(body.current_password, user.password_hash):
        raise ApiError(400, "Your current password is incorrect")
    failures = password_failures(body.new_password)
    if failures:
        raise _password_error("New password must", failures)
    if body.new_password == body.current_password:
        raise ApiError(400, "New password must be different from the current one")
    user.password_hash = f"mock:{body.new_password}"
    user.updated_at = datetime.now(timezone.utc)


@router.post("/reset-password/request")
async def request_password_reset(body: ResetRequest, session: AsyncSession = Depends(get_session)) -> Any:
    email = body.email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    if not user:
        raise ApiError(404, "No account found for that email")
    token = secrets.token_urlsafe(16)
    session.add(PasswordResetToken(
        id=uid(),
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        used=False,
        created_at=datetime.now(timezone.utc),
    ))
    return {"token": token, "reset_url": f"{WEB_ORIGIN}/reset-password?token={token}"}


@router.post("/reset-password/confirm", status_code=204)
async def reset_password(body: ResetPasswordRequest, session: AsyncSession = Depends(get_session)) -> None:
    record = await session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token, PasswordResetToken.used.is_(False))
    )
    if not record:
        raise ApiError(400, "Invalid or expired reset token")
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise ApiError(400, "This reset link has expired")
    failures = password_failures(body.new_password)
    if failures:
        raise _password_error("Password does not", failures)
    user = await session.get(User, record.user_id)
    if not user:
        raise ApiError(404, "No account found for this token")
    user.password_hash = f"mock:{body.new_password}"
    user.updated_at = datetime.now(timezone.utc)
    record.used = True