import { ConfirmPopup } from '../../shared/popup/Popup.tsx'
import { fmtNum } from './format.ts'
import { reverseSubtitle } from './logic.ts'
import type { Modal } from './modal.tsx'
import type { Txn } from './types.ts'

/** How many transactions the popup lists by name before summarising the rest. */
const LISTED = 8

/** Reverse Transaction(s): one row, the current selection, or the rows dragged onto Reverse. */
export function ReverseModal({
  modal,
  txns,
  reason,
  onReasonChange,
  onConfirm,
}: {
  modal: Modal
  /** The transactions as they were when the popup opened. */
  txns: Txn[]
  reason: string
  onReasonChange: (reason: string) => void
  onConfirm: () => void
}) {
  return (
    <ConfirmPopup
      open={modal.isOpen}
      tone="danger"
      title="Reverse Transaction(s)"
      message={<span id="reverse-subtitle">{txns.length ? reverseSubtitle(txns) : null}</span>}
      cancelLabel="Cancel"
      confirmLabel="Yes, Reverse"
      onCancel={modal.close}
      onConfirm={onConfirm}
      wide
    >
      <div id="reverse-body">
        <ul id="reverse-detail-grid" style={{ margin: '0 0 12px', padding: 0, listStyle: 'none' }}>
          {txns.slice(0, LISTED).map((t) => (
            <li
              key={t.rfha}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--sp-border)' }}
            >
              <span style={{ fontWeight: 600, color: 'var(--sp-muted)' }}>{t.rfha}</span>
              <span style={{ fontWeight: 600, color: 'var(--sp-primary-dark)' }}>
                Deal {t.dealId} · {t.ccy1} {fmtNum(t.amt1)}
              </span>
            </li>
          ))}
          {txns.length > LISTED ? <li style={{ padding: '6px 0', color: 'var(--sp-muted)' }}>...and {txns.length - LISTED} more.</li> : null}
        </ul>
        <div
          style={{ margin: '0 0 12px', padding: '9px 12px', borderRadius: 8, fontSize: 12, background: 'var(--sp-warning-tint)', color: 'var(--sp-text)' }}
        >
          <strong>Note:</strong> This runs <code>BAPI_FTR_FXT_REVERSE</code> in SAP (reason 04) &mdash; reversing is final.
          The transaction stays in the list marked <strong>Reversed</strong>. The SAP service has no field for a remark, so the
          remark below is not sent anywhere.
        </div>
        <label htmlFor="reverse-reason">Remark (optional, not sent to SAP)</label>
        <textarea
          id="reverse-reason"
          rows={2}
          placeholder="Not stored: SAP has no field for it."
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
      </div>
    </ConfirmPopup>
  )
}
