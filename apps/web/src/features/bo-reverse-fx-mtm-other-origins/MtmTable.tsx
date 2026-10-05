import type { DragEvent } from 'react'
import { COLUMNS } from './data.ts'
import { cellText, isNumericType, sortMark } from './logic.ts'
import type { Column, DocField, Row, RowField, Sort } from './types.ts'

type Props = {
  rows: readonly Row[]
  total: number
  selectedId: string | null
  draggingId: string | null
  sort: Sort
  onSort: (field: RowField) => void
  onSelect: (id: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, id: string) => void
  onDragEnd: () => void
  onOpenTransaction: (row: Row) => void
  onOpenDocument: (row: Row, field: DocField) => void
}

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

function Dash() {
  return <span className="muted">&mdash;</span>
}

function Cell({ col, row, selected, onSelect, onOpenTransaction, onOpenDocument }: {
  col: Column
  row: Row
  selected: boolean
  onSelect: () => void
  onOpenTransaction: () => void
  onOpenDocument: (field: DocField) => void
}) {
  const cls = cx(
    col.sticky,
    col.cls,
    isNumericType(col.type) && 'num',
    col.group === 'ext' && 'cell-ext',
    col.group === 'mtm' && 'cell-mtm',
  )
  if (col.field === 'select') {
    return (
      <td className={cls}>
        <input
          type="checkbox"
          className="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onSelect}
        />
      </td>
    )
  }
  const value = row[col.field]
  if (col.type === 'link') {
    return (
      <td className={cls}>
        <span
          className="cell-link"
          onClick={(e) => {
            e.stopPropagation()
            onOpenTransaction()
          }}
        >
          {String(value)}
        </span>
      </td>
    )
  }
  if (col.type === 'doc') {
    return (
      <td className={cls}>
        {value ? (
          <span
            className="cell-link posted"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDocument(col.field as DocField)
            }}
          >
            {String(value)}
          </span>
        ) : (
          <Dash />
        )}
      </td>
    )
  }
  const text = cellText(value, col.type)
  return <td className={cls}>{text === null ? <Dash /> : text}</td>
}

/** The grid: sortable headers, three sticky columns, selectable and draggable rows. */
export function MtmTable({
  rows,
  total,
  selectedId,
  draggingId,
  sort,
  onSort,
  onSelect,
  onDragStart,
  onDragEnd,
  onOpenTransaction,
  onOpenDocument,
}: Props) {
  return (
    <div className="table-shell">
      <table aria-label="Reverse FX MTM Other Origins transactions" style={total ? undefined : { display: 'none' }}>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const sortable = c.sort !== false
              return (
                <th
                  key={c.field}
                  className={cx(c.sticky, c.cls, isNumericType(c.type) && 'num', !sortable && 'no-sort')}
                  onClick={sortable && c.field !== 'select' ? () => onSort(c.field as RowField) : undefined}
                >
                  {c.label}
                  {sortable && <span className="sort-mark">{sortMark(sort, c.field)}</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.rfha}
              className={cx(selectedId === r.rfha && 'selected', draggingId === r.rfha && 'dragging')}
              draggable
              onClick={() => onSelect(r.rfha)}
              onDragStart={(e) => onDragStart(e, r.rfha)}
              onDragEnd={onDragEnd}
            >
              {COLUMNS.map((c) => (
                <Cell
                  key={c.field}
                  col={c}
                  row={r}
                  selected={selectedId === r.rfha}
                  onSelect={() => onSelect(r.rfha)}
                  onOpenTransaction={() => onOpenTransaction(r)}
                  onOpenDocument={(field) => onOpenDocument(r, field)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!total && <div className="empty">No transactions match the current selection.</div>}
    </div>
  )
}
