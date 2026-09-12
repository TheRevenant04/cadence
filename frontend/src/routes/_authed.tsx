import React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RequireAuth } from '@/components/Guards'
import { AppShell } from '@/components/AppShell'
import { useAuthStore } from '@/stores/useAuth'
import { useOnboardingStore } from '@/stores/useOnboarding'
import { OnboardingTour } from '@/features/OnboardingTour'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
})

function RealtimeGlobalSync() {
  const qc = useQueryClient()
  React.useEffect(() => {
    return api.realtime.subscribeGlobal(() => {
      void qc.invalidateQueries({ queryKey: ['boards'] })
    })
  }, [qc])
  return null
}

function AuthedLayout() {
  const status = useAuthStore((s) => s.status)
  const userHasSeenTour = useOnboardingStore((s) => s.userHasSeenTour)
  const showTour = useOnboardingStore((s) => s.showTour)

  React.useEffect(() => {
    if (status === 'authed' && !userHasSeenTour) showTour()
  }, [status, userHasSeenTour, showTour])

  return (
    <RequireAuth>
      <RealtimeGlobalSync />
      <AppShell>
        <Outlet />
      </AppShell>
      <OnboardingTour />
    </RequireAuth>
  )
}