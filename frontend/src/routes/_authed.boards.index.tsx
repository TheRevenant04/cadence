import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { BoardSummary } from '@/types'
import { Button } from '@/components/ui/Button'
import { RoleBadge } from '@/components/ui/Badge'
import { InlineSpinner } from '@/components/ui/Spinner'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { NewBoardDialog } from '@/features/NewBoardDialog'
import { BoardIcon, PlusIcon, UsersIcon, CalendarIcon } from '@/components/icons'
import { formatDateOnly } from '@/lib/format'

export const Route = createFileRoute('/_authed/boards/')({
  component: BoardsListRoute,
})

function BoardsListRoute() {
  const [newOpen, setNewOpen] = React.useState(false)
  const boardsQuery = useQuery({ queryKey: ['boards'], queryFn: () => api.boards.list() })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Your boards</h1>
          <p className="mt-0.5 text-sm text-slate-500">Pick a board to get going.</p>
        </div>
        <Button variant="primary" onClick={() => setNewOpen(true)}>
          <PlusIcon className="size-4" />
          New board
        </Button>
      </div>

      {boardsQuery.isLoading ? (
        <InlineSpinner />
      ) : boardsQuery.isError || !boardsQuery.data ? (
        <ErrorState
          title="Could not load boards"
          message={boardsQuery.error instanceof Error ? boardsQuery.error.message : undefined}
          onRetry={() => void boardsQuery.refetch()}
        />
      ) : boardsQuery.data.length === 0 ? (
        <EmptyState
          icon={<BoardIcon className="size-6" />}
          title="No boards yet"
          description="Create your first board to start organising tasks."
          action={
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <PlusIcon className="size-4" />
              New board
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boardsQuery.data.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}

      <NewBoardDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function BoardCard({ board }: { board: BoardSummary }) {
  const overdue = board.overdue_tasks
  return (
    <Link
      to="/boards/$boardId"
      params={{ boardId: board.id }}
      className="card group flex flex-col gap-3 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-indigo-700">{board.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
            <UsersIcon className="size-3.5" />
            {board.member_count} member{board.member_count === 1 ? '' : 's'}
          </p>
        </div>
        <RoleBadge role={board.role} />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{board.total_tasks} tasks</span>
        <span className={overdue > 0 ? 'font-medium text-rose-600' : ''}>
          {overdue} overdue
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <CalendarIcon className="size-3" />
          {formatDateOnly(board.created_at.slice(0, 10))}
        </span>
      </div>
      {board.is_archived && <span className="chip w-fit bg-amber-100 text-amber-700">Archived</span>}
    </Link>
  )
}