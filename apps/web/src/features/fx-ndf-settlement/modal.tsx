import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MODAL_CLOSE_MS } from './data.ts'

type Phase = 'closed' | 'open' | 'closing'

export type Modal = {
  /** True from open() until the close animation has finished. */
  isShown: boolean
  /** Open and not already closing: what Escape acts on. */
  isOpen: boolean
  open: () => void
  /** Plays the close animation, then removes the overlay. */
  close: () => void
  /** Removes the overlay at once (Refresh and Reset close every popup this way). */
  closeNow: () => void
}

/**
 * Open/closed state for one .modal-overlay. The original added "open", and for the 160 ms
 * close animation also "closing", so the content stays mounted and the CSS transition plays.
 */
export function useModal(): Modal {
  const [phase, setPhase] = useState<Phase>('closed')
  const open = useCallback(() => setPhase('open'), [])
  const close = useCallback(() => setPhase((p) => (p === 'open' ? 'closing' : p)), [])
  const closeNow = useCallback(() => setPhase('closed'), [])
  useEffect(() => {
    if (phase !== 'closing') return
    const t = setTimeout(() => setPhase('closed'), MODAL_CLOSE_MS)
    return () => clearTimeout(t)
  }, [phase])
  return useMemo(
    () => ({ isShown: phase !== 'closed', isOpen: phase === 'open', open, close, closeNow }),
    [phase, open, close, closeNow],
  )
}

/**
 * One popup: the overlay, the card and its header. A press on the backdrop itself closes it,
 * except for the confirmation, which only its buttons and Escape close.
 */
export function ModalFrame({
  id,
  modal,
  title,
  titleId,
  width,
  scrollable = true,
  sub,
  subId,
  closeOnBackdrop = true,
  actions,
  children,
}: {
  id: string
  modal: Modal
  title: string
  titleId?: string
  width: 'w-sm' | 'w-md' | 'w-lg'
  scrollable?: boolean
  sub?: string
  subId?: string
  closeOnBackdrop?: boolean
  /** The footer; defaults to a single Close button. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={`modal-overlay${modal.isShown ? ' open' : ''}${modal.isShown && !modal.isOpen ? ' closing' : ''}`}
      id={id}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) modal.close()
      }}
    >
      <div className={`modal modal-left${scrollable ? ' modal-scrollable' : ''} ${width}`}>
        <div className="modal-head-row">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        {sub !== undefined ? (
          <div className="modal-sub" id={subId}>
            {sub}
          </div>
        ) : null}
        {children}
        {actions ?? (
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={modal.close}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
