import { Fragment } from 'react'
import { fmtDate, fmtNum, fmtRate } from './format.ts'
import { plTable, ratesEditable } from './logic.ts'
import type { Deal } from './types.ts'

const buySellTag = (v: string) => (v === 'Buy' ? 'buy-tag' : 'sell-tag')
const dealLegTag = (leg: string) => `leg-tag ${leg === 'D1' ? 'leg-d1' : 'leg-d2'}`

/** The D1 / D2 legs booked with the trader. */
export function FxDealsPanel({ deal }: { deal: Deal }) {
  return (
    <div className="panel">
      <div className="panel-title">
        <div className="panel-title-left">
          <span className="dot-bullet" />
          <h2>FX Deals (D1 / D2 legs booked with the trader)</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid-mini-table" id="fx-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th className="list-table th">Leg</th>
              <th>CoCode</th>
              <th>Trade Date</th>
              <th>Buy/Sell</th>
              <th>Currency 1</th>
              <th>Amount 1</th>
              <th>Buy/Sell</th>
              <th>Currency 2</th>
              <th>Amount 2</th>
              <th>All-in Rate</th>
              <th>Value Date</th>
              <th>Partner</th>
              <th>Txn Type</th>
            </tr>
          </thead>
          <tbody id="fx-tbody">
            {deal.fxLegs.map((l) => (
              <tr key={l.leg}>
                <td>
                  <span className={dealLegTag(l.leg)}>{l.leg}</span>
                </td>
                <td>{l.coCode}</td>
                <td>{fmtDate(l.tradeDate)}</td>
                <td>
                  <span className={buySellTag(l.buy1)}>{l.buy1}</span>
                </td>
                <td>{l.curr1}</td>
                <td className="num">{fmtNum(l.amt1)}</td>
                <td>
                  <span className={buySellTag(l.buy2)}>{l.buy2}</span>
                </td>
                <td>{l.curr2}</td>
                <td className="num">{fmtNum(l.amt2)}</td>
                <td className="num">{fmtRate(l.rate)}</td>
                <td>{fmtDate(l.valueDate)}</td>
                <td>{l.partner}</td>
                <td>{l.txnType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-note">
        This shows the two market-facing FX Deals (<strong>D1</strong> and <strong>D2</strong>) that were booked by the trader and assigned to this
        Master Contract. They offset each other's currency exposure and lock in the FX spread as risk-free margin.
      </div>
    </div>
  )
}

/**
 * Planned trade invoices. The exchange-rate inputs are uncontrolled, as on the page: a typed
 * rate is committed on change (blur or Enter) and the row redrawn from state, which `rev`
 * forces by remounting the inputs — so a rejected rate snaps back to the stored one.
 */
export function InvoicesPanel({
  deal,
  rev,
  onRateChange,
  onCalculate,
}: {
  deal: Deal
  rev: number
  onRateChange: (idx: number, text: string) => void
  onCalculate: () => void
}) {
  const editable = ratesEditable(deal)
  return (
    <div className="panel">
      <div className="panel-title">
        <div className="panel-title-left">
          <span className="dot-bullet" />
          <h2>Deal ID: Planned Trade Invoices</h2>
        </div>
        <button className="calc-btn" type="button" onClick={onCalculate}>
          ↻ Calculate
        </button>
      </div>
      <div className="table-wrap">
        <table className="grid-mini-table" id="inv-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Inv TRM Ref No</th>
              <th>Trade Type</th>
              <th>Deal Type</th>
              <th>Sell (from)</th>
              <th>Buy (to)</th>
              <th>MC Ref (Sell)</th>
              <th>MC Ref (Buy)</th>
              <th>Amount</th>
              <th>Exchange Rate</th>
              <th>Invoice Amount</th>
              <th>Inv Currency</th>
            </tr>
          </thead>
          <tbody id="inv-tbody">
            {deal.invLegs.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={11}>No invoices yet — waiting for the Bill of Lading to be attached to this Deal ID.</td>
              </tr>
            ) : (
              deal.invLegs.map((l, idx) => (
                <tr key={l.ref}>
                  <td className="inv-text">{l.ref}</td>
                  <td>
                    <span className="leg-tag leg-t">{l.type}</span>
                  </td>
                  <td>
                    <span className={dealLegTag(l.dealType)}>{l.dealType}</span>
                  </td>
                  <td>{l.sell}</td>
                  <td>{l.buy}</td>
                  <td>{l.mcSell}</td>
                  <td>{l.mcBuy}</td>
                  <td className="num">{fmtNum(l.amt)}</td>
                  <td className="num">
                    <input
                      key={`${rev}-${l.rate}`}
                      className="ex-rate-input"
                      data-idx={idx}
                      defaultValue={fmtRate(l.rate)}
                      disabled={!editable}
                      onBlur={(e) => {
                        if (e.currentTarget.value !== e.currentTarget.defaultValue) onRateChange(idx, e.currentTarget.value)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value !== e.currentTarget.defaultValue) onRateChange(idx, e.currentTarget.value)
                      }}
                    />
                  </td>
                  <td className="num">{fmtNum(l.invAmt)}</td>
                  <td>{l.curr}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="section-note">
        Only generated once shipment happens and a <strong>Bill of Lading</strong> (the shipping document proving goods were loaded) is attached to
        this Deal ID. One invoice leg is created per step of the Entity String — <strong>T1, T2, T3</strong>. Exchange rates are editable before
        confirmation; use <strong>Calculate</strong> to refresh invoice amounts and the P&amp;L below.
      </div>
    </div>
  )
}

/** Sale / Purchase / P&L per invoice leg, foreign and local amounts side by side. */
export function PlPanel({ deal }: { deal: Deal }) {
  const pl = plTable(deal)
  const last = pl.labels.length - 1
  const amountRow = (label: string, cells: Array<{ famt: number; lamt: number }>) => (
    <tr>
      <td>{label}</td>
      {cells.map((c, i) => (
        <Fragment key={i}>
          <td className="num famt">{fmtNum(c.famt)}</td>
          <td className="num lamt">{fmtNum(c.lamt)}</td>
        </Fragment>
      ))}
    </tr>
  )
  return (
    <div className="panel">
      <div className="panel-title">
        <div className="panel-title-left">
          <span className="dot-bullet" />
          <h2>Deal ID: Planned P&amp;L</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table className="grid-mini-table" id="pl-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>
                Type
              </th>
              {pl.labels.map((lb, i) => (
                <th key={i} colSpan={2} className="leg-head">
                  {lb} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(T{i + 1})</span>
                </th>
              ))}
            </tr>
            <tr className="pl-subhead">
              {pl.labels.map((_, i) => (
                <Fragment key={i}>
                  <th className="num">Foreign</th>
                  <th className="num">Local</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody id="pl-tbody">
            {amountRow('Sale', pl.sale)}
            {amountRow('Purchase', pl.purchase)}
            {/* The total markup goes only under the last leg, for readability. */}
            <tr className="pl-row">
              <td>P&amp;L (trade markup)</td>
              {pl.labels.map((_, i) => (
                <Fragment key={i}>
                  <td className="num famt" />
                  <td className="num lamt">{i === last ? fmtNum(pl.totalMarkup) : null}</td>
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="section-note">
        <span className="famt" style={{ fontWeight: 700 }}>
          Red
        </span>{' '}
        = foreign-currency leg amount.{' '}
        <span className="lamt" style={{ fontWeight: 700 }}>
          Green
        </span>{' '}
        = local (invoice) currency amount. The <strong>P&amp;L</strong> row is the trade markup profit realised across the Entity String, on top of
        the FX spread profit already locked in by the D1/D2 pair.
      </div>
    </div>
  )
}
