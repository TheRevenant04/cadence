import React from 'react'
import { cn } from '@/lib/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 animate-spin text-current', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Spinner className="size-8" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  )
}

export function InlineSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Spinner className="size-4" />
      {label}
    </div>
  )
}