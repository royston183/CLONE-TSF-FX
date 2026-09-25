import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out before hiding. */
  close: () => void
  /** Hides at once — used when one popup hands over to another, as the original does. */
  hide: () => void
}

export function useModal(): Modal {
  const [state, setState] = useState<ModalState>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const open = useCallback(() => {
    clearTimeout(timer.current)
    setState('open')
  }, [])
  const close = useCallback(() => {
    setState((s) => {
      if (s !== 'open') return s
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState((cur) => (cur === 'closing' ? 'closed' : cur)), 160)
      return 'closing'
    })
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setState('closed')
  }, [])

  return useMemo(() => ({ state, open, close, hide }), [state, open, close, hide])
}

/**
 * The original's .modal-overlay. Its content stays mounted while hidden, exactly like the
 * legacy markup, so a half-filled Create form survives being closed and reopened.
 */
export function Overlay({
  modal,
  onBackdrop,
  children,
}: {
  modal: Modal
  onBackdrop?: (() => void) | undefined
  children: ReactNode
}) {
  const cls =
    modal.state === 'open' ? 'modal-overlay open' : modal.state === 'closing' ? 'modal-overlay open closing' : 'modal-overlay'
  return (
    <div
      className={cls}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdrop?.()
      }}
    >
      {children}
    </div>
  )
}
