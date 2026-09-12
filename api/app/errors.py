"""API errors shared across the application.

Errors are returned to clients in the shape `{"status": <int>, "message":
<string>}`, matching the frontend's `ApiError` in `src/api/mock.ts`.
"""

from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message