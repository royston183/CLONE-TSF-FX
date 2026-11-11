import type { ReactNode } from 'react'

export type SignOutButtonProps = {
  className?: string
  label?: string
  showIcon?: boolean
  icon?: ReactNode
}

/** The TSF_FX shell has its own sign-out, so the reference's header button renders nothing. */
export function SignOutButton(props: SignOutButtonProps) {
  void props
  return null
}
