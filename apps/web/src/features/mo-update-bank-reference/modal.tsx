import type { ReactNode } from 'react'

/**
 * The original's .modal-overlay. Like the legacy markup it is always mounted and only toggles
 * .open: the stylesheet fades opacity over 0.18s, so closing needs no timer of its own, and
 * the content keeps showing its last record while it fades out.
 */
export function Overlay({ id, open, onClose, children }: { id: string; open: boolean; onClose: () => void; children: ReactNode }) {
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

/** Title, optional subtitle and ×. The narrow confirmations have no subtitle line at all. */
export function ModalHeader({
  title,
  subtitle,
  subtitleId,
  onClose,
}: {
  title: string
  subtitle?: string
  subtitleId?: string
  onClose: () => void
}) {
  return (
    <div className="modal-header">
      <div className="modal-header-text">
        <div className="modal-title">{title}</div>
        {subtitle !== undefined && (
          <div className="modal-subtitle" id={subtitleId}>
            {subtitle}
          </div>
        )}
      </div>
      <button className="modal-close" type="button" onClick={onClose}>
        ×
      </button>
    </div>
  )
}

/** The page's dgCell(label, val). */
export function DetailCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className="detail-val">{value}</div>
    </div>
  )
}
