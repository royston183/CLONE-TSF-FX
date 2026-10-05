import { fmtNum } from './format.ts'
import { reverseSubtitle } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
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
    <Overlay id="reverse-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title">Reverse Transaction(s)</div>
            <div className="modal-subtitle" id="reverse-subtitle">
              {txns.length ? reverseSubtitle(txns) : null}
            </div>
          </div>
          <button className="modal-close" onClick={modal.close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body" id="reverse-body">
          <div className="detail-grid" id="reverse-detail-grid" style={{ marginBottom: 12 }}>
            {txns.slice(0, LISTED).map((t) => (
              <div className="detail-cell" key={t.rfha}>
                <div className="detail-lbl">{t.rfha}</div>
                <div className="detail-val accent">
                  Deal {t.dealId} · {t.ccy1} {fmtNum(t.amt1)}
                </div>
              </div>
            ))}
            {txns.length > LISTED ? (
              <div className="detail-cell">
                <div className="detail-val">...and {txns.length - LISTED} more.</div>
              </div>
            ) : null}
          </div>
          <div className="note" style={{ marginBottom: 12 }}>
            <strong>Note:</strong> This runs <code>BAPI_FTR_FXT_REVERSE</code> in SAP (reason 04) &mdash; reversing is final.
            The transaction stays in the list marked <strong>Reversed</strong>. The SAP service has no field for a remark, so the
            remark below is not sent anywhere.
          </div>
          <div className="filter-field" style={{ width: '100%' }}>
            <label htmlFor="reverse-reason">Remark (optional, not sent to SAP)</label>
            <textarea
              id="reverse-reason"
              className="textarea-field"
              rows={2}
              placeholder="Not stored: SAP has no field for it."
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn-confirm is-reject" onClick={onConfirm}>
            Yes, Reverse
          </button>
        </div>
      </div>
    </Overlay>
  )
}
