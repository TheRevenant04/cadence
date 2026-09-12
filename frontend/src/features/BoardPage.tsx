import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '@/api'
import type { BoardDetail, TaskFull } from '@/types'
import { useAuthStore } from '@/stores/useAuth'
import { useBoardSelectionStore } from '@/stores/useBoardSelection'
import { cn } from '@/lib/cn'
import { sortByRank } from '@/lib/rank'
import { Button } from '@/components/ui/Button'
import { Dropdown, DropdownItem, DropdownDivider, DropdownLabel } from '@/components/ui/Dropdown'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { RoleBadge } from '@/components/ui/Badge'
import { TaskCard, type DropPosition } from './TaskCard'
import { FilterBar, filteredTasks } from './FilterBar'
import { StatsPanel } from './StatsPanel'
import { NewTaskDialog } from './NewTaskDialog'
import { SettingsDialog } from './SettingsDialog'
import { TaskDetailModal } from './TaskDetail'
import {
  ArchiveIcon,
  EyeIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  UsersIcon,
} from '@/components/icons'

function useBoardRealtime(boardId: string) {
  const qc = useQueryClient()
  React.useEffect(() => {
    return api.realtime.subscribeBoard(boardId, () => {
      void qc.invalidateQueries({ queryKey: ['board', boardId] })
      void qc.invalidateQueries({ queryKey: ['boards'] })
    })
  }, [boardId, qc])
}

function columnTasks(board: BoardDetail, columnId: string): TaskFull[] {
  return sortByRank(
    board.tasks.filter((t) => t.column_id === columnId),
    (t) => t.rank,
  )
}

interface BoardPageProps {
  boardId: string
}

export function BoardPage({ boardId }: BoardPageProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const setBoard = useBoardSelectionStore((s) => s.setBoard)

  const boardQuery = useQuery({ queryKey: ['board', boardId], queryFn: () => api.boards.get(boardId) })
  const board = boardQuery.data
  useBoardRealtime(boardId)

  React.useEffect(() => {
    setBoard(boardId)
  }, [boardId, setBoard])

  const canEdit = board?.role === 'editor' || board?.role === 'owner'
  const canManage = board?.role === 'owner'

  // filters
  const [search, setSearch] = React.useState('')
  const [tagIds, setTagIds] = React.useState<string[]>([])
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([])
  const searchRef = React.useRef<HTMLInputElement | null>(null)

  // dialogs
  const [newTaskOpen, setNewTaskOpen] = React.useState(false)
  const [newTaskColumnId, setNewTaskColumnId] = React.useState<string>('')
  const [modalTaskId, setModalTaskId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [deleteTaskId, setDeleteTaskId] = React.useState<string | null>(null)

  // drag & drop
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null)
  const [drop, setDrop] = React.useState<DropPosition | null>(null)

  const resetDrop = () => {
    setDraggedTaskId(null)
    setDrop(null)
  }

  const move = useMutation({
    mutationFn: (input: { taskId: string; columnId: string; beforeId?: string | null; afterId?: string | null }) =>
      api.tasks.move(boardId, input.taskId, {
        column_id: input.columnId,
        before_task_id: input.beforeId,
        after_task_id: input.afterId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['board', boardId] })
      void qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })

  const visibleTasks = board ? filteredTasks(board, search, tagIds, assigneeIds) : []

  const handleDropAtEnd = (columnId: string) => {
    const from = draggedTaskId
    setDrop(null)
    if (!from) return
    move.mutate({ taskId: from, columnId, beforeId: null, afterId: null })
  }

  const handleDropOnCard = (targetTaskId: string, position: 'before' | 'after') => {
    const from = draggedTaskId
    const target = board?.tasks.find((t) => t.id === targetTaskId)
    setDrop(null)
    if (!from || !target || from === targetTaskId) {
      if (from === targetTaskId) move.mutate({ taskId: from, columnId: target?.column_id ?? '', beforeId: target?.column_id ? undefined : null, afterId: null })
      return
    }
    if (position === 'before') {
      move.mutate({ taskId: from, columnId: target.column_id, beforeId: targetTaskId, afterId: null })
    } else {
      move.mutate({ taskId: from, columnId: target.column_id, beforeId: null, afterId: targetTaskId })
    }
  }

  const attemptDelete = (taskId: string) => setDeleteTaskId(taskId)

  // keyboard shortcuts
  const selection = useBoardSelectionStore((s) => s)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

      if (e.key === 'Escape') {
        setModalTaskId(null)
        selection.clear()
        setDrop(null)
        return
      }
      if (typing || !board) return

      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        setNewTaskColumnId(selection.columnId ?? board.columns[0]?.id ?? '')
        setNewTaskOpen(true)
      } else if (key === 'e') {
        e.preventDefault()
        if (selection.taskId) setModalTaskId(selection.taskId)
      } else if (key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.taskId) {
          e.preventDefault()
          setDeleteTaskId(selection.taskId)
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        if (!board) return
        const list = visibleTasks
        if (list.length === 0) return
        const idx = list.findIndex((t) => t.id === selection.taskId)
        const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
        const nextIdx = Math.max(0, Math.min(list.length - 1, (idx < 0 ? 0 : idx) + step))
        const next = list[nextIdx]
        if (next) {
          selection.select(next.id, next.column_id)
          const el = document.getElementById(`task-${next.id}`)
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [board, search, tagIds, assigneeIds, selection, visibleTasks])

  if (boardQuery.isLoading) return <InlineSpinner />
  if (boardQuery.isError || !board) {
    return (
      <ErrorState
        title="Could not load board"
        message={boardQuery.error instanceof Error ? boardQuery.error.message : undefined}
        onRetry={() => void boardQuery.refetch()}
      />
    )
  }

  const selectedTask = deleteTaskId ? board.tasks.find((t) => t.id === deleteTaskId) : null

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{board.name}</h1>
            <RoleBadge role={board.role} />
            {board.is_archived && <span className="chip bg-amber-100 text-amber-700">Archived</span>}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <UsersIcon className="size-3.5" />
            {board.member_count} member{board.member_count === 1 ? '' : 's'} · {board.columns.length} columns · {board.total_tasks} tasks
            {!canEdit && <span className="ml-1 inline-flex items-center gap-0.5 text-slate-400"><EyeIcon className="size-3.5" /> read-only</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="primary" onClick={() => { setNewTaskColumnId(board.columns[0]?.id ?? ''); setNewTaskOpen(true) }}>
              <PlusIcon className="size-4" />
              New task
            </Button>
          )}
          {canManage ? (
            <Dropdown
              trigger={
                <span className="btn btn-secondary">
                  <SettingsIcon className="size-4" />
                  <span className="hidden sm:inline">Manage</span>
                </span>
              }
            >
              <DropdownLabel>Board settings</DropdownLabel>
              <DropdownItem onClick={() => setSettingsOpen(true)} icon={<SettingsIcon className="size-4" />}>
                Columns, tags & members
              </DropdownItem>
              <DropdownItem onClick={() => { void api.boards.archive(board.id).then(() => { void qc.invalidateQueries({ queryKey: ['boards'] }); void navigate({ to: '/boards' }) }) }} icon={<ArchiveIcon className="size-4" />}>
                Archive board
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem danger onClick={() => setSettingsOpen(true)} icon={<TrashIcon className="size-4" />}>
                Delete…
              </DropdownItem>
            </Dropdown>
          ) : (
            <Button variant="secondary" onClick={() => setSettingsOpen(true)} disabled={!canManage} className="hidden">
              Manage
            </Button>
          )}
        </div>
      </div>

      {/* filters + stats */}
      <FilterBar
        board={board}
        search={search}
        onSearchChange={setSearch}
        tagIds={tagIds}
        onTagIdsChange={setTagIds}
        assigneeIds={assigneeIds}
        onAssigneeIdsChange={setAssigneeIds}
        searchRef={searchRef}
      />
      <StatsPanel board={board} tasks={visibleTasks} />

      {/* columns */}
      <div className="flex items-start gap-4 overflow-x-auto pb-2 thin-scroll">
        {board.columns.map((column) => {
          const tasksInColumn = columnTasks(board, column.id)
          const shown = tasksInColumn.filter((t) => visibleTasks.some((vt) => vt.id === t.id))
          const filteredOut = tasksInColumn.length - shown.length
          const isDropEnd = drop?.type === 'end' && drop.columnId === column.id

          return (
            <section
              key={column.id}
              className="flex w-72 max-h-[72vh] shrink-0 flex-col rounded-xl bg-slate-200/60 ring-1 ring-slate-300/60"
              onDragOver={(e) => {
                if (!canEdit) return
                e.preventDefault()
                setDrop({ type: 'end', columnId: column.id })
              }}
              onDrop={(e) => {
                if (!canEdit) return
                e.preventDefault()
                handleDropAtEnd(column.id)
              }}
            >
              <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-300/70 px-1.5 text-[11px] font-bold text-slate-700">
                  {shown.length}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{column.name}</h2>
                {canEdit && (
                  <button
                    type="button"
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-300/60 hover:text-slate-700"
                    aria-label={`Add task to ${column.name}`}
                    onClick={() => {
                      setNewTaskColumnId(column.id)
                      setNewTaskOpen(true)
                    }}
                  >
                    <PlusIcon className="size-4" />
                  </button>
                )}
              </header>

              <div className="flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-2 thin-scroll">
                {shown.map((task) => (
                  <div key={task.id} id={`task-${task.id}`}>
                    <TaskCard
                      task={task}
                      selected={selection.taskId === task.id}
                      draggable={canEdit && draggedTaskId !== task.id}
                      dropPosition={draggedTaskId && draggedTaskId !== task.id ? drop : null}
                      onOpen={() => setModalTaskId(task.id)}
                      onDragStart={(id) => setDraggedTaskId(id)}
                      onDragOverTask={(id, pos) => setDrop({ type: pos, taskId: id })}
                      onDragOverEnd={() => setDrop({ type: 'end', columnId: column.id })}
                      onDropBefore={(id, pos) => handleDropOnCard(id, pos)}
                    />
                  </div>
                ))}
                {shown.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    {filteredOut > 0 ? `${filteredOut} task${filteredOut === 1 ? '' : 's'} hidden by filters` : canEdit ? 'Drop tasks here or press N' : 'No tasks'}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'mx-2.5 mb-2.5 flex h-9 items-center justify-center rounded-lg border border-dashed text-xs transition-colors',
                  isDropEnd ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-300 text-slate-400',
                )}
              >
                {isDropEnd ? 'Drop to add here' : 'Drop to add here'}
              </div>
            </section>
          )
        })}

        {canManage && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-14 w-72 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-400 transition-colors hover:border-indigo-300 hover:bg-white hover:text-indigo-600"
          >
            <PlusIcon className="size-4" />
            Edit columns
          </button>
        )}
      </div>

      {/* empty board */}
      {board.columns.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
          <InboxIcon className="size-10 text-slate-300" />
          <p className="text-sm text-slate-500">This board has no columns yet.</p>
          {canManage ? (
            <Button variant="primary" onClick={() => setSettingsOpen(true)}>
              Add your first column
            </Button>
          ) : (
            <p className="text-xs text-slate-400">Ask the board owner to add columns.</p>
          )}
        </div>
      )}

      {/* dialogs */}
      <NewTaskDialog
        open={newTaskOpen}
        board={board}
        defaultColumnId={newTaskColumnId || board.columns[0]?.id || ''}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(taskId) => setModalTaskId(taskId)}
      />
      <TaskDetailModal
        boardId={board.id}
        taskId={modalTaskId}
        open={!!modalTaskId}
        onClose={() => setModalTaskId(null)}
        onDeleted={() => setModalTaskId(null)}
      />
      <SettingsDialog
        open={settingsOpen}
        board={board}
        onClose={() => setSettingsOpen(false)}
        onArchived={() => {
          void navigate({ to: '/boards' })
        }}
        onDeleted={() => {
          void navigate({ to: '/boards' })
        }}
      />
      <ConfirmDialog
        open={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        onConfirm={() => {
          if (!deleteTaskId) return
          void api.tasks.remove(board.id, deleteTaskId).then(() => {
            void qc.invalidateQueries({ queryKey: ['board', board.id] })
            void qc.invalidateQueries({ queryKey: ['boards'] })
            setDeleteTaskId(null)
            if (selection.taskId === deleteTaskId) selection.clear()
          })
        }}
        title="Delete task"
        danger
        confirmLabel="Delete task"
        message={<>Permanently delete <b>{selectedTask?.title ?? 'this task'}</b>? This action cannot be undone.</>}
      />
    </div>
  )
}