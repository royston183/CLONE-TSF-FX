import type { DragEvent, KeyboardEvent } from 'react'
import { COLUMN_CATALOG } from './data.ts'
import { cellClasses, cellValue, isNumericColumn, rowId, sortMark, statusClass } from './logic.ts'
import type { ColumnKey, Deal, Sort } from './types.ts'

type Props = {
  cols: ColumnKey[]
  rows: Deal[]
  selectedId: string | null
  draggingId: string | null
  sort: Sort
  onSort: (key: ColumnKey) => void
  onSelect: (id: string) => void
  onDeselect: () => void
  onOpenTxn: (row: Deal) => void
  onOpenFi: (row: Deal) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, row: Deal) => void
  onDragEnd: () => void
}

/** The dynamic-column deal table: sortable headers, a selection checkbox, hotspots and draggable rows. */
export function DealTable({
  cols,
  rows,
  selectedId,
  draggingId,
  sort,
  onSort,
  onSelect,
  onDeselect,
  onOpenTxn,
  onOpenFi,
  onDragStart,
  onDragEnd,
}: Props) {
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault()
      onSelect(id)
    }
  }

  return (
    <table className="mc-table" id="dealTable">
      <thead id="tableHead">
        <tr>
          <th className="no-sort action-col sticky-a"></th>
          {cols.map((k) => {
            const cls = [isNumericColumn(k) ? 'num' : '', k === 'rfha' ? 'sticky-b' : '', sort.field === k ? 'sorted' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <th key={k} className={cls} data-sort={k} title="Click to sort" onClick={() => onSort(k)}>
                {COLUMN_CATALOG[k].label}
                <span className="sort-ind">{sortMark(sort, k)}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody id="tableBody">
        {rows.map((r) => {
          const id = rowId(r)
          const selected = selectedId === id
          return (
            <tr
              key={id}
              data-id={id}
              tabIndex={0}
              draggable
              title="Click to select · drag onto an action button to run it"
              className={`${selected ? 'selected' : ''}${draggingId === id ? ' dragging' : ''}`.trim()}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => onRowKey(e, id)}
              onDragStart={(e) => onDragStart(e, r)}
              onDragEnd={onDragEnd}
            >
              <td className="action-col sticky-a">
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  aria-label={`Select transaction ${r.rfha}`}
                  checked={selected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => (e.target.checked ? onSelect(id) : onDeselect())}
                />
              </td>
              {cols.map((k) => (
                <td key={k} className={cellClasses(k).join(' ')}>
                  <Cell colKey={k} row={r} onOpenTxn={onOpenTxn} onOpenFi={onOpenFi} />
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Cell({
  colKey,
  row,
  onOpenTxn,
  onOpenFi,
}: {
  colKey: ColumnKey
  row: Deal
  onOpenTxn: (row: Deal) => void
  onOpenFi: (row: Deal) => void
}) {
  const txt = cellValue(colKey, row)
  if (colKey === 'rfha')
    return (
      <button type="button" className="hotspot mono" data-hot="rfha" title="Display transaction" onClick={() => onOpenTxn(row)}>
        {txt}
      </button>
    )
  if (colKey === 'fi_doc')
    return row.fi_doc ? (
      <button type="button" className="hotspot mono" data-hot="fidoc" title="Display FI document" onClick={() => onOpenFi(row)}>
        {txt}
      </button>
    ) : (
      <span className="cell-muted">—</span>
    )
  if (colKey === 'txn_status') return <span className={`status-text ${statusClass(row.txn_status)}`}>{txt}</span>
  if (COLUMN_CATALOG[colKey].type === 'amount') return <span className={Number(row[colKey]) < 0 ? 'neg' : ''}>{txt}</span>
  return <>{txt}</>
}
