import type { DragEvent } from 'react'
import { fmtAmt, formatDateDMY } from './format.ts'
import { ROW_TITLE, sortIndicator, statusTextClass, typeLabel } from './logic.ts'
import type { Leg, Sort, SortField } from './types.ts'

type Column = { label: string; sort?: SortField; cls?: string }

const COLUMNS: readonly Column[] = [
  { label: 'Sel', cls: 'no-sort action-col' },
  { label: 'Transaction', sort: 'rfha' },
  { label: 'Co. Code', sort: 'bukrs' },
  { label: 'Counterparty', sort: 'bpName' },
  { label: 'Txn Type', sort: 'sfhaart' },
  { label: 'Trade Date', sort: 'dblfz' },
  { label: 'Value Date', sort: 'delfz' },
  { label: 'Ccy Pair', sort: 'cpair' },
  { label: 'Buy', cls: 'no-sort' },
  { label: 'Sell', cls: 'no-sort' },
  { label: 'All in Rate', sort: 'otot_rate', cls: 'num' },
  { label: 'Orig Txn', cls: 'no-sort' },
  { label: 'Roll Type', cls: 'no-sort' },
  { label: 'Status', sort: 'txnDesc' },
  { label: 'Flags', cls: 'no-sort' },
]

/** The Deal Transactions grid. Only the selected row is draggable. */
export function DealTable({
  rows,
  hidden,
  sort,
  selectedRfha,
  flashRfha,
  draggingRfha,
  onSort,
  onSelect,
  onView,
  onDragStart,
  onDragEnd,
}: {
  rows: readonly Leg[]
  hidden: boolean
  sort: Sort
  selectedRfha: string | null
  flashRfha: string | null
  draggingRfha: string | null
  onSort: (field: SortField) => void
  onSelect: (rfha: string) => void
  onView: (leg: Leg) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, leg: Leg) => void
  onDragEnd: () => void
}) {
  return (
    <table className="pm-table" style={{ display: hidden ? 'none' : 'table' }}>
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const sortable = c.sort
            const cls = [c.cls, sortable && sort.field === sortable ? 'sorted' : ''].filter(Boolean).join(' ')
            return (
              <th key={c.label} className={cls || undefined} onClick={sortable ? () => onSort(sortable) : undefined}>
                {c.label}
                {sortable ? <span className="sort-ind">{sortIndicator(sort, sortable)}</span> : null}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => {
          const selected = selectedRfha === l.rfha
          const cls = [selected ? 'selected' : '', flashRfha === l.rfha ? 'row-flash' : '', draggingRfha === l.rfha ? 'dragging' : '']
            .filter(Boolean)
            .join(' ')
          return (
            <tr
              key={l.rfha}
              className={cls || undefined}
              title={ROW_TITLE}
              draggable={selected}
              onClick={() => onSelect(l.rfha)}
              onDoubleClick={() => onView(l)}
              onDragStart={(e) => {
                if (!selected) {
                  e.preventDefault()
                  return
                }
                onDragStart(e, l)
              }}
              onDragEnd={onDragEnd}
            >
              <td className="action-col">
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  title="Select transaction"
                  checked={selected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onSelect(l.rfha)}
                />
              </td>
              <td>
                <a
                  className="pm-link mono"
                  title="Click to view transaction"
                  onClick={(e) => {
                    e.stopPropagation()
                    onView(l)
                  }}
                >
                  {l.rfha}
                </a>
              </td>
              <td>{l.bukrs}</td>
              <td>{l.bpName}</td>
              <td>
                <span className="status-pill pill-info">{typeLabel(l)}</span>
              </td>
              <td className="mono">{formatDateDMY(l.dblfz)}</td>
              <td className="mono">{formatDateDMY(l.delfz)}</td>
              <td>{l.cpair}</td>
              <td className="mono">
                {l.bs1} {l.curr1} {fmtAmt(l.amt1)}
              </td>
              <td className="mono">
                {l.bs2} {l.curr2} {fmtAmt(l.amt2)}
              </td>
              <td className="num mono">{l.otot_rate.toFixed(4)}</td>
              <td className="mono">{l.zuonr}</td>
              <td>{l.zroll || '-'}</td>
              <td>
                <span className={`status-text ${statusTextClass(l.txnDesc)}`}>{l.txnDesc}</span>
              </td>
              <td>
                {l.ztsf_pre_mature || l.ztsf_unwind ? (
                  <>
                    {l.ztsf_pre_mature ? <span className="flag-chip pm">PM</span> : null}
                    {l.ztsf_unwind ? <span className="flag-chip unw">UNW</span> : null}
                  </>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
