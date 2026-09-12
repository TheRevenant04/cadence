"""Client-side validation rules mirrored from `frontend/src/lib/validator.ts`."""

from __future__ import annotations

import re

PASSWORD_RULES = [
    (lambda p: len(p) >= 12, "At least 12 characters"),
    (lambda p: bool(re.search(r"[A-Z]", p)), "One uppercase letter"),
    (lambda p: bool(re.search(r"[a-z]", p)), "One lowercase letter"),
    (lambda p: bool(re.search(r"[0-9]", p)), "One number"),
    (lambda p: bool(re.search(r"[^A-Za-z0-9]", p)), "One special character"),
]


def password_failures(password: str) -> list[str]:
    return [label for test, label in PASSWORD_RULES if not test(password)]


def is_email(value: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value))