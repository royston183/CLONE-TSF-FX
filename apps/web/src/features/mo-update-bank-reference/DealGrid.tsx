import { useState, type DragEvent, type MouseEvent } from 'react'
import { fmtNum } from './format.ts'
import type { Column, ColumnKey, Deal, EditKey, SortState } from './types.ts'

/**
 * The inline External Reference / Int Ref box. Like the original, the typed text is written
 * back to the row on change (blur or Enter), not per keystroke, so an active search does not
 * drop the row out from under the cursor mid-edit.
 */
function EditCell({ row, field, onCommit }: { row: Deal; field: EditKey; onCommit: (id: string, field: EditKey, value: string) => void }) {
  const [draft, setDraft] = useState(row[field])
  const commit = () => {
    if (draft !== row[field]) onCommit(row._id, field, draft)
  }
  return (
    <input
      type="text"
      className="edit-input"
      value={draft}
      placeholder={field === 'NORDEXT' ? 'Enter reference' : 'Enter internal ref'}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

function isNumCol(c: Column): boolean {
  return c.type === 'number' || c.type === 'rate'
}

function Cell({
  col,
  row,
  onView,
  onEdit,
}: {
  col: Column
  row: Deal
  onView: (id: string) => void
  onEdit: (id: string, field: EditKey, value: string) => void
}) {
  const v = row[col.key]
  switch (col.type) {
    case 'hotspot':
      return (
        <span
          className="mc-link"
          title="Click to view transaction details"
          onClick={(e) => {
            e.stopPropagation()
            onView(row._id)
          }}
        >
          {String(v ?? '')}
        </span>
      )
    case 'number':
      return <>{typeof v === 'number' ? fmtNum(v, 2) : ''}</>
    case 'rate':
      return <>{typeof v === 'number' ? fmtNum(v, 4) : ''}</>
    case 'status':
    case 'status2':
      return <span className={`status-txt status-${String(v)}`}>{String(v ?? '')}</span>
    case 'edit':
      return <EditCell row={row} field={col.key as EditKey} onCommit={onEdit} />
    case 'date':
    case 'text':
      return <>{v === undefined || v === null ? '' : String(v)}</>
  }
}

export function DealGrid({
  cols,
  rows,
  rowKeyPrefix,
  sort,
  activeRowId,
  draggingId,
  allPageChecked,
  onSort,
  onToggleAll,
  onToggleRow,
  onRowClick,
  onView,
  onEdit,
  onDragStart,
  onDragEnd,
}: {
  cols: readonly Column[]
  rows: readonly Deal[]
  /** Changes on every Execute so edit boxes start from the freshly generated values. */
  rowKeyPrefix: string
  sort: SortState
  activeRowId: string | null
  draggingId: string | null
  allPageChecked: boolean
  onSort: (key: ColumnKey) => void
  onToggleAll: (checked: boolean) => void
  onToggleRow: (id: string, checked: boolean) => void
  onRowClick: (id: string) => void
  onView: (id: string) => void
  onEdit: (id: string, field: EditKey, value: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, row: Deal) => void
  onDragEnd: () => void
}) {
  const insideControl = (e: MouseEvent) => e.target instanceof Element && e.target.closest('input') !== null

  return (
    <table className="grid">
      <thead>
        <tr>
          <th className="chkcol">
            <input
              type="checkbox"
              className="row-select-checkbox"
              checked={allPageChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
          </th>
          {cols.map((c) => {
            const cls = [c.pin ? 'pin2' : '', isNumCol(c) ? 'num' : '', sort.field === c.key ? 'sorted' : ''].filter(Boolean).join(' ')
            const ind = sort.field === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''
            return (
              <th key={c.key} className={cls} onClick={() => onSort(c.key)}>
                {c.label}
                <span className="sort-ind">{ind}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const active = activeRowId === r._id
          const cls = [idx % 2 === 1 ? 'zebra' : '', active ? 'active-row' : '', draggingId === r._id ? 'dragging' : '']
            .filter(Boolean)
            .join(' ')
          const draggable = r._checked || active
          return (
            <tr
              key={`${rowKeyPrefix}-${r._id}`}
              className={cls}
              draggable={draggable ? true : undefined}
              onClick={(e) => {
                if (insideControl(e) || (e.target instanceof Element && e.target.closest('.mc-link'))) return
                onRowClick(r._id)
              }}
              onDoubleClick={(e) => {
                if (insideControl(e)) return
                onView(r._id)
              }}
              onDragStart={(e) => {
                if (!draggable) {
                  e.preventDefault()
                  return
                }
                onDragStart(e, r)
              }}
              onDragEnd={onDragEnd}
            >
              <td className="chkcol">
                <input
                  type="checkbox"
                  className="row-select-checkbox row-chk"
                  checked={r._checked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onToggleRow(r._id, e.target.checked)}
                />
              </td>
              {cols.map((c) => (
                <td key={c.key} className={[c.pin ? 'pin2' : '', isNumCol(c) ? 'num' : ''].filter(Boolean).join(' ') || undefined}>
                  <Cell col={c} row={r} onView={onView} onEdit={onEdit} />
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
