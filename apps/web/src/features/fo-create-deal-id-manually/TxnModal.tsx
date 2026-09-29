import { Fragment } from 'react'
import { money } from './format.ts'
import type { FxRow } from './types.ts'

/** "Transaction Details": the legacy #txnModal, opened from an FX row's Transaction hotspot. */
export function TxnModal({ row, onClose }: { row: FxRow; onClose: () => void }) {
  const items: Array<[string, string]> = [
    ['Company Code', row.bukrs],
    ['Transaction', row.rfha],
    ['Deal Type', row.dealType],
    ['Product Type', row.sfhaart],
    ['Start Date', row.start],
    ['End Date', row.end],
    ['Text', row.text],
    ['Entity', row.entity],
    ['Leg 1', `${row.side1} ${row.curr1} ${money(row.amt1)}`],
    ['Leg 2', `${row.side2} ${row.curr2} ${money(row.amt2)}`],
    ['All in Rate', money(row.allIn, 4)],
    ['MC Ref No', row.mcRef],
    ['Transaction Status', row.txnStatus],
  ]
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Transaction Details</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="txn-kv">
            {items.map(([k, v]) => (
              <Fragment key={k}>
                <div>{k}</div>
                <div>{v}</div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
