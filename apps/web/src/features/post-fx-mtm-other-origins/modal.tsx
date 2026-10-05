import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out before hiding. */
  close: () => void
  /** Hides at once, as Refresh does. */
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
 * The original's .modal-overlay. Its content stays mounted while hidden, like the legacy markup;
 * pressing the mouse on the backdrop (not inside the box) dismisses it.
 */
export function Overlay({ modal, id, children }: { modal: Modal; id: string; children: ReactNode }) {
  const cls =
    modal.state === 'open' ? 'modal-overlay open' : modal.state === 'closing' ? 'modal-overlay open closing' : 'modal-overlay'
  return (
    <div
      id={id}
      className={cls}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) modal.close()
      }}
    >
      {children}
    </div>
  )
}
