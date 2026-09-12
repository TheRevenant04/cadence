import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './index'
import { clearToken, getToken, setToken } from './token'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

describe('api client: session & auth', () => {
  beforeEach(() => {
    clearToken()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('logs in, persists the token, and returns the user', async () => {
    const user = { id: 'u-1', email: 'a@x.dev', is_admin: false, is_active: true, created_at: 'x', updated_at: 'x' }
    vi.mocked(fetch).mockResolvedValue(json({ user, token: 'tok-123' }))

    const { user: returned } = await api.auth.login('a@x.dev', 'Password123!')

    expect(returned.email).toBe('a@x.dev')
    expect(getToken()).toBe('tok-123')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@x.dev', password: 'Password123!' })
  })

  it('attaches the bearer token to authorized calls', async () => {
    setToken('tok-secret')
    vi.mocked(fetch).mockResolvedValue(json({ user: { id: 'u-1', email: 'a@x.dev', is_admin: false, is_active: true, created_at: 'x', updated_at: 'x' } }))

    await api.auth.me()

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-secret')
  })

  it('me() returns null when there is no token', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('should not be called'))
    expect(await api.auth.me()).toBeNull()
  })

  it('logout clears the token even if the server call fails', async () => {
    setToken('tok-123')
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    await expect(api.auth.logout()).resolves.toBeUndefined()
    expect(getToken()).toBeNull()
  })
})

describe('api client: mapping & errors', () => {
  beforeEach(() => {
    clearToken()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps 204 responses to undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204, headers: { 'content-type': 'application/json' } }))
    await expect(api.boards.archive('b-1')).resolves.toBeUndefined()
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/boards/b-1/archive')
    expect(init.method).toBe('POST')
  })

  it('throws ApiError with status and message from the error body', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ status: 403, message: 'Viewers cannot create tasks' }, 403))
    await expect(api.tasks.create('b-1', { column_id: 'c-1', title: 'x' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Viewers cannot create tasks',
    })
  })

  it('throws ApiError instances from the shared class', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ status: 404, message: 'Board not found' }, 404))
    await expect(api.boards.get('b-missing')).rejects.toBeInstanceOf(ApiError)
  })

  it('posts comments to the task-scoped endpoint', async () => {
    const comment = { id: 'cm-9', task_id: 't-1', user_id: 'u-1', content: 'hi', created_at: 'x', updated_at: 'x', user: { id: 'u-1', email: 'a@x.dev', is_admin: false, is_active: true, created_at: 'x', updated_at: 'x' } }
    vi.mocked(fetch).mockResolvedValue(json(comment))

    const result = await api.comments.create('t-1', 'hi')

    expect(result.content).toBe('hi')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/tasks/t-1/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ content: 'hi' })
  })

  it('writes tag ids with snake_case tag_ids on the tasks tags endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ id: 't-1', column_id: 'c-1', title: 'x', description: null, due_date: null, assignee_id: null, rank: '0000000001', created_at: 'x', updated_at: 'x', tags: [], assignee: null }))

    await api.tasks.setTags('b-1', 't-1', ['g-7'])

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/boards/b-1/tasks/t-1/tags')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ tag_ids: ['g-7'] })
  })
})