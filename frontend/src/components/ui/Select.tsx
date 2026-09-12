import React from 'react'
import { cn } from '@/lib/cn'
import { ChevronDownIcon } from '../icons'

interface Option {
  value: string
  label: string
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: Option[]
  emptyLabel?: string
  label?: string
  onChange?: (value: string) => void
}

export function Select({ options, emptyLabel = 'Select…', label, className, value, onChange, ...rest }: SelectProps) {
  return (
    <div className={cn(label && 'space-y-1', className)}>
      {label && <span className="label">{label}</span>}
      <div className="relative">
        <select
          className={cn('input cursor-pointer appearance-none pr-9')}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          {...rest}
        >
          {(emptyLabel || !value) && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  )
}