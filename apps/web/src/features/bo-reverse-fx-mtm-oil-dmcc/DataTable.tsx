import type { DragEvent } from 'react'
import { COLUMNS } from './data.ts'
import { cellText, isNumericType, sortMark } from './logic.ts'
import type { DocField, Row, Sort, SortField } from './types.ts'

type Props = {
  rows: Row[]
  sort: Sort
  selectedId: string | null
  draggingId: string | null
  onSort: (field: SortField) => void
  onSelect: (id: string) => void
  onOpenTransaction: (row: Row) => void
  onOpenDocument: (row: Row, field: DocField) => void
  onDragStart: (id: string, e: DragEvent<HTMLTableRowElement>) => void
  onDragEnd: () => void
}

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

export function DataTable({
  rows,
  sort,
  selectedId,
  draggingId,
  onSort,
  onSelect,
  onOpenTransaction,
  onOpenDocument,
  onDragStart,
  onDragEnd,
}: Props) {
  return (
    <table aria-label="Reverse FX MTM transactions" style={{ display: rows.length ? 'table' : 'none' }}>
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const sortable = c.sort !== false
            return (
              <th
                key={c.field}
                className={cls(c.sticky, c.cls, isNumericType(c.type) && 'num', !sortable && 'no-sort')}
                onClick={sortable ? () => onSort(c.field as SortField) : undefined}
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
            className={cls(selectedId === r.rfha && 'selected', draggingId === r.rfha && 'dragging') || undefined}
            draggable
            onClick={(e) => {
              const t = e.target as HTMLElement
              if (t.tagName === 'A' || t.classList.contains('cell-link') || t.tagName === 'INPUT') return
              onSelect(r.rfha)
            }}
            onDragStart={(e) => onDragStart(r.rfha, e)}
            onDragEnd={onDragEnd}
          >
            {COLUMNS.map((c) => {
              const tdCls = cls(
                c.sticky,
                c.cls,
                isNumericType(c.type) && 'num',
                c.group === 'ext' && 'cell-ext',
                c.group === 'mtm' && 'cell-mtm',
              )
              if (c.type === 'select') {
                return (
                  <td key={c.field} className={tdCls}>
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
                  <td key={c.field} className={tdCls}>
                    <span
                      className="cell-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenTransaction(r)
                      }}
                    >
                      {r.rfha}
                    </span>
                  </td>
                )
              }
              const value = r[c.field as keyof Row]
              if (c.type === 'doc') {
                const field = c.field as DocField
                return (
                  <td key={c.field} className={tdCls}>
                    {r[field] ? (
                      <span
                        className="cell-link posted"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDocument(r, field)
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
                <td key={c.field} className={tdCls}>
                  {text === null ? <span className="muted">—</span> : text}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
