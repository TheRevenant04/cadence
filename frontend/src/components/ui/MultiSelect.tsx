import React from 'react'
import { Listbox } from '@headlessui/react'
import { cn } from '@/lib/cn'
import { CheckIcon, ChevronDownIcon } from '../icons'

export interface Option<T extends string = string> {
  value: T
  label: string
  /** color dot rendered next to label, e.g. tag colors */
  dot?: string | null
  count?: number
}

interface MultiSelectProps<T extends string> {
  label?: string
  value: T[]
  onChange: (value: T[]) => void
  options: Option<T>[]
  placeholder?: string
  className?: string
}

export function MultiSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
}: MultiSelectProps<T>) {
  const selected = options.filter((o) => value.includes(o.value))
  return (
    <Listbox value={value} onChange={onChange} multiple>
      <div className={cn('relative', className)}>
        {label && <span className="label">{label}</span>}
        <Listbox.Button className="input flex cursor-pointer items-center gap-1.5 pr-9 text-left">
          {selected.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selected.slice(0, 3).map((o) => (
                <span key={o.value} className="chip bg-indigo-50 text-indigo-700">
                  {o.dot && <span className="size-1.5 rounded-full" style={{ background: o.dot }} />}
                  {o.label}
                </span>
              ))}
              {selected.length > 3 && <span className="chip bg-slate-100 text-slate-600">+{selected.length - 3}</span>}
            </span>
          )}
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" />
        </Listbox.Button>
        <Listbox.Options className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200 focus:outline-none">
          {options.map((o) => {
            const isActive = value.includes(o.value)
            return (
              <Listbox.Option key={o.value} value={o.value} className="cursor-pointer">
                {({ selected: sel }) => (
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-sm',
                      sel ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700',
                    )}
                  >
                    {o.dot ? (
                      <span className="size-2 shrink-0 rounded-full" style={{ background: o.dot }} />
                    ) : (
                      <span className="size-2 shrink-0 rounded-full border border-slate-300" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="text-xs text-slate-400">{o.count}</span>}
                    {isActive && <CheckIcon className="size-4 shrink-0 text-indigo-600" />}
                  </div>
                )}
              </Listbox.Option>
            )
          })}
        </Listbox.Options>
      </div>
    </Listbox>
  )
}