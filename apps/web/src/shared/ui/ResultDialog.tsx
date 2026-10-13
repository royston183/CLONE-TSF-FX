import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * It is the top layer of whatever is open. It renders into document.body, so no screen's stacking context
 * (a transformed or z-indexed parent) can hold it under that screen's own popups, and its overlay sits above
 * them (z-index in ResultDialog.css). Escape is taken in the capture phase and stopped, so it closes only this
 * message, never the popup underneath; focus returns to where it was once the message closes.
 */
export function ResultDialog({
  tone,
  title,
  message,
  reference,
  details,
  actions,
  onClose,
  children,
}: {
  tone: ResultTone
  title: string
  message?: ReactNode
  /** Highlighted reference, e.g. { label: 'Deal ID / MC Number', value: '2000000039' }. */
  reference?: { label: string; value: ReactNode } | undefined
  /** What is being confirmed: label / value rows under the message (rows with an empty value are skipped). */
  details?: ReadonlyArray<{ label: string; value: ReactNode }> | undefined
  actions: ResultAction[]
  onClose?: (() => void) | undefined
  children?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The screen's own Escape handlers (closing its top popup) must not see this key.
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const shownDetails = (details ?? []).filter((d) => d.value !== '' && d.value != null)

  // Focus the first action while the message is up, and hand focus back to the popup underneath after.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.querySelector<HTMLButtonElement>('.std-result-btn-primary, .std-result-btn')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return createPortal(
    <div
      className="std-result-overlay"
      // A click here belongs to the message only: it must not reach a popup's backdrop handler underneath.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={cardRef}
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
        {shownDetails.length > 0 ? (
          <dl className="std-result-details">
            {shownDetails.map((d) => (
              <div className="std-result-detail" key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
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
    </div>,
    document.body,
  )
}
