import React from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'subtle'
type Size = 'sm' | 'md' | 'xs'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
}

const sizeClass: Record<Size, string> = {
  xs: 'px-2 py-1 text-xs rounded-md',
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn('btn', variantClass[variant], sizeClass[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
}