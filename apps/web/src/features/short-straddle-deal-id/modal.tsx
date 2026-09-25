import type { ReactNode } from 'react'

/**
 * The original's .modal-overlay. Like the legacy markup it is always mounted and only toggles
 * .open: the stylesheet fades opacity and lifts the card over 0.2s, so closing needs no timer
 * of its own, and the content keeps showing its last record while it fades out.
 */
export function Overlay({
  id,
  open,
  onClose,
  children,
}: {
  id: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      id={id}
      className={open ? 'modal-overlay open' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

/** Title, subtitle and × — the header every popup on the page shares. */
export function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="modal-header">
      <div className="modal-header-text">
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
      </div>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  )
}

/** The page's detailCell(label, val, accent). */
export function DetailCell({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className={accent ? 'detail-val accent' : 'detail-val'}>{value}</div>
    </div>
  )
}
