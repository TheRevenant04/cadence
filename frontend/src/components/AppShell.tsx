import React from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/stores/useAuth'
import { useOnboardingStore } from '@/stores/useOnboarding'
import { Avatar } from './ui/Avatar'
import { ArchiveBoxIcon, BoltIcon, BoardIcon, HelpIcon, LogoutIcon, ShieldIcon, UserIcon } from './icons'

function NavLinkItem({ to, label, icon, active }: { to: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-indigo-100' : 'text-slate-400 group-hover:text-slate-600')}>{icon}</span>
      {label}
    </Link>
  )
}

function useNavItems() {
  const location = useLocation()
  const path = location.pathname
  const isAdmin = useAuthStore((s) => !!s.user?.is_admin)
  return [
    { to: '/boards' as const, label: 'Boards', icon: <BoardIcon />, active: path.startsWith('/boards') && !path.includes('/archived') },
    { to: '/boards/archived' as const, label: 'Archived', icon: <ArchiveBoxIcon />, active: path.startsWith('/boards/archived') },
    ...(isAdmin ? [{ to: '/admin' as const, label: 'Admin', icon: <ShieldIcon />, active: path.startsWith('/admin') }] : []),
    { to: '/profile' as const, label: 'Profile', icon: <UserIcon />, active: path.startsWith('/profile') },
  ]
}

const iconClass = 'size-4.5'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuthStore()
  const showTour = useOnboardingStore((s) => s.showTour)
  const items = useNavItems()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <BoltIcon className="size-5" />
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-900">Cadence</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 py-2">
        {items.map((item) => (
          <div key={item.to} onClick={onNavigate}>
            <NavLinkItem to={item.to} label={item.label} icon={<span className={iconClass}>{item.icon}</span>} active={item.active} />
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-slate-200/70 px-2.5 py-3">
        <button
          type="button"
          onClick={showTour}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/70"
        >
          <HelpIcon className="size-4.5 text-slate-400" />
          Help & tour
        </button>
      </div>

      {user && (
        <div className="border-t border-slate-200/70 px-3 py-3">
          <div className="flex items-center gap-3">
            <Avatar email={user.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
              <p className="truncate text-xs text-slate-500">{user.is_admin ? 'Administrator' : 'Member'}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
            >
              <LogoutIcon className="size-4.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="size-5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="flex items-center gap-1.5 text-base font-bold tracking-tight text-slate-900">
        <BoltIcon className="size-4.5 text-indigo-600" />
        Cadence
      </span>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <div className="min-h-screen">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-slate-50 lg:block">
        <SidebarContent />
      </div>

      <div className="lg:hidden">
        <MobileTopBar onMenu={() => setMenuOpen(true)} />
      </div>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-900/40 transition-opacity lg:hidden',
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 transform bg-slate-50 shadow-xl transition-transform duration-200 lg:hidden',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent onNavigate={() => setMenuOpen(false)} />
      </div>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}