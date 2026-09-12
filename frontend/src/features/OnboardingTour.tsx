import React from 'react'
import { useOnboardingStore } from '@/stores/useOnboarding'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { BoltIcon } from '@/components/icons'

interface Step {
  title: string
  body: string
  bullets?: string[]
  shortcuts?: { keys: string; label: string }[]
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Cadence',
    body: 'Cadence is a minimal but polished Kanban board for your team. Organise work on boards and columns, assign people, set due dates and keep a full activity timeline.',
  },
  {
    title: 'Boards & columns',
    body: 'Create as many boards as you like. Every board has fully custom columns — add, rename or remove them freely from the board settings.',
    bullets: ['Archive boards when you’re done', 'Owners and admins can see archived boards'],
  },
  {
    title: 'Creating tasks',
    body: 'Press N (or use the “New task” button) to create a task. Every task can have a description, due date, a single assignee and tags from the board’s fixed tag set.',
  },
  {
    title: 'Organising work',
    body: 'Drag and drop tasks between and within columns. Use tags and assignee filters plus text search to focus on what matters.',
  },
  {
    title: 'Sharing a board',
    body: 'Boards have three roles: owner can manage everything and invite people, editors create and move tasks, and viewers have read-only access.',
  },
  {
    title: 'Keyboard shortcuts',
    body: 'Work fast with the keyboard:',
    shortcuts: [
      { keys: 'N', label: 'New task' },
      { keys: 'E', label: 'Edit selected task' },
      { keys: 'Delete', label: 'Delete selected task' },
      { keys: 'F', label: 'Focus search' },
      { keys: 'Esc', label: 'Close dialog / clear selection' },
      { keys: '↑ ↓ ← →', label: 'Navigate between tasks' },
    ],
  },
]

export function OnboardingTour() {
  const open = useOnboardingStore((s) => s.open)
  const closeTour = useOnboardingStore((s) => s.closeTour)
  const completeTour = useOnboardingStore((s) => s.completeTour)
  const [step, setStep] = React.useState(0)

  React.useEffect(() => {
    setStep(0)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTour()
      if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, STEPS.length - 1))
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeTour])

  if (!open) return null
  const current = STEPS[step]!
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div className="card w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 pt-4 pb-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <BoltIcon className="size-4" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">Quick tour</span>
          <span className="ml-auto text-xs text-slate-400">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div className="px-6 py-5">
          <h2 className="text-lg font-bold text-slate-900">{current.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{current.body}</p>
          {current.bullets && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {current.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {current.shortcuts && (
            <ul className="mt-3 space-y-1.5">
              {current.shortcuts.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <kbd className="min-w-14 rounded-md bg-slate-100 px-2 py-0.5 text-center font-mono text-xs text-slate-700 ring-1 ring-slate-300">
                    {s.keys}
                  </kbd>
                  <span className="text-slate-600">{s.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-6 py-4">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => setStep(i)}
                className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-indigo-600' : 'w-2.5 bg-slate-300')}
              />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={closeTour}>
              Skip
            </Button>
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button variant="primary" onClick={completeTour}>
                Start exploring
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}