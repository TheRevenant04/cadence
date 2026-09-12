import { createFileRoute } from '@tanstack/react-router'
import { RequireAdmin } from '@/components/Guards'
import { AdminPage } from '@/features/AdminPage'

export const Route = createFileRoute('/_authed/admin')({
  component: AdminRoute,
})

function AdminRoute() {
  return (
    <RequireAdmin>
      <AdminPage />
    </RequireAdmin>
  )
}