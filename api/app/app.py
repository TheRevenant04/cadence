"""FastAPI application factory.

The HTTP surface implements the contract in `openapi.yaml`. Error responses
always use the `{status, message}` shape the frontend expects.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .errors import ApiError
from .routes import admin, auth, boards, columns, comments, realtime, tags, tasks, users


def create_app() -> FastAPI:
    app = FastAPI(
        title="Cadence Mini Kanban API",
        version="1.0.0",
        description="FastAPI backend for the Cadence mini kanban board (v1). "
        "Contract documented in openapi.yaml; data lives in an in-memory mock database.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"status": exc.status, "message": exc.message})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else None
        field = first["loc"][-1] if first else "request"
        return JSONResponse(status_code=400, content={"status": 400, "message": f"Invalid value for '{field}'"})

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(boards.router)
    app.include_router(columns.router)
    app.include_router(tags.router)
    app.include_router(tasks.router)
    app.include_router(comments.router)
    app.include_router(admin.router)
    app.include_router(realtime.router)

    return app


app = create_app()