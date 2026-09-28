import { useCallback, useMemo, useState, type ReactNode } from 'react'

export type Modal = {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * Open/closed state for one .modal-overlay. The original only toggled its "open" class (the
 * card's popIn keyframe plays on display), so there is no closing phase to time here.
 */
export function useModal(): Modal {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
}

/** The original's .modal-overlay; a click on the backdrop itself (not the card) closes it. */
export function Overlay({ modal, children }: { modal: Modal; children: ReactNode }) {
  return (
    <div
      className={`modal-overlay${modal.isOpen ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) modal.close()
      }}
    >
      {children}
    </div>
  )
}

/** The shared .modal-header: title, optional sub-line and the ✕. */
export function ModalHeader({ title, sub, onClose }: { title: string; sub?: string | undefined; onClose: () => void }) {
  return (
    <div className="modal-header">
      <div>
        <h2>{title}</h2>
        {sub !== undefined ? <div className="mh-sub">{sub}</div> : null}
      </div>
      <button type="button" className="modal-close" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

/** A read-only .form-field. */
export function Field({ label, value, calc, wide }: { label: string; value: ReactNode; calc?: boolean; wide?: boolean }) {
  return (
    <div className="form-field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <div className={calc ? 'fv calc' : 'fv'}>{value}</div>
    </div>
  )
}
