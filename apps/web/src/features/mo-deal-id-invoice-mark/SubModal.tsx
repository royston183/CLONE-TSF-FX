import { fmtNdfCash, fmtNdfDate, fmtNdfRate } from '../../shared/fx/ndf-columns.ts'
import { formatAmount, formatRate } from './format.ts'
import { buildBlRows } from './logic.ts'
import type { SubModalState } from './types.ts'

function BlListBody({ state }: { state: Extract<NonNullable<SubModalState>, { kind: 'bl' }> }) {
  const rows = buildBlRows(state.row)
  return (
    <div className="deal-table-scroll">
      <table className="deal-table">
        <thead>
          <tr>
            <th>TF No</th>
            <th>TF Split</th>
            <th>BL No</th>
            <th>BL Split</th>
            <th>BL Date</th>
            <th>Invoice Commodity</th>
            <th>TRM Commodity ID</th>
            <th>Incoterm</th>
            <th>Invoice Date</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Trade Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.blNo}>
              <td>{r.tfNo}</td>
              <td>{r.tfSplit}</td>
              <td>{r.blNo}</td>
              <td>{r.blSplit}</td>
              <td>{r.blDate}</td>
              <td>{r.commodity}</td>
              <td>{r.commodityId}</td>
              <td>{r.incoterm}</td>
              <td>{r.invoiceDate}</td>
              <td className="num">{formatAmount(r.qty)}</td>
              <td>{r.unit}</td>
              <td className="num">{formatAmount(r.price)}</td>
              <td className="num">{formatAmount(r.tradeValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TxnBody({ state }: { state: Extract<NonNullable<SubModalState>, { kind: 'txn' }> }) {
  const fx = state.fx
  const fields: Array<[string, string]> = [
    ['Company Code', fx.bukrs],
    ['Transaction No', fx.rfha],
    ['Deal Type', fx.dealType],
    ['Product', fx.text],
    ['Start Date', fx.start],
    ['End Date', fx.end],
    ['Currency 1', fx.curr1],
    ['Amount 1', formatAmount(fx.amt1)],
    ['Currency 2', fx.curr2],
    ['Amount 2', formatAmount(fx.amt2)],
    ['All in Rate', formatRate(fx.allIn || fx.strike)],
    ['NDF Fixing Date', fmtNdfDate(fx.ndf?.ndfDate ?? '')],
    ['NDF Ref', fx.ndf?.ndfRef ?? ''],
    ['NDF Settlement Rate', fmtNdfRate(fx.ndf?.ndfRate)],
    ['Cash Settlement Amount', fmtNdfCash(fx.ndf?.cashAmount)],
    ['Cash Currency', fx.ndf?.cashCurrency ?? ''],
    ['Transaction Status', fx.txnStatus],
  ]
  return (
    <div className="txn-grid">
      {fields.map(([label, value]) => (
        <div className="txn-card" key={label}>
          <div className="txn-label">{label}</div>
          <div className="txn-value">{value}</div>
        </div>
      ))}
    </div>
  )
}

/** The small popup stacked on everything else — BL list (from the deal workspace) or a Treasury Transaction display. */
export function SubModal({ state, onClose }: { state: NonNullable<SubModalState>; onClose: () => void }) {
  const title = state.kind === 'bl' ? `View List of BLs — ${state.row.dealId}` : 'Treasury Transaction Display'
  return (
    <div className="sub-modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={state.kind === 'txn' ? 'sub-modal small' : 'sub-modal'}>
        <div className="sub-modal-head">
          <div className="sub-modal-title">{title}</div>
          <button className="sub-modal-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="sub-modal-body">{state.kind === 'bl' ? <BlListBody state={state} /> : <TxnBody state={state} />}</div>
        <div className="sub-modal-foot">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
