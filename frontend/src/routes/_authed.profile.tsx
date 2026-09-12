import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/useAuth'
import { api } from '@/api'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { PasswordRules } from '@/components/PasswordRules'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { UserIcon } from '@/components/icons'
import { formatDateLong } from '@/lib/format'

export const Route = createFileRoute('/_authed/profile')({
  component: ProfileRoute,
})

function ProfileRoute() {
  const user = useAuthStore((s) => s.user)
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const change = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      setSuccess(true)
      setError(null)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to change password'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess(false)
    setError(null)
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    change.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Profile</h1>

      {user && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Account</h2>
          <div className="flex items-center gap-3">
            <Avatar email={user.email} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{user.email}</p>
              <p className="text-xs text-slate-500">
                {user.is_admin ? <Badge tone="purple">Admin</Badge> : <Badge>Member</Badge>}
                <span className="ml-2">Member since {formatDateLong(user.created_at)}</span>
              </p>
            </div>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <UserIcon className="size-3.5" />
            Your email cannot be changed after signup.
          </p>
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Change password</h2>
        <p className="mb-4 text-xs text-slate-500">New passwords must meet the strong password rules below.</p>
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <div className="space-y-1">
            <TextField
              label="New password"
              type="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <PasswordRules password={next} />
          </div>
          <TextField
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Password updated successfully.</p>}
          <Button type="submit" variant="primary" loading={change.isPending} disabled={!current || !next || !confirm}>
            Update password
          </Button>
        </form>
      </section>
    </div>
  )
}