import type { DragEvent } from 'react'
import { COLUMNS } from './columns.ts'
import { cellText, isNumericType } from './logic.ts'
import type { Column, ColumnField, DocField, Row, Sort } from './types.ts'

const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

const numCls = (c: Column) => (isNumericType(c.type) ? 'num' : undefined)

/** The sticky header and the rows of the current page, plus the "no match" message. */
export function DataTable({
  rows,
  hasRows,
  sort,
  selectedId,
  draggingId,
  onSort,
  onSelect,
  onOpenTransaction,
  onOpenDocument,
  onDragStart,
  onDragEnd,
}: {
  rows: Row[]
  hasRows: boolean
  sort: Sort
  selectedId: string | null
  draggingId: string | null
  onSort: (field: ColumnField) => void
  onSelect: (rfha: string) => void
  onOpenTransaction: (rfha: string) => void
  onOpenDocument: (rfha: string, field: DocField) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, rfha: string) => void
  onDragEnd: () => void
}) {
  return (
    <div className="table-shell" id="tableShell">
      <table id="dataTable" aria-label="Reverse FX MTM transactions" style={{ display: hasRows ? 'table' : 'none' }}>
        <thead id="tableHead">
          <tr>
            {COLUMNS.map((c) => {
              const sortable = c.sort !== false
              return (
                <th
                  key={c.field}
                  className={join(c.sticky, c.cls, numCls(c), !sortable && 'no-sort')}
                  onClick={sortable ? () => onSort(c.field as ColumnField) : undefined}
                >
                  {c.label}
                  {sortable && (
                    <span className="sort-mark">{c.field === sort.field ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody id="tableBody">
          {rows.map((r) => (
            <tr
              key={r.rfha}
              data-id={r.rfha}
              draggable
              className={join(selectedId === r.rfha && 'selected', draggingId === r.rfha && 'dragging') || undefined}
              onClick={() => onSelect(r.rfha)}
              onDragStart={(e) => onDragStart(e, r.rfha)}
              onDragEnd={onDragEnd}
            >
              {COLUMNS.map((c) => {
                const cls = join(c.sticky, c.cls, numCls(c), c.group === 'ext' && 'cell-ext', c.group === 'mtm' && 'cell-mtm')
                if (c.type === 'select') {
                  return (
                    <td key={c.field} className={cls}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selectedId === r.rfha}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onSelect(r.rfha)}
                      />
                    </td>
                  )
                }
                if (c.type === 'link') {
                  return (
                    <td key={c.field} className={cls}>
                      <span
                        className="cell-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenTransaction(r.rfha)
                        }}
                      >
                        {r.rfha}
                      </span>
                    </td>
                  )
                }
                const value = r[c.field as ColumnField]
                if (c.type === 'doc') {
                  const field = c.field as DocField
                  return (
                    <td key={c.field} className={cls}>
                      {r[field] ? (
                        <span
                          className="cell-link posted"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDocument(r.rfha, field)
                          }}
                        >
                          {r[field]}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )
                }
                const text = cellText(value, c.type)
                return (
                  <td key={c.field} className={cls}>
                    {text === null ? <span className="muted">—</span> : text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="empty" id="emptyState" style={{ display: hasRows ? 'none' : 'block' }}>
        No transactions match the current selection.
      </div>
    </div>
  )
}
