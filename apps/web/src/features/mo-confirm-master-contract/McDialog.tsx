import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../fo-create-master-contract/fo-create-master-contract.legacy.css'
import '../fo-create-master-contract/fo-create-master-contract.dark.css'

/**
 * A pop-up in the Create Master Contract screen's style: its overlay, its `modal modal-left modal-scrollable` card, a heading with
 * a × close button, a scrolling body and an actions bar. It is drawn inside a `.fomc` wrapper (that stylesheet is scoped to it),
 * on the body, so this screen's own stylesheet does not reach it and night mode follows the Create screen's.
 */
export function McDialog({ open, title, onClose, children, actions, ids = {}, busy = false }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions: ReactNode
  ids?: { overlay?: string; title?: string; body?: string; close?: string }
  busy?: boolean
}) {
  const card = useRef<HTMLDivElement>(null)
  const down = useRef(false)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    card.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!busy) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [open, busy, onClose])
  if (!open) return null
  return createPortal(
    <div className="fomc" style={{ background: 'transparent' }}>
      <div
        className="modal-overlay open"
        id={ids.overlay}
        style={{ zIndex: 10050 }}
        onMouseDown={(e) => { down.current = e.target === e.currentTarget }}
        onClick={(e) => { if (e.target === e.currentTarget && down.current && !busy) onClose(); down.current = false }}
      >
        <div className="modal modal-left modal-scrollable" ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={ids.title ?? 'mc-dialog-title'} aria-busy={busy}>
          <div className="modal-head-row">
            <h2 id={ids.title ?? 'mc-dialog-title'}>{title}</h2>
            <button type="button" className="modal-close-btn" id={ids.close} aria-label="Close" disabled={busy} onClick={onClose}>×</button>
          </div>
          <div className="modal-body-scroll" id={ids.body}>{children}</div>
          <div className="modal-actions contract-detail-actions">{actions}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
