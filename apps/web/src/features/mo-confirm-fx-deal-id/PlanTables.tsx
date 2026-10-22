import { GAPS } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import { storedPlRows } from './logic.ts'
import type { ConfirmPreview } from './Modals.tsx'
import type { Deal, Invoice } from './types.ts'

/** The invoice plan saved for the deal (ZSGTSFTR_INV_REF). A deal that was never confirmed has none. */
/** Shown in place of an empty plan when the model is configured without one (ZNO_INV), so the card is never silently missing. */
export const NO_INV_NOTE = 'This FX model is configured without an invoice plan (ZNO_INV), so no planned trade invoices or P&L are created for it.'

export function InvoiceTable({ rows, notice }: { rows: readonly Invoice[]; notice?: string | undefined }) {
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
                  {notice ?? 'No invoice plan is saved for this Deal ID yet. It is created when the deal is confirmed.'}
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
export function PlTable({ deal, planned, notice }: { deal: Deal; notice?: string | undefined; planned?: { loading: boolean; reason: string | null; preview: ConfirmPreview | null } | null }) {
  const rows = storedPlRows(deal)
  const calc = planned?.preview
  const plRows = rows.length
    ? rows
    : calc && !notice
      ? [
          { type: 'P&L (USD)', value: fmtAmt(calc.pl.amount) },
          { type: `P&L Local (${calc.pl.localCurrency || '—'})`, value: fmtAmt(calc.pl.localAmount) },
          { type: 'P&L Rate', value: fmtRate(calc.rate) },
        ]
      : []
  return (
    <div className="card" id="plCard">
      <div className="card-head">
        <h3>Deal ID: P&amp;L</h3>
        <span className="hint">
          {rows.length ? GAPS.pl : notice ? notice : calc ? `Planned P&L, calculated now: TCURR type M rate ${fmtRate(calc.rate)} (${calc.rateDate}), the currency string and the origin profit margin. Not saved until the deal is confirmed.` : planned?.loading ? 'Calculating the planned P&L…' : (planned?.reason ?? GAPS.pl)}
        </span>
      </div>
      <div className="table-scroll">
        <table id="plTable">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">{rows.length ? 'Stored on the Deal ID' : 'Planned'}</th>
            </tr>
          </thead>
          <tbody>
            {plRows.length ? (
              plRows.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td className="num mono">{r.value}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>
                  {notice ?? (planned?.loading ? 'Calculating…' : planned?.reason ?? 'No P&L is stored: this Deal ID has not been confirmed.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
