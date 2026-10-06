import { fmtAmt, fmtRate } from './format.ts'
import { statusMeta } from './logic.ts'
import type { Deal, Invoice } from './types.ts'

export function StatusBadge({ code, desc }: { code: string; desc?: string }) {
  const meta = statusMeta(code, desc)
  return (
    <span className={`status-badge ${meta.cls}`}>
      <span className="status-dot"></span>
      {code} - {meta.desc}
    </span>
  )
}

/** The Deal Selection card's detail grid. */
export function DealDetails({ deal }: { deal: Deal }) {
  const items: [string, string][] = [
    ['Deal ID', deal.dealId],
    ['Deal Description', deal.dealDesc],
    ['Trader', deal.traderName ? `${deal.trader} — ${deal.traderName}` : deal.trader],
  ]
  const rest: [string, string][] = [
    ['Deal Start Date', deal.startDate],
    ['Deal End Date', deal.endDate],
    ['MC Ref No', deal.mcRef],
    ['MC Date', deal.mcDate],
    ['MC Description', deal.mcDesc],
    ['Company Code', deal.bukrs],
    ['Shipment Start Date', deal.shipStart],
    ['Shipment End Date', deal.shipEnd],
    ['FX Model ID', deal.fxModel],
    ['Model Description', deal.modelDesc],
    ['Entity String', deal.entityString],
    ['Currency String', deal.currString],
  ]
  const item = ([k, v]: [string, string]) => (
    <div className="detail-item" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
  return (
    <div className="deal-details">
      <div className="detail-grid">
        {items.map(item)}
        <div className="detail-item">
          <span className="k">Deal ID Status</span>
          <StatusBadge code={deal.status} desc={deal.statusText} />
        </div>
        {rest.map(item)}
      </div>
    </div>
  )
}

/** `rows` null: the plan cannot be built yet, and `waiting` says why in the empty-state row. */
export function InvoiceTable({ rows, waiting }: { rows: readonly Invoice[] | null; waiting: string | null }) {
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
            {rows && rows.length ? (
              rows.map((r) => (
                <tr key={r.tradeRef}>
                  <td className="mono">{r.tradeRef}</td>
                  <td>{r.invType}</td>
                  <td className="num mono">{fmtRate(r.exRate)}</td>
                  <td className="num mono">{fmtAmt(r.amt)}</td>
                  <td className="num mono">{fmtAmt(r.invAmt)}</td>
                  <td>{r.curr}</td>
                  <td>{r.due}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>
                  {waiting ?? 'No planned invoices.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Deal ID: Planned P&L. FORM alv_data_3 builds it from the FX legs (premium, FX P&L) and the
 * tickets; while the legs are not served the table shows why instead of invented figures.
 */
export function PlTable({ waiting }: { waiting: string }) {
  return (
    <div className="card" id="plCard">
      <div className="card-head">
        <h3>Deal ID: Planned P&amp;L</h3>
      </div>
      <div className="table-scroll">
        <table id="plTable">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Foreign Ccy Amount</th>
              <th className="num">Local Ccy (INR) Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>
                {waiting}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
