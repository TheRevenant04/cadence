import React from 'react'
import type { BoardDetail, TaskFull } from '@/types'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { SearchIcon, XMarkIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

interface FilterBarProps {
  board: BoardDetail
  search: string
  onSearchChange: (value: string) => void
  tagIds: string[]
  onTagIdsChange: (value: string[]) => void
  assigneeIds: string[]
  onAssigneeIdsChange: (value: string[]) => void
  searchRef?: React.Ref<HTMLInputElement>
}

export function FilterBar({
  board,
  search,
  onSearchChange,
  tagIds,
  onTagIdsChange,
  assigneeIds,
  onAssigneeIdsChange,
  searchRef,
}: FilterBarProps) {
  const taskCounts = React.useMemo(() => {
    const tags = new Map<string, number>()
    const assignees = new Map<string, number>()
    for (const t of board.tasks) {
      for (const tag of t.tags) tags.set(tag.id, (tags.get(tag.id) ?? 0) + 1)
      if (t.assignee_id) assignees.set(t.assignee_id, (assignees.get(t.assignee_id) ?? 0) + 1)
    }
    return { tags, assignees }
  }, [board.tasks])

  const hasActive = search.trim() !== '' || tagIds.length > 0 || assigneeIds.length > 0

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="relative flex-1 md:max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks…  (F)"
          className="input pl-9"
          aria-label="Search tasks"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          value={tagIds}
          onChange={onTagIdsChange}
          placeholder="Filter by tag"
          options={board.tags.map((tag) => ({
            value: tag.id,
            label: tag.name,
            dot: tag.color,
            count: taskCounts.tags.get(tag.id),
          }))}
          className="w-52"
        />
        <MultiSelect
          value={assigneeIds}
          onChange={onAssigneeIdsChange}
          placeholder="Filter by assignee"
          options={board.members.map((m) => ({
            value: m.user_id,
            label: m.email,
            count: taskCounts.assignees.get(m.user_id),
          }))}
          className="w-56"
        />
        <button
          type="button"
          onClick={() => {
            onSearchChange('')
            onTagIdsChange([])
            onAssigneeIdsChange([])
          }}
          className={cn(
            'btn btn-ghost text-sm',
            !hasActive && 'pointer-events-none opacity-40',
          )}
        >
          <XMarkIcon className="size-3.5" />
          Clear
        </button>
      </div>
    </div>
  )
}

export function filteredTasks(board: BoardDetail, search: string, tagIds: string[], assigneeIds: string[]): TaskFull[] {
  const q = search.trim().toLowerCase()
  return board.tasks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (tagIds.length > 0 && !t.tags.some((tag) => tagIds.includes(tag.id))) return false
    if (assigneeIds.length > 0 && !(t.assignee_id && assigneeIds.includes(t.assignee_id))) return false
    return true
  })
}