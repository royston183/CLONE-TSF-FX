import { money, oldRateText, rate } from './format.ts'
import type { NdfRow } from './types.ts'

/** "Transaction Details": the legacy #detailOverlay, opened via the Transaction hotspot or a row double-click. */
export function DetailModal({ row, onClose }: { row: NdfRow; onClose: () => void }) {
  const items: Array<[string, string]> = [
    ['Transaction', row.rfha],
    ['Company Code', row.bukrs],
    ['Company Name', row.company],
    ['Product Type', row.product],
    ['Currency Pair', row.pair],
    ['Buy/Sell', row.side],
    ['Amount 1', `${money(row.amt1)} ${row.curr1}`],
    ['Amount 2', `${money(row.amt2)} ${row.curr2}`],
    ['Fixing Date', row.fixDate],
    ['Fixing Ref', row.fixRef],
    ['Fixing Ref Description', row.fixRefName],
    ['Old Fixing Rate', oldRateText(row.oldRate)],
    ['Trader', row.trader],
    ['Business Partner', row.partner],
    ['Transaction Status', row.status],
    ['Status Description', row.statusText],
  ]
  return (
    <div className="overlay open" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal detail-modal">
        <div className="modal-head">
          <div className="modal-title">Transaction Details</div>
          <button className="close-btn" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="section-box">
            <div className="section-label">Transaction Overview</div>
            <div className="detail-grid">
              {items.map(([k, v]) => (
                <div className="detail-item" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
