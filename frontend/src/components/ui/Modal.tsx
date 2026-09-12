import React from 'react'
import { Dialog } from '@headlessui/react'
import { cn } from '@/lib/cn'
import { XMarkIcon } from '../icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
  hideClose?: boolean
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-5xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className,
  hideClose = false,
}: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-3 sm:p-6 sm:pt-[8vh]">
          <Dialog.Panel
            className={cn(
              'card w-full rounded-2xl shadow-xl',
              sizeClass[size],
              className,
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  {title && <Dialog.Title className="text-base font-semibold text-slate-900">{title}</Dialog.Title>}
                  {description && <Dialog.Description className="mt-0.5 text-sm text-slate-500">{description}</Dialog.Description>}
                </div>
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <XMarkIcon className="size-5" />
                  </button>
                )}
              </div>
            )}
            {children}
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  )
}