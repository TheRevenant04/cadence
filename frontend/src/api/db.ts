import type { BoardRole, Column, Tag, User } from '../types'

export interface StoredUser extends User {
  password_hash: string
}

export interface StoredBoard {
  id: string
  name: string
  owner_id: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface StoredMembership {
  board_id: string
  user_id: string
  role: BoardRole
}

export interface StoredColumn extends Column {}

export interface StoredTag extends Tag {}

export interface StoredTask {
  id: string
  column_id: string
  title: string
  description: string | null
  due_date: string | null
  assignee_id: string | null
  rank: string
  created_at: string
  updated_at: string
}

export interface StoredTaskTag {
  task_id: string
  tag_id: string
}

export interface StoredComment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface StoredActivity {
  id: string
  task_id: string
  user_id: string
  action_type: string
  action_details: Record<string, unknown>
  human_readable_message: string
  created_at: string
}

export interface StoredResetToken {
  id: string
  user_id: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

export interface DB {
  version: number
  users: StoredUser[]
  boards: StoredBoard[]
  members: StoredMembership[]
  columns: StoredColumn[]
  tags: StoredTag[]
  tasks: StoredTask[]
  task_tags: StoredTaskTag[]
  comments: StoredComment[]
  activity: StoredActivity[]
  resets: StoredResetToken[]
  session_user_id: string | null
  seq: number
}

const STORAGE_KEY = 'cadence.db.v1'
const DB_VERSION = 1

export const DEMO_PASSWORD = 'Password123!'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

/** ISO date-only string n days from today (or negative for past). */
function dateOnly(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const r = (n: number) => String(n).padStart(10, '0')

function seedUsers(): StoredUser[] {
  const base = iso(-90 * 24 * 3600 * 1000)
  return [
    {
      id: 'u-admin', email: 'admin@cadence.dev', is_admin: true, is_active: true,
      password_hash: `mock:${DEMO_PASSWORD}`, created_at: base, updated_at: base,
    },
    {
      id: 'u-alice', email: 'alice@cadence.dev', is_admin: false, is_active: true,
      password_hash: `mock:${DEMO_PASSWORD}`, created_at: iso(-80 * 24 * 3600 * 1000), updated_at: iso(-80 * 24 * 3600 * 1000),
    },
    {
      id: 'u-bob', email: 'bob@cadence.dev', is_admin: false, is_active: true,
      password_hash: `mock:${DEMO_PASSWORD}`, created_at: iso(-45 * 24 * 3600 * 1000), updated_at: iso(-45 * 24 * 3600 * 1000),
    },
    {
      id: 'u-carol', email: 'carol@cadence.dev', is_admin: false, is_active: true,
      password_hash: `mock:${DEMO_PASSWORD}`, created_at: iso(-20 * 24 * 3600 * 1000), updated_at: iso(-20 * 24 * 3600 * 1000),
    },
  ]
}

function seed(): DB {
  const users = seedUsers()
  const boards: StoredBoard[] = [
    { id: 'b-launch', name: 'Product Launch', owner_id: 'u-admin', is_archived: false, created_at: iso(-30 * 24 * 3600 * 1000), updated_at: iso(-30 * 24 * 3600 * 1000) },
    { id: 'b-engine', name: 'Engineering Sprint', owner_id: 'u-alice', is_archived: false, created_at: iso(-14 * 24 * 3600 * 1000), updated_at: iso(-14 * 24 * 3600 * 1000) },
    { id: 'b-archive', name: 'Q3 Planning', owner_id: 'u-admin', is_archived: true, created_at: iso(-120 * 24 * 3600 * 1000), updated_at: iso(-120 * 24 * 3600 * 1000) },
  ]

  const members: StoredMembership[] = [
    { board_id: 'b-launch', user_id: 'u-admin', role: 'owner' },
    { board_id: 'b-launch', user_id: 'u-alice', role: 'editor' },
    { board_id: 'b-launch', user_id: 'u-bob', role: 'viewer' },
    { board_id: 'b-engine', user_id: 'u-alice', role: 'owner' },
    { board_id: 'b-engine', user_id: 'u-admin', role: 'editor' },
    { board_id: 'b-engine', user_id: 'u-bob', role: 'viewer' },
    { board_id: 'b-engine', user_id: 'u-carol', role: 'editor' },
    { board_id: 'b-archive', user_id: 'u-admin', role: 'owner' },
  ]

  const col = (id: string, board_id: string, name: string, position: number): StoredColumn => ({
    id, board_id, name, position, created_at: iso(-29 * 24 * 3600 * 1000), updated_at: iso(-29 * 24 * 3600 * 1000),
  })

  const columns: StoredColumn[] = [
    col('c-b1', 'b-launch', 'Backlog', 0),
    col('c-b2', 'b-launch', 'In Progress', 1),
    col('c-b3', 'b-launch', 'Review', 2),
    col('c-b4', 'b-launch', 'Done', 3),
    col('c-e1', 'b-engine', 'To Do', 0),
    col('c-e2', 'b-engine', 'Doing', 1),
    col('c-e3', 'b-engine', 'Done', 2),
  ]

  const tag = (id: string, board_id: string, name: string, color: string): StoredTag => ({
    id, board_id, name, color,
  })
  const tags: StoredTag[] = [
    tag('g-b1', 'b-launch', 'frontend', '#6366f1'),
    tag('g-b2', 'b-launch', 'backend', '#0ea5e9'),
    tag('g-b3', 'b-launch', 'design', '#ec4899'),
    tag('g-b4', 'b-launch', 'urgent', '#ef4444'),
    tag('g-b5', 'b-launch', 'docs', '#10b981'),
    tag('g-e1', 'b-engine', 'api', '#0ea5e9'),
    tag('g-e2', 'b-engine', 'frontend', '#6366f1'),
    tag('g-e3', 'b-engine', 'tests', '#f59e0b'),
  ]

  const task = (
    id: string, columnId: string, title: string, rankIdx: number,
    opts: { description?: string | null; due?: string | null; assignee?: string | null } = {},
  ): StoredTask => ({
    id,
    column_id: columnId,
    title,
    description: opts.description ?? null,
    due_date: opts.due ?? null,
    assignee_id: opts.assignee ?? null,
    rank: r(rankIdx),
    created_at: iso(-6 * 24 * 3600 * 1000 - rankIdx * 3600 * 1000),
    updated_at: iso(-6 * 24 * 3600 * 1000 - rankIdx * 3600 * 1000),
  })

  const tasks: StoredTask[] = [
    task('t-1', 'c-b2', 'Drag & drop between columns', 1, {
      description:
        'Tasks should move **within** and **between** columns with a slick drop indicator.\n\n- Reorder with drag handles\n- Keyboard: arrow keys to navigate\n- On mobile fall back to a move action menu\n\nSee the [spec](/boards) for details.',
      due: dateOnly(-1),
      assignee: 'u-admin',
    }),
    task('t-2', 'c-b1', 'Migrate auth to JWT cookies', 1, {
      description: 'Store the JWT in an HttpOnly cookie and enable CSRF protection.\n\n> Only touches auth middleware scope.',
      due: dateOnly(5),
      assignee: 'u-alice',
    }),
    task('t-3', 'c-b1', 'Design invite flow screens', 3, {
      description: 'Invite editors/viewers by searching existing users.\n\nScreens: empty state, results dropdown, role picker.',
      assignee: 'u-alice',
    }),
    task('t-4', 'c-b1', 'Set up pgvector extension', 5, { description: 'Enable the extension in migrations; unused in v1 but required for compatibility.' }),
    task('t-5', 'c-b2', 'Lexorank position model', 2, {
      description: 'Use sparse lexorank-style ranks for task ordering to minimise positional writes.',
      assignee: 'u-admin',
    }),
    task('t-6', 'c-b3', 'Onboarding tour copy', 1, {
      description: 'Write the one-time guided tour steps. Include a persistent help button.',
      due: dateOnly(2),
      assignee: 'u-alice',
    }),
    task('t-7', 'c-b4', 'Docker compose skeleton', 1, { description: 'api, web, db and backup services with dev/prod profiles.' }),
    task('t-8', 'c-b3', 'Board stats summary panel', 3, {
      description: 'Total, overdue, per-column, per-assignee and per-tag breakdowns.',
      due: dateOnly(-3),
    }),
    task('t-9', 'c-e1', 'Integration tests for tasks API', 1, {
      description: 'Cover create, edit, move, delete and tag changes against the activity log.',
      assignee: 'u-carol',
    }),
    task('t-10', 'c-e1', 'Search + filter endpoint', 4, {
      description: 'Text search on titles and descriptions plus tag/assignee filters.',
      due: dateOnly(4),
    }),
    task('t-11', 'c-e2', 'Comment edit/delete', 2, {
      description: 'Allow authors to edit and remove their own comments.',
      assignee: 'u-carol',
    }),
    task('t-12', 'c-e2', 'Mock password reset flow', 5, { description: 'Produce reset tokens and log the reset link.' }),
    task('t-13', 'c-e3', 'Project scaffold', 1, {}),
    task('t-14', 'c-e3', 'CI pipeline config', 2, { assignee: 'u-admin' }),
  ]

  const taskTags: StoredTaskTag[] = [
    { task_id: 't-1', tag_id: 'g-b1' },
    { task_id: 't-1', tag_id: 'g-b4' },
    { task_id: 't-2', tag_id: 'g-b2' },
    { task_id: 't-2', tag_id: 'g-b4' },
    { task_id: 't-3', tag_id: 'g-b3' },
    { task_id: 't-4', tag_id: 'g-b2' },
    { task_id: 't-5', tag_id: 'g-b2' },
    { task_id: 't-6', tag_id: 'g-b3' },
    { task_id: 't-7', tag_id: 'g-b2' },
    { task_id: 't-8', tag_id: 'g-b5' },
    { task_id: 't-9', tag_id: 'g-e1' },
    { task_id: 't-9', tag_id: 'g-e3' },
    { task_id: 't-10', tag_id: 'g-e1' },
    { task_id: 't-11', tag_id: 'g-e1' },
    { task_id: 't-13', tag_id: 'g-e2' },
    { task_id: 't-13', tag_id: 'g-e1' },
  ]

  const comments: StoredComment[] = [
    {
      id: 'cm-1', task_id: 't-1', user_id: 'u-alice',
      content: 'Can we show a **ghost card** while dragging? Feels much more polished.',
      created_at: iso(-5 * 24 * 3600 * 1000), updated_at: iso(-5 * 24 * 3600 * 1000),
    },
    {
      id: 'cm-2', task_id: 't-1', user_id: 'u-admin',
      content: 'Yes — plan is to use a translucent card with a drop line **before/after** the hovered card.\n\nKeyboard shortcuts to follow too: `N`, `E`, `Delete`, `F`, `Esc`, arrows.',
      created_at: iso(-4 * 24 * 3600 * 1000), updated_at: iso(-4 * 24 * 3600 * 1000),
    },
    {
      id: 'cm-3', task_id: 't-1', user_id: 'u-bob',
      content: 'E2E for drag-drop is deferred, but happy to review the interactions.',
      created_at: iso(-2 * 24 * 3600 * 1000), updated_at: iso(-2 * 24 * 3600 * 1000),
    },
  ]

  const ml = (
    taskId: string | string[], userId: string, type: string, details: Record<string, unknown>,
    message: string, minsAgo: number,
  ): StoredActivity[] => {
    const ids = Array.isArray(taskId) ? taskId : [taskId]
    return ids.map((tid, i) => ({
      id: uid(), task_id: tid, user_id: userId, action_type: type,
      action_details: details, human_readable_message: message,
      created_at: iso(-minsAgo * 60 * 1000 - i * 60 * 1000),
    }))
  }

  const activity: StoredActivity[] = [
    ...ml(['t-2', 't-3', 't-4', 't-5', 't-6', 't-7', 't-8', 't-1'], 'u-admin', 'task.created', {}, 'created this task', 8640),
    ...ml('t-1', 'u-admin', 'task.moved', { from: 'Backlog', to: 'In Progress' }, "moved this task from 'Backlog' to 'In Progress'", 7200),
    ...ml('t-1', 'u-admin', 'task.assignee_changed', { from: null, to: 'admin@cadence.dev' }, 'assigned this task to admin@cadence.dev', 7000),
    ...ml('t-1', 'u-admin', 'task.due_date_changed', { from: null, to: dateOnly(-1) }, `set the due date to ${dateOnly(-1)}`, 6980),
    ...ml('t-1', 'u-admin', 'task.tags_changed', { added: ['urgent'] }, "added tag 'urgent'", 6900),
    ...ml('t-1', 'u-alice', 'comment.added', {}, 'added a comment', 7200),
    ...ml('t-1', 'u-admin', 'task.edited', { fields: ['description'] }, 'edited the description', 6800),
    ...ml('t-1', 'u-bob', 'comment.added', {}, 'added a comment', 2880),
    ...ml('t-1', 'u-alice', 'comment.added', {}, 'added a comment', 100),
  ]

  return {
    version: DB_VERSION,
    users,
    boards,
    members,
    columns,
    tags,
    tasks,
    task_tags: taskTags,
    comments,
    activity,
    resets: [],
    session_user_id: null,
    seq: 100,
  }
}

export function load(): DB {
  if (typeof localStorage === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed && parsed.version === DB_VERSION) return parsed
    }
  } catch {
    // fall through to reseed
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

export function save(db: DB): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // storage could be full/unavailable; mock keeps working in memory
  }
}

export function reset(): DB {
  const fresh = seed()
  save(fresh)
  return fresh
}

export { DB_VERSION, STORAGE_KEY }