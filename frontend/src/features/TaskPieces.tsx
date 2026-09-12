import React from 'react'
import { cn } from '@/lib/cn'
import { formatDueDate } from '@/lib/format'
import type { Tag } from '@/types'
import { CalendarIcon } from '@/components/icons'

export function DueDateBadge({ dueDate, className }: { dueDate: string | null; className?: string }) {
  const disp = formatDueDate(dueDate)
  if (!disp) return null
  const tone = disp.days < 0 ? 'rose' : disp.days === 0 ? 'amber' : 'slate'
  const cls =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span
      title={`Due ${disp.exact}`}
      className={cn(
        'chip ring-1',
        tone === 'rose' ? (disp.days < -1 ? 'font-semibold' : '') : '',
        cls,
        className,
      )}
    >
      <CalendarIcon className="size-3" />
      {disp.relative}
    </span>
  )
}

export function TagChip({ tag, selected, className }: { tag: Tag; selected?: boolean; className?: string }) {
  const color = tag.color ?? '#64748b'
  return (
    <span
      className={cn('chip ring-1', className)}
      style={{
        backgroundColor: selected ? color : `${color}1f`,
        color: selected ? '#fff' : color,
        borderColor: 'transparent',
      }}
      title={tag.name}
    >
      {tag.name}
    </span>
  )
}