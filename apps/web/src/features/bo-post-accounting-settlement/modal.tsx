import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { AccountingLine } from './logic.ts'

/** Secondary footer buttons share this look in the original (inline there too). */
export const SECONDARY_BTN: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--ink-soft)',
  borderColor: 'var(--border)',
}

/**
 * The original's .modal-overlay / .modal-card frame. The overlay stays mounted and is shown by
 * its "open" class, as in the legacy markup; a click on the dimmed backdrop closes it.
 */
export function ModalShell({
  open,
  size,
  icon,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  open: boolean
  size: '' | 'wide' | 'narrow'
  icon: string
  title: string
  subtitle: string
  onClose: () => void
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
          <button type="button" className="modal-close" onClick={onClose}>
            {'✕'}
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}

/** Escape closes whichever popup is open. */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEscape])
}

/** A labelled read-only value, the original's .field / .static pair. */
export function StaticField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="static">{children}</div>
    </div>
  )
}

/** The D/C, Account, Amount mini table every posting popup shows. */
export function EntryTable({ lines }: { lines: AccountingLine[] }) {
  return (
    <table className="mini-table">
      <thead>
        <tr>
          <th className="left">D/C</th>
          <th className="left">Account</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.dc}>
            <td className={l.dc === 'Debit' ? 'left dc-dr' : 'left dc-cr'}>{l.dc}</td>
            <td className="left">{l.account}</td>
            <td className="num">{l.amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
