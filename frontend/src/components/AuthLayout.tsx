import React from 'react'
import { Link } from '@tanstack/react-router'
import { BoltIcon } from '@/components/icons'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <BoltIcon className="size-5" />
        </span>
        <span className="text-2xl font-bold tracking-tight text-slate-900">Cadence</span>
      </div>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <p className="mt-5 text-sm text-slate-500">{footer}</p>}
    </div>
  )
}

export function DemoAccounts({ onChoose }: { onChoose: (email: string) => void }) {
  const accounts = [
    { email: 'admin@cadence.dev', label: 'Admin', tone: 'text-indigo-600' },
    { email: 'alice@cadence.dev', label: 'Editor', tone: 'text-amber-600' },
    { email: 'bob@cadence.dev', label: 'Viewer', tone: 'text-slate-600' },
  ]
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts</p>
      <p className="mt-0.5 mb-2 text-xs text-slate-400">All share the password <code className="rounded bg-slate-200 px-1 font-mono text-[11px]">Password123!</code></p>
      <div className="flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <button
            key={a.email}
            type="button"
            onClick={() => onChoose(a.email)}
            className={`chips rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-slate-300 transition-colors hover:bg-white ${a.tone}`}
          >
            Use {a.label.toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AuthFooterLink({ to, label, text }: { to: string; label: string; text: string }) {
  return (
    <p className="text-sm text-slate-500">
      {text}{' '}
      <Link to={to} className="font-medium text-indigo-600 hover:text-indigo-700">
        {label}
      </Link>
    </p>
  )
}