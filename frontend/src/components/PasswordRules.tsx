import React from 'react'
import { PASSWORD_RULES } from '@/lib/validator'
import { cn } from '@/lib/cn'
import { CheckIcon } from '@/components/icons'

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.label} className={cn('inline-flex items-center gap-1.5', ok ? 'text-emerald-600' : 'text-slate-400')}>
            <span
              className={cn(
                'flex size-3.5 items-center justify-center rounded-full',
                ok ? 'bg-emerald-100' : 'bg-slate-100',
              )}
            >
              <CheckIcon className={cn('size-2.5', ok ? 'text-emerald-600' : 'text-slate-300')} />
            </span>
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}