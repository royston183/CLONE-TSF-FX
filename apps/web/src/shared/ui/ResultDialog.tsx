import { useEffect, type ReactNode } from 'react'
import './ResultDialog.css'

export type ResultTone = 'success' | 'error' | 'warning' | 'info'
export type ResultActionKind = 'primary' | 'secondary' | 'danger'

export type ResultAction = {
  label: string
  onClick: () => void
  kind?: ResultActionKind
  disabled?: boolean
}

const ICON: Record<ResultTone, string> = { success: '✓', error: '✕', warning: '!', info: 'i' }

/**
 * The standard outcome popup for every mid-office screen: a toned icon circle (green success,
 * red error, amber warning, blue info), a bold title, one line of detail, an optional reference
 * box (SAP deal / contract / document number) and a row of buttons. It is self-contained —
 * its own overlay and stylesheet — so it looks the same whatever screen root it is rendered in.
 *
 * Like the Create Master Contract success popup it has no backdrop dismissal; Escape runs
 * onClose only when one is given, so an outcome that needs a decision cannot be dismissed by accident.
 */
export function ResultDialog({
  tone,
  title,
  message,
  reference,
  actions,
  onClose,
  children,
}: {
  tone: ResultTone
  title: string
  message?: ReactNode
  /** Highlighted reference, e.g. { label: 'Deal ID / MC Number', value: '2000000039' }. */
  reference?: { label: string; value: ReactNode } | undefined
  actions: ResultAction[]
  onClose?: (() => void) | undefined
  children?: ReactNode
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="std-result-overlay">
      <div
        className={`std-result std-result-${tone}`}
        role={tone === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title}
      >
        <div className="std-result-icon" aria-hidden="true">
          {ICON[tone]}
        </div>
        <h2 className="std-result-title">{title}</h2>
        {message ? <p className="std-result-message">{message}</p> : null}
        {reference ? (
          <div className="std-result-ref">
            <div className="std-result-ref-label">{reference.label}</div>
            <div className="std-result-ref-value">{reference.value}</div>
          </div>
        ) : null}
        {children}
        <div className="std-result-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`std-result-btn std-result-btn-${a.kind ?? 'secondary'}`}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
