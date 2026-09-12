/**
 * HTTP API client for the FastAPI backend (`api/`).
 *
 * Drop-in replacement for the localStorage mock: the method signatures match
 * `apiMock` exactly. Session tokens are persisted in localStorage and attached
 * as `Authorization: Bearer <token>`; every read/mutation returns the server's
 * JSON shape. All endpoints mirror the mock 1:1 (see `openapi.yaml`).
 */

import type {
  AuthUser,
  BoardDetail,
  BoardMember,
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
import { API_BASE } from './config'
import { ApiError } from './errors'
import { clearToken, getToken, setToken } from './token'
import { startRealtime, stopRealtime, subscribeBoard, subscribeGlobal } from './socket'

export interface UserSearchResult {
  id: string
  email: string
}

export interface AdminBoardSummary extends BoardSummary {
  owner_email: string
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body !== undefined && typeof init.body === 'string') headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'omit' })

  if (response.status === 204) return undefined as T

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  const data = isJson ? ((await response.json()) as unknown) : undefined

  if (!response.ok) {
    const message = data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
      ? (data as { message: string }).message
      : `Request failed with status ${response.status}`
    throw new ApiError(response.status, message)
  }
  return data as T
}

function authSession(response: { user: User; token: string }): AuthUser {
  setToken(response.token)
  startRealtime()
  return { user: response.user }
}

async function endSession(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST' })
  } catch {
    // Signing out locally must succeed even if the server is unreachable.
  } finally {
    clearToken()
    stopRealtime()
  }
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

const auth = {
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return authSession(res)
  },

  async signup(email: string, password: string): Promise<AuthUser> {
    const res = await request<{ user: User; token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return authSession(res)
  },

  async logout(): Promise<void> {
    await endSession()
  },

  async me(): Promise<AuthUser | null> {
    if (!getToken()) return null
    try {
      const res = await request<{ user: User | null }>('/auth/me')
      if (!res.user) {
        clearToken()
        stopRealtime()
        return null
      }
      startRealtime()
      return { user: res.user }
    } catch {
      // Server unreachable → treat as signed out so the app can retry login.
      return null
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
  },

  async requestPasswordReset(email: string): Promise<ResetToken> {
    return request<ResetToken>('/auth/reset-password/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await request<void>('/auth/reset-password/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    })
  },
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

const users = {
  async search(query: string, boardId?: string): Promise<UserSearchResult[]> {
    const params = new URLSearchParams({ query })
    if (boardId) params.set('board_id', boardId)
    return request<UserSearchResult[]>(`/users/search?${params.toString()}`)
  },
}

// ---------------------------------------------------------------------------
// boards
// ---------------------------------------------------------------------------

const boards = {
  async list(): Promise<BoardSummary[]> {
    return request<BoardSummary[]>('/boards')
  },

  async listArchived(): Promise<BoardSummary[]> {
    return request<BoardSummary[]>('/boards/archived')
  },

  async get(boardId: string): Promise<BoardDetail> {
    const detail = await request<BoardDetail>(`/boards/${boardId}`)
    trackBoardRecords(detail)
    return detail
  },

  async create(input: { name: string; column_names?: string[] }): Promise<BoardSummary> {
    return request<BoardSummary>('/boards', { method: 'POST', body: JSON.stringify(input) })
  },

  async rename(boardId: string, name: string): Promise<void> {
    await request<void>(`/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
  },

  async archive(boardId: string): Promise<void> {
    await request<void>(`/boards/${boardId}/archive`, { method: 'POST' })
  },

  async unarchive(boardId: string): Promise<void> {
    await request<void>(`/boards/${boardId}/unarchive`, { method: 'POST' })
  },

  async remove(boardId: string): Promise<void> {
    await request<void>(`/boards/${boardId}`, { method: 'DELETE' })
  },

  async stats(boardId: string): Promise<BoardStats> {
    return request<BoardStats>(`/boards/${boardId}/stats`)
  },

  async invite(boardId: string, input: InviteInput): Promise<BoardMember[]> {
    return request<BoardMember[]>(`/boards/${boardId}/members`, { method: 'POST', body: JSON.stringify(input) })
  },

  async updateMemberRole(boardId: string, userId: string, role: 'owner' | 'editor' | 'viewer'): Promise<void> {
    await request<void>(`/boards/${boardId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) })
  },

  async removeMember(boardId: string, userId: string): Promise<void> {
    await request<void>(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' })
  },
}

// ---------------------------------------------------------------------------
// columns / tags  (their mock methods take ids without the board, so we keep a
// board lookup populated from every board detail response)
// ---------------------------------------------------------------------------

const columnBoards = new Map<string, string>()
const tagBoards = new Map<string, string>()

function trackBoardRecords(detail: BoardDetail): BoardDetail {
  for (const column of detail.columns) columnBoards.set(column.id, column.board_id)
  for (const tag of detail.tags) tagBoards.set(tag.id, tag.board_id)
  return detail
}

function boardOfColumn(columnId: string, boardId?: string): string {
  const found = boardId ?? columnBoards.get(columnId)
  if (!found) throw new ApiError(404, 'Column not found')
  return found
}

function boardOfTag(tagId: string, boardId?: string): string {
  const found = boardId ?? tagBoards.get(tagId)
  if (!found) throw new ApiError(404, 'Tag not found')
  return found
}

const columns = {
  async add(boardId: string, name: string): Promise<Column> {
    const column = await request<Column>(`/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify({ name }) })
    columnBoards.set(column.id, column.board_id)
    return column
  },

  async rename(columnId: string, name: string, boardId?: string): Promise<void> {
    await request<void>(`/boards/${boardOfColumn(columnId, boardId)}/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },

  async remove(columnId: string, boardId?: string): Promise<void> {
    await request<void>(`/boards/${boardOfColumn(columnId, boardId)}/columns/${columnId}`, { method: 'DELETE' })
  },
}

const tags = {
  async add(boardId: string, name: string, color?: string | null): Promise<Tag> {
    const body = color === undefined ? { name } : { name, color: color ?? null }
    const tag = await request<Tag>(`/boards/${boardId}/tags`, { method: 'POST', body: JSON.stringify(body) })
    tagBoards.set(tag.id, tag.board_id)
    return tag
  },

  async remove(tagId: string, boardId?: string): Promise<void> {
    await request<void>(`/boards/${boardOfTag(tagId, boardId)}/tags/${tagId}`, { method: 'DELETE' })
  },
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

const tasks = {
  async create(boardId: string, input: TaskCreateInput): Promise<TaskFull> {
    return request<TaskFull>(`/boards/${boardId}/tasks`, { method: 'POST', body: JSON.stringify(input) })
  },

  async get(boardId: string, taskId: string): Promise<TaskDetail> {
    return request<TaskDetail>(`/boards/${boardId}/tasks/${taskId}`)
  },

  async update(boardId: string, taskId: string, input: TaskUpdateInput): Promise<TaskFull> {
    return request<TaskFull>(`/boards/${boardId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  async move(boardId: string, taskId: string, input: TaskMoveInput): Promise<TaskFull> {
    return request<TaskFull>(`/boards/${boardId}/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify(input) })
  },

  async remove(boardId: string, taskId: string): Promise<void> {
    await request<void>(`/boards/${boardId}/tasks/${taskId}`, { method: 'DELETE' })
  },

  async setTags(boardId: string, taskId: string, tagIds: string[]): Promise<TaskFull> {
    return request<TaskFull>(`/boards/${boardId}/tasks/${taskId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: tagIds }),
    })
  },
}

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

const comments = {
  async create(taskId: string, content: string): Promise<Comment> {
    return request<Comment>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ content }) })
  },

  async update(commentId: string, content: string): Promise<Comment> {
    return request<Comment>(`/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content }) })
  },

  async remove(commentId: string): Promise<void> {
    await request<void>(`/comments/${commentId}`, { method: 'DELETE' })
  },
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

const admin = {
  async listUsers(): Promise<User[]> {
    return request<User[]>('/admin/users')
  },

  async listBoards(): Promise<AdminBoardSummary[]> {
    return request<AdminBoardSummary[]>('/admin/boards')
  },

  async setUserActive(userId: string, active: boolean): Promise<void> {
    await request<void>(`/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ active }) })
  },
}

// ---------------------------------------------------------------------------
// realtime
// ---------------------------------------------------------------------------

const realtime = {
  subscribeBoard(boardId: string, cb: () => void): () => void {
    return subscribeBoard(boardId, cb)
  },
  subscribeGlobal(cb: () => void): () => void {
    return subscribeGlobal(cb)
  },
}

export const api = {
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

export type ApiClient = typeof api