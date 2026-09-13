# Cadence Backend

The FastAPI backend for Cadence — a local/dev Kanban board. This directory
holds the Python API, the data model, migrations, seed data, and the full
pytest suite.

> Looking for how to run the whole app? See the [root README](../README.md).

---

## Quickstart

The backend runs inside Docker Compose as the `api` service. From the repo root:

```sh
docker compose up --build
```

The API is then available at `http://localhost:8000`. On boot, the container
automatically runs `alembic upgrade head`, seeds demo data, and starts Uvicorn.

To run it natively:

```sh
uv sync --group dev
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.app:app --reload --port 8000
```

Without `DATABASE_URL`, the app falls back to a local SQLite file
(`cadence.dev.db`) for quick exploration.

---

## Layout

```
backend/
├── app/
│   ├── app.py            # create_app(): routers, CORS, error handlers, lifespan
│   ├── authdeps.py       # Bearer token auth (get_bearer, current_user, issue_token)
│   ├── database.py       # DSN resolution, async engine/sessions, in-memory token store
│   ├── db.py             # Seed data dicts + helpers (demo accounts, boards, tasks)
│   ├── errors.py         # ApiError (status + message shape)
│   ├── models.py         # SQLAlchemy 2.0 ORM models
│   ├── realtime.py       # WebSocket ConnectionManager + publish()
│   ├── schemas.py        # Pydantic request bodies
│   ├── seed.py           # init_db: create schema + idempotent seed
│   ├── services.py       # Business logic + board permission checks
│   ├── validation.py     # Password rules / email check
│   └── routes/           # One router per resource (auth, users, boards, ...)
├── alembic/              # Migration env + versions/
├── tests/                # pytest suite (one file per resource)
├── Dockerfile            # python:3.12-slim + uv
├── docker-entrypoint.sh  # migrate → seed → uvicorn
├── pyproject.toml        # deps + pytest/mypy config
└── uv.lock
```

---

## Key concepts

- **App factory** — `create_app()` in `app/app.py` wires all routers and is the
  single entry point (`app.app:app`); the module-level `app = create_app()`
  instance is what Uvicorn loads.
- **Lifespan seeding** — the FastAPI lifespan calls `init_db()`, which creates
  the schema (via `Base.metadata.create_all` for SQLite-only convenience) and
  seeds demo data once. For the composed Postgres DB, the container entrypoint
  runs Alembic first, so `create_all` becomes a no-op.
- **Sessions** — tokens live in an in-memory dict (`database.SESSIONS`); the
  REST layer uses them as opaque bearer tokens, not JWTs.
- **Permission checks** — every board/task/comment endpoint resolves the role
  (owner/editor/viewer) via `services.board_access` and raises `ApiError` on
  violations. Admins bypass board-level restrictions.

---

## Data model

Defined in `app/models.py`: `User`, `Board`, `BoardMember`, `Column`, `Task`,
`Tag`, `TaskTag`, `Comment`, `ActivityLog`, `PasswordResetToken`. See the
[Database schema](../README.md#database-schema) section of the root README for a
table-by-table description.

Key detail: tasks use a lexorank-style `rank` string for stable ordering, and
`activity_logs.action_details` is a JSON column with a companion
`human_readable_message`.

---

## API contract

The authoritative HTTP contract is `openapi.yaml` at the repo root. A readable
endpoint list lives in the [API overview](../README.md#api-overview) section of
the root README. Errors are always `{"status": <code>, "message": "..."}`.

---

## Migrations (Alembic)

**In the compose workflow you almost never run these yourself** — the `api`
container runs `alembic upgrade head` on every boot.

To create a new migration:

```sh
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Rule for the composed Postgres DB: **schema changes go through Alembic only**.
Calling `Base.metadata.create_all` against Postgres leaves an untracked schema
that later migrations collide with (e.g. `relation "users" already exists`).

If that ever happens, the reset is:

```sh
docker compose down -v && docker compose up --build
```

---

## Seeding

`app/seed.py` + `app/db.py` produce the demo data: 4 users, 3 boards (one
archived), custom columns/tags/tasks/comments, and a full activity timeline.

Two things worth knowing when editing seeds:

1. Seeding is **idempotent** — `seed_if_empty` returns early if `users` has rows.
2. `insert_seed` deliberately flushes in dependency layers (users first, then
   boards/members, then columns/tags, then tasks, then stamps/comments/activity,
   then reset tokens). This matters because **Postgres validates every FK on its
   own INSERT**, and the models have no `relationship()` definitions to let
   SQLAlchemy infer insert order — SQLite tolerated out-of-order inserts because
   FK enforcement is off there.

---

## Real-time

- `app/realtime.py` holds the `ConnectionManager` and `publish(kind, board_id, op)`.
- `app/routes/realtime.py` exposes the `ws://localhost:8000/realtime` endpoint:
  auth → subscribe → receive `{kind, board_id, op, at}` notifications.
- The frontend client protocol is documented in the
  [root README](../README.md#real-time--websocket-protocol).

---

## Tests

Run from this directory:

```sh
uv run pytest          # full suite
uv run pytest -k task  # e.g. only task tests
```

The suite covers auth, users, boards, columns, tags, tasks, comments, realtime,
and admin — including owner/editor/viewer permission scenarios. It uses an
in-memory/test database via `set_database_url` (no Postgres required).

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite+aiosqlite:///<repo>/backend/cadence.dev.db` | Async SQLAlchemy URL. In compose this is `postgresql+asyncpg://cadence:cadence@db:5432/cadence`. |
| `PORT` | `8000` | Uvicorn listen port (used by entrypoint). |

---

## Security caveat

v1 is local/dev-only: **passwords are `mock:<password>` strings, not real
hashes**, and sessions are in-memory bearer tokens. Read the
[Security notes](../README.md#security-notes--known-limitations) in the root
README before running anything beyond `localhost`.