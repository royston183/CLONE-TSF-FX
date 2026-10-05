import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** The original's close animation (popOut) lasts 160ms; the overlay stays up for that long. */
const CLOSE_MS = 160

export type Overlay = {
  isOpen: boolean
  isClosing: boolean
  show: () => void
  /** Close with the fade-out. */
  hide: () => void
  /** Close at once (Refresh closes every modal without animation). */
  hideNow: () => void
}

/** Open / closing / closed state for one .modal-overlay. */
export function useOverlay(): Overlay {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const show = useCallback(() => {
    clearTimeout(timer.current)
    setPhase('open')
  }, [])
  const hide = useCallback(() => {
    if (phaseRef.current !== 'open') return
    setPhase('closing')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPhase('closed'), CLOSE_MS)
  }, [])
  const hideNow = useCallback(() => {
    clearTimeout(timer.current)
    setPhase('closed')
  }, [])

  return useMemo(
    () => ({ isOpen: phase === 'open', isClosing: phase === 'closing', show, hide, hideNow }),
    [phase, show, hide, hideNow],
  )
}

/** The original's .modal-overlay; a click on the backdrop itself (not the card) closes it. */
export function OverlayShell({ id, overlay, children }: { id: string; overlay: Overlay; children: ReactNode }) {
  return (
    <div
      className={`modal-overlay${overlay.isOpen ? ' open' : ''}${overlay.isClosing ? ' closing' : ''}`}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) overlay.hide()
      }}
    >
      {children}
    </div>
  )
}
