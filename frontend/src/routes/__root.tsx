import React from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/useAuth'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const hydrate = useAuthStore((s) => s.hydrate)
  React.useEffect(() => {
    void hydrate()
  }, [hydrate])
  return <Outlet />
}