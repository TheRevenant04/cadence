import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '@/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextField, TextAreaField } from '@/components/ui/Field'

export function NewBoardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = React.useState('')
  const [columns, setColumns] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setName('')
      setColumns('')
      setError(null)
    }
  }, [open])

  const create = useMutation({
    mutationFn: () =>
      api.boards.create({
        name,
        column_names: columns.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 12),
      }),
    onSuccess: (board) => {
      void qc.invalidateQueries({ queryKey: ['boards'] })
      onClose()
      void navigate({ to: '/boards/$boardId', params: { boardId: board.id } })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to create board'),
  })

  return (
    <Modal open={open} onClose={onClose} title="New board" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) {
            setError('Board name is required')
            return
          }
          setError(null)
          create.mutate()
        }}
        className="px-5 py-4"
      >
        <div className="space-y-4">
          <TextField
            label="Board name"
            placeholder="e.g. Product Launch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <TextAreaField
            label="Initial columns (optional)"
            hint="Comma-separated. Defaults to To Do, In Progress, Done"
            placeholder="Backlog, In Progress, Review, Done"
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
            rows={2}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create board
          </Button>
        </div>
      </form>
    </Modal>
  )
}