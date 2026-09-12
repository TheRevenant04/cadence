import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { BoardSummary } from '@/types'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineSpinner } from '@/components/ui/Spinner'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { ArchiveBoxIcon, ArchiveIcon, BoardIcon, TrashIcon } from '@/components/icons'
import { formatDateLong } from '@/lib/format'

export const Route = createFileRoute('/_authed/boards/archived')({
  component: ArchivedRoute,
})

function ArchivedRoute() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['archived-boards'], queryFn: () => api.boards.listArchived() })
  const [confirmDelete, setConfirmDelete] = React.useState<BoardSummary | null>(null)
  const [notice, setNotice] = React.useState(false)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['archived-boards'] })
    void qc.invalidateQueries({ queryKey: ['boards'] })
    setNotice(true)
    const t = setTimeout(() => setNotice(false), 3000)
    return () => clearTimeout(t)
  }

  const restore = useMutation({
    mutationFn: (boardId: string) => api.boards.unarchive(boardId),
    onSuccess: invalidate,
  })

  const del = useMutation({
    mutationFn: (boardId: string) => api.boards.remove(boardId),
    onSuccess: () => {
      setConfirmDelete(null)
      invalidate()
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Archived boards</h1>
            <span className="chip bg-amber-100 text-amber-700">Owners & admins</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            <Link to="/boards" className="font-medium text-indigo-600 hover:text-indigo-700">
              ← Back to boards
            </Link>
          </p>
        </div>
      </div>

      {notice && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">Board updated.</div>}

      {query.isLoading ? (
        <InlineSpinner />
      ) : query.isError || !query.data ? (
        <ErrorState
          title="Could not load archived boards"
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<ArchiveBoxIcon className="size-6" />}
          title="No archived boards"
          description="Archived boards only appear here for owners and admins."
        />
      ) : (
        <ul className="space-y-3">
          {query.data.map((board) => (
            <li key={board.id} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <BoardIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{board.name}</p>
                <p className="text-xs text-slate-400">
                  Archived {formatDateLong(board.updated_at)} · {board.total_tasks} tasks
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={restore.isPending && restore.variables === board.id}
                  onClick={() => restore.mutate(board.id)}
                >
                  <ArchiveIcon className="size-3.5 rotate-180" />
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(board)}>
                  <TrashIcon className="size-3.5" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) del.mutate(confirmDelete.id)
        }}
        confirmLoading={del.isPending}
        title="Delete archived board"
        danger
        confirmLabel="Delete permanently"
        message={
          <>
            Permanently delete <b>{confirmDelete?.name}</b> and all of its data? This cannot be undone.
          </>
        }
      />
    </div>
  )
}