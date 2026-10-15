import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ModalId } from './types.ts'

export type Modals = {
  isOpen: (id: ModalId) => boolean
  open: (id: ModalId) => void
  close: (id: ModalId) => void
  /** Escape: closes the popup that was opened last (the letter preview sits above a posting popup). */
  closeTop: () => void
}

export function useModals(): Modals {
  const [stack, setStack] = useState<readonly ModalId[]>([])
  const isOpen = useCallback((id: ModalId) => stack.includes(id), [stack])
  const open = useCallback((id: ModalId) => setStack((s) => (s.includes(id) ? s : [...s, id])), [])
  const close = useCallback((id: ModalId) => setStack((s) => s.filter((m) => m !== id)), [])
  const closeTop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  return useMemo(() => ({ isOpen, open, close, closeTop }), [isOpen, open, close, closeTop])
}

/**
 * The original's .modal-overlay > .modal-card with its header, body and footer. The overlay
 * stays mounted while hidden (the .open class drives the fade), like the legacy markup.
 */
export function ModalFrame({
  open,
  onClose,
  size,
  icon,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  size?: 'wide' | 'narrow' | 'compact'
  icon: ReactNode
  title: ReactNode
  subtitle: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={open ? 'modal-overlay open' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={size ? `modal-card ${size}` : 'modal-card'}>
        <div className="modal-header">
          <div className="modal-icon">{icon}</div>
          <div className="modal-header-text">
            <div className="modal-title">{title}</div>
            <div className="modal-subtitle">{subtitle}</div>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}
