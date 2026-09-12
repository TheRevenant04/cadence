import React from 'react'
import { cn } from '@/lib/cn'
import type { Tag } from '@/types'
import { TagChip } from './TaskPieces'

interface TagPickerProps {
  tags: Tag[]
  selected: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  className?: string
}

export function TagPicker({ tags, selected, onChange, disabled, className }: TagPickerProps) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((tag) => {
        const isSelected = selected.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(tag.id)}
            aria-pressed={isSelected}
            className={cn(
              'cursor-pointer rounded-full transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60',
              isSelected && 'ring-2 ring-slate-400 ring-offset-1',
            )}
          >
            <TagChip tag={tag} selected={isSelected} />
          </button>
        )
      })}
      {tags.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          No tags yet{disabled ? '' : ' — the board owner can add tags in settings.'}
        </p>
      )}
    </div>
  )
}