import type { ReactNode } from 'react'
import { cellText, sortArrow, statusTone } from './logic.ts'
import type { Column, ColumnKey, HeadsUpRow, Sort } from './types.ts'

/** The .status-text class of a deal status code (draft when the status is unknown). */
export function statusToneClass(code: string): string {
  return `status-text status-text-${statusTone(code)}`
}

function Cell({
  col,
  row,
  onOpenMc,
  onOpenInvoice,
}: {
  col: Column
  row: HeadsUpRow
  onOpenMc: (mcRef: string) => void
  onOpenInvoice: (dealId: string) => void
}) {
  const cls: string[] = []
  if (col.num) cls.push('num')
  if (col.type === 'date' || col.type === 'amt' || col.type === 'rate') cls.push('mono')
  if (col.color) cls.push(`cell-${col.color}`)
  if (col.sticky) cls.push('sticky-col')
  const text = cellText(col, row)
  let inner: ReactNode
  if (col.type === 'deal') {
    // The hotspots handle their own click so the row is not (de)selected.
    inner = (
      <span
        className="mc-link deal-link mono"
        data-link="deal"
        title="Open invoice for this deal"
        onClick={(e) => {
          e.stopPropagation()
          onOpenInvoice(row.dealId)
        }}
      >
        {text}
      </span>
    )
  } else if (col.type === 'mc') {
    inner = (
      <span
        className="mc-link mono"
        data-link="mc"
        title="Open master contract details"
        onClick={(e) => {
          e.stopPropagation()
          onOpenMc(row.mcRef)
        }}
      >
        {text}
      </span>
    )
  } else if (col.type === 'status') {
    inner = <span className={statusToneClass(row.status)}>{text}</span>
  } else if (col.type === 'flag') {
    const on = !!row[col.key]
    inner = (
      <span className={`chk-ro${on ? ' on' : ''}`} role="img" aria-label={on ? 'Yes' : 'No'}>
        {on ? '✓' : ''}
      </span>
    )
    cls.push('text-center')
  } else {
    inner = text
  }
  return <td className={cls.join(' ')}>{inner}</td>
}

/** The ALV grid: a pinned checkbox column, then the layout's columns with a sticky Deal ID. */
export function DealTable({
  rows,
  cols,
  sort,
  selectedId,
  hidden,
  onSort,
  onSelect,
  onOpenMc,
  onOpenInvoice,
}: {
  rows: readonly HeadsUpRow[]
  cols: readonly Column[]
  sort: Sort
  selectedId: string | null
  /** The table is hidden (not removed) while there is nothing to list. */
  hidden: boolean
  onSort: (key: ColumnKey) => void
  onSelect: (dealId: string) => void
  onOpenMc: (mcRef: string) => void
  onOpenInvoice: (dealId: string) => void
}) {
  return (
    <div className="table-scroll">
      <table className="mc-table" id="dealTable" style={{ display: hidden ? 'none' : 'table' }}>
        <thead id="tableHead">
          <tr>
            <th className="no-sort action-col pin-check" aria-label="Select"></th>
            {cols.map((c) => {
              const cls: string[] = []
              if (c.num) cls.push('num')
              if (c.sticky) cls.push('sticky-col')
              if (sort.field === c.key) cls.push('sorted')
              return (
                <th key={c.key} className={cls.join(' ')} data-sort={c.key} onClick={() => onSort(c.key)}>
                  {c.label}
                  <span className="sort-ind">{sortArrow(sort, c.key)}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody id="tableBody">
          {rows.map((r) => {
            const sel = selectedId === r.dealId
            return (
              <tr key={r.dealId} data-id={r.dealId} className={sel ? 'selected' : undefined} onClick={() => onSelect(r.dealId)}>
                <td className="action-col pin-check">
                  <input
                    type="checkbox"
                    className="row-select-checkbox"
                    aria-label={`Select deal ${r.dealId}`}
                    checked={sel}
                    onChange={() => undefined}
                  />
                </td>
                {cols.map((c) => (
                  <Cell key={c.key} col={c} row={r} onOpenMc={onOpenMc} onOpenInvoice={onOpenInvoice} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
