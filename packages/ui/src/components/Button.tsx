import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader } from './Spinner.tsx'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The action's colour: primary (blue) save/create/approve · default (grey) cancel/view ·
   *  danger (red) reject/delete · warning (amber) push back/return. Ghost is chrome only. */
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'warning'
  /** 32px (dialog footers, page actions) or 28px (toolbars, tables). */
  size?: 'md' | 'sm'
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`slc-btn slc-btn--${variant}${size === 'sm' ? ' slc-btn--sm' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      // Tells a screen reader the control is working, which the dots alone do not.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader /> : icon}
      {children}
    </button>
  )
}
