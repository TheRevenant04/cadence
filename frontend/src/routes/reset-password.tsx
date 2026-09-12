import React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RedirectIfAuthed } from '@/components/Guards'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { PasswordRules } from '@/components/PasswordRules'
import { api } from '@/api'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: ResetRoute,
})

function ResetRoute() {
  return (
    <RedirectIfAuthed>
      <ResetPage />
    </RedirectIfAuthed>
  )
}

function ResetPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const token = search.token

  const [email, setEmail] = React.useState('')
  const [resetInfo, setResetInfo] = React.useState<{ token: string; reset_url: string } | null>(null)

  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.requestPasswordReset(email)
      setResetInfo(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset')
    } finally {
      setLoading(false)
    }
  }

  async function performReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 12) {
      setError('Password must be at least 12 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await api.auth.resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const hasToken = token.length > 0

  return (
    <AuthLayout title="Reset password" subtitle={hasToken ? 'Choose a new password.' : 'We’ll issue a mock reset link.'}>
      {success ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
            Your password has been updated. You can now sign in.
          </div>
          <Link to="/login" className="btn btn-primary w-full">
            Go to sign in
          </Link>
        </div>
      ) : hasToken ? (
        <form onSubmit={performReset} className="space-y-4">
          <div className="space-y-1">
            <TextField
              label="New password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordRules password={password} />
          </div>
          <TextField
            label="Confirm new password"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Update password
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void navigate({ to: '/login' })}>
            Cancel
          </Button>
        </form>
      ) : resetInfo ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <p className="text-xs font-semibold text-emerald-700">Mock reset token issued for {email}</p>
            <p className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">{resetInfo.token}</p>
          </div>
          <Button variant="primary" className="w-full" onClick={() => void navigate({ to: '/reset-password', search: { token: resetInfo.token } })}>
            Continue with this token
          </Button>
        </div>
      ) : (
        <form onSubmit={requestReset} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}