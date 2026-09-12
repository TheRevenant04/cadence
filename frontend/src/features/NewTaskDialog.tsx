import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { BoardDetail } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { TextField, TextAreaField } from '@/components/ui/Field'
import { TagPicker } from './TagPicker'

interface NewTaskDialogProps {
  open: boolean
  board: BoardDetail
  defaultColumnId: string
  onClose: () => void
  onCreated: (taskId: string) => void
}

export function NewTaskDialog({ open, board, defaultColumnId, onClose, onCreated }: NewTaskDialogProps) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [assigneeId, setAssigneeId] = React.useState('')
  const [tagIds, setTagIds] = React.useState<string[]>([])
  const [columnId, setColumnId] = React.useState(defaultColumnId)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setDueDate('')
      setAssigneeId('')
      setTagIds([])
      setColumnId(defaultColumnId)
      setError(null)
    }
  }, [open, defaultColumnId])

  const create = useMutation({
    mutationFn: () =>
      api.tasks.create(board.id, {
        column_id: columnId,
        title,
        description: description.trim() ? description : null,
        due_date: dueDate || null,
        assignee_id: assigneeId || null,
        tag_ids: tagIds,
      }),
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: ['board', board.id] })
      void qc.invalidateQueries({ queryKey: ['boards'] })
      onClose()
      onCreated(task.id)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Task title is required')
      return
    }
    setError(null)
    create.mutate()
  }

  const assigneeOptions = board.members.map((m) => ({ value: m.user_id, label: m.email }))

  return (
    <Modal open={open} onClose={onClose} title="New task" size="lg">
      <form onSubmit={submit} className="px-5 py-4">
        <div className="space-y-4">
          <TextField
            label="Title"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            error={create.isError ? undefined : null}
          />
          <TextAreaField
            label="Description"
            placeholder="Optional description (basic Markdown supported)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Column"
              options={board.columns.map((c) => ({ value: c.id, label: c.name }))}
              value={columnId}
              onChange={setColumnId}
            />
            <label className="space-y-1">
              <span className="label">Due date</span>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <Select label="Assignee" emptyLabel="Unassigned" options={assigneeOptions} value={assigneeId} onChange={setAssigneeId} />
          </div>
          <div>
            <span className="label">Tags</span>
            <TagPicker tags={board.tags} selected={tagIds} onChange={setTagIds} />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  )
}