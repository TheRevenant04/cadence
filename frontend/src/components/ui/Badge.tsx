import React from 'react'
import { cn } from '@/lib/cn'

export function Badge({
  children,
  className,
  tone = 'slate',
}: {
  children: React.ReactNode
  className?: string
  tone?: 'slate' | 'indigo' | 'green' | 'amber' | 'rose' | 'sky' | 'purple'
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <span className={cn('chip', tones[tone], className)}>
      {children}
    </span>
  )
}

export function RoleBadge({ role }: { role: 'owner' | 'editor' | 'viewer' }) {
  const map = { owner: 'indigo', editor: 'amber', viewer: 'slate' } as const
  const label = role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer'
  return <Badge tone={map[role]}>{label}</Badge>
}