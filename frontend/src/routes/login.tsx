import React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RedirectIfAuthed } from '@/components/Guards'
import { AuthLayout, DemoAccounts, AuthFooterLink } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { useAuthStore } from '@/stores/useAuth'
import { api } from '@/api'

export const Route = createFileRoute('/login')({
  component: LoginRoute,
})

function LoginRoute() {
  return (
    <RedirectIfAuthed>
      <LoginPage />
    </RedirectIfAuthed>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const [forgotOpen, setForgotOpen] = React.useState(false)
  const [forgotEmail, setForgotEmail] = React.useState('')
  const [resetToken, setResetToken] = React.useState<{ token: string; reset_url: string } | null>(null)
  const [forgotError, setForgotError] = React.useState<string | null>(null)
  const [forgotLoading, setForgotLoading] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      void navigate({ to: '/boards' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function useDemo(accountEmail: string) {
    setEmail(accountEmail)
    setPassword('Password123!')
    setError(null)
    setLoading(true)
    try {
      await login(accountEmail, 'Password123!')
      void navigate({ to: '/boards' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    try {
      const res = await api.auth.requestPasswordReset(forgotEmail)
      setResetToken(res)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Failed to send reset')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in to Cadence"
      subtitle="Welcome back — manage your boards."
      footer={<AuthFooterLink to="/signup" label="Create an account" text="New here?" />}
    >
      {forgotOpen ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600">
              Enter the email for your account and we’ll issue a reset link. (In the mock the token is returned directly
              so you can continue.)
            </p>
            {resetToken ? (
              <div className="mt-3 space-y-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
                <p className="text-xs font-semibold text-emerald-700">Mock email sent to {forgotEmail}</p>
                <p className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">{resetToken.token}</p>
                <a
                  href={resetToken.reset_url}
                  className="inline-block rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Reset password →
                </a>
              </div>
            ) : (
              <form onSubmit={sendReset} className="mt-3 space-y-3">
                <TextField
                  label="Email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
                {forgotError && <p className="text-sm text-rose-600">{forgotError}</p>}
                <Button type="submit" variant="primary" className="w-full" loading={forgotLoading}>
                  Send reset link
                </Button>
              </form>
            )}
          </div>
          <Button variant="ghost" onClick={() => { setForgotOpen(false) }}>
            ← Back to sign in
          </Button>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4">
            <TextField
              label="Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="space-y-1">
              <TextField
                label="Password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
          <div className="mt-5">
            <DemoAccounts onChoose={(email) => void useDemo(email)} />
          </div>
        </>
      )}
    </AuthLayout>
  )
}