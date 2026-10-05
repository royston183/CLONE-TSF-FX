import { useCallback, useMemo, useState, type ReactNode } from 'react'

export type Modal = {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * Open/closed state for one .modal-overlay. The original only toggled its "open" class and let
 * the stylesheet fade the overlay, so the content stays mounted and the CSS transition plays.
 */
export function useModal(): Modal {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
}

/** The original's .modal-overlay; a click on the backdrop itself (not the card) closes it. */
export function Overlay({ id, modal, children }: { id: string; modal: Modal; children: ReactNode }) {
  return (
    <div
      className={`modal-overlay${modal.isOpen ? ' open' : ''}`}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) modal.close()
      }}
    >
      {children}
    </div>
  )
}
