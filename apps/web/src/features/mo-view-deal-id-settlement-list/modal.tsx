import { useCallback, useMemo, useState, type ReactNode } from 'react'

export type ModalTarget = {
  /** The id last opened; kept after closing so the card's content does not blank mid fade-out. */
  id: string | null
  isOpen: boolean
  open: (id: string) => void
  close: () => void
}

/** One popup: which record it shows, and whether it is open. */
export function useModalTarget(): ModalTarget {
  const [id, setId] = useState<string | null>(null)
  const [isOpen, setOpen] = useState(false)
  const open = useCallback((next: string) => {
    setId(next)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])
  return useMemo(() => ({ id, isOpen, open, close }), [id, isOpen, open, close])
}

/** The original's .modal-overlay: a click on the backdrop itself (not the card) closes it. */
export function Overlay({
  isOpen,
  onClose,
  maxWidth,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  maxWidth: number
  children: ReactNode
}) {
  return (
    <div
      className={isOpen ? 'modal-overlay open' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: string
  title: string
  subtitle: string
  onClose: () => void
}) {
  return (
    <div className="modal-header">
      <div className="modal-icon">{icon}</div>
      <div className="modal-header-text">
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
      </div>
      <button className="modal-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
    </div>
  )
}

/** A label/value cell; an empty value shows an em dash. */
export function DetailCell({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className={accent ? 'detail-val accent' : 'detail-val'}>{empty ? '—' : value}</div>
    </div>
  )
}
