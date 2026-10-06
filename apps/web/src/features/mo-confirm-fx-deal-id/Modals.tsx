import type { ReactNode } from 'react'

/** One .modal card: header with its × close, then the popup's own body and footer. */
function ModalCard({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal">
      <div className="modal-head">
        <h3>{title}</h3>
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>
      </div>
      {children}
    </div>
  )
}

/** The icon + message confirmation: Cancel Deal ID. */
export function PromptModal({
  title,
  icon,
  message,
  noLabel,
  yesLabel,
  yesClass,
  busy = false,
  onYes,
  onClose,
}: {
  title: string
  icon: 'warn' | 'info'
  message: string
  noLabel: string
  yesLabel: string
  yesClass: 'btn-danger' | 'btn-primary'
  /** True while the SAP call runs: both buttons wait. */
  busy?: boolean
  onYes: () => void
  onClose: () => void
}) {
  return (
    <ModalCard title={title} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-icon-row">
          <div className={`modal-icon icon-${icon}`}>{icon === 'warn' ? '⚠' : 'ℹ'}</div>
          <p className="modal-msg">{message}</p>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          {noLabel}
        </button>
        <button type="button" className={`btn ${yesClass}`} disabled={busy} onClick={onYes}>
          {busy ? 'Working…' : yesLabel}
        </button>
      </div>
    </ModalCard>
  )
}
