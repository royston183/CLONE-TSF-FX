import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './popup.css'

/*
 * The standard FX popups: one look for every screen, taken from "Master Contract Created"
 * (FO: Create Master Contract). Use StatusPopup for an outcome (success / error / warning / info)
 * and ConfirmPopup before an action. They render into document.body, so a screen's stylesheet
 * cannot change them.
 */

export type StatusTone = 'success' | 'error' | 'warning' | 'info'
export type PopupButtonVariant = 'secondary' | 'primary' | 'danger'
export type PopupAction = { label: string; onClick: () => void; variant?: PopupButtonVariant; disabled?: boolean; autoFocus?: boolean }

const ICON: Record<StatusTone | 'danger' | 'primary', string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
  danger: '!',
  primary: '?',
}

function Shell({ wide, labelledBy, children }: { wide?: boolean | undefined; labelledBy: string; children: ReactNode }) {
  return createPortal(
    <div className="std-pop-overlay">
      <div className={`std-pop${wide ? ' std-pop-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Escape runs `onEscape` while the popup is open (and is ignored while it is busy). */
function useEscape(open: boolean, onEscape: (() => void) | undefined) {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current) {
        e.stopPropagation()
        ref.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])
}

let seq = 0
const useTitleId = () => useRef(`std-pop-title-${++seq}`).current

export type StatusPopupProps = {
  open: boolean
  tone: StatusTone
  title: string
  message?: ReactNode
  /** The highlighted reference, e.g. label "Deal ID / MC Number", value "2000000039". */
  refLabel?: string
  refValue?: ReactNode
  /** Extra content under the message: a list of SAP messages, per-row results, … */
  details?: ReactNode
  /** Buttons left to right. Defaults to a single "Close". */
  actions?: PopupAction[]
  /** Close / Escape. Like the reference, a click on the backdrop does not close an outcome. */
  onClose: () => void
  wide?: boolean
}

export function StatusPopup({ open, tone, title, message, refLabel, refValue, details, actions, onClose, wide }: StatusPopupProps) {
  const titleId = useTitleId()
  useEscape(open, onClose)
  if (!open) return null
  const buttons = actions ?? [{ label: 'Close', onClick: onClose, variant: 'secondary' as const, autoFocus: true }]
  return (
    <Shell wide={wide} labelledBy={titleId}>
      <div className={`std-pop-icon ${tone}`} aria-hidden="true">
        {ICON[tone]}
      </div>
      <h2 className="std-pop-title" id={titleId}>
        {title}
      </h2>
      {message ? <p className="std-pop-message">{message}</p> : null}
      {refValue !== undefined && refValue !== null && refValue !== '' ? (
        <div className="std-pop-ref">
          {refLabel ? <div className="std-pop-ref-label">{refLabel}</div> : null}
          <div className="std-pop-ref-value">{refValue}</div>
        </div>
      ) : null}
      {details ? <div className="std-pop-body">{details}</div> : null}
      <div className="std-pop-actions">
        {buttons.map((b) => (
          <button key={b.label} type="button" className={`std-pop-btn ${b.variant ?? 'secondary'}`} disabled={b.disabled} autoFocus={b.autoFocus} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
    </Shell>
  )
}

export type ConfirmPopupProps = {
  open: boolean
  title: string
  message?: ReactNode
  /** Extra content: the records affected, a remark field, … */
  children?: ReactNode
  /** 'danger' for destructive actions (red ! and red button), 'primary' otherwise (blue ?). */
  tone?: 'danger' | 'primary'
  cancelLabel?: string
  confirmLabel?: string
  /** Shown on the confirm button while the action runs; both buttons and Escape are disabled. */
  busyLabel?: string
  busy?: boolean
  confirmDisabled?: boolean
  onCancel: () => void
  onConfirm: () => void
  wide?: boolean
}

export function ConfirmPopup({
  open,
  title,
  message,
  children,
  tone = 'primary',
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  busyLabel,
  busy = false,
  confirmDisabled = false,
  onCancel,
  onConfirm,
  wide,
}: ConfirmPopupProps) {
  const titleId = useTitleId()
  useEscape(open, busy ? undefined : onCancel)
  if (!open) return null
  return (
    <Shell wide={wide} labelledBy={titleId}>
      <div className={`std-pop-icon ${tone}`} aria-hidden="true">
        {ICON[tone]}
      </div>
      <h2 className="std-pop-title" id={titleId}>
        {title}
      </h2>
      {message ? <p className="std-pop-message">{message}</p> : null}
      {children ? <div className="std-pop-body">{children}</div> : null}
      <div className="std-pop-actions">
        <button type="button" className="std-pop-btn secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={`std-pop-btn ${tone}`} autoFocus disabled={busy || confirmDisabled} onClick={onConfirm}>
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </div>
    </Shell>
  )
}

export type StatusOptions = Omit<StatusPopupProps, 'open' | 'onClose'> & { onClose?: () => void }

/**
 * An outcome popup driven imperatively, for code that used to raise a toast:
 *   const status = useStatusPopup()
 *   status.show({ tone: 'success', title: 'Spot Created', message, refLabel: 'Transaction', refValue: rfha })
 *   …render {status.element}
 */
export function useStatusPopup(): { element: ReactNode; show: (opts: StatusOptions) => void; hide: () => void } {
  const [opts, setOpts] = useState<StatusOptions | null>(null)
  const hide = useCallback(() => setOpts(null), [])
  const show = useCallback((o: StatusOptions) => setOpts(o), [])
  const close = useCallback(() => {
    const after = opts?.onClose
    setOpts(null)
    after?.()
  }, [opts])
  const element = opts ? <StatusPopup {...opts} open onClose={close} /> : null
  return { element, show, hide }
}
