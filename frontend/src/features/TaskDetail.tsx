import React from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { ActivityLog, BoardDetail, TaskDetail } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { TextAreaField } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { InlineSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { Markdown } from '@/components/Markdown'
import { useAuthStore } from '@/stores/useAuth'
import { cn } from '@/lib/cn'
import { formatDateTime, formatDateOnlyLong, timeAgo } from '@/lib/format'
import { DueDateBadge, TagChip } from './TaskPieces'
import { TagPicker } from './TagPicker'
import { CalendarIcon, EditIcon, PaperAirplaneIcon, TrashIcon, XMarkIcon } from '@/components/icons'

function invalidateRelated(qc: ReturnType<typeof useQueryClient>, boardId: string, taskId: string) {
  void qc.invalidateQueries({ queryKey: ['task', taskId] })
  void qc.invalidateQueries({ queryKey: ['board', boardId] })
  void qc.invalidateQueries({ queryKey: ['boards'] })
}

// ---------------------------------------------------------------------------
// Activity timeline
// ---------------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  'task.created': 'C',
  'task.title_changed': 'T',
  'task.edited': 'E',
  'task.description_changed': 'D',
  'task.moved': 'M',
  'task.reordered': 'R',
  'task.assignee_changed': 'A',
  'task.due_date_changed': 'D',
  'task.tags_changed': 'G',
  'task.deleted': 'X',
  'comment.added': '💬',
}

const ACTION_TONE: Record<string, string> = {
  'task.created': 'bg-indigo-100 text-indigo-600',
  'task.title_changed': 'bg-sky-100 text-sky-600',
  'task.edited': 'bg-sky-100 text-sky-600',
  'task.description_changed': 'bg-sky-100 text-sky-600',
  'task.moved': 'bg-indigo-100 text-indigo-600',
  'task.reordered': 'bg-indigo-100 text-indigo-600',
  'task.assignee_changed': 'bg-purple-100 text-purple-600',
  'task.due_date_changed': 'bg-amber-100 text-amber-600',
  'task.tags_changed': 'bg-pink-100 text-pink-600',
  'task.deleted': 'bg-rose-100 text-rose-600',
  'comment.added': 'bg-emerald-100 text-emerald-600',
  'comment.edited': 'bg-emerald-100 text-emerald-600',
  'comment.deleted': 'bg-rose-100 text-rose-600',
}

export function ActivityTimeline({ activity }: { activity: ActivityLog[] }) {
  return (
    <ol className="space-y-0">
      {activity.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-3 pb-4">
          {i < activity.length - 1 && <span className="absolute top-7 left-[11px] h-full w-px bg-slate-200" />}
          <span
            className={cn(
              'relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              ACTION_TONE[entry.action_type] ?? 'bg-slate-100 text-slate-500',
            )}
          >
            {(ACTION_LABEL[entry.action_type] ?? '•').slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-slate-700">
              <span className="font-semibold text-slate-900">{entry.user.email.split('@')[0]}</span>{' '}
              {entry.human_readable_message}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(entry.created_at)}</p>
          </div>
        </li>
      ))}
      {activity.length === 0 && <p className="italic text-slate-400 text-sm">No activity recorded yet.</p>}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentSection({ board, task, meId }: { board: BoardDetail; task: TaskDetail; meId: string }) {
  const qc = useQueryClient()
  const [draft, setDraft] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editText, setEditText] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)
  const canEdit = board.role === 'editor' || board.role === 'owner'

  const invalidate = () => invalidateRelated(qc, board.id, task.id)

  const add = useMutation({
    mutationFn: () => api.comments.create(task.id, draft),
    onSuccess: () => {
      setDraft('')
      invalidate()
    },
  })
  const update = useMutation({
    mutationFn: () => api.comments.update(editingId!, editText),
    onSuccess: () => {
      setEditingId(null)
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: () => api.comments.remove(confirmDelete!),
    onSuccess: () => {
      setConfirmDelete(null)
      invalidate()
    },
  })

  return (
    <section aria-label="Comments">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">
        {task.comments.length} comment{task.comments.length === 1 ? '' : 's'}
      </h3>
      <ul className="space-y-3">
        {task.comments.map((c) => {
          const isEditing = editingId === c.id
          const isAuthor = meId === c.user_id
          const canModify = isAuthor || board.role === 'owner'
          return (
            <li key={c.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <Avatar email={c.user.email} size="sm" />
                <span className="text-sm font-medium text-slate-800">{c.user.email}</span>
                <span className="text-[11px] text-slate-400">
                  {timeAgo(c.created_at)}
                  {c.updated_at !== c.created_at && ' (edited)'}
                </span>
                {canEdit && canModify && !isEditing && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      aria-label="Edit comment"
                      onClick={() => {
                        setEditingId(c.id)
                        setEditText(c.content)
                      }}
                    >
                      <EditIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                      aria-label="Delete comment"
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </span>
                )}
              </div>
              {isEditing ? (
                <form
                  className="mt-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (editText.trim()) update.mutate()
                  }}
                >
                  <TextAreaField value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" type="submit" loading={update.isPending}>
                      Save
                    </Button>
                  </div>
                </form>
              ) : (
                <Markdown text={c.content} className="mt-1.5 text-sm" />
              )}
            </li>
          )
        })}
      </ul>

      {canEdit ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) add.mutate()
          }}
        >
          <div className="flex items-end gap-2">
            <TextAreaField
              placeholder="Write a comment… (basic Markdown supported)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!draft.trim()}
              loading={add.isPending}
              aria-label="Post comment"
              className="mb-0.5"
            >
              <PaperAirplaneIcon className="size-4" />
              <span className="hidden sm:inline">Comment</span>
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">Viewers cannot comment on tasks.</p>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => remove.mutate()}
        confirmLoading={remove.isPending}
        title="Delete comment"
        danger
        confirmLabel="Delete"
        message="This comment will be permanently removed."
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Task detail core — shared by the modal and the standalone page
// ---------------------------------------------------------------------------

interface Draft {
  title: string
  description: string
  dueDate: string
  assigneeId: string
  tagIds: string[]
}

interface TaskDetailCoreProps {
  boardId: string
  taskId: string
  isModal?: boolean
  onClose?: () => void
  onDeleted?: () => void
}

export function TaskDetailCore({ boardId, taskId, isModal = false, onClose, onDeleted }: TaskDetailCoreProps) {
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const boardQuery = useQuery({ queryKey: ['board', boardId], queryFn: () => api.boards.get(boardId) })
  const taskQuery = useQuery({ queryKey: ['task', taskId], queryFn: () => api.tasks.get(boardId, taskId) })

  const board = boardQuery.data
  const task = taskQuery.data
  const canEditRole = board?.role === 'editor' || board?.role === 'owner'

  const [editing, setEditing] = React.useState(false)
  const [descriptionMode, setDescriptionMode] = React.useState<'write' | 'preview'>('write')
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    setEditing(false)
    setDescriptionMode('write')
    setError(null)
  }, [taskId])

  React.useEffect(() => {
    if (task) {
      setDraft({
        title: task.title,
        description: task.description ?? '',
        dueDate: task.due_date ?? '',
        assigneeId: task.assignee_id ?? '',
        tagIds: task.tags.map((t) => t.id),
      })
    }
  }, [task])

  const savedEdits = useMutation({
    mutationFn: async () => {
      if (!draft) return
      await api.tasks.update(boardId, taskId, {
        title: draft.title.trim(),
        description: draft.description.trim() ? draft.description : null,
        due_date: draft.dueDate || null,
        assignee_id: draft.assigneeId || null,
      })
      if (board) await api.tasks.setTags(boardId, taskId, draft.tagIds)
    },
    onSuccess: () => {
      invalidateRelated(qc, boardId, taskId)
      setEditing(false)
      setError(null)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save task'),
  })

  const del = useMutation({
    mutationFn: () => api.tasks.remove(boardId, taskId),
    onSuccess: () => {
      invalidateRelated(qc, boardId, taskId)
      setConfirmDelete(false)
      onDeleted?.()
    },
  })

  if (taskQuery.isLoading || boardQuery.isLoading) return <div className="p-6"><InlineSpinner /></div>
  if (taskQuery.isError || !task || !board) {
    return (
      <div className="p-6">
        <ErrorState
          title="Could not load task"
          message={taskQuery.error instanceof Error ? taskQuery.error.message : undefined}
          onRetry={() => {
            void taskQuery.refetch()
            void boardQuery.refetch()
          }}
        />
      </div>
    )
  }

  const trimmedDesc = (draft?.description ?? task.description ?? '').trim()
  const dueLabel = task.due_date

  return (
    <div className={cn('flex flex-col overflow-hidden', isModal && 'max-h-[85vh] rounded-b-2xl')}>
      {/* header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={draft?.title ?? ''}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                className="input px-3 py-2 text-lg font-semibold"
                aria-label="Task title"
              />
            ) : (
              <h2 className="text-lg leading-snug font-semibold break-words text-slate-900">{task.title}</h2>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-indigo-400" />
                {board.columns.find((c) => c.id === task.column_id)?.name ?? '—'}
              </span>
              <span>Created {formatDateTime(task.created_at)}</span>
              {task.updated_at !== task.created_at && <span>Edited {timeAgo(task.updated_at)}</span>}
            </div>
          </div>
          {canEditRole && !editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="shrink-0">
              <EditIcon className="size-3.5" />
              Edit
            </Button>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close task detail"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <XMarkIcon className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-5 py-4">
        {/* description */}
        <div className="pb-4">
          <div className="flex items-center justify-between">
            <h3 className="mb-1.5 text-sm font-semibold text-slate-900">Description</h3>
            {canEditRole && editing && (
              <span className="mb-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => setDescriptionMode('write')}
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-semibold transition-colors',
                    descriptionMode === 'write' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-100',
                  )}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setDescriptionMode('preview')}
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-semibold transition-colors',
                    descriptionMode === 'preview' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-100',
                  )}
                >
                  Preview
                </button>
              </span>
            )}
          </div>
          {editing && descriptionMode === 'write' ? (
            <TextAreaField
              value={draft?.description ?? ''}
              onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
              rows={5}
              placeholder="Add a more detailed description (Markdown supported)…"
              className=""
            />
          ) : trimmedDesc ? (
            <Markdown text={trimmedDesc} />
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 italic">
              No description yet{canEditRole ? ' — click Edit to add one.' : '.'}
            </p>
          )}
        </div>

        {/* details */}
        <div className="py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Details</h3>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="label">Due date</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="input flex-1"
                    value={draft?.dueDate ?? ''}
                    onChange={(e) => setDraft((d) => (d ? { ...d, dueDate: e.target.value } : d))}
                  />
                  {draft?.dueDate && (
                    <Button size="sm" variant="secondary" onClick={() => setDraft((d) => (d ? { ...d, dueDate: '' } : d))}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <Select
                label="Assignee"
                emptyLabel="Unassigned"
                options={board.members.map((m) => ({ value: m.user_id, label: m.email }))}
                value={draft?.assigneeId ?? ''}
                onChange={(v) => setDraft((d) => (d ? { ...d, assigneeId: v } : d))}
              />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                <CalendarIcon className="size-4 shrink-0 text-slate-400" />
                {task.due_date ? (
                  <>
                    <DueDateBadge dueDate={task.due_date} />
                    <span className="text-[11px] text-slate-400">({formatDateOnlyLong(task.due_date)})</span>
                  </>
                ) : (
                  <span className="text-slate-400">No due date</span>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                {task.assignee ? (
                  <>
                    <Avatar email={task.assignee.email} size="sm" />
                    <span className="min-w-0 truncate text-slate-700">{task.assignee.email}</span>
                  </>
                ) : (
                  <span className="text-slate-400">Unassigned</span>
                )}
              </div>
            </div>
          )}
          <div className="mt-3">
            <span className="label">Tags</span>
            {editing ? (
              <TagPicker tags={board.tags} selected={draft?.tagIds ?? []} onChange={(ids) => setDraft((d) => (d ? { ...d, tagIds: ids } : d))} />
            ) : task.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((t) => (
                  <TagChip key={t.id} tag={t} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No tags</p>
            )}
          </div>
        </div>

        {/* comments */}
        <div className="py-4">
          <CommentSection board={board} task={task} meId={me?.id ?? ''} />
        </div>

        {/* activity */}
        <div className="py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Activity</h3>
          <ActivityTimeline activity={task.activity} />
        </div>
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          {canEditRole && (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} loading={del.isPending}>
              <TrashIcon className="size-3.5" />
              Delete task
            </Button>
          )}
          <span className="text-[11px] text-slate-400">Due: {dueLabel ? formatDateOnlyLong(dueLabel) : 'none'}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          {isModal && (
            <Link
              to="/boards/$boardId/tasks/$taskId"
              params={{ boardId, taskId }}
              className="btn btn-secondary"
              onClick={onClose}
            >
              Open full page
            </Link>
          )}
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" loading={savedEdits.isPending} onClick={() => savedEdits.mutate()}>
                Save changes
              </Button>
            </>
          ) : (
            isModal && (
              <Button variant="secondary" size="sm" onClick={onClose} className="lg:hidden">
                Close
              </Button>
            )
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        confirmLoading={del.isPending}
        title="Delete task"
        danger
        confirmLabel="Delete task"
        message={<>Permanently delete <b>{task.title}</b>? This action cannot be undone.</>}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

export function TaskDetailModal({
  boardId,
  taskId,
  open,
  onClose,
  onDeleted,
}: {
  boardId: string
  taskId: string | null
  open: boolean
  onClose: () => void
  onDeleted?: () => void
}) {
  if (!open || !taskId) return null
  return (
    <Modal open={open} onClose={onClose} size="full" hideClose className="p-0" title={undefined}>
      <TaskDetailCore boardId={boardId} taskId={taskId} isModal onClose={onClose} onDeleted={onDeleted} />
    </Modal>
  )
}