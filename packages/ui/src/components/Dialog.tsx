import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Roughly how wide the dialog should be; it never exceeds the viewport. */
  width?: number
  /** Keep a committed operation visible until it finishes, including native Escape handling. */
  closeDisabled?: boolean
}

/**
 * Built on the native <dialog> element, which supplies the focus trap, Escape-to-close,
 * backdrop, and inertness of the page behind it. The legacy consoles hand-rolled all four
 * with a div, a global keydown listener and an `inert` toggle, and each console's copy had
 * drifted from the others.
 */
export function Dialog({ open, onClose, title, children, footer, width = 880, closeDisabled = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Fires for Escape as well as an explicit close(), so both paths tell React the same thing
    // and the `open` prop can never disagree with what is on screen.
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className="slc-dialog"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      onCancel={(event) => { if (closeDisabled) event.preventDefault() }}
      // Clicking the backdrop closes. The check is against the dialog itself because the
      // backdrop is not a separate node — clicks on children never match.
      onClick={(event) => {
        if (!closeDisabled && event.target === ref.current) onClose()
      }}
    >
      <div className="slc-dialog__head">
        <h2 className="slc-dialog__title">{title}</h2>
        <button type="button" className="slc-dialog__close" onClick={onClose} aria-label="Close" disabled={closeDisabled}>
          ×
        </button>
      </div>
      <div className="slc-dialog__body">{children}</div>
      {footer ? <div className="slc-dialog__footer">{footer}</div> : null}
    </dialog>
  )
}
