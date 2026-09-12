import React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RedirectIfAuthed } from '@/components/Guards'
import { AuthLayout, AuthFooterLink } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { PasswordRules } from '@/components/PasswordRules'
import { useAuthStore } from '@/stores/useAuth'
import { isEmail } from '@/lib/validator'

export const Route = createFileRoute('/signup')({
  component: SignupRoute,
})

function SignupRoute() {
  return (
    <RedirectIfAuthed>
      <SignupPage />
    </RedirectIfAuthed>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; confirm?: string }>({})
  const [loading, setLoading] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!isEmail(email)) {
      setFieldErrors({ email: 'Enter a valid email address' })
      return
    }
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' })
      return
    }
    setLoading(true)
    try {
      await signup(email, password)
      void navigate({ to: '/boards' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A local, team-ready Kanban board."
      footer={<AuthFooterLink to="/login" label="Sign in instead" text="Already have an account?" />}
    >
      <form onSubmit={submit} className="space-y-4">
        <TextField
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email ?? null}
        />
        <div className="space-y-1">
          <TextField
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordRules password={password} />
        </div>
        <TextField
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm ?? null}
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}