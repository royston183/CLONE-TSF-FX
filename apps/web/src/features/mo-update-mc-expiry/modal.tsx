import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out before hiding. */
  close: () => void
}

export function useModal(): Modal {
  const [state, setState] = useState<ModalState>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const open = useCallback(() => {
    clearTimeout(timer.current)
    setState('open')
  }, [])
  // Unlike the original, closing a popup that is not open does nothing: its Escape handler
  // briefly flashed both closed overlays on screen.
  const close = useCallback(() => {
    setState((s) => {
      if (s !== 'open') return s
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState((cur) => (cur === 'closing' ? 'closed' : cur)), 160)
      return 'closing'
    })
  }, [])

  return useMemo(() => ({ state, open, close }), [state, open, close])
}

/** The original's .overlay. Its content stays mounted while hidden, like the legacy markup. */
export function Overlay({
  modal,
  onBackdrop,
  children,
}: {
  modal: Modal
  onBackdrop?: (() => void) | undefined
  children: ReactNode
}) {
  const cls = modal.state === 'open' ? 'overlay open' : modal.state === 'closing' ? 'overlay open closing' : 'overlay'
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
