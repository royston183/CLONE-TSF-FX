import { useCallback, useMemo, useState, type ReactNode } from 'react'

export type Modal = {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * Open/closed state for one .modal-backdrop. The original only toggled its "open" class (the
 * card animates in on its own, and closing is instant), so the content stays mounted.
 */
export function useModal(): Modal {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
}

/** The original's .modal-backdrop; a click on the backdrop itself (not the card) closes it. */
export function Backdrop({ id, modal, children }: { id: string; modal: Modal; children: ReactNode }) {
  return (
    <div
      className={`modal-backdrop${modal.isOpen ? ' open' : ''}`}
      id={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) modal.close()
      }}
    >
      {children}
    </div>
  )
}

/** The header every modal shares: its title and the × close button. */
export function ModalHeader({ title, onClose, titleId }: { title: ReactNode; onClose: () => void; titleId?: string }) {
  return (
    <div className="modal-header">
      <h3 id={titleId}>{title}</h3>
      <button className="modal-close" type="button" onClick={onClose}>
        &times;
      </button>
    </div>
  )
}
