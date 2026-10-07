import type { DragEvent } from 'react'
import { fmtAmt, plClass } from './format.ts'
import { LEGS_PARTIAL_NOTE, PL_WAITING } from './api.ts'
import { invoicesEditable, invoicesVisible } from './logic.ts'
import { StatusBadge, TxnStatusBadge } from './parts.tsx'
import type { Deal, Leg } from './types.ts'

/** "Deal ID Analysis": the header key/value grid, the status badge and the Short Straddle pill. */
export function HeaderCard({ deal }: { deal: Deal }) {
  const items: [string, string, string][] = [
    ['Deal ID', deal.dealId, 'mono'],
    ['Deal Reference', deal.dealRef, ''],
    ['Deal Start Date', deal.startDate, ''],
    ['Deal End Date', deal.endDate, ''],
    ['MC Ref No', deal.mcRefNo, 'mono'],
    ['MC Description', deal.mcDesc, 'muted'],
    ['MC Date', deal.mcDate, ''],
    ['Shipment Start', deal.shipStart, ''],
    ['Shipment End', deal.shipEnd, ''],
    ['FX Model ID', deal.fxModel, ''],
    ['FX Model Description', deal.fxModelDesc, 'muted'],
    ['Entity String', deal.entityString, 'mono'],
    ['FX Inv Model', deal.fxInvModel, ''],
    ['Trader', [deal.traderCode, deal.traderDesc].filter(Boolean).join(' — '), 'muted'],
    ['Currency String', deal.currString, 'mono'],
  ]
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Deal ID Analysis</div>
        <div>
          <StatusBadge code={deal.status} text={deal.statusText} />
          {deal.isSS ? (
            <>
              {' '}
              <span className="pill pill-alt" style={{ marginLeft: 6 }}>
                Short Straddle
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="deal-grid">
        {items.map(([k, v, cls]) => (
          <div className="kv" key={k}>
            <div className="k">{k}</div>
            <div className={`v ${cls}`} title={v.replace(/"/g, '')}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** "FX Deals": one selectable, draggable row per leg; the transaction number opens its details. */
export function LegTable({
  legs,
  waiting,
  selectedRfha,
  draggingRfha,
  onToggle,
  onView,
  onDragStart,
  onDragEnd,
}: {
  legs: readonly Leg[]
  /** Why there are no legs (nothing carries the Deal ID, or the read failed). */
  waiting: string
  selectedRfha: string | null
  draggingRfha: string | null
  onToggle: (rfha: string) => void
  onView: (rfha: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, leg: Leg) => void
  onDragEnd: () => void
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          FX Deals <span className="count">{legs.length}</span>
        </div>
        <div className="small text-faint">Select a row to enable Edit Deal Pair</div>
      </div>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="checkbox-cell" />
              <th>Transaction No</th>
              <th>Leg</th>
              <th>Instrument</th>
              <th>Trade Date</th>
              <th>Value Date</th>
              <th className="num">Buy</th>
              <th className="num">Sell</th>
              <th className="num">All-in Rate / Strike</th>
              <th>MC Ref No</th>
              <th>Txn Status</th>
              <th className="num">FX P&amp;L</th>
              <th className="num">Settlement P&amp;L</th>
              <th className="num">Total P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {legs.length === 0 ? (
              <tr>
                <td colSpan={14}>
                  <div className="empty-state" style={{ padding: 20 }}>
                    {waiting || 'No FX deals for this Deal ID'}
                  </div>
                </td>
              </tr>
            ) : null}
            {legs.map((l, i) => {
              const selected = selectedRfha === l.rfha
              const cls = ['selectable', selected ? 'row-selected' : '', draggingRfha === l.rfha ? 'dragging' : '']
                .filter(Boolean)
                .join(' ')
              return (
                <tr
                  // Keyed by position: Edit Deal Pair renames a leg's transaction number in place.
                  key={i}
                  className={cls}
                  draggable
                  onClick={() => onToggle(l.rfha)}
                  onDragStart={(e) => onDragStart(e, l)}
                  onDragEnd={onDragEnd}
                >
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      className="rowchk"
                      checked={selected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle(l.rfha)}
                    />
                  </td>
                  <td>
                    <a
                      className="hotspot"
                      onClick={(e) => {
                        e.stopPropagation()
                        onView(l.rfha)
                      }}
                    >
                      {l.rfha}
                    </a>
                  </td>
                  <td>
                    <span className="pill">{l.dealType}</span>
                  </td>
                  <td>{l.instrument}</td>
                  <td>{l.tradeDate}</td>
                  <td>{l.valueDate}</td>
                  <td className="num">
                    {l.bs1} {l.curr1} {fmtAmt(l.amt1)}
                  </td>
                  <td className="num">
                    {l.bs2} {l.curr2} {fmtAmt(l.amt2)}
                  </td>
                  <td className="num">{fmtAmt(l.strike || l.allInRate, 4)}</td>
                  <td>{l.mcRef}</td>
                  <td>
                    <TxnStatusBadge code={l.txnStatus} />
                  </td>
                  {/* P&L needs ZSGTSFCDS_OPTION and the settlement figures: not served, so never a made-up 0. */}
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num">
                    <b>—</b>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {legs.length > 0 ? <div className="small text-faint" style={{ padding: '8px 12px' }}>{LEGS_PARTIAL_NOTE}</div> : null}
    </div>
  )
}

/** "Planned Trade Invoices" and "Planned P&L"; both hidden when the deal has no invoice plan. */
export function InvoiceAndPlCards({ deal }: { deal: Deal }) {
  const visible = invoicesVisible(deal)
  const hidden = visible ? '' : ' hidden'
  const editable = invoicesEditable(deal)
  return (
    <>
      <div className={`card${hidden}`}>
        <div className="card-head">
          <div className="card-title">
            Planned Trade Invoices <span className="count">{deal.invoices.length}</span>
          </div>
          <div className="small text-faint">
            {editable
              ? 'Exchange rate is editable — use Change / Confirm to update and confirm'
              : 'Exchange rate is locked — deal is no longer in Pending Confirmation'}
          </div>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Trade Type</th>
                <th>Deal Type</th>
                <th>Buy</th>
                <th>Sell</th>
                <th>Invoice Ccy</th>
                <th className="num">Exchange Rate</th>
                <th className="num">Invoice Amount</th>
                <th className="num">Invoice Amount (USD)</th>
                <th>Inv TRM Ref No</th>
                <th>MC Ref</th>
              </tr>
            </thead>
            <tbody>
              {deal.invoices.length ? (
                deal.invoices.map((inv, i) => (
                  <tr key={i}>
                    <td>{inv.ttype}</td>
                    <td>
                      <span className="pill">{inv.dtype}</span>
                    </td>
                    <td>{inv.buy}</td>
                    <td>{inv.sell}</td>
                    <td>{inv.currency}</td>
                    <td className="num">{fmtAmt(inv.exRate, 4)}</td>
                    <td className="num">{fmtAmt(inv.invAmt)}</td>
                    <td className="num">{fmtAmt(inv.invAmtUsd)}</td>
                    <td>{inv.trmRef}</td>
                    <td>{inv.mcRef}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state" style={{ padding: 20 }}>
                      {deal.invoicesWaiting || 'No invoice legs for this Deal ID'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`card${hidden}`}>
        <div className="card-head">
          <div className="card-title">Planned P&amp;L</div>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Amount (Local Ccy)</th>
                <th className="num">Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3}>
                  <div className="empty-state" style={{ padding: 20 }}>
                    {PL_WAITING}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
