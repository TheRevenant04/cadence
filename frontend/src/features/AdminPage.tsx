import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api } from '@/api'
import type { User } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatDateOnly } from '@/lib/format'
import { TrashIcon, ShieldIcon } from '@/components/icons'

export function AdminPage() {
  const [tab, setTab] = React.useState<'users' | 'boards'>('users')
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldIcon className="size-5 text-indigo-500" />
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin panel</h1>
      </div>
      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 ring-1 ring-slate-200 w-fit">
        {(['users', 'boards'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTab /> : <BoardsTab />}
    </div>
  )
}

function UsersTab() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-users'], queryFn: () => api.admin.listUsers() })
  const me = query.data ? null : null

  const toggle = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => api.admin.setUserActive(userId, active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  if (query.isLoading) return <InlineSpinner />
  if (query.isError || !query.data) {
    return <ErrorState title="Could not load users" message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2.5 font-semibold">User</th>
            <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Joined</th>
            <th className="px-4 py-2.5 font-semibold">Role</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {query.data.map((u: User) => (
            <tr key={u.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar email={u.email} size="sm" />
                  <span className="font-medium text-slate-800">{u.email}</span>
                </div>
              </td>
              <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{formatDateOnly(u.created_at.slice(0, 10))}</td>
              <td className="px-4 py-2.5">{u.is_admin ? <Badge tone="purple">Admin</Badge> : <Badge>User</Badge>}</td>
              <td className="px-4 py-2.5">
                <span className={cn('chip', u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                  {u.is_active ? 'Active' : 'Deactivated'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                {u.is_admin ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  <Button
                    variant={u.is_active ? 'secondary' : 'primary'}
                    size="sm"
                    loading={toggle.isPending}
                    onClick={() => toggle.mutate({ userId: u.id, active: !u.is_active })}
                  >
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface AdminBoardRow {
  id: string
  name: string
  owner_email: string
  is_archived: boolean
  member_count: number
  total_tasks: number
  created_at: string
}

function BoardsTab() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-boards'], queryFn: () => api.admin.listBoards() })
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const del = useMutation({
    mutationFn: (boardId: string) => api.boards.remove(boardId),
    onSuccess: () => {
      setConfirmDelete(null)
      void qc.invalidateQueries({ queryKey: ['admin-boards'] })
      void qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })

  if (query.isLoading) return <InlineSpinner />
  if (query.isError || !query.data) {
    return <ErrorState title="Could not load boards" message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} />
  }

  const boards = query.data as unknown as AdminBoardRow[]

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Board</th>
            <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Owner</th>
            <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Members / Tasks</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {boards.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-2.5">
                <Link to="/boards/$boardId" params={{ boardId: b.id }} className="font-medium text-slate-800 hover:text-indigo-700">
                  {b.name}
                </Link>
              </td>
              <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">{b.owner_email || b.id}</td>
              <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
                {b.member_count} / {b.total_tasks}
              </td>
              <td className="px-4 py-2.5">
                <span className={cn('chip', b.is_archived ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                  {b.is_archived ? 'Archived' : 'Active'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(b.id)}>
                  <TrashIcon className="size-3.5" />
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) del.mutate(confirmDelete)
        }}
        confirmLoading={del.isPending}
        title="Delete board"
        danger
        confirmLabel="Delete board"
        message="Delete this board permanently as an admin? This cannot be undone."
      />
    </div>
  )
}