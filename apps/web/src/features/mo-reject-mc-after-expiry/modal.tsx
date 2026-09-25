import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out (closeOverlayAnimated) before hiding. */
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
  const close = useCallback(() => {
    setState((s) => {
      // The original also "closed" overlays that were not open (Escape closes everything),
      // which flashed them for 160 ms; only an open one animates out here.
      if (s !== 'open') return s
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState((cur) => (cur === 'closing' ? 'closed' : cur)), 160)
      return 'closing'
    })
  }, [])

  return useMemo(() => ({ state, open, close }), [state, open, close])
}

/** The original's .overlay: a backdrop click behaves like the modal's close button. */
export function Overlay({
  modal,
  id,
  onBackdrop,
  children,
}: {
  modal: Modal
  id: string
  onBackdrop: () => void
  children: ReactNode
}) {
  const cls = modal.state === 'open' ? 'overlay open' : modal.state === 'closing' ? 'overlay open closing' : 'overlay'
  return (
    <div
      className={cls}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdrop()
      }}
    >
      {children}
    </div>
  )
}
