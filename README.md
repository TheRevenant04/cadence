# Cadence — Mini Kanban Board

Cadence is a small, self-hosted Kanban board for teams. It focuses on two things
done well: **polished task creation/organization** and **board setup/management**,
with multi-user accounts, board permissions, and real-time updates.

It is a **local/dev-only application** — everything runs on your machine via
Docker Compose. There is no production deployment, no cloud account, and no
external service required.

---

## Table of Contents

- [Features](#features)
- [What it looks like (pages)](#what-it-looks-like-pages)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick start with Docker Compose (recommended)](#quick-start-with-docker-compose-recommended)
- [Demo accounts](#demo-accounts)
- [Running without Docker (manual dev setup)](#running-without-docker-manual-dev-setup)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Real-time / WebSocket protocol](#real-time--websocket-protocol)
- [Database schema](#database-schema)
- [Database migrations](#database-migrations)
- [Backups](#backups)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security notes & known limitations](#security-notes--known-limitations)
- [Out of scope (v1 non-goals)](#out-of-scope-v1-non-goals)

---

## Features

**Boards & columns**

- Multiple boards per instance, each with fully custom columns (add / rename / remove).
- Fixed tag set per board, defined by the board **owner**.
- Board roles: **owner**, **editor** (invite-based), **viewer**.
- Invite other users by email; archive or permanently delete a board.
- Archived boards live under a separate "Archived boards" page (owners/admins only).

**Tasks**

- Task fields: **title** (required), **description** (Markdown), **due date**
  (optional), **assignee** (single user, optional).
- Drag-and-drop movement within and between columns.
- Tag tasks from the board's fixed tag set.
- Task detail is available both as a **modal** and as a **dedicated page** with its
  own URL (`/boards/:boardId/tasks/:taskId`).

**Comments & activity**

- Plain-Markdown comments on tasks; authors can edit and delete their own.
- Full per-task **activity timeline** (audit trail): creates, edits, moves,
  deletes, tag/assignee/due-date changes, and comment activity — each with a
  structured payload and a human-readable message.

**Filters, search & stats**

- Filter bar combining multi-select tags, multi-select assignees, and free-text
  search over task titles/descriptions.
- Live board stats: tasks per column, overdue count, total tasks, tasks per
  assignee, tasks per tag.

**Auth & permissions**

- Email/password signup and login.
- Strong password rules (≥12 chars, upper/lowercase, digit, special character).
- Sessions are **opaque bearer tokens** (see [Security notes](#security-notes--known-limitations)).
- Permission model enforced on every API call:
  - **Owner** — full control; invite editors/viewers, define tags, archive/delete board.
  - **Editor** — create/edit/move/delete tasks and comments.
  - **Viewer** — read-only.
  - **Admin** (`is_admin` flag) — deactivate any user, delete any board; sees the admin panel.

**Real time**

- WebSocket feed that pushes lightweight notifications for task creates, edits,
  moves, deletes, comment activity, and refreshed board stats. Clients refetch
  the affected data on notification (see [protocol](#real-time--websocket-protocol)).

**Shortcuts & onboarding**

- Basic keyboard shortcuts: `N` new task, `E` edit task, `Delete` remove selected
  task, `F` focus search, `Esc` close modal, arrow keys to move between cards.
- One-time guided onboarding tour after first login, with a persistent help button.

---

## What it looks like (pages)

| Page | Route | Notes |
| --- | --- | --- |
| Login | `/login` | |
| Signup | `/signup` | |
| Password reset | `/reset-password` | Mocked — reset link is returned in the API response / console |
| Board list (active) | `/boards` | |
| Single board | `/boards/:boardId` | Columns, tasks, filters, search, stats, task modal |
| Task detail | `/boards/:boardId/tasks/:taskId` | Dedicated page |
| Archived boards | `/boards/archived` | Owners/admins only |
| Profile / password change | `/profile` | Email is fixed after signup |
| Admin panel | `/admin` | List users & boards, deactivate users, delete boards |
| Home | `/` | Redirects to board list or login |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your browser                            │
│   React SPA (frontend/)  ──  Vite dev server :5173           │
│   TanStack Router + React Query + Zustand + Tailwind         │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTTP (REST-ish JSON)         │ WebSocket
               │ Authorization: Bearer <tok>  │ ws://localhost:8000/realtime
┌──────────────▼──────────────────────────────▼───────────────┐
│                        FastAPI backend (backend/)  :8000     │
│   Routers: auth, users, boards, columns, tags, tasks,        │
│            comments, admin, realtime                         │
│   SQLAlchemy 2 async ORM                                    │
└──────────────┬───────────────────────────────────────────────┘
               │ asyncpg
┌──────────────▼──────────────────────────────┬────────────────┐
│  PostgreSQL (db service) :5432              │  backup service│
│  volume: db_data                            │  hourly pg_dump│
│                                             │  volume: backup_data │
└─────────────────────────────────────────────┴────────────────┘
```

- **API** (`docker compose up` service `api`) — FastAPI app in `backend/app/`.
- **Web** (service `web`) — Vite dev server for the React SPA in `frontend/`,
  with `./frontend/src` bind-mounted for hot reload.
- **DB** (service `db`) — PostgreSQL 16, schema managed by Alembic.
- **Backup** (service `backup`) — hourly `pg_dump` (custom format) to a Docker
  volume, pruning dumps older than 30 days.

Every request to the backend flows through the single hub at
`frontend/src/api/index.ts` (HTTP client in `client.ts`, WebSocket in `socket.ts`).

---

## Tech stack

**Backend** (`backend/`)

- Python 3.12, FastAPI
- SQLAlchemy 2.0 (async) + asyncpg / aiosqlite
- Alembic for migrations
- Uvicorn (ASGI server)

**Frontend** (`frontend/`)

- React 18 + TypeScript
- Vite (build + dev server)
- TanStack Router (type-safe routes)
- TanStack Query (server state) + Zustand (UI state)
- Tailwind CSS v4 + Headless UI

**DevOps**

- Docker Compose (the primary workflow), PostgreSQL, scheduled `pg_dump` backups

---

## Repository structure

```
cadence/
├── backend/                  # FastAPI app (Python)
│   ├── app/
│   │   ├── app.py            # App factory, CORS, error handlers
│   │   ├── authdeps.py       # Bearer-token auth dependencies
│   │   ├── database.py       # Engine/DSN resolution, async sessions, token store
│   │   ├── db.py             # Seed data helpers (demo accounts, boards, tasks...)
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   ├── realtime.py       # WebSocket connection manager
│   │   ├── seed.py           # Schema bootstrap + demo data seeding
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── services.py       # Business logic (permissions, operations)
│   │   ├── validation.py     # Password/email rules
│   │   └── routes/           # API routers (auth, boards, tasks, comments...)
│   ├── alembic/              # Alembic config + migration versions
│   ├── tests/                # pytest suite
│   ├── Dockerfile
│   ├── docker-entrypoint.sh  # migrate → seed → start uvicorn
│   ├── pyproject.toml        # deps & tool config (uv)
│   └── uv.lock
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── api/              # HTTP client, WebSocket, config, mock backend
│   │   ├── components/       # Shared UI + app shell components
│   │   ├── features/         # Page-level UI (board, task detail, dialogs...)
│   │   ├── routes/           # TanStack Router route components
│   │   ├── stores/           # Zustand stores
│   │   ├── lib/              # Formatting / ranking / validation utilities
│   │   └── types.ts          # Shared TS types
│   ├── Dockerfile            # dev target → `npm run dev`
│   └── package.json
├── backup/
│   └── backup.sh             # Hourly pg_dump loop + 30-day pruning
├── docker-compose.yml        # api, web, db, backup services
├── openapi.yaml              # HTTP API contract
└── _docs/
    └── specs.md              # Full v1 feature specification
```

> The `frontend/src/api/mock.ts` file ships a localStorage-backed mock backend
> used only by tests/reference. The live UI always talks to the real FastAPI
> backend.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with the
  bundled Docker Compose — Compose v2) — **required** for the recommended workflow.
- A web browser.

That's it for the primary workflow. If you want to develop the backend or
frontend without Docker, you'll also want:

- Python 3.12 and [uv](https://docs.astral.sh/uv/) (for `backend/`)
- Node.js 18+ and npm (for `frontend/`)

---

## Quick start with Docker Compose (recommended)

1. **Start everything**

   From the repository root:

   ```sh
   docker compose up --build
   ```

   This builds and starts four containers:

   | Service | Port | Container |
   | --- | --- | --- |
   | `api` | `http://localhost:8000` | Cadence FastAPI backend |
   | `web` | `http://localhost:5173` | Vite dev server / React app |
   | `db` | `localhost:5432` | PostgreSQL 16 |
   | `backup` | — | hourly `pg_dump` loop |

   Add `-d` to run in the background instead of attached: `docker compose up --build -d`.

2. **Open the app** at [http://localhost:5173](http://localhost:5173).

3. **Sign in** with a demo account (see below) or sign up.

4. **Tear down**

   ```sh
   docker compose down          # stop containers (data kept in volumes)
   docker compose down -v       # stop AND delete volumes (wipes db + backups)
   ```

On startup, the `api` container automatically:
1. runs `uv run alembic upgrade head` (apply migrations),
2. runs `uv run python -m app.seed` (insert demo data — idempotent),
3. starts Uvicorn.

> **Ports already in use?** If `5432`, `8000`, or `5173` are taken, see
> [Troubleshooting](#troubleshooting).

### Monitoring the stack

```sh
docker compose ps                 # status of all services
docker compose logs -f api        # tail backend logs
docker compose logs -f web        # tail frontend logs
docker compose logs -f backup     # tail backup logs
```

---

## Demo accounts

The first boot seeds a few accounts (all with the same password):

| Email | Password | Role | Notes |
| --- | --- | --- | --- |
| `admin@cadence.dev` | `Password123!` | Admin | Owns "Product Launch" and the archived "Q3 Planning" boards |
| `alice@cadence.dev` | `Password123!` | Regular user | Owns "Engineering Sprint" |
| `bob@cadence.dev` | `Password123!` | Regular user | Member of several boards |
| `carol@cadence.dev` | `Password123!` | Regular user | Member of several boards |

Seeded boards: **Product Launch**, **Engineering Sprint**, and (archived)
**Q3 Planning**, with custom columns, tags, tasks, comments, and a full activity
timeline so you can explore the UI immediately.

> Note: v1 uses a **mock password implementation** — the stored password "hash"
> is literally `mock:<password>`. This is intentional for this local/dev-only
> version; see [Security notes](#security-notes--known-limitations).

---

## Running without Docker (manual dev setup)

For people actively developing, each side can be run natively. You still need a
PostgreSQL server and a reachable database, or the API falls back to a local
SQLite file (see [Configuration](#configuration)).

### Backend

```sh
cd backend
uv sync --group dev        # install deps
uv run alembic upgrade head   # create schema
uv run python -m app.seed     # seed demo data (idempotent)
uv run uvicorn app.app:app --reload --port 8000
```

The API now listens on `http://localhost:8000`.

### Frontend

```sh
cd frontend
npm install
npm run dev                 # starts Vite on http://localhost:5173
```

> `npm run build` produces a production bundle in `frontend/dist/`;
> `npm run preview` serves it locally.

---

## Configuration

### Environment variables

| Variable | Applies to | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | `api` | `sqlite+aiosqlite:///backend/cadence.dev.db` | Backend connection string (e.g. `postgresql+asyncpg://cadence:cadence@db:5432/cadence`). Unset → SQLite fallback for quick local dev. |
| `VITE_API_BASE` | `web` | `http://localhost:8000` | HTTP + WebSocket base URL the SPA talks to. |
| `PORT` | `api` | `8000` | Uvicorn listen port. |

The compose file sets `DATABASE_URL` (api → `db` service) and `VITE_API_BASE`
(web → `http://localhost:8000`) for you.

### SQLite fallback

If you run the backend without `DATABASE_URL` set, it uses a local async-SQLite
file (`backend/cadence.dev.db`). This is handy for a zero-dependency demo but is
not the primary workflow — use the Docker stack for anything more than a quick
look. (Note: the seed logic and FK behavior differ slightly between SQLite and
Postgres; the compose stack is the source of truth.)

---

## API overview

The HTTP API contract is documented in `openapi.yaml`. All endpoints live under
`http://localhost:8000`, return JSON (`{"status": ..., "message": ...}` on
errors), and (except auth/whoami) require:

```
Authorization: Bearer <session-token>
```

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/login` | Login, returns `{user, token}` |
| `POST` | `/auth/signup` | Create account, returns `{user, token}` |
| `POST` | `/auth/logout` | Invalidate current token |
| `GET` | `/auth/me` | Current user |
| `POST` | `/auth/change-password` | Change own password |
| `POST` | `/auth/reset-password/request` | Mocked reset — returns `{token, reset_url}` |
| `POST` | `/auth/reset-password/confirm` | Apply new password from reset token |

### Users

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/search?q=...` | Search users by email (for invites) |

### Boards

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/boards` | List active boards for the current user |
| `GET` | `/boards/archived` | Archived boards (owner/admin) |
| `POST` | `/boards` | Create board (`{name, column_names?}`) |
| `GET` | `/boards/{board_id}` | Board detail (columns, tasks, members, tags) |
| `PATCH` | `/boards/{board_id}` | Rename |
| `DELETE` | `/boards/{board_id}` | Delete (owner/admin) |
| `POST` | `/boards/{board_id}/archive` | Archive |
| `POST` | `/boards/{board_id}/unarchive` | Unarchive |
| `GET` | `/boards/{board_id}/stats` | Column/assignee/tag counts, overdue, total |
| `POST` | `/boards/{board_id}/members` | Invite editor/viewer by email |
| `PATCH` | `/boards/{board_id}/members/{user_id}` | Change role |
| `DELETE` | `/boards/{board_id}/members/{user_id}` | Remove member |

### Columns / Tags

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/boards/{board_id}/columns` | Add column |
| `PATCH` | `/boards/{board_id}/columns/{column_id}` | Rename |
| `DELETE` | `/boards/{board_id}/columns/{column_id}` | Delete |
| `POST` | `/boards/{board_id}/tags` | Create tag (owner) |
| `DELETE` | `/boards/{board_id}/tags/{tag_id}` | Delete tag (owner) |

### Tasks

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/boards/{board_id}/tasks` | Create task |
| `GET` | `/boards/{board_id}/tasks/{task_id}` | Task detail + comments + activity |
| `PATCH` | `/boards/{board_id}/tasks/{task_id}` | Update title/description/due/assignee |
| `POST` | `/boards/{board_id}/tasks/{task_id}/move` | Move to column / reorder (`{column_id, before_task_id?, after_task_id?}`) |
| `DELETE` | `/boards/{board_id}/tasks/{task_id}` | Delete |
| `PUT` | `/boards/{board_id}/tasks/{task_id}/tags` | Set tags (`{tag_ids: [...]}`) |

### Comments

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/tasks/{task_id}/comments` | Add comment |
| `PATCH` | `/comments/{comment_id}` | Edit (author only) |
| `DELETE` | `/comments/{comment_id}` | Delete (author only) |

### Admin

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/users` | List users |
| `GET` | `/admin/boards` | List all boards |
| `PATCH` | `/admin/users/{user_id}/active` | Deactivate/reactivate a user |

---

## Real-time / WebSocket protocol

Endpoint: `ws://localhost:8000/realtime` (`WS_BASE` is derived from
`VITE_API_BASE`).

1. Connect, then send `{"type": "auth", "token": "<session-token>"}`.
   Server replies `{"type": "authed", "ok": true}` or closes with code `4401`.
2. To watch a board, send `{"type": "subscribe", "board_id": "<id>"}`.
   Server replies `{"type": "subscribed", "board_id": "<id>"}` (closes `4403`
   if you lack access).
3. Backend broadcasts are **notifications only** — clients refetch the affected
   query on receipt:

   ```json
   {"kind": "board", "board_id": "b-1", "op": "task_moved", "at": 1726182000000}
   {"kind": "global", "op": "notification", "at": 1726182000000}
   ```

The client (`frontend/src/api/socket.ts`) auto-connects when a token exists,
re-subscribes after reconnect (3s backoff), and stops on sign-out.

---

## Database schema

Managed by Alembic — the single migration file is
`backend/alembic/versions/df29af455603_initial_schema.py`.

| Table | Purpose | Key fields |
| --- | --- | --- |
| `users` | Accounts | `id`, `email` (unique), `password_hash`, `is_admin`, `is_active`, timestamps |
| `boards` | Boards | `id`, `name`, `owner_id → users`, `is_archived` |
| `board_members` | Board permissions | `board_id`, `user_id`, `role` (`owner/editor/viewer`), unique (board, user) |
| `columns` | Board columns | `id`, `board_id`, `name`, `position` |
| `tasks` | Tasks | `id`, `column_id`, `title`, `description`, `due_date`, `assignee_id → users`, `rank` (lexorank-style string for ordering) |
| `tags` | Board tag set | `id`, `board_id`, `name`, `color`; unique (board, name) |
| `task_tags` | Task ↔ tag join | `task_id`, `tag_id` |
| `comments` | Task comments | `id`, `task_id`, `user_id`, `content` |
| `activity_logs` | Audit trail | `id`, `task_id`, `user_id`, `action_type`, `action_details` (JSON), `human_readable_message` |
| `password_reset_tokens` | Reset tokens | `id`, `user_id`, `token` (unique), `expires_at`, `used` |

The schema is designed to remain forward-compatible with future features
(dependencies, custom fields, recurring tasks, etc.) — those tables are **not**
created in v1.

---

## Database migrations

Migrations are managed with Alembic. The compose `api` container runs them
automatically on boot, so in the typical workflow you never touch this.

When you change a model, generate a new migration from inside the backend
environment:

```sh
cd backend
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

**Important:** for the compose database, always create/alter tables via new
Alembic migrations — do **not** call `Base.metadata.create_all` against the
Postgres DB, or later migrations will fail on duplicate objects (e.g.
`relation "users" already exists`).

---

## Backups

The `backup` service runs `backup/backup.sh`, an infinite loop that every hour:

1. runs `pg_dump -Fc` (custom format) into the Docker volume `backup_data`
   as `/backups/cadence_<timestamp>.dump`,
2. deletes dumps older than 30 days.

Inspect or restore:

```sh
# list dumps
docker compose exec backup ls -lh /backups

# restore one (example) into the running db
docker exec -i cadence-db-1 pg_restore -U cadence -d cadence \
  < <(docker compose exec -T backup cat /backups/cadence_<ts>.dump)
```

> Volume wiped with `docker compose down -v`? Backups are lost too — they live
> only in the `backup_data` volume.

---

## Testing

See `AGENTS.md` for the canonical workflow. In short:

**Backend** (from `backend/`):

```sh
uv run pytest            # full suite
uv run pytest -k boards  # a single test file
```

**Frontend** (from `frontend/`):

```sh
npm test                 # Vitest: 39 tests across 5 files
npm run typecheck        # tsc
```

Both must pass before committing, per `AGENTS.md`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `docker compose up` fails while `api` is `Restarting (127)` | Entrypoint script missing (e.g. stale image). Rebuild: `docker compose up --build -d api`. |
| `relation "users" already exists` at boot | Schema was created outside Alembic (e.g. manual `create_all` or an aborted earlier attempt). Reset: `docker compose down -v` then `docker compose up --build`. This wipes data; whole stack re-seeds on boot. |
| Port `8000` / `5173` / `5432` already in use | Another process owns the port. Stop it, or remap in `docker-compose.yml` (e.g. `"8001:8000"` + `VITE_API_BASE=http://localhost:8001`). |
| Frontend shows errors talking to API | Check `docker compose logs api`; confirm `web` has `VITE_API_BASE=http://localhost:8000` and that the SPA was (re)loaded after `up`. CORS allows only `localhost:5173` / `127.0.0.1:5173`. |
| WebSocket not connected | Session token is in `localStorage`; hard refresh after login. Check `docker compose logs web`. WebSocket base derives from `VITE_API_BASE`. |
| Login says "Invalid email or password" | Passwords are case-sensitive; demo password is `Password123!`. |
| No data in board list | First boot seeds automatically via `api` entrypoint. If you reset the DB (`down -v`), up again — seeding is idempotent. |
| Backend crashes only with Postgres, fine on SQLite | Postgres enforces FK order on inserts — seeding now flushes in dependency order, so rebuild the image (`docker compose up --build -d api`). |

---

## Security notes & known limitations

This is a **local/dev-only** v1 — security posture is intentionally minimal and
documented in `_docs/specs.md`:

- **Passwords are mocked.** Stored as `mock:<password>` and verified by string
  comparison. There is **no real hashing** (bcrypt/argon2 are future work).
  Do not use real passwords; this must never be deployed publicly as-is.
- **Sessions are in-memory tokens.** Login returns an opaque bearer token kept in
  a Python process dict (`backend/app/database.py` `SESSIONS`) and stored by the
  frontend in `localStorage`. Restarting the API logs everyone out. No JWT, no
  HttpOnly cookie, **no CSRF protection** in the shipped code despite what the
  original spec envisioned.
- **No rate limiting**, no account lockout, no brute-force protection.
- **No email is actually sent** — password reset prints/returns the token instead
  (mocked, per the v1 spec).
- **CORS** is locked to `http://localhost:5173` / `http://127.0.0.1:5173`.
- Markdown is rendered by the frontend; review the rendering library before
  accepting untrusted input in real deployments.

Review these honestly before exposing this app beyond `localhost`.

---

## Out of scope (v1 non-goals)

Deliberately **not** built in v1 (see `_docs/specs.md` for the full list):

- Subtasks / checklists, task templates, custom task fields, dependencies,
  recurring tasks, milestones, project statuses
- Dark mode, mobile-only optimizations
- Export/import, integrations (GitHub/Slack/email), email notifications
- External error tracking (Sentry/Logfire)
- API documentation pages (OpenAPI/Swagger UI off)
- Rich comment features (mentions, attachments, rich editor)
- Rate limiting / advanced hardening

---

## Further reading

- `_docs/specs.md` — full v1 specification and rationale
- `AGENTS.md` — the agent/human development handbook (workflows, tests, PR rules)
- `openapi.yaml` — the HTTP API contract
- `backend/app/seed.py` + `backend/app/db.py` — how demo data is produced