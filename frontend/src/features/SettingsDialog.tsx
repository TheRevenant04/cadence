import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { BoardDetail, BoardRole } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { RoleBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { PlusIcon, TrashIcon, ArchiveIcon, EditIcon, CheckIcon, XMarkIcon } from '@/components/icons'

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

interface SettingsDialogProps {
  open: boolean
  board: BoardDetail
  onClose: () => void
  onArchived: () => void
  onDeleted: () => void
}

export function SettingsDialog({ open, board, onClose, onArchived, onDeleted }: SettingsDialogProps) {
  const [tab, setTab] = React.useState<'general' | 'columns' | 'tags' | 'members' | 'danger'>('general')
  React.useEffect(() => {
    if (open) setTab('general')
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Board settings" size="lg">
      <div className="flex flex-col sm:flex-row">
        <div className="border-b border-slate-100 sm:w-44 sm:border-r sm:border-b-0">
          <TabRow active={tab === 'general'} onClick={() => setTab('general' as const)}>General</TabRow>
          <TabRow active={tab === 'columns'} onClick={() => setTab('columns' as const)}>Columns</TabRow>
          <TabRow active={tab === 'tags'} onClick={() => setTab('tags' as const)}>Tags</TabRow>
          <TabRow active={tab === 'members'} onClick={() => setTab('members' as const)}>Members</TabRow>
          <TabRow active={tab === 'danger'} onClick={() => setTab('danger' as const)} danger>Danger zone</TabRow>
        </div>
        <div className="min-w-0 flex-1 px-5 py-4">
          {tab === 'general' && <GeneralTab board={board} />}
          {tab === 'columns' && <ColumnsTab board={board} />}
          {tab === 'tags' && <TagsTab board={board} />}
          {tab === 'members' && <MembersTab board={board} />}
          {tab === 'danger' && <DangerTab board={board} onArchived={onArchived} onDeleted={onDeleted} />}
        </div>
      </div>
    </Modal>
  )
}

function TabRow({ children, active, onClick, danger }: { children: React.ReactNode; active: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium transition-colors sm:min-w-36 sm:justify-start',
        active
          ? danger
            ? 'bg-rose-50 text-rose-700'
            : 'bg-indigo-50 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

function GeneralTab({ board }: { board: BoardDetail }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState(board.name)
  const [error, setError] = React.useState<string | null>(null)
  const didRename = name.trim() !== board.name

  React.useEffect(() => setName(board.name), [board.name])

  const rename = useMutation({
    mutationFn: () => api.boards.rename(board.id, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['board', board.id] })
      void qc.invalidateQueries({ queryKey: ['boards'] })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Rename failed'),
  })

  return (
    <div className="space-y-4">
      <TextField
        label="Board name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-sm"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div>
        <Button
          variant="primary"
          onClick={() => {
            if (!name.trim()) {
              setError('Board name is required')
              return
            }
            setError(null)
            rename.mutate()
          }}
          disabled={!didRename}
          loading={rename.isPending}
        >
          Save name
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        Role: <span className="font-medium capitalize">{board.role}</span>. Only the board owner can manage settings; editors can
        create and move tasks, viewers have read-only access.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function ColumnsTab({ board }: { board: BoardDetail }) {
  const qc = useQueryClient()
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['board', board.id] })
    void qc.invalidateQueries({ queryKey: ['boards'] })
  }

  const add = useMutation({
    mutationFn: () => api.columns.add(board.id, newName),
    onSuccess: () => {
      setNewName('')
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to add column'),
  })

  const remove = useMutation({
    mutationFn: () => api.columns.remove(confirmDelete!),
    onSuccess: () => {
      setConfirmDelete(null)
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to remove column'),
  })

  const targetColumn = board.columns.find((c) => c.id === confirmDelete)
  const targetCount = targetColumn ? board.tasks.filter((t) => t.column_id === targetColumn.id).length : 0

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Columns and their task counts. Removing a column permanently deletes its tasks.</p>
      <ul className="space-y-1.5">
        {board.columns.map((c) => {
          const count = board.tasks.filter((t) => t.column_id === c.id).length
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <span className="size-2 shrink-0 rounded-full bg-indigo-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-400">{count} task{count === 1 ? '' : 's'}</span>
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Delete column ${c.name}`}
                onClick={() => setConfirmDelete(c.id)}
              >
                <TrashIcon className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-2 pt-1">
        <input
          className="input flex-1"
          placeholder="New column name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (newName.trim()) add.mutate()
            }
          }}
        />
        <Button
          variant="primary"
          onClick={() => add.mutate()}
          disabled={!newName.trim()}
          loading={add.isPending}
        >
          <PlusIcon className="size-4" />
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => remove.mutate()}
        confirmLoading={remove.isPending}
        title="Delete column"
        danger
        confirmLabel="Delete column"
        message={
          <>
            Delete <b>{targetColumn?.name}</b>? This will permanently delete{' '}
            <b>{targetCount} task{targetCount === 1 ? '' : 's'}</b> in that column.
          </>
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function TagsTab({ board }: { board: BoardDetail }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState(PRESET_COLORS[0]!)
  const [error, setError] = React.useState<string | null>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['board', board.id] })
    void qc.invalidateQueries({ queryKey: ['boards'] })
  }

  const add = useMutation({
    mutationFn: () => api.tags.add(board.id, name, color),
    onSuccess: () => {
      setName('')
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to add tag'),
  })

  const remove = useMutation({
    mutationFn: (tagId: string) => api.tags.remove(tagId),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to remove tag'),
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">The fixed tag set for this board. Tags appear on task cards.</p>
      <ul className="space-y-1.5">
        {board.tags.map((tag) => {
          const count = board.tasks.filter((t) => t.tags.some((x) => x.id === tag.id)).length
          return (
            <li key={tag.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: tag.color ?? '#64748b' }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{tag.name}</span>
              <span className="text-xs text-slate-400">{count} task{count === 1 ? '' : 's'}</span>
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Delete tag ${tag.name}`}
                onClick={() => remove.mutate(tag.id)}
              >
                <TrashIcon className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="space-y-2 pt-1 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="New tag name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (name.trim()) add.mutate()
              }
            }}
          />
          <Button
            variant="primary"
            onClick={() => add.mutate()}
            disabled={!name.trim()}
            loading={add.isPending}
          >
            <PlusIcon className="size-4" />
            Add
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Use color ${c}`}
              className={cn('size-6 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110', color === c ? 'ring-slate-500' : 'ring-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function MembersTab({ board }: { board: BoardDetail }) {
  const qc = useQueryClient()
  const [query, setQuery] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<{ id: string; email: string }[]>([])
  const [selected, setSelected] = React.useState<{ id: string; email: string } | null>(null)
  const [role, setRole] = React.useState<'editor' | 'viewer'>('viewer')
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      api.users
        .search(query, board.id)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 200)
    return () => clearTimeout(t)
  }, [query, board.id])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['board', board.id] })
    void qc.invalidateQueries({ queryKey: ['boards'] })
  }

  const invite = useMutation({
    mutationFn: () => api.boards.invite(board.id, { email: selected?.email ?? query, role }),
    onSuccess: () => {
      setQuery('')
      setSelected(null)
      setNotice(`${selected?.email ?? query} was added as ${role}`)
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Invite failed'),
  })

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) => api.boards.updateMemberRole(board.id, userId, role),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (userId: string) => api.boards.removeMember(board.id, userId),
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {board.members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <Avatar email={m.email} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{m.email}</span>
            {m.role === 'owner' ? (
              <RoleBadge role="owner" />
            ) : (
              <>
                <Select
                  className="w-32"
                  options={[
                    { value: 'editor', label: 'Editor' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  value={m.role}
                  onChange={(v) => changeRole.mutate({ userId: m.user_id, role: v as BoardRole })}
                />
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${m.email}`}
                  onClick={() => remove.mutate(m.user_id)}
                >
                  <TrashIcon className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Invite by email</p>
        <div className="relative">
          <TextField
            placeholder="Search existing users…"
            value={selected?.email ?? query}
            onChange={(e) => {
              setSelected(null)
              setQuery(e.target.value)
            }}
            className=""
          />
          {suggestions.length > 0 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setSelected(s)
                    setQuery(s.email)
                    setSuggestions([])
                  }}
                >
                  <Avatar email={s.email} size="sm" />
                  <span className="truncate">{s.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <Select
            className="w-36"
            label="Role"
            options={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'editor', label: 'Editor' },
            ]}
            value={role}
            onChange={(v) => setRole(v as 'editor' | 'viewer')}
          />
          <Button
            variant="primary"
            className="mb-0.5"
            onClick={() => invite.mutate()}
            disabled={!query.trim()}
            loading={invite.isPending}
          >
            <PlusIcon className="size-4" />
            Invite
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        {notice && <p className="mt-2 text-sm text-emerald-600">{notice}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Danger
// ---------------------------------------------------------------------------

function DangerTab({
  board,
  onArchived,
  onDeleted,
}: {
  board: BoardDetail
  onArchived: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [confirmArchive, setConfirmArchive] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const archive = useMutation({
    mutationFn: () => api.boards.archive(board.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] })
      setConfirmArchive(false)
      onArchived()
    },
  })
  const del = useMutation({
    mutationFn: () => api.boards.remove(board.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] })
      setConfirmDelete(false)
      onDeleted()
    },
  })

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
        <div className="flex items-start gap-2">
          <ArchiveIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Archive this board</p>
            <p className="text-xs text-amber-700">Moves it to the archived boards page (owners and admins only).</p>
          </div>
        </div>
        <Button variant="secondary" className="mt-2" onClick={() => setConfirmArchive(true)}>
          Archive board
        </Button>
      </div>

      <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-200">
        <div className="flex items-start gap-2">
          <TrashIcon className="mt-0.5 size-4 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800">Delete this board</p>
            <p className="text-xs text-rose-700">
              Permanently removes the board, its columns, {board.members.length} members and {board.total_tasks} tasks.
            </p>
          </div>
        </div>
        <Button variant="danger" className="mt-2" onClick={() => setConfirmDelete(true)}>
          Delete board
        </Button>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => archive.mutate()}
        confirmLoading={archive.isPending}
        title="Archive board"
        confirmLabel="Archive"
        message={<>Archive <b>{board.name}</b>? It will only be visible on the archived boards page.</>}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        confirmLoading={del.isPending}
        title="Delete board"
        danger
        confirmLabel="Delete permanently"
        message={<>This permanently deletes <b>{board.name}</b> and all of its data. This cannot be undone.</>}
      />
    </div>
  )
}