# AGENTS.md — Mini Kanban Board v1

> This file is the single source of truth for AI agents and human developers working on this project. Read this first before making any changes.

---

## Dev environment tips

- Use Docker Compose for local development: `docker compose up --build` to start all services (API, web, DB, backup).
- For backend work, activate the Python venv or use `docker compose exec api bash` to run commands inside the API container.
- Install Python deps with `uv sync` or `uv pip install -r requirements.txt`.
- For frontend, use `pnpm install` in the `web/` directory, then `pnpm dev` for Vite dev server.
- Run backend tests with `pytest` from the `api/` directory; run frontend tests with `pnpm test` from `web/`.
- Check the `docker-compose.yml` service names (`api`, `web`, `db`, `backup`) to target the right container.
- Use `docker compose logs -f api` or `docker compose logs -f web` to tail logs during development.
- Database migrations managed via Alembic (or similar); run `alembic upgrade head` inside the API container after schema changes.
- Backups stored in a Docker volume; inspect with `docker compose exec backup ls /backups`.

---

## Testing instructions

- Backend: run `pytest` from `api/` for full test suite. Use `pytest -k <test_name>` to focus on specific tests.
- Frontend: run `pnpm test` from `web/` for Vitest/RTL tests. Use `pnpm vitest run -t "<test name>"` to focus.
- For E2E (if Playwright is set up): run `pnpm playwright test` from `web/`.
- Always run `pytest` and `pnpm test` before committing; all tests must pass.
- Add or update tests for any new feature or bug fix, even if not explicitly requested.
- After changing imports or moving files, run type checks: `mypy` (backend) and `pnpm tsc --noEmit` (frontend).
- Ensure permission-related tests cover owner/editor/viewer scenarios for boards, tasks, and comments.

---

## PR instructions

- Title format: `[mini-kanban] <Title>` (e.g., `[mini-kanban] Add task drag-and-drop`).
- Always run `pytest` (backend) and `pnpm lint && pnpm test` (frontend) before committing.
- Keep PRs focused on v1 scope only; do not introduce out-of-scope features.
- Update `AGENTS.md` if you change any core assumption, workflow, or constraint.
- Reference relevant sections of `AGENTS.md` in PR descriptions when implementing features.

---

## Project overview

**Name:** Mini Kanban Board v1  
**Goal:** A minimal but complete, multi-user Kanban board focused on polished task creation/organization and board setup/management.  
**Deployment:** Local/dev only via Docker Compose.  
**Stack:** Python + FastAPI, PostgreSQL, React + lightweight UI library (Radix/Headless) + Tailwind, WebSockets/SSE for real-time.

---

## Non-goals (do NOT build in v1)

- Subtasks or checklists  
- Dark mode  
- Export/import functionality  
- Integrations (GitHub, Slack, email, etc.)  
- Task templates  
- Email notifications (only mocked password-reset emails)  
- External error tracking (Sentry, Logfire, etc.)  
- API documentation (OpenAPI/Swagger)  
- Explicit accessibility work beyond basic HTML semantics  
- Rate limiting or advanced security hardening  
- Rich comment features (mentions, attachments, formatting)  
- Mobile-only optimizations (responsive is enough)  
- Custom task fields, dependencies, recurring tasks, milestones, project statuses  

These are future features; the schema should be forward-compatible, but they are out of scope for v1.

---

## Core requirements (v1)

### Functional scope

- Multiple boards per instance  
- Data model: Board → Columns → Tasks + Tags  
- Full drag-and-drop task movement (within and between columns)  
- Task fields: Title (required), Description, Due date, Assignee (single user)  
- Simple email/password authentication with strong password rules  
- Multi-user support with separate accounts and sessions  
- Board permissions: Owner + Editors (invite-based) + Viewers  
- In-app notifications only (no email notifications)  
- Full audit trail with visible activity timeline per task  
- PostgreSQL with automatic scheduled backups  
- Custom columns per board (add/rename/remove)  
- Fixed tag set per board (defined by board owner)  
- Filters (by tag, assignee) + text search on task titles/descriptions  
- Simple board stats (tasks per column, overdue count, summary panel)  
- Real-time updates via WebSockets or Server-Sent Events  
- Basic keyboard shortcuts (e.g., `N` for new task, `Delete` to remove selected task)  
- Guided onboarding (short walkthrough or help panel)  
- Both archive and delete for boards  
- Archived boards visible only to owners/admins via “Archived boards” view  
- Simple comments on tasks (plain text, no mentions/attachments)  
- Comment authors can edit and delete their own comments  
- Comments included in task activity timeline  
- Task detail view as both modal and separate page  
- Password change allowed (email fixed after signup)  
- Email-based password reset flow (mocked: tokens logged to console)  
- Basic admin view (list of users and boards, deactivate users, delete boards)  
- Admin role via `is_admin` flag on user record  
- Responsive design (phones and tablets)  
- Comprehensive tests (unit + integration for backend, some frontend)  
- Forward-compatible database schema  

### Tech stack

- **Backend:** Python 3.11+ with FastAPI  
- **Database:** PostgreSQL 15+ (with pgvector extension available but not used in v1)  
- **Frontend:** React 18+ with Vite, TypeScript, Tailwind CSS, Radix UI or Headless UI  
- **Real-time:** WebSockets (FastAPI `WebSocket`) or Server-Sent Events  
- **Deployment:** Docker Compose (local/dev only)  
- **Testing:** pytest (backend), Vitest/React Testing Library (frontend), optional Playwright for E2E  

---

## Data model (logical)

Agents should keep the schema forward-compatible. Minimum v1 tables:

- `users` — `id`, `email` (unique), `password_hash`, `is_admin` (bool), `created_at`, `updated_at`  
- `boards` — `id`, `name`, `owner_id` (FK → users), `is_archived` (bool), `created_at`, `updated_at`  
- `board_members` — `id`, `board_id` (FK), `user_id` (FK), `role` (enum: owner/editor/viewer), unique(board_id, user_id)  
- `columns` — `id`, `board_id` (FK), `name`, `position` (int), `created_at`, `updated_at`  
- `tasks` — `id`, `column_id` (FK), `title`, `description` (text, nullable), `due_date` (date, nullable), `assignee_id` (FK → users, nullable), `position` (int), `created_at`, `updated_at`  
- `tags` — `id`, `board_id` (FK), `name`, `color` (nullable), unique(board_id, name)  
- `task_tags` — `task_id` (FK), `tag_id` (FK), primary key (task_id, tag_id)  
- `comments` — `id`, `task_id` (FK), `user_id` (FK), `content` (text), `created_at`, `updated_at`  
- `activity_logs` — `id`, `task_id` (FK), `user_id` (FK), `action_type` (string), `action_details` (JSONB), `created_at`  
- `password_reset_tokens` — `id`, `user_id` (FK), `token` (unique), `expires_at`, `used` (bool)  

Future tables (do not create in v1, but design to accommodate):

- `task_dependencies`, `custom_fields`, `custom_field_values`, `recurring_task_rules`, `milestones`, `project_statuses`, etc.

---

## Key workflows (must feel polished)

1. **Creating and organizing tasks**
   - Create task with title, description, due date, assignee  
   - Edit task fields inline or in detail view  
   - Drag-and-drop tasks between/within columns  
   - Tag tasks from fixed board tag set  
   - Add/edit/delete comments  
   - View full activity timeline  

2. **Board setup and management**
   - Create board, define custom columns  
   - Define fixed tag set for board  
   - Invite editors/viewers by email  
   - Archive or delete board  
   - View archived boards (owners/admins only)  
   - See simple board stats (counts per column, overdue tasks)  

---

## Pages / views

Implement at least:

- `/login`, `/signup`  
- `/boards` — board list (active)  
- `/boards/archived` — archived boards (owners/admins only)  
- `/boards/:id` — single board view (columns, tasks, filters, search, stats)  
- `/boards/:id/tasks/:taskId` — task detail page  
- Task detail modal on `/boards/:id`  
- `/profile` — user profile/settings (password change)  
- `/admin` — admin panel (user/board list, deactivate/delete)  
- Onboarding/help panel (route or modal)  

---

## Authentication & permissions

- Email/password signup and login  
- Strong password rules (minimum length + complexity)  
- Password reset via email token (mocked in v1: log token to console)  
- Board roles: `owner`, `editor`, `viewer`  
- Owners can invite editors/viewers  
- Editors can create/edit/move/delete tasks and comments  
- Viewers can only view tasks and comments  
- Admins (`is_admin = true`) can deactivate users and delete any board  

All API endpoints must enforce these permissions.

---

## Real-time behavior

- Task creates, updates, moves, deletes broadcast in real time to all viewers of the board  
- Comment activity updates visible instantly  
- Board stats refresh in real time  
- Use WebSockets or SSE; be consistent across the app  

---

## Validation rules

- Task title: required, non-empty string  
- Due date: valid date format if provided (optional field)  
- Minimal validation otherwise (no workflow constraints like “must have assignee to move to Done”)  

Validate on both backend (authoritative) and frontend (UX).

---

## Security & hardening

- Basic authentication and session management (JWT or session cookies)  
- No explicit rate limiting in v1  
- CORS configured for local dev (e.g., `http://localhost:5173` ↔ `http://localhost:8000`)  
- Passwords hashed with strong algorithm (bcrypt or argon2)  
- SQL injection prevention via parameterized queries/ORM  

Do not add extra security features unless explicitly added to this spec.

---

## Testing strategy

- **Backend:**  
  - Unit tests for models, services, permission checks  
  - Integration tests for auth, boards, tasks, comments, activity logs  
  - Use pytest, `TestClient`, test database  
- **Frontend:**  
  - Component tests for key UI (board, task card, modal, forms)  
  - Basic E2E flows (login, create task, move task, add comment) using Vitest/RTL and optionally Playwright  
- Aim for high coverage on critical paths and permissions  

---

## Deployment (local/dev)

Provide a `docker-compose.yml` with:

- `api` — FastAPI service  
- `web` — React service (dev server or built static)  
- `db` — PostgreSQL  
- `backup` — scheduled `pg_dump` to local volume  

All data persisted in Docker volumes. Automatic scheduled backups configured (e.g., cron in backup container).

No production deployment required for v1.

---

## Coding standards for agents

- Follow existing code style in the repo (PEP 8 for Python, Prettier/ESLint for TS/JS)  
- Keep changes minimal and focused on v1 scope  
- When in doubt, prefer simpler implementations that match this spec  
- Do not introduce new libraries or patterns unless clearly beneficial and documented here  
- Update this `AGENTS.md` if you discover ambiguities or make decisions that affect scope  

---

## How to use this file

- Before implementing any feature, re-read relevant sections here  
- If a requested feature is not listed under “Core Requirements”, treat it as out of scope unless explicitly added  
- When refactoring or extending the schema, ensure forward-compatibility with future features (dependencies, custom fields, recurring tasks, etc.)
- 