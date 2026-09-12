"""Authentication and password reset endpoints."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ..authdeps import current_token, current_user, issue_token, optional_current_user
from ..db import db, now_iso, uid
from ..errors import ApiError
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
async def login(body: LoginRequest):
    email = body.email.strip().lower()
    user = next((u for u in db.users if u["email"].lower() == email), None)
    if not user or not _verify(body.password, user["password_hash"]):
        raise ApiError(401, "Invalid email or password")
    if not user["is_active"]:
        raise ApiError(403, "This account has been deactivated")
    token = issue_token(user["id"])
    await publish("global", op="session")
    return {"user": user_pure(user), "token": token}


@router.post("/signup")
async def signup(body: SignupRequest):
    clean_email = body.email.strip().lower()
    if not is_email(clean_email):
        raise ApiError(400, "Enter a valid email address")
    failures = password_failures(body.password)
    if failures:
        raise _password_error("Password does not", failures)
    if any(u["email"].lower() == clean_email for u in db.users):
        raise ApiError(409, "An account with this email already exists")
    now = now_iso()
    user = {
        "id": uid(),
        "email": clean_email,
        "is_admin": False,
        "is_active": True,
        "password_hash": f"mock:{body.password}",
        "created_at": now,
        "updated_at": now,
    }
    db.users.append(user)
    token = issue_token(user["id"])
    await publish("global", op="session")
    return {"user": user_pure(user), "token": token}


@router.post("/logout", status_code=204)
async def logout(user: dict = Depends(current_user), token: str = Depends(current_token)):
    db.sessions.pop(token, None)
    await publish("global", op="session")


@router.get("/me")
async def me(user: dict | None = Depends(optional_current_user)):
    return {"user": user_pure(user) if user else None}


@router.post("/change-password", status_code=204)
async def change_password(body: ChangePasswordRequest, user: dict = Depends(current_user)):
    if not _verify(body.current_password, user["password_hash"]):
        raise ApiError(400, "Your current password is incorrect")
    failures = password_failures(body.new_password)
    if failures:
        raise _password_error("New password must", failures)
    if body.new_password == body.current_password:
        raise ApiError(400, "New password must be different from the current one")
    user["password_hash"] = f"mock:{body.new_password}"
    user["updated_at"] = now_iso()


@router.post("/reset-password/request")
async def request_password_reset(body: ResetRequest):
    email = body.email.strip().lower()
    user = next((u for u in db.users if u["email"].lower() == email), None)
    if not user:
        raise ApiError(404, "No account found for that email")
    token = secrets.token_urlsafe(16)
    db.resets.append({
        "id": uid(),
        "user_id": user["id"],
        "token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
        "created_at": now_iso(),
    })
    return {"token": token, "reset_url": f"{WEB_ORIGIN}/reset-password?token={token}"}


@router.post("/reset-password/confirm", status_code=204)
async def reset_password(body: ResetPasswordRequest):
    record = next((r for r in db.resets if r["token"] == body.token and not r["used"]), None)
    if not record:
        raise ApiError(400, "Invalid or expired reset token")
    if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        raise ApiError(400, "This reset link has expired")
    failures = password_failures(body.new_password)
    if failures:
        raise _password_error("Password does not", failures)
    user = next((u for u in db.users if u["id"] == record["user_id"]), None)
    if not user:
        raise ApiError(404, "No account found for this token")
    user["password_hash"] = f"mock:{body.new_password}"
    user["updated_at"] = now_iso()
    record["used"] = True