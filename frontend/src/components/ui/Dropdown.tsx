import React from 'react'
import { Menu, Transition } from '@headlessui/react'
import { cn } from '@/lib/cn'

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
  width?: string
  buttonClassName?: string
}

export function Dropdown({ trigger, children, align = 'right', width = 'w-56', buttonClassName }: DropdownProps) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className={cn('rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500', buttonClassName)}>
        {trigger}
      </Menu.Button>
      <Transition
        as={React.Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={cn(
            'absolute z-40 mt-1 origin-top-right overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200 focus:outline-none',
            width,
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </Menu.Items>
      </Transition>
    </Menu>
  )
}

interface DropdownItemProps {
  children: React.ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  icon?: React.ReactNode
}

export function DropdownItem({ children, onClick, danger, disabled, icon }: DropdownItemProps) {
  return (
    <Menu.Item disabled={disabled}>
      {({ active }) => (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
            active && !danger ? 'bg-slate-100 text-slate-900' : '',
            active && danger ? 'bg-rose-50 text-rose-700' : '',
            danger ? 'text-rose-600' : 'text-slate-700',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {icon}
          {children}
        </button>
      )}
    </Menu.Item>
  )
}

export function DropdownDivider() {
  return <div className="my-1 h-px bg-slate-100" />
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{children}</div>
}