import React from 'react'
import { cn } from '@/lib/cn'
import type { TaskFull } from '@/types'
import { DueDateBadge, TagChip } from './TaskPieces'
import { Avatar } from '@/components/ui/Avatar'

export interface DropPosition {
  type: 'before' | 'after' | 'end'
  taskId?: string
  columnId?: string
}

interface TaskCardProps {
  task: TaskFull
  selected: boolean
  draggable: boolean
  dropPosition: DropPosition | null
  onOpen: () => void
  onDragStart: (taskId: string) => void
  onDragOverTask: (taskId: string, position: 'before' | 'after') => void
  onDragOverEnd: () => void
  onDropBefore: (taskId: string, position: 'before' | 'after') => void
}

export function TaskCard({
  task,
  selected,
  draggable,
  dropPosition,
  onOpen,
  onDragStart,
  onDragOverTask,
  onDragOverEnd,
  onDropBefore,
}: TaskCardProps) {
  const isDropHere = dropPosition?.type !== 'end' && dropPosition?.taskId === task.id
  const dropBefore = isDropHere && dropPosition?.type === 'before'
  const dropAfter = isDropHere && dropPosition?.type === 'after'

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        onDragOverTask(task.id, before ? 'before' : 'after')
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        onDropBefore(task.id, before ? 'before' : 'after')
      }}
      className={cn(
        'group relative cursor-pointer rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-indigo-500',
        dropBefore && 'translate-y-1 border-t-2 border-indigo-500 ring-indigo-200',
        dropAfter && '-translate-y-1 border-b-2 border-indigo-500 ring-indigo-200',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
      )}
      onClick={onOpen}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-slate-800">{task.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.tags.slice(0, 3).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.due_date && <DueDateBadge dueDate={task.due_date} />}
          </div>
        </div>
        {task.assignee && (
          <Avatar email={task.assignee.email} size="sm" className="mt-0.5" />
        )}
      </div>
    </div>
  )
}