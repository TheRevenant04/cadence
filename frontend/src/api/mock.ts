import type { DB, StoredActivity, StoredComment, StoredTask, StoredTaskTag, StoredUser } from './db'
import { load, save, uid } from './db'
import { publish } from './realtime'
import { isEmail, passwordFailures } from '../lib/validator'
import { midRank, rankToNumber, sortByRank } from '../lib/rank'
import type {
  ActivityLog,
  AuthUser,
  BoardDetail,
  BoardMember,
  BoardRole,
  BoardStats,
  BoardSummary,
  Column,
  Comment,
  InviteInput,
  ResetToken,
  Tag,
  TaskCreateInput,
  TaskDetail,
  TaskFull,
  TaskMoveInput,
  TaskUpdateInput,
  User,
} from '../types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface UserSearchResult {
  id: string
  email: string
}

const pure = (u: StoredUser): User => ({
  id: u.id,
  email: u.email,
  is_admin: u.is_admin,
  is_active: u.is_active,
  created_at: u.created_at,
  updated_at: u.updated_at,
})

export const displayName = (email: string): string => (email.split('@')[0] ?? email) || 'someone'

const delay = (ms = 220): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms / 2 + Math.random() * ms))

// ---------------------------------------------------------------------------
// permission helpers
// ---------------------------------------------------------------------------

function currentUser(db: DB): StoredUser {
  const user = db.users.find((u) => u.id === db.session_user_id)
  if (!user) throw new ApiError(401, 'You are not signed in')
  if (!user.is_active) throw new ApiError(403, 'Your account has been deactivated')
  return user
}

function roleIn(db: DB, userId: string, boardId: string): BoardRole | null {
  const m = db.members.find((x) => x.board_id === boardId && x.user_id === userId)
  return m?.role ?? null
}

interface BoardAccess {
  board: DB['boards'][number]
  role: BoardRole
}

function requireBoard(db: DB, userId: string, boardId: string): BoardAccess {
  const board = db.boards.find((b) => b.id === boardId)
  if (!board) throw new ApiError(404, 'Board not found')
  const user = db.users.find((u) => u.id === userId)!
  const membership = roleIn(db, userId, boardId)
  let role = membership

  if (board.owner_id === userId && !role) role = 'owner'
  if (user.is_admin && !role) role = 'owner'

  if (!role) throw new ApiError(403, 'You do not have access to this board')
  if (board.is_archived && !(role === 'owner')) {
    throw new ApiError(404, 'Board not found')
  }
  return { board, role }
}

function requireRole(
  access: { role: BoardRole },
  min: 'owner' | 'editor',
  action: string,
): void {
  const rank: Record<BoardRole, number> = { viewer: 0, editor: 1, owner: 2 }
  if (rank[access.role] < rank[min]) {
    throw new ApiError(403, `You need ${min === 'owner' ? 'owner' : 'editor'} permissions to ${action}`)
  }
}

const canEdit = (access: { role: BoardRole }): boolean => access.role === 'editor' || access.role === 'owner'
const canManage = (access: { role: BoardRole }): boolean => access.role === 'owner'

// ---------------------------------------------------------------------------
// activity logging
// ---------------------------------------------------------------------------

function logActivity(
  db: DB,
  taskId: string,
  userId: string,
  action_type: string,
  action_details: Record<string, unknown>,
  human_readable_message: string,
): void {
  db.activity.unshift({
    id: uid(),
    task_id: taskId,
    user_id: userId,
    action_type,
    action_details,
    human_readable_message,
    created_at: new Date().toISOString(),
  })
}

function withUser(db: DB, activity: StoredActivity): ActivityLog {
  const user = db.users.find((u) => u.id === activity.user_id)
  return {
    ...activity,
    user: pure(user ?? db.users[0]!),
  }
}

// ---------------------------------------------------------------------------
// serializers
// ---------------------------------------------------------------------------

function taskFull(db: DB, task: StoredTask): TaskFull {
  const pair = db.task_tags.filter((pt) => pt.task_id === task.id)
  const tags = pair
    .map((pt) => db.tags.find((t) => t.id === pt.tag_id)!)
    .filter(Boolean)
  const assignee = task.assignee_id ? db.users.find((u) => u.id === task.assignee_id) ?? null : null
  return {
    ...task,
    tags,
    assignee: assignee ? pure(assignee) : null,
  }
}

function taskDetail(db: DB, task: StoredTask): TaskDetail {
  const comments = db.comments
    .filter((c) => c.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => ({ ...c, user: pure(db.users.find((u) => u.id === c.user_id) ?? db.users[0]!) }))
  const activity = db.activity
    .filter((a) => a.task_id === task.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((a) => withUser(db, a))
  return { ...taskFull(db, task), comments, activity }
}

function isOverdue(task: StoredTask, todayStr: string): boolean {
  return !!task.due_date && task.due_date < todayStr
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function boardSummary(db: DB, board: DB['boards'][number], userId: string): BoardSummary {
  const user = db.users.find((u) => u.id === userId)
  const role = roleIn(db, userId, board.id) ?? (board.owner_id === userId ? 'owner' : null)
  const effectiveRole: BoardRole =
    role ?? (user?.is_admin ? 'owner' : null) ?? 'viewer'
  const boardTasks = db.tasks.filter((t) => {
    const col = db.columns.find((c) => c.id === t.column_id)
    return col?.board_id === board.id
  })
  const members = db.members.filter((m) => m.board_id === board.id)
  const t = todayStr()
  return {
    id: board.id,
    name: board.name,
    owner_id: board.owner_id,
    is_archived: board.is_archived,
    created_at: board.created_at,
    updated_at: board.updated_at,
    role: effectiveRole,
    total_tasks: boardTasks.length,
    overdue_tasks: boardTasks.filter((tk) => isOverdue(tk, t)).length,
    member_count: members.length,
  }
}

function boardDetail(db: DB, board: DB['boards'][number], userId: string): BoardDetail {
  const summary = boardSummary(db, board, userId)
  const columns = db.columns
    .filter((c) => c.board_id === board.id)
    .sort((a, b) => a.position - b.position)
  const tags = db.tags.filter((t) => t.board_id === board.id)
  const members = db.members
    .filter((m) => m.board_id === board.id)
    .map((m) => {
      const user = db.users.find((u) => u.id === m.user_id)!
      return { user_id: m.user_id, role: m.role, email: user?.email ?? '' } as BoardMember
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))

  const boardTasks = sortByRank(
    db.tasks.filter((t) => columns.some((c) => c.id === t.column_id)),
    (t) => t.rank,
  )
  const tasks: TaskFull[] = boardTasks.map((t) => taskFull(db, t))

  return { ...summary, columns, tags, members, tasks }
}

function boardStats(db: DB, board: DB['boards'][number]): BoardStats {
  const cols = db.columns.filter((c) => c.board_id === board.id)
  const tasks = db.tasks.filter((t) => cols.some((c) => c.id === t.column_id))
  const t = todayStr()

  const per_column = cols.map((c) => ({
    column_id: c.id,
    name: c.name,
    count: tasks.filter((tk) => tk.column_id === c.id).length,
  }))

  const per_assignee = Array.from(
    new Map<string, { user_id: string | null; label: string; count: number }>([
      ['none', { user_id: null, label: 'Unassigned', count: 0 }],
      ...db.users
        .filter((u) => db.members.some((m) => m.board_id === board.id && m.user_id === u.id))
        .map((u) => [u.id, { user_id: u.id, label: u.email, count: 0 }] as const),
    ]),
  ).map(([, v]) => ({ ...v }))
  for (const tk of tasks) {
    const bucket = per_assignee.find((p) => p.user_id === tk.assignee_id)
    if (bucket) bucket.count++
  }

  const per_tag = Array.from(
    new Map<string, { tag_id: string | null; name: string | null; color: string | null; count: number }>([
      ['none', { tag_id: null, name: null, color: null, count: 0 }],
      ...db.tags
        .filter((g) => g.board_id === board.id)
        .map((g) => [g.id, { tag_id: g.id, name: g.name, color: g.color, count: 0 }] as const),
    ]),
  ).map(([, v]) => ({ ...v }))
  for (const tk of tasks) {
    const ids = db.task_tags.filter((pt) => pt.task_id === tk.id).map((pt) => pt.tag_id)
    if (ids.length === 0) {
      const none = per_tag.find((p) => p.tag_id === null)
      if (none) none.count++
    }
    for (const id of ids) {
      const bucket = per_tag.find((p) => p.tag_id === id)
      if (bucket) bucket.count++
    }
  }

  return {
    total_tasks: tasks.length,
    overdue_tasks: tasks.filter((tk) => isOverdue(tk, t)).length,
    per_column,
    per_assignee: per_assignee.filter((p) => p.count > 0),
    per_tag: per_tag.filter((p) => p.count > 0),
  }
}

function createColumn(db: DB, boardId: string, name: string): Column {
  const maxPos = db.columns
    .filter((c) => c.board_id === boardId)
    .reduce((max, c) => Math.max(max, c.position), -1)
  const now = new Date().toISOString()
  const column: Column = {
    id: uid(),
    board_id: boardId,
    name,
    position: maxPos + 1,
    created_at: now,
    updated_at: now,
  }
  db.columns.push(column)
  return column
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

const auth = {
  async login(email: string, password: string): Promise<AuthUser> {
    return delay().then(() => {
      const db = load()
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!user) throw new ApiError(401, 'Invalid email or password')
      if (user.password_hash !== `mock:${password}`) throw new ApiError(401, 'Invalid email or password')
      if (!user.is_active) throw new ApiError(403, 'This account has been deactivated')
      db.session_user_id = user.id
      save(db)
      publish({ kind: 'global', op: 'session', at: Date.now() })
      return { user: pure(user) }
    })
  },

  async signup(email: string, password: string): Promise<AuthUser> {
    return delay().then(() => {
      const db = load()
      const cleanEmail = email.trim().toLowerCase()
      if (!isEmail(cleanEmail)) throw new ApiError(400, 'Enter a valid email address')
      const failures = passwordFailures(password)
      if (failures.length > 0) {
        throw new ApiError(400, `Password does not meet the requirements: ${failures[0]!.toLowerCase()}`)
      }
      if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        throw new ApiError(409, 'An account with this email already exists')
      }
      const now = new Date().toISOString()
      const user: StoredUser = {
        id: uid(),
        email: cleanEmail,
        is_admin: false,
        is_active: true,
        password_hash: `mock:${password}`,
        created_at: now,
        updated_at: now,
      }
      db.users.push(user)
      db.session_user_id = user.id
      save(db)
      publish({ kind: 'global', op: 'session', at: Date.now() })
      return { user: pure(user) }
    })
  },

  async logout(): Promise<void> {
    return delay(100).then(() => {
      const db = load()
      db.session_user_id = null
      save(db)
      publish({ kind: 'global', op: 'session', at: Date.now() })
    })
  },

  async me(): Promise<AuthUser | null> {
    return delay(80).then(() => {
      const db = load()
      if (!db.session_user_id) return null
      const user = db.users.find((u) => u.id === db.session_user_id)
      if (!user) return null
      return { user: pure(user) }
    })
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const user = currentUser(db)
      if (user.password_hash !== `mock:${currentPassword}`) {
        throw new ApiError(400, 'Your current password is incorrect')
      }
      const failures = passwordFailures(newPassword)
      if (failures.length > 0) {
        throw new ApiError(400, `New password must meet the requirements: ${failures[0]!.toLowerCase()}`)
      }
      if (newPassword === currentPassword) {
        throw new ApiError(400, 'New password must be different from the current one')
      }
      user.password_hash = `mock:${newPassword}`
      user.updated_at = new Date().toISOString()
      save(db)
    })
  },

  async requestPasswordReset(email: string): Promise<ResetToken> {
    return delay().then(() => {
      const db = load()
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!user) throw new ApiError(404, 'No account found for that email')
      const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
      db.resets.push({
        id: uid(),
        user_id: user.id,
        token,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        used: false,
        created_at: new Date().toISOString(),
      })
      save(db)
      return {
        token,
        reset_url: `${window.location.origin}/reset-password?token=${token}`,
      }
    })
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const record = db.resets.find((r) => r.token === token && !r.used)
      if (!record) throw new ApiError(400, 'Invalid or expired reset token')
      if (new Date(record.expires_at) < new Date()) {
        throw new ApiError(400, 'This reset link has expired')
      }
      const failures = passwordFailures(newPassword)
      if (failures.length > 0) {
        throw new ApiError(400, `Password does not meet the requirements: ${failures[0]!.toLowerCase()}`)
      }
      const user = db.users.find((u) => u.id === record.user_id)
      if (!user) throw new ApiError(404, 'No account found for this token')
      user.password_hash = `mock:${newPassword}`
      user.updated_at = new Date().toISOString()
      record.used = true
      save(db)
    })
  },
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

const users = {
  async search(query: string, boardId?: string): Promise<UserSearchResult[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const q = query.trim().toLowerCase()
      const existing = new Set(
        db.members.filter((m) => m.board_id === boardId).map((m) => m.user_id),
      )
      return db.users
        .filter((u) => u.id !== me.id)
        .filter((u) => u.is_active)
        .filter((u) => (boardId ? !existing.has(u.id) : true))
        .filter((u) => (q ? u.email.toLowerCase().includes(q) : true))
        .slice(0, 6)
        .map((u) => ({ id: u.id, email: u.email }))
    })
  },
}

// ---------------------------------------------------------------------------
// boards
// ---------------------------------------------------------------------------

const boards = {
  async list(): Promise<BoardSummary[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const visible = db.members
        .filter((m) => m.user_id === me.id)
        .map((m) => m.board_id)
      return db.boards
        .filter((b) => !b.is_archived)
        .filter((b) => visible.includes(b.id) || b.owner_id === me.id)
        .map((b) => boardSummary(db, b, me.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  },

  async listArchived(): Promise<BoardSummary[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      return db.boards
        .filter((b) => b.is_archived)
        .filter((b) => {
          const role = roleIn(db, me.id, b.id)
          return role === 'owner' || b.owner_id === me.id || me.is_admin
        })
        .map((b) => boardSummary(db, b, me.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    })
  },

  async get(boardId: string): Promise<BoardDetail> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const { board } = requireBoard(db, me.id, boardId)
      return boardDetail(db, board, me.id)
    })
  },

  async create(input: { name: string; column_names?: string[] }): Promise<BoardSummary> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const name = input.name.trim()
      if (!name) throw new ApiError(400, 'Board name is required')
      const now = new Date().toISOString()
      const board = {
        id: uid(),
        name,
        owner_id: me.id,
        is_archived: false,
        created_at: now,
        updated_at: now,
      }
      db.boards.push(board)
      db.members.push({ board_id: board.id, user_id: me.id, role: 'owner' })
      const defaultCols = input.column_names?.length ? input.column_names : ['To Do', 'In Progress', 'Done']
      defaultCols.forEach((c) => createColumn(db, board.id, c.trim()))
      save(db)
      publish({ kind: 'global', op: 'board_created', at: Date.now() })
      return boardSummary(db, board, me.id)
    })
  },

  async rename(boardId: string, name: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'rename this board')
      const clean = name.trim()
      if (!clean) throw new ApiError(400, 'Board name is required')
      access.board.name = clean
      access.board.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'board', boardId, op: 'updated', at: Date.now() })
    })
  },

  async archive(boardId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'archive this board')
      access.board.is_archived = true
      access.board.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'global', op: 'board_archived', at: Date.now() })
    })
  },

  async unarchive(boardId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'restore this board')
      access.board.is_archived = false
      access.board.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'global', op: 'board_unarchived', at: Date.now() })
    })
  },

  async remove(boardId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      if (!me.is_admin) {
        const access = requireBoard(db, me.id, boardId)
        requireRole(access, 'owner', 'delete this board')
      }
      const colIds = db.columns.filter((c) => c.board_id === boardId).map((c) => c.id)
      const taskIds = db.tasks.filter((t) => colIds.includes(t.column_id)).map((t) => t.id)
      db.columns = db.columns.filter((c) => c.board_id !== boardId)
      db.tags = db.tags.filter((t) => t.board_id !== boardId)
      db.tasks = db.tasks.filter((t) => !colIds.includes(t.column_id))
      db.task_tags = db.task_tags.filter((pt) => !taskIds.includes(pt.task_id))
      db.comments = db.comments.filter((c) => !taskIds.includes(c.task_id))
      db.activity = db.activity.filter((a) => !taskIds.includes(a.task_id))
      db.members = db.members.filter((m) => m.board_id !== boardId)
      db.boards = db.boards.filter((b) => b.id !== boardId)
      save(db)
      publish({ kind: 'global', op: 'board_deleted', at: Date.now() })
    })
  },

  async stats(boardId: string): Promise<BoardStats> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const { board } = requireBoard(db, me.id, boardId)
      return boardStats(db, board)
    })
  },

  async invite(boardId: string, input: InviteInput): Promise<BoardMember[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'invite members')
      if (!input.role || !['editor', 'viewer'].includes(input.role)) {
        throw new ApiError(400, 'Choose a role (editor or viewer)')
      }
      const target = db.users.find((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())
      if (!target) throw new ApiError(404, `No user found for "${input.email}"`)
      if (target.id === me.id) throw new ApiError(400, 'You already own this board')
      const existing = db.members.find((m) => m.board_id === boardId && m.user_id === target.id)
      if (existing) {
        if (existing.role !== 'owner') {
          existing.role = input.role
          save(db)
          publish({ kind: 'board', boardId, op: 'members_changed', at: Date.now() })
        }
      } else {
        db.members.push({ board_id: boardId, user_id: target.id, role: input.role })
        save(db)
        publish({ kind: 'board', boardId, op: 'members_changed', at: Date.now() })
      }
      return db.members
        .filter((m) => m.board_id === boardId)
        .map((m) => {
          const user = db.users.find((u) => u.id === m.user_id)!
          return { user_id: m.user_id, role: m.role, email: user ? user.email : '' }
        })
    })
  },

  async updateMemberRole(boardId: string, userId: string, role: BoardRole): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'change member roles')
      const m = db.members.find((x) => x.board_id === boardId && x.user_id === userId)
      if (!m) throw new ApiError(404, 'Member not found')
      if (m.role === 'owner') throw new ApiError(400, 'The owner role cannot be changed')
      m.role = role
      save(db)
      publish({ kind: 'board', boardId, op: 'members_changed', at: Date.now() })
    })
  },

  async removeMember(boardId: string, userId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'remove members')
      const m = db.members.find((x) => x.board_id === boardId && x.user_id === userId)
      if (!m) throw new ApiError(404, 'Member not found')
      if (m.role === 'owner') throw new ApiError(400, 'The owner cannot be removed')
      db.members = db.members.filter((x) => !(x.board_id === boardId && x.user_id === userId))
      // unassign tasks from the removed member
      db.tasks
        .filter((t) => db.columns.some((c) => c.board_id === boardId && c.id === t.column_id))
        .forEach((t) => {
          if (t.assignee_id === userId) t.assignee_id = null
        })
      save(db)
      publish({ kind: 'board', boardId, op: 'members_changed', at: Date.now() })
    })
  },
}

// ---------------------------------------------------------------------------
// columns
// ---------------------------------------------------------------------------

const columns = {
  async add(boardId: string, name: string): Promise<Column> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'add columns')
      const clean = name.trim()
      if (!clean) throw new ApiError(400, 'Column name is required')
      const column = createColumn(db, boardId, clean)
      save(db)
      publish({ kind: 'board', boardId, op: 'columns_changed', at: Date.now() })
      return column
    })
  },

  async rename(columnId: string, name: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const column = db.columns.find((c) => c.id === columnId)
      if (!column) throw new ApiError(404, 'Column not found')
      const access = requireBoard(db, me.id, column.board_id)
      requireRole(access, 'owner', 'rename columns')
      const clean = name.trim()
      if (!clean) throw new ApiError(400, 'Column name is required')
      column.name = clean
      column.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'board', boardId: column.board_id, op: 'columns_changed', at: Date.now() })
    })
  },

  async remove(columnId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const column = db.columns.find((c) => c.id === columnId)
      if (!column) throw new ApiError(404, 'Column not found')
      const access = requireBoard(db, me.id, column.board_id)
      requireRole(access, 'owner', 'remove columns')
      const taskIds = db.tasks.filter((t) => t.column_id === columnId).map((t) => t.id)
      db.tasks = db.tasks.filter((t) => t.column_id !== columnId)
      db.task_tags = db.task_tags.filter((pt) => !taskIds.includes(pt.task_id))
      db.comments = db.comments.filter((c) => !taskIds.includes(c.task_id))
      db.activity = db.activity.filter((a) => !taskIds.includes(a.task_id))
      db.columns = db.columns.filter((c) => c.id !== columnId)
      db.columns
        .filter((c) => c.board_id === column.board_id && c.position > column.position)
        .forEach((c) => {
          c.position -= 1
        })
      save(db)
      publish({ kind: 'board', boardId: column.board_id, op: 'columns_changed', at: Date.now() })
    })
  },
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

const TAG_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

const tags = {
  async add(boardId: string, name: string, color?: string | null): Promise<Tag> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      requireRole(access, 'owner', 'manage tags')
      const clean = name.trim()
      if (!clean) throw new ApiError(400, 'Tag name is required')
      if (db.tags.some((t) => t.board_id === boardId && t.name.toLowerCase() === clean.toLowerCase())) {
        throw new ApiError(409, 'A tag with this name already exists')
      }
      const now = new Date().toISOString()
      const tag: Tag = {
        id: uid(),
        board_id: boardId,
        name: clean,
        color: color ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] ?? '#6366f1',
      }
      db.tags.push(tag as DB['tags'][number])
      save(db)
      publish({ kind: 'board', boardId, op: 'tags_changed', at: Date.now() })
      return tag
    })
  },

  async remove(tagId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const tag = db.tags.find((t) => t.id === tagId)
      if (!tag) throw new ApiError(404, 'Tag not found')
      const access = requireBoard(db, me.id, tag.board_id)
      requireRole(access, 'owner', 'manage tags')
      db.task_tags = db.task_tags.filter((pt) => pt.tag_id !== tagId)
      db.tags = db.tags.filter((t) => t.id !== tagId)
      save(db)
      publish({ kind: 'board', boardId: tag.board_id, op: 'tags_changed', at: Date.now() })
    })
  },
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

function findBoardIdForTask(db: DB, taskId: string): string {
  const task = db.tasks.find((t) => t.id === taskId)
  if (!task) throw new ApiError(404, 'Task not found')
  const col = db.columns.find((c) => c.id === task.column_id)
  return col!.board_id
}

const tasks = {
  async create(boardId: string, input: TaskCreateInput): Promise<TaskFull> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot create tasks')
      const title = input.title.trim()
      if (!title) throw new ApiError(400, 'Task title is required')
      const column = db.columns.find((c) => c.id === input.column_id && c.board_id === boardId)
      if (!column) throw new ApiError(400, 'Choose a valid column')

      if (input.assignee_id) {
        const isMember =
          db.members.some((m) => m.board_id === boardId && m.user_id === input.assignee_id) ||
          input.assignee_id === me.id
        if (!isMember) throw new ApiError(400, 'Assignee must be a member of this board')
      }
      if (input.tag_ids?.length) {
        const valid = input.tag_ids.some((g) => db.tags.some((t) => t.id === g && t.board_id === boardId))
        if (!valid) throw new ApiError(400, 'One or more tags are not part of this board')
      }

      const columnTasks = sortByRank(
        db.tasks.filter((t) => t.column_id === column.id),
        (t) => t.rank,
      )
      const lastRank = columnTasks.length > 0 ? rankToNumber(columnTasks[columnTasks.length - 1]!.rank) : 0
      const now = new Date().toISOString()
      const task: StoredTask = {
        id: uid(),
        column_id: column.id,
        title,
        description: input.description?.trim() ? input.description : null,
        due_date: input.due_date || null,
        assignee_id: input.assignee_id || null,
        rank: String(lastRank + 1000).padStart(10, '0'),
        created_at: now,
        updated_at: now,
      }
      db.tasks.push(task)
      db.seq += 1
      if (input.tag_ids?.length) {
        const pairs: StoredTaskTag[] = input.tag_ids.map((g) => ({ task_id: task.id, tag_id: g }))
        db.task_tags.push(...pairs)
      }
      logActivity(db, task.id, me.id, 'task.created', {}, 'created this task')
      if (input.assignee_id) {
        const assignee = db.users.find((u) => u.id === input.assignee_id)!
        logActivity(db, task.id, me.id, 'task.assignee_changed', { to: assignee.email }, `assigned this task to ${assignee.email}`)
      }
      if (task.due_date) {
        logActivity(db, task.id, me.id, 'task.due_date_changed', { to: task.due_date }, `set the due date to ${task.due_date}`)
      }
      save(db)
      publish({ kind: 'board', boardId, op: 'task_created', at: Date.now() })
      return taskFull(db, task)
    })
  },

  async get(boardId: string, taskId: string): Promise<TaskDetail> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      requireBoard(db, me.id, boardId)
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'Task not found')
      return taskDetail(db, task)
    })
  },

  async update(boardId: string, taskId: string, input: TaskUpdateInput): Promise<TaskFull> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot edit tasks')
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'Task not found')

      if (input.title !== undefined) {
        const title = input.title.trim()
        if (!title) throw new ApiError(400, 'Task title is required')
        if (title !== task.title) {
          logActivity(db, task.id, me.id, 'task.title_changed', { from: task.title, to: title }, 'changed the title')
          task.title = title
        }
      }
      if (input.description !== undefined) {
        const next = input.description?.trim() ? input.description : null
        if (next !== task.description) {
          logActivity(db, task.id, me.id, 'task.description_changed', {}, 'edited the description')
          task.description = next
        }
      }
      if (input.due_date !== undefined) {
        const next = input.due_date || null
        if (next !== task.due_date) {
          logActivity(
            db, task.id, me.id, 'task.due_date_changed',
            { from: task.due_date ?? null, to: next ?? null },
            next
              ? `set the due date to ${next}`
              : 'removed the due date',
          )
          task.due_date = next
        }
      }
      if (input.assignee_id !== undefined) {
        const next = input.assignee_id || null
        if (next !== task.assignee_id) {
          const fromUser = task.assignee_id ? db.users.find((u) => u.id === task.assignee_id) : null
          const toUser = next ? db.users.find((u) => u.id === next) : null
          if (next && !toUser) throw new ApiError(400, 'Assignee must be a member of this board')
          logActivity(
            db, task.id, me.id, 'task.assignee_changed',
            { from: task.assignee_id ?? null, to: next ?? null },
            next
              ? `assigned this task to ${toUser ? toUser.email : next}`
              : `unassigned this task from ${fromUser ? fromUser.email : 'this task'}`,
          )
          task.assignee_id = next
        }
      }
      task.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'board', boardId, op: 'task_updated', at: Date.now() })
      return taskFull(db, task)
    })
  },

  async move(boardId: string, taskId: string, input: TaskMoveInput): Promise<TaskFull> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot move tasks')
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'Task not found')
      const toColumn = db.columns.find((c) => c.id === input.column_id && c.board_id === boardId)
      if (!toColumn) throw new ApiError(400, 'Target column not found on this board')
      const fromColumn = db.columns.find((c) => c.id === task.column_id)!

      const others = sortByRank(
        db.tasks.filter((t) => t.column_id === toColumn.id && t.id !== taskId),
        (t) => t.rank,
      )

      let prevRank: string | null = null
      let nextRank: string | null = null
      if (input.before_task_id) {
        const idx = others.findIndex((t) => t.id === input.before_task_id)
        if (idx >= 0) {
          prevRank = idx > 0 ? others[idx - 1]!.rank : null
          nextRank = others[idx]!.rank
        }
      } else if (input.after_task_id) {
        const idx = others.findIndex((t) => t.id === input.after_task_id)
        if (idx >= 0) {
          prevRank = others[idx]!.rank
          nextRank = idx < others.length - 1 ? others[idx + 1]!.rank : null
        }
      } else {
        prevRank = others.length > 0 ? others[others.length - 1]!.rank : null
        nextRank = null
      }

      let rank = midRank(prevRank, nextRank)
      if (rank === null) {
        // Rebalance this column (excluding the moving task), then retry.
        const base = 100_000_000
        const step = Math.floor(base / (others.length + 1))
        others.forEach((t, i) => {
          t.rank = String(step * (i + 1)).padStart(10, '0')
        })
        let prevIdx2 = 0
        if (input.before_task_id) {
          const idx = others.findIndex((t) => t.id === input.before_task_id)
          if (idx >= 0) prevIdx2 = idx
        } else if (input.after_task_id) {
          const idx = others.findIndex((t) => t.id === input.after_task_id)
          if (idx >= 0) prevIdx2 = idx + 1
        } else {
          prevIdx2 = others.length
        }
        const lo = prevIdx2 === 0 ? 0 : rankToNumber(others[prevIdx2 - 1]!.rank)
        const hi = prevIdx2 >= others.length ? 0 : rankToNumber(others[prevIdx2]!.rank)
        rank = midRank(prevIdx2 === 0 ? null : String(lo), prevIdx2 >= others.length ? null : String(hi))
        if (rank === null) rank = String(lo + Math.floor(step / 2)).padStart(10, '0')
      }

      const movedBetweenColumns = fromColumn.id !== toColumn.id
      task.column_id = toColumn.id
      task.rank = rank!
      task.updated_at = new Date().toISOString()
      if (movedBetweenColumns) {
        logActivity(
          db, task.id, me.id, 'task.moved',
          { from: fromColumn.name, to: toColumn.name },
          `moved this task from '${fromColumn.name}' to '${toColumn.name}'`,
        )
      } else {
        logActivity(db, task.id, me.id, 'task.reordered', {}, 'reordered this task')
      }
      save(db)
      publish({ kind: 'board', boardId, op: 'task_moved', at: Date.now() })
      return taskFull(db, task)
    })
  },

  async remove(boardId: string, taskId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot delete tasks')
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'Task not found')
      logActivity(db, task.id, me.id, 'task.deleted', { title: task.title }, 'deleted this task')
      db.tasks = db.tasks.filter((t) => t.id !== taskId)
      db.task_tags = db.task_tags.filter((pt) => pt.task_id !== taskId)
      db.comments = db.comments.filter((c) => c.task_id !== taskId)
      db.activity = db.activity.filter((a) => a.task_id !== taskId)
      save(db)
      publish({ kind: 'board', boardId, op: 'task_deleted', at: Date.now() })
    })
  },

  async setTags(boardId: string, taskId: string, tagIds: string[]): Promise<TaskFull> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot change tags')
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError(404, 'Task not found')
      const validTagIds = db.tags.filter((t) => t.board_id === boardId).map((t) => t.id)
      const clean = [...new Set(tagIds)].filter((id) => validTagIds.includes(id))

      const existing = db.task_tags.filter((pt) => pt.task_id === taskId).map((pt) => pt.tag_id)
      const added = clean.filter((id) => !existing.includes(id))
      const removed = existing.filter((id) => !clean.includes(id))

      if (added.length > 0) {
        const pairs: StoredTaskTag[] = added.map((g) => ({ task_id: taskId, tag_id: g }))
        db.task_tags.push(...pairs)
        const names = added.map((id) => db.tags.find((t) => t.id === id)?.name ?? id)
        logActivity(
          db, taskId, me.id, 'task.tags_changed',
          { added: names },
          `added tag${names.length > 1 ? 's' : ''} ${names.map((n) => `'${n}'`).join(', ')}`,
        )
      }
      if (removed.length > 0) {
        db.task_tags = db.task_tags.filter((pt) => !(pt.task_id === taskId && removed.includes(pt.tag_id)))
        const names = removed.map((id) => db.tags.find((t) => t.id === id)?.name ?? id)
        logActivity(
          db, taskId, me.id, 'task.tags_changed',
          { removed: names },
          `removed tag${names.length > 1 ? 's' : ''} ${names.map((n) => `'${n}'`).join(', ')}`,
        )
      }
      task.updated_at = new Date().toISOString()
      save(db)
      publish({ kind: 'board', boardId, op: 'task_updated', at: Date.now() })
      return taskFull(db, task)
    })
  },
}

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

const comments = {
  async create(taskId: string, content: string): Promise<Comment> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const boardId = findBoardIdForTask(db, taskId)
      const access = requireBoard(db, me.id, boardId)
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot comment')
      const clean = content.trim()
      if (!clean) throw new ApiError(400, 'Comment cannot be empty')
      const now = new Date().toISOString()
      const comment: StoredComment = {
        id: uid(),
        task_id: taskId,
        user_id: me.id,
        content: clean,
        created_at: now,
        updated_at: now,
      }
      db.comments.push(comment)
      logActivity(db, taskId, me.id, 'comment.added', {}, 'added a comment')
      save(db)
      publish({ kind: 'board', boardId, op: 'comment_added', at: Date.now() })
      return { ...comment, user: pure(me) }
    })
  },

  async update(commentId: string, content: string): Promise<Comment> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const comment = db.comments.find((c) => c.id === commentId)
      if (!comment) throw new ApiError(404, 'Comment not found')
      const boardId = findBoardIdForTask(db, comment.task_id)
      const access = requireBoard(db, me.id, boardId)
      const isOwner = access.role === 'owner'
      if (comment.user_id !== me.id && !isOwner && !me.is_admin) {
        throw new ApiError(403, 'You can only edit your own comments')
      }
      if (!canEdit(access)) throw new ApiError(403, 'Viewers cannot edit comments')
      const clean = content.trim()
      if (!clean) throw new ApiError(400, 'Comment cannot be empty')
      comment.content = clean
      comment.updated_at = new Date().toISOString()
      logActivity(db, comment.task_id, me.id, 'comment.edited', {}, 'edited a comment')
      save(db)
      publish({ kind: 'board', boardId, op: 'comment_edited', at: Date.now() })
      return { ...comment, user: pure(me) }
    })
  },

  async remove(commentId: string): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      const comment = db.comments.find((c) => c.id === commentId)
      if (!comment) throw new ApiError(404, 'Comment not found')
      const boardId = findBoardIdForTask(db, comment.task_id)
      const access = requireBoard(db, me.id, boardId)
      const isOwner = access.role === 'owner'
      if (comment.user_id !== me.id && !isOwner && !me.is_admin) {
        throw new ApiError(403, 'You can only delete your own comments')
      }
      db.comments = db.comments.filter((c) => c.id !== commentId)
      logActivity(db, comment.task_id, me.id, 'comment.deleted', {}, 'deleted a comment')
      save(db)
      publish({ kind: 'board', boardId, op: 'comment_deleted', at: Date.now() })
    })
  },
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

const admin = {
  async listUsers(): Promise<User[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      if (!me.is_admin) throw new ApiError(403, 'Admin access required')
      return db.users
        .slice()
        .sort((a, b) => a.email.localeCompare(b.email))
        .map(pure)
    })
  },

  async listBoards(): Promise<BoardSummary[]> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      if (!me.is_admin) throw new ApiError(403, 'Admin access required')
      return db.boards
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((b) => {
          const owner = db.users.find((u) => u.id === b.owner_id)
          const members = db.members.filter((m) => m.board_id === b.id)
          const boardTasks = db.tasks.filter((t) => {
            const col = db.columns.find((c) => c.id === t.column_id)
            return col?.board_id === b.id
          })
          const t = todayStr()
          return {
            id: b.id,
            name: b.name,
            owner_id: b.owner_id,
            owner_email: owner?.email ?? owner?.id ?? '',
            is_archived: b.is_archived,
            created_at: b.created_at,
            updated_at: b.updated_at,
            role: roleIn(db, me.id, b.id) ?? (me.is_admin ? 'owner' : 'viewer'),
            total_tasks: boardTasks.length,
            overdue_tasks: boardTasks.filter((tk) => isOverdue(tk, t)).length,
            member_count: members.length,
          } as BoardSummary & { owner_email: string }
        })
    })
  },

  async setUserActive(userId: string, active: boolean): Promise<void> {
    return delay().then(() => {
      const db = load()
      const me = currentUser(db)
      if (!me.is_admin) throw new ApiError(403, 'Admin access required')
      const user = db.users.find((u) => u.id === userId)
      if (!user) throw new ApiError(404, 'User not found')
      if (user.id === me.id) throw new ApiError(400, 'You cannot deactivate your own account')
      user.is_active = active
      user.updated_at = new Date().toISOString()
      if (!active && db.session_user_id === user.id) db.session_user_id = null
      save(db)
    })
  },
}

const realtime = {
  subscribeBoard(boardId: string, cb: () => void): () => void {
    const unsubscribe = subscribePath((ev) => ev.kind === 'board' && ev.boardId === boardId, cb)
    return unsubscribe
  },
  subscribeGlobal(cb: () => void): () => void {
    return subscribePath((ev) => ev.kind === 'global', cb)
  },
}

import { subscribe as subscribeRaw } from './realtime'
function subscribePath(predicate: (ev: import('./realtime').RealtimeEvent) => boolean, cb: () => void): () => void {
  return subscribeRaw((ev) => {
    if (predicate(ev)) cb()
  })
}

export const apiMock = {
  auth,
  users,
  boards,
  columns,
  tags,
  tasks,
  comments,
  admin,
  realtime,
}

export type ApiMock = typeof apiMock