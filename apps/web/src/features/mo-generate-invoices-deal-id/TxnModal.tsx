import { money } from './format.ts'
import type { FxRow } from './types.ts'

/** "Transaction Details": the legacy #txnModal, opened from an FX row's Transaction No hotspot or double-click. */
export function TxnModal({ row, onClose }: { row: FxRow; onClose: () => void }) {
  const items: Array<[string, string]> = [
    ['Company Code', row.bukrs],
    ['Transaction No', row.rfha],
    ['Deal Type', row.dealType],
    ['Roll Deal Type', row.roll || '—'],
    ['Business Partner', `${row.partner} — ${row.bp}`],
    ['Start Date', row.start],
    ['End Date', row.end],
    ['Entity', row.entity],
    ['Currency 1', row.curr1],
    ['Amount 1', money(row.amt1, 2)],
    ['Currency 2', row.curr2],
    ['Amount 2', money(row.amt2, 2)],
    ['All in Rate', money(row.allIn, 4)],
    ['Strike', money(row.strike, 4)],
    ['MC Ref No', row.mc],
    ['Transaction Status', row.txn],
  ]
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal txn-modal">
        <div className="modal-head">
          <div className="modal-title">Transaction Details</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            {items.map(([k, v]) => (
              <div className="detail-item" key={k}>
                <div className="detail-label">{k}</div>
                <div className="detail-value">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="action-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
