import React from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/useAuth'
import { FullPageSpinner } from './ui/Spinner'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === 'loading') return <FullPageSpinner />
  if (status !== 'authed' || !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user?.is_admin) return <Navigate to="/boards" replace />
  return <>{children}</>
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authed') return <Navigate to="/boards" replace />
  return <>{children}</>
}