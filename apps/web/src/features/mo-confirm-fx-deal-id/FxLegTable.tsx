import { StatusBadge } from './DetailTables.tsx'
import { fmtAmt, fmtRate } from './format.ts'
import { legRowClass } from './logic.ts'
import type { Leg, Sort, SortKey } from './types.ts'

/** The FX Deals header row. Buy / Sell / MC Ref No are clickable but carry no sort arrow. */
const COLUMNS: readonly { key: SortKey; label: string; num?: true; arrow: boolean }[] = [
  { key: 'rfha', label: 'Txn Ref', arrow: true },
  { key: 'dealType', label: 'Type', arrow: true },
  { key: 'bpName', label: 'Counterparty', arrow: true },
  { key: 'dealDate', label: 'Deal Date', arrow: true },
  { key: 'valueDate', label: 'Value Date', arrow: true },
  { key: 'bs1', label: 'Buy', arrow: false },
  { key: 'amt1', label: 'Amount', num: true, arrow: true },
  { key: 'bs2', label: 'Sell', arrow: false },
  { key: 'amt2', label: 'Amount', num: true, arrow: true },
  { key: 'rateVal', label: 'Rate', num: true, arrow: true },
  { key: 'mcRef', label: 'MC Ref No', arrow: false },
  { key: 'txnStatusDesc', label: 'Status', arrow: true },
  { key: 'fxPl', label: 'FX P&L', num: true, arrow: true },
]

export function FxLegTable({
  legs,
  mcRef,
  sort,
  selected,
  onSort,
  onSelect,
}: {
  legs: readonly Leg[]
  mcRef: string
  sort: Sort
  selected: string | null
  onSort: (key: SortKey) => void
  onSelect: (rfha: string) => void
}) {
  return (
    <div className="table-scroll">
      <table id="fxTable">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={[c.num ? 'num' : '', sort.key === c.key ? 'sorted' : ''].filter(Boolean).join(' ') || undefined}
                onClick={() => onSort(c.key)}
              >
                {c.label}
                {c.arrow && <span className="sort-ind">&#9662;</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {legs.length ? (
            legs.map((l) => {
              const isSelected = selected === l.rfha
              const cls = legRowClass(l, isSelected)
              return (
                <tr
                  key={l.rfha}
                  className={cls || undefined}
                  onClick={() => onSelect(l.rfha)}
                >
                  <td>
                    <input type="checkbox" className="chk" checked={isSelected} readOnly />
                  </td>
                  <td className="mono">{l.rfha}</td>
                  <td>{l.dealType}</td>
                  <td>
                    {l.bpName}
                    <div style={{ fontSize: '10.5px', color: 'var(--text-faint)' }}>{l.desc}</div>
                  </td>
                  <td>{l.dealDate}</td>
                  <td>{l.valueDate}</td>
                  <td>
                    <span className="bs-pill bs-buy">{l.curr1}</span>
                  </td>
                  <td className="num mono">{fmtAmt(l.amt1)}</td>
                  <td>
                    <span className="bs-pill bs-sell">{l.curr2}</span>
                  </td>
                  <td className="num mono">{fmtAmt(l.amt2)}</td>
                  <td className="num mono">
                    {fmtRate(l.rateVal)}
                    <div style={{ fontSize: '9.5px', color: 'var(--text-faint)', textAlign: 'right' }}>{l.rateLabel}</div>
                  </td>
                  <td>{mcRef}</td>
                  <td>
                    <StatusBadge code={l.txnStatus} />
                  </td>
                  <td
                    className="num mono"
                    style={{ color: l.fxPl !== null && l.fxPl < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}
                  >
                    {fmtAmt(l.fxPl)}
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={14} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 24 }}>
                No matching deal legs.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
