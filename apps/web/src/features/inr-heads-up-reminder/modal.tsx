import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MODAL_CLOSE_MS } from './data.ts'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out before hiding. */
  close: () => void
  /** Hides at once (closeAllModals). */
  hide: () => void
}

export function useModal(): Modal {
  const [state, setState] = useState<ModalState>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const open = useCallback(() => {
    clearTimeout(timer.current)
    setState('open')
  }, [])
  const close = useCallback(() => {
    setState((s) => {
      if (s !== 'open') return s
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState((cur) => (cur === 'closing' ? 'closed' : cur)), MODAL_CLOSE_MS)
      return 'closing'
    })
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setState('closed')
  }, [])

  return useMemo(() => ({ state, open, close, hide }), [state, open, close, hide])
}

/**
 * The original's .modal-overlay. The content stays mounted while hidden, like the legacy
 * markup; pressing the mouse on the backdrop itself (not the card) closes it.
 */
export function Overlay({ modal, id, children }: { modal: Modal; id: string; children: ReactNode }) {
  const cls =
    modal.state === 'open' ? 'modal-overlay open' : modal.state === 'closing' ? 'modal-overlay open closing' : 'modal-overlay'
  return (
    <div
      className={cls}
      id={id}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) modal.close()
      }}
    >
      {children}
    </div>
  )
}

/** The shared card of the three popups: title row, scrolling body, action row. */
export function ModalCard({
  modal,
  id,
  size,
  title,
  titleId,
  body,
  bodyId,
  actions,
}: {
  modal: Modal
  id: string
  size: 'heads-modal' | 'heads-modal-sm'
  title: string
  titleId?: string | undefined
  body: ReactNode
  bodyId: string
  actions: ReactNode
}) {
  return (
    <Overlay modal={modal} id={id}>
      <div className={`modal modal-left modal-scrollable ${size}`}>
        <div className="modal-head-row">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            &times;
          </button>
        </div>
        <div className="modal-body-scroll" id={bodyId}>
          {body}
        </div>
        <div className="modal-actions">{actions}</div>
      </div>
    </Overlay>
  )
}

/** A label/value cell of a detail grid; an empty value shows an em dash. */
export function DetailItem({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className={`detail-item${full ? ' full' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{empty ? '\u2014' : value}</span>
    </div>
  )
}

export function KvRow({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={`kv-row${total ? ' kv-total' : ''}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  )
}
