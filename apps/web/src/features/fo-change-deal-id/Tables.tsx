import type { DragEvent } from 'react'
import { fmtAmt, fmtRate } from './format.ts'
import { legStatus, parseExRate, statusMeta } from './logic.ts'
import type { InvoiceLine, PlTable as PlTableData, TopRow } from './types.ts'

export function StatusPill({ code }: { code: string }) {
  const s = statusMeta(code)
  return <span className={`pill ${s.css}`}>{s.label || '–'}</span>
}

/** FX Deals. A row is draggable only while it is the single selected row. */
export function DealTable({
  rows,
  selectedIndex,
  draggingIndex,
  onSelect,
  onOpenTxn,
  onDragStart,
  onDragEnd,
}: {
  rows: readonly TopRow[]
  selectedIndex: number | null
  draggingIndex: number | null
  onSelect: (idx: number) => void
  onOpenTxn: (idx: number) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, idx: number) => void
  onDragEnd: () => void
}) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th className="center">Sel</th>
          <th>Co. Code</th>
          <th>Deal Type</th>
          <th>BP Name</th>
          <th>BP No.</th>
          <th>Transaction No</th>
          <th>Structure</th>
          <th>Deal Start</th>
          <th>Deal Valid</th>
          <th>Text</th>
          <th>Entity</th>
          <th>B/S 1</th>
          <th>Curr 1</th>
          <th className="num">Amount 1</th>
          <th>B/S 2</th>
          <th>Curr 2</th>
          <th className="num">Amount 2</th>
          <th className="num">Spot</th>
          <th className="num">Swap</th>
          <th className="num">All-in Rate</th>
          <th className="num">Strike</th>
          <th>NDF Fixing Date</th>
          <th>NDF Ref</th>
          <th className="num">NDF Rate</th>
          <th className="num">Cash Amount</th>
          <th>Cash Currency</th>
          <th>MC Ref No</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="empty-row" colSpan={28}>
              No FX deal legs found for this Deal ID.
            </td>
          </tr>
        ) : (
          rows.map((r, idx) => {
            const sel = selectedIndex === idx
            const cls = [sel ? 'row-selected' : '', draggingIndex === idx ? 'dragging' : ''].filter(Boolean).join(' ')
            return (
              <tr
                // Index keys, as the page addressed legs by position (data-idx).
                key={idx}
                className={cls || undefined}
                draggable={sel}
                onClick={() => onSelect(idx)}
                onDragStart={(e) => {
                  if (selectedIndex !== idx) {
                    e.preventDefault()
                    return
                  }
                  onDragStart(e, idx)
                }}
                onDragEnd={onDragEnd}
              >
                <td className="center">
                  <input
                    type="checkbox"
                    className="chk"
                    checked={sel}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onSelect(idx)}
                  />
                </td>
                <td>{r.bukrs}</td>
                <td>
                  <span className="badge-type">{r.dealType}</span>
                </td>
                <td>{r.bpName}</td>
                <td>{r.kontrh}</td>
                <td
                  className="hotspot"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenTxn(idx)
                  }}
                >
                  {r.rfha}
                </td>
                <td>{r.sfhaart}</td>
                <td>{r.dblfz}</td>
                <td>{r.delfz}</td>
                <td>{r.xtext}</td>
                <td>{r.entity}</td>
                <td>{r.bs1}</td>
                <td>{r.curr1}</td>
                <td className="num">{fmtAmt(r.amt1)}</td>
                <td>{r.bs2}</td>
                <td>{r.curr2}</td>
                <td className="num">{fmtAmt(r.amt2)}</td>
                <td className="num">{fmtRate(r.ospot)}</td>
                <td className="num">{fmtRate(r.oswap)}</td>
                <td className="num">{fmtRate(r.otot_rate)}</td>
                <td className="num">{fmtRate(r.strike)}</td>
                <td>{r.ndfDate}</td>
                <td>{r.ndfRef}</td>
                <td className="num">{fmtRate(r.ndfRate ?? '')}</td>
                <td className="num">{fmtAmt(r.cashAmt)}</td>
                <td>{r.cashCurr}</td>
                <td>{r.mcRefNo}</td>
                <td>
                  <StatusPill code={legStatus(r)} />
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

/**
 * Deal ID: Planned Trade Invoices. The exchange-rate cells are uncontrolled like the page's
 * inputs: they keep what was typed until the table is next rendered from data (load,
 * refresh, Calculate), which `generation` marks.
 */
export function InvoiceTable({
  lines,
  generation,
  onExRateChange,
}: {
  lines: readonly InvoiceLine[]
  generation: number
  onExRateChange: (idx: number, value: string) => void
}) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Type</th>
          <th>From (Sell)</th>
          <th>To (Buy)</th>
          <th>Currency</th>
          <th>Invoice Term No</th>
          <th className="num">Invoice Amount (USD)</th>
          <th className="num">Exchange Rate</th>
          <th className="num">Invoice Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td className="empty-row" colSpan={8}>
              No invoice plan lines for this Deal ID.
            </td>
          </tr>
        ) : (
          lines.map((r, idx) => (
            <tr key={`${generation}-${idx}`}>
              <td>
                <span className="badge-type">{r.zttype}</span>
              </td>
              <td>{r.sell}</td>
              <td>{r.buy}</td>
              <td>{r.curr}</td>
              <td>{r.trmNo}</td>
              <td className="num">{fmtAmt(r.amt)}</td>
              <td className="num">
                <input
                  className="cell-input"
                  type="number"
                  step="0.0001"
                  defaultValue={r.exRate.toFixed(4)}
                  onChange={(e) => onExRateChange(idx, e.target.value)}
                  onBlur={(e) => {
                    // Rates carry four decimals: show a longer entry the way it is kept (see parseExRate).
                    if (/\.\d{5,}/.test(e.target.value)) e.target.value = parseExRate(e.target.value).toFixed(4)
                  }}
                />
              </td>
              <td className="num">{fmtAmt(r.invAmt)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

const RED = { color: 'var(--red)' }
const GREEN = { color: 'var(--green)' }

/** Deal ID: Planned P&L. */
export function PlTable({ data }: { data: PlTableData }) {
  if (data.empty) {
    return (
      <table className="grid">
        <thead>
          <tr>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="empty-row">No P&amp;L data available.</td>
          </tr>
        </tbody>
        <tfoot>
          <tr />
        </tfoot>
      </table>
    )
  }
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Type</th>
          {data.headers.map((h, i) => (
            <th key={i} className="num">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            {row.cells.map((c, i) => (
              <td key={i} className="num" style={c.negative ? RED : undefined}>
                {c.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          {data.totals.map((c, i) => (
            <td key={i} className="num" style={c.negative ? RED : GREEN}>
              {c.text}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  )
}
