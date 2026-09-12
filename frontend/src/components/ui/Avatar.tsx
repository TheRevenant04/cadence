import React from 'react'
import { cn } from '@/lib/cn'

const PALETTE = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-purple-500',
  'bg-teal-500',
  'bg-slate-500',
]

export function Avatar({
  email,
  className,
  size = 'md',
}: {
  email: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = (email.split('@')[0] ?? email).slice(0, 2).toUpperCase()
  const hash = Array.from(email).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const color = PALETTE[hash % PALETTE.length] ?? 'bg-slate-500'
  const sizes = { sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        color,
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}