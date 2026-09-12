import React from 'react'
import { cn } from '@/lib/cn'

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
  inputClassName?: string
}

export function TextField({ label, hint, error, className, inputClassName, id, ...rest }: TextFieldProps) {
  const inputId = id ?? rest.name ?? label
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <input id={inputId} className={cn('input', error && 'ring-rose-400 focus:ring-rose-500', inputClassName)} {...rest} />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
  labelFor?: string
}

export function TextAreaField({ label, hint, error, className, id, labelFor, ...rest }: TextAreaFieldProps) {
  const inputId = labelFor ?? id
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <textarea id={inputId} className={cn('input', error && 'ring-rose-400 focus:ring-rose-500')} {...rest} />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}