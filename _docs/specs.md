# Mini Kanban Board — v1 Final Specification

## Overview

A team-ready, local/dev Kanban board application with polished task creation/organization, board setup/management, multi-user support, real-time updates, and a forward-compatible schema.

---

## Core Features

### Boards & Columns
- Multiple boards per instance.
- Fully custom columns per board (users can add/rename/remove any columns).
- Fixed tag set per board, defined by the board owner.
- Board permissions: owner, editors (invite-based), viewers.
- Invite existing users by search (no email invite links in v1).
- Archive or delete boards.
- Archived boards visible only to owners/admins via a separate "Archived boards" page.

### Tasks
- Task fields:
  - Title (required, non-empty)
  - Description (basic Markdown)
  - Due date (optional, valid date format)
  - Assignee (single user, optional)
- Drag-and-drop task movement within and between columns.
- Lexorank-style positions for tasks (fewer writes, more complex logic).
- Tag tasks from the board's fixed tag set.
- Task detail view available as both:
  - Modal on the board view
  - Dedicated page with its own URL
- Minimal task card display: title, tags, due date.
- Due date display: relative + exact (e.g., "in 3 days (Sep 20)", "2 days overdue (Sep 10)").

### Comments
- Simple comments on tasks with basic Markdown support (bold, italics, lists, links).
- Comment authors can edit and delete their own comments.
- Comments included in the task activity timeline.

### Activity Timeline
- Full audit trail per task showing all actions:
  - Creates, edits, moves, deletes
  - Comment activity
  - Tag changes
  - Assignee changes
  - Due date changes
- Each activity log entry includes:
  - Structured JSON payload
  - Derived human-readable message (e.g., "Alice moved this task from 'To Do' to 'Done'")

### Filters & Search
- Advanced filter bar combining:
  - Multi-select tags
  - Multi-select assignees
  - Free-text search on task titles and descriptions

### Board Stats
- Visible metrics on the board view:
  - Tasks per column
  - Overdue count
  - Total tasks
  - Tasks per assignee
  - Tasks per tag

### Authentication & Permissions
- Email/password signup and login.
- Strong password rules:
  - Minimum 12 characters
  - At least one uppercase, one lowercase, one digit, and one special character
- Password change allowed (email fixed after signup).
- Password reset via email token (mocked in v1: reset link returned in API response for manual copying).
- JWT-based sessions:
  - JWT stored in HttpOnly cookie
  - CSRF protection enabled
- Board roles:
  - Owner: full control, can invite editors/viewers, define tags, archive/delete board
  - Editor: create/edit/move/delete tasks and comments
  - Viewer: read-only access to tasks and comments
- Admin role (`is_admin = true` on user record):
  - Can deactivate users and delete any board
  - Admin panel accessible via both a visible navigation link and direct URL

### Real-Time Updates
- Hybrid WebSocket model:
  - Global channel for lightweight notifications across all boards the user can access
  - Per-board channels for detailed events when viewing a specific board
- Real-time broadcasting of:
  - Task creates, edits, moves, deletes
  - Comment activity
  - Board stats refresh

### Responsive Design
- Desktop-first responsive design.
- Full support down to 375px screen width (typical modern phones).

---

## Tech Stack

### Backend
- **Framework:** Python + FastAPI
- **ORM:** SQLModel (Pydantic + SQLAlchemy)
- **Migrations:** Alembic
- **Database:** PostgreSQL with:
  - Automatic scheduled daily backups
  - `pgvector` extension enabled from day one (forward-compatible)
- **Logging:** Structured JSON logging (machine-parseable)
- **Session Management:** JWT in HttpOnly cookie + CSRF protection
- **CORS:** Restricted to `http://localhost` and `http://localhost:5173`

### Frontend
- **Framework:** React
- **Routing:** TanStack Router (type-safe)
- **State Management:**
  - Server state: TanStack Query
  - UI state: Zustand
- **UI Components:** Headless UI + Tailwind CSS
- **Task Cards:** Minimal display (title, tags, due date)
- **Keyboard Shortcuts:**
  - `N`: new task
  - `E`: edit task
  - `Delete`: remove selected task
  - `F`: focus search
  - `Esc`: close modal
  - Arrow keys: navigate cards

### DevOps & Deployment
- **Deployment:** Local/dev only via Docker Compose
- **Services:**
  - `api`: FastAPI backend
  - `web`: React frontend
  - `db`: PostgreSQL
  - `backup`: cron container running `pg_dump` on a daily schedule
- **Compose Profiles:**
  - Dev profile: Vite dev server with hot reload
  - Prod profile: production build served by lightweight server or FastAPI
- **Backups:** Daily `pg_dump` to local Docker volume

### Testing
- Backend: comprehensive unit + integration tests (models, services, APIs, auth, boards, tasks, comments, activity logs)
- Frontend: component tests for key UI (board, task card, modal), basic flow tests
- E2E tests: deferred to post-v1

---

## Pages / Views

- Login / Signup
- Board list (active boards)
- Archived boards (separate page, owners/admins only)
- Single board view (columns, tasks, filters, search, stats)
- Task detail modal (on board)
- Task detail page (dedicated URL)
- User profile/settings (password change)
- Admin panel (user/board list, deactivate users, delete boards)
- Onboarding/help panel:
  - One-time guided tour on first login
  - Persistent help button available anytime

---

## Data Model (High-Level)

- `users` — id, email, password_hash, is_admin, created_at, updated_at
- `boards` — id, name, owner_id (FK → users), is_archived, created_at, updated_at
- `board_members` — id, board_id (FK), user_id (FK), role (owner/editor/viewer)
- `columns` — id, board_id (FK), name, position, created_at, updated_at
- `tasks` — id, column_id (FK), title, description, due_date, assignee_id (FK → users, nullable), position (lexorank-style), created_at, updated_at
- `tags` — id, board_id (FK), name, color (optional)
- `task_tags` — task_id (FK), tag_id (FK)
- `comments` — id, task_id (FK), user_id (FK), content, created_at, updated_at
- `activity_logs` — id, task_id (FK), user_id (FK), action_type, action_details (JSON), human_readable_message, created_at
- `password_reset_tokens` — id, user_id (FK), token, expires_at, used

*Schema designed to accommodate future features: custom fields, dependencies, recurring tasks, multiple assignees, @mentions, attachments, task duplication, milestones, project-level statuses, notifications, export/import, integrations, templates.*

---

## Key Workflows (Polished in v1)

### 1. Creating and Organizing Tasks
- Create task with title, description, due date, assignee
- Edit task fields inline or in detail view
- Drag-and-drop tasks between/within columns
- Tag tasks from fixed board tag set
- Add/edit/delete comments with basic Markdown
- View full activity timeline with all actions

### 2. Board Setup and Management
- Create board, define custom columns
- Define fixed tag set for board (owner only)
- Invite editors/viewers by searching existing users
- Archive or delete board
- View archived boards (owners/admins only, separate page)
- See extended board stats (counts per column/assignee/tag, total tasks, overdue tasks)

---

## Validation Rules

- Task title: required, non-empty
- Due date: valid date format (optional field)
- Minimal validation otherwise (no workflow constraints like "must have assignee to move to Done")

---

## Security & Hardening

- Basic authentication and session management with JWT in HttpOnly cookies
- CSRF protection enabled
- CORS configured for local dev (`http://localhost` and `http://localhost:5173`)
- Passwords hashed with strong algorithm (e.g., bcrypt/argon2)
- Strong password rules enforced (12+ chars, uppercase, lowercase, digit, special character)
- No explicit rate limiting in v1

---

## Out of Scope for v1 (Explicit)

- Subtasks or checklists
- Dark mode
- Export/import functionality
- Integrations (GitHub, Slack, email, etc.)
- Task templates
- Email notifications (only in-app notifications)
- External error tracking / observability (Sentry, Logfire, etc.)
- API documentation (OpenAPI/Swagger)
- Explicit accessibility work (beyond basic HTML semantics)
- Rate limiting or advanced security hardening
- Rich comment features (mentions, attachments, rich text editor)
- Mobile-only optimizations (desktop-first responsive)
- Custom task fields, dependencies, recurring tasks, milestones, project statuses (schema prepared but not implemented)

---

## Open Decisions (To Be Finalized During Implementation)

- Exact onboarding content and flow details (guided tour steps, help panel content)
- Backup retention policy (how many daily backups to keep)
- Exact color scheme and branding (beyond Tailwind defaults)
- Specific Markdown features to enable/sanitize in comments and task descriptions

---

## Future-Proofing (Not in v1)

Schema and code structure prepared for:

- Task dependencies (blocking relationships)
- Custom task fields (text, number, date, dropdown)
- Recurring tasks with basic rules
- Multiple assignees + collaborators
- @mentions and attachments in comments
- Task duplication
- Milestones and project-level statuses
- Notifications (email, richer in-app)
- Export/import, integrations, templates