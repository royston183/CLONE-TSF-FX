import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../popup/popup.css'
import './confirmation-review.css'

/** Reference popup styling, retaining existing transaction element IDs. */
export function MasterContractConfirmation({ open, title, message, children, danger = false,
  confirmLabel = 'Confirm', onCancel, onConfirm, ids = {}, iconId, subtitle, review = false, eyebrow }: {
  open: boolean; title: string; message?: ReactNode; children?: ReactNode; danger?: boolean
  confirmLabel?: string; onCancel: () => void; onConfirm: () => void | Promise<void>; subtitle?: ReactNode
  iconId?: string
  review?: boolean
  eyebrow?: string
  ids?: { overlay?: string; title?: string; message?: string; body?: string; cancel?: string; confirm?: string; close?: string }
}) {
  const generatedId = useId()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const card = useRef<HTMLDivElement>(null)
  const titleId = ids.title ?? generatedId
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation()
        if (!pending.current) onCancel()
      }
      if (event.key === 'Tab') {
        const controls = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
        const first = controls[0], last = controls[controls.length - 1]
        if (!first || !last) { event.preventDefault(); card.current?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    card.current?.focus()
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus() }
  }, [open, onCancel])
  if (!open) return null
  const proceed = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await onConfirm() } finally { pending.current = false; setBusy(false) }
  }
  return createPortal(<div className="std-pop-overlay" id={ids.overlay}>
    <div className={`std-pop mc-confirmation${review ? ' mc-confirmation--review' : ''}`} ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
      {ids.close ? <button id={ids.close} className="mc-confirm-close" type="button" aria-label="Close" disabled={busy} onClick={onCancel}>&times;</button> : null}
      {!review ? <div className={`std-pop-icon ${danger ? 'danger' : 'primary'}`} id={iconId} aria-hidden="true">{danger ? '!' : '?'}</div> : null}
      <div className={review ? 'confirmation-review-header' : undefined}>
        {review && eyebrow ? <div className="confirmation-review-eyebrow">{eyebrow}</div> : null}
        <h2 className="std-pop-title" id={titleId}>{title}</h2>
        {subtitle}
      </div>
      {message ? <div className="std-pop-message" id={ids.message}>{message}</div> : null}
      {children ? <div className="std-pop-body" id={ids.body}><fieldset className="mc-confirm-fields" disabled={busy}>{children}</fieldset></div> : null}
      <div className="std-pop-actions">
        <button className="std-pop-btn secondary" type="button" id={ids.cancel} disabled={busy} onClick={onCancel}>Cancel</button>
        <button className={`std-pop-btn ${danger ? 'danger' : 'primary'}`} type="button" id={ids.confirm} disabled={busy} onClick={() => void proceed()}>{busy ? 'Processing...' : confirmLabel}</button>
      </div>
    </div>
  </div>, document.body)
}
