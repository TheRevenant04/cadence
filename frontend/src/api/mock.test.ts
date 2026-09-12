import { beforeEach, describe, expect, it } from 'vitest'
import { apiMock as api, ApiError } from './mock'
import { DEMO_PASSWORD, reset } from './db'

async function login(email: string) {
  return api.auth.login(email, DEMO_PASSWORD)
}

describe('mock api: auth', () => {
  beforeEach(() => {
    reset()
  })

  it('logs in with seeded demo credentials', async () => {
    const { user } = await login('admin@cadence.dev')
    expect(user.email).toBe('admin@cadence.dev')
    expect(user.is_admin).toBe(true)
  })

  it('rejects a wrong password', async () => {
    await expect(api.auth.login('bob@cadence.dev', 'wrong-password')).rejects.toMatchObject({ status: 401 })
  })

  it('signs up, then can log in with the new credentials', async () => {
    const password = 'FreshPassword1!'
    const { user } = await api.auth.signup('new@cadence.dev', password)
    expect(user.is_admin).toBe(false)
    const { user: again } = await api.auth.login('new@cadence.dev', password)
    expect(again.email).toBe('new@cadence.dev')
  })

  it('rejects a weak password at signup', async () => {
    await expect(api.auth.signup('weak@cadence.dev', 'short')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a duplicate email at signup', async () => {
    await expect(api.auth.signup('alice@cadence.dev', 'FreshPassword1!')).rejects.toMatchObject({ status: 409 })
  })
})

describe('mock api: board permissions', () => {
  beforeEach(() => {
    reset()
  })

  it('keeps archived boards visible only to owners/admins', async () => {
    await login('bob@cadence.dev')
    expect(await api.boards.listArchived()).toEqual([])
    await expect(api.boards.get('b-archive')).rejects.toBeInstanceOf(ApiError)

    await login('admin@cadence.dev')
    const archived = await api.boards.listArchived()
    expect(archived.some((b) => b.id === 'b-archive')).toBe(true)
    expect((await api.boards.get('b-archive')).id).toBe('b-archive')
  })

  it('lets a viewer see a board but not mutate it', async () => {
    await login('bob@cadence.dev')
    const board = await api.boards.get('b-launch')
    expect(board.role).toBe('viewer')

    await expect(
      api.tasks.create('b-launch', { column_id: 'c-b1', title: 'Blocked task' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets an editor create and move tasks', async () => {
    await login('alice@cadence.dev')
    const created = await api.tasks.create('b-launch', {
      column_id: 'c-b1',
      title: 'Editor-created task',
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    })
    expect(created.column_id).toBe('c-b1')

    const moved = await api.tasks.move('b-launch', created.id, { column_id: 'c-b2' })
    expect(moved.column_id).toBe('c-b2')
  })

  it('restricts tag management to owners', async () => {
    await login('alice@cadence.dev')
    await expect(api.tags.add('b-launch', 'Owner-only')).rejects.toMatchObject({ status: 403 })

    await login('admin@cadence.dev')
    const tag = await api.tags.add('b-launch', 'Owner-allowed')
    expect(tag.name).toBe('Owner-allowed')
  })
})

describe('mock api: task lifecycle', () => {
  beforeEach(() => {
    reset()
  })

  it('records activity for create and move', async () => {
    await login('alice@cadence.dev')
    const created = await api.tasks.create('b-engine', { column_id: 'c-e1', title: 'Track me' })

    const detail = await api.tasks.get('b-engine', created.id)
    expect(detail.activity[0]?.action_type).toBe('task.created')
    expect(detail.activity[0]?.human_readable_message).toContain('created this task')

    await api.tasks.move('b-engine', created.id, { column_id: 'c-e2' })
    const moved = await api.tasks.get('b-engine', created.id)
    expect(moved.activity[0]?.action_type).toBe('task.moved')
  })
})