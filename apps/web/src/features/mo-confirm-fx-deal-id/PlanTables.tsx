import { GAPS } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import { storedPlRows } from './logic.ts'
import type { Deal, Invoice } from './types.ts'

/** The invoice plan saved for the deal (ZSGTSFTR_INV_REF). A deal that was never confirmed has none. */
export function InvoiceTable({ rows }: { rows: readonly Invoice[] }) {
  return (
    <div className="card" id="invoiceCard">
      <div className="card-head">
        <h3>Deal ID: Planned Trade Invoices</h3>
      </div>
      <div className="table-scroll">
        <table id="invTable">
          <thead>
            <tr>
              <th>Trade Ref</th>
              <th>Invoice Type</th>
              <th className="num">Exchange Rate</th>
              <th className="num">Amount (FCY)</th>
              <th className="num">Invoice Amount (INR)</th>
              <th>Currency</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={`${r.tradeRef}-${r.invType}`}>
                  <td className="mono">{r.tradeRef}</td>
                  <td>{r.invType}</td>
                  <td className="num mono">{fmtRate(r.exRate)}</td>
                  <td className="num mono">{fmtAmt(r.amt)}</td>
                  <td className="num mono">{fmtAmt(r.invAmt)}</td>
                  <td>{r.curr}</td>
                  {/* The saved plan has no due date. */}
                  <td>&mdash;</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>
                  No invoice plan is saved for this Deal ID yet. It is created when the deal is confirmed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The P&L stored on the Deal ID at confirmation, with the reason a planned P&L cannot be shown. */
export function PlTable({ deal }: { deal: Deal }) {
  const rows = storedPlRows(deal)
  return (
    <div className="card" id="plCard">
      <div className="card-head">
        <h3>Deal ID: P&amp;L</h3>
        <span className="hint">{GAPS.pl}</span>
      </div>
      <div className="table-scroll">
        <table id="plTable">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Stored on the Deal ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td className="num mono">{r.value}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>
                  No P&amp;L is stored: this Deal ID has not been confirmed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
