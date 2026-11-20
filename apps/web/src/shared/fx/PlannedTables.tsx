import type { PlannedData, PlannedInvoiceRow, PlannedPnlGrid } from './planned.ts'
import './PlannedTables.css'

/**
 * "Deal ID: Planned Trade Invoices" and "Deal ID: Planned P&L", laid out like the SAP screens. Presentational: give it the
 * PlannedData of a deal (loaded by mo-confirm-fx-deal-id/PlannedForDeal.tsx) or its loading / error state. The stylesheet takes
 * the host screen's own tokens (--border, --text, --primary ...) and falls back to the Master Contract palette, so the tables
 * sit in any screen.
 */

const amount = (v: number | null, decimals = 2) =>
  v === null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
const neg = (v: number | null) => (v !== null && v < 0 ? ' neg' : '')

export type PlannedParts = 'both' | 'invoices' | 'pnl'

export function PlannedTables({
  data,
  loading = false,
  error = '',
  onRetry,
  parts = 'both',
}: {
  data?: PlannedData | null | undefined
  loading?: boolean
  error?: string
  onRetry?: (() => void) | undefined
  parts?: PlannedParts
}) {
  const state = loading && !data ? 'Calculating the planned trade invoices and P&L…' : null
  return (
    <div className="pt-wrap">
      {parts !== 'pnl' ? (
        <Section title="Deal ID: Planned Trade Invoices">
          {state ? <Note>{state}</Note> : error ? <Failed message={error} onRetry={onRetry} /> : data ? <InvoiceTable data={data} /> : null}
        </Section>
      ) : null}
      {parts !== 'invoices' ? (
        <Section title="Deal ID: Planned P&L">
          {state ? <Note>{state}</Note> : error ? <Failed message={error} onRetry={onRetry} /> : data ? <PnlTable data={data} /> : null}
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-card" aria-label={title}>
      <h3 className="pt-title">{title}</h3>
      {children}
    </section>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="pt-note">{children}</p>

function Failed({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <p className="pt-note err" role="alert">
      Could not load the planned figures: {message}
      {onRetry ? <button type="button" className="pt-retry" onClick={onRetry}>Retry</button> : null}
    </p>
  )
}

const SOURCE_LABEL = { stored: 'Saved on the Deal ID', planned: 'Planned, not yet confirmed', none: '' } as const

function InvoiceTable({ data }: { data: PlannedData }) {
  const rows: PlannedInvoiceRow[] = data.invoices
  return (
    <>
      {data.source !== 'none' ? <p className="pt-src"><b>{SOURCE_LABEL[data.source]}.</b> {data.note}</p> : null}
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Trade Type</th><th>Inv TRM Ref No</th><th>Sell</th><th>Buy</th><th>MC Ref P</th><th>MC Ref Sale</th>
              <th>Deal Type</th><th>Inv Curr</th><th className="num">Inv Amt</th><th className="num">Inv Amount</th><th className="num">Exchange R</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={`${r.tradeType}-${r.invTrmRefNo}`}>
                <td className="key">{r.tradeType}</td><td>{r.invTrmRefNo}</td><td>{r.sell}</td><td>{r.buy}</td><td>{r.mcRefP}</td><td>{r.mcRefSale}</td>
                <td>{r.dealType}</td><td>{r.invCurr}</td>
                <td className="num">{amount(r.invAmt)}</td><td className="num">{amount(r.invAmount)}</td><td className="num">{amount(r.exchangeRate, 7)}</td>
              </tr>
            )) : (
              <tr><td className="empty" colSpan={11}>{data.note || 'There are no planned trade invoices for this Deal ID.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PnlTable({ data }: { data: PlannedData }) {
  const grid: PlannedPnlGrid | null = data.pnl
  return (
    <>
      {data.source !== 'none' && grid ? (
        <p className="pt-src"><b>{SOURCE_LABEL[data.source]}.</b> {data.rate ? `Calculated with the TCURR type M rate ${data.rate.value} (${data.rate.date}).` : ''}</p>
      ) : null}
      {grid ? (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr><th>Type</th>{grid.columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r.label} className={r.label === 'P&L' ? 'sum' : undefined}>
                  <td className="key">{r.label}</td>
                  {r.cells.map((v, i) => <td key={i} className={`num${neg(v)}`}>{amount(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data.stored ? (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead><tr><th>Type</th><th className="num">Stored on the Deal ID</th></tr></thead>
            <tbody>
              <tr><td className="key">{`P&L (${data.stored.currency || 'USD'})`}</td><td className="num">{amount(data.stored.amount)}</td></tr>
              <tr><td className="key">{`P&L Local (${data.stored.localCurrency || '—'})`}</td><td className="num">{amount(data.stored.localAmount)}</td></tr>
              <tr><td className="key">P&amp;L Rate</td><td className="num">{amount(data.stored.rate, 7)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {!grid && !data.stored ? <Note>{data.note || 'There is no P&L for this Deal ID.'}</Note> : null}
      {grid && data.stored ? (
        <p className="pt-src">Stored on the Deal ID: P&amp;L {amount(data.stored.amount)} {data.stored.currency || 'USD'}
          {data.stored.localCurrency ? ` / ${amount(data.stored.localAmount)} ${data.stored.localCurrency}` : ''}, rate {amount(data.stored.rate, 7)}.</p>
      ) : null}
    </>
  )
}
