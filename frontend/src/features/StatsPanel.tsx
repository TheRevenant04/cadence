import React from 'react'
import type { BoardDetail, TaskFull } from '@/types'
import { formatDateOnly } from '@/lib/format'
import { ChartIcon } from '@/components/icons'

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface StatsPanelProps {
  board: BoardDetail
  tasks: TaskFull[]
}

export function StatsPanel({ board, tasks }: StatsPanelProps) {
  const today = todayStr()
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today).length
  const nextDue = tasks.map((t) => t.due_date).filter((d): d is string => !!d).sort()[0]

  const perAssignee = React.useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const t of tasks) {
      const key = t.assignee_id ?? '__none__'
      const label = t.assignee ? t.assignee.email : 'Unassigned'
      const cur = map.get(key)
      map.set(key, { label, count: (cur?.count ?? 0) + 1 })
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [tasks])

  const perTag = React.useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const t of tasks) {
      if (t.tags.length === 0) {
        const cur = map.get('__none__')
        map.set('__none__', { label: 'Untagged', count: (cur?.count ?? 0) + 1 })
      }
      for (const tag of t.tags) {
        const cur = map.get(tag.id)
        map.set(tag.id, { label: tag.name, count: (cur?.count ?? 0) + 1 })
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [tasks])

  return (
    <section className="card px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ChartIcon className="size-4 text-indigo-500" />
        Board stats
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <p className="text-xl font-bold text-slate-900">{tasks.length}</p>
          <p className="text-xs text-slate-500">Total tasks</p>
        </div>
        <div className="rounded-lg bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
          <p className="text-xl font-bold text-rose-700">{overdue}</p>
          <p className="text-xs text-rose-600">Overdue</p>
        </div>
        {board.columns.map((c) => {
          const count = tasks.filter((t) => t.column_id === c.id).length
          return (
            <div key={c.id} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <p className="text-xl font-bold text-slate-900">{count}</p>
              <p className="max-w-28 truncate text-xs text-slate-500">{c.name}</p>
            </div>
          )
        })}
      </div>

      {(perAssignee.length > 0 || perTag.length > 0) && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">By assignee</p>
            <ul className="mt-1.5 space-y-1">
              {perAssignee.map(([key, val]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-600">{val.label}</span>
                  <span className="font-semibold text-slate-800">{val.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">By tag</p>
            <ul className="mt-1.5 space-y-1">
              {perTag.map(([key, val]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-600">{val.label}</span>
                  <span className="font-semibold text-slate-800">{val.count}</span>
                </li>
              ))}
            </ul>
            {tasks.some((t) => t.due_date) && (
              <p className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                Next due: {formatDateOnly(nextDue ?? '')}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}