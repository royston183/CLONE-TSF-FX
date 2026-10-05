import type { DragEvent, KeyboardEvent } from 'react'
import { cellText, colClasses, isNumericColumn, statusClass } from './logic.ts'
import type { Column, Deal, Sort } from './types.ts'

function Cell({
  row,
  col,
  onOpenDeal,
  onOpenDoc,
}: {
  row: Deal
  col: Column
  onOpenDeal: (rfha: string) => void
  onOpenDoc: (docNo: string) => void
}) {
  const t = cellText(row, col)
  if (col.type === 'link') {
    if (!t) return null
    return (
      <button
        type="button"
        className="mc-link mono"
        title={col.action === 'deal' ? 'Display transaction' : 'Display document'}
        onClick={(e) => {
          e.stopPropagation()
          if (col.action === 'deal') onOpenDeal(row.rfha)
          else onOpenDoc(t)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {t}
      </button>
    )
  }
  if (col.type === 'status') return <span className={`status-text ${statusClass(t)}`}>{t}</span>
  if (col.type === 'gl') {
    const v = row[col.key]
    const cls = typeof v === 'number' && v < 0 ? 'gl-neg' : typeof v === 'number' && v > 0 ? 'gl-pos' : ''
    return <span className={cls}>{t}</span>
  }
  if (col.key === 'msg' && t) return <span className="msg-ok">{t}</span>
  return <>{t}</>
}

/**
 * The deal list. A row is selected by clicking it or its checkbox; only the selected row can be
 * dragged (onto the Post button), and double-clicking a row displays the transaction.
 */
export function DealTable({
  cols,
  rows,
  sort,
  selectedId,
  draggingId,
  hidden,
  onSort,
  onSelect,
  onOpenDeal,
  onOpenDoc,
  onDragStart,
  onDragEnd,
}: {
  cols: readonly Column[]
  rows: readonly Deal[]
  sort: Sort
  selectedId: string | null
  draggingId: string | null
  hidden: boolean
  onSort: (field: Column['key']) => void
  onSelect: (rfha: string | null) => void
  onOpenDeal: (rfha: string) => void
  onOpenDoc: (docNo: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, row: Deal) => void
  onDragEnd: () => void
}) {
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: Deal, selected: boolean) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!selected) onSelect(row.rfha)
    }
  }

  return (
    <table className="mc-table" style={hidden ? { display: 'none' } : undefined}>
      <thead>
        <tr>
          <th className="no-sort col-sel pin-1" title="Select a row">
            &nbsp;
          </th>
          {cols.map((c, i) => {
            const cls = [isNumericColumn(c) ? 'num' : '', c.group ? `t-${c.group}` : '', i === 0 ? 'pin-2' : '', c.key === sort.field ? 'sorted' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <th key={c.key} className={cls} onClick={() => onSort(c.key)}>
                {c.label}
                <span className="sort-ind">{c.key === sort.field ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const sel = selectedId === r.rfha
          return (
            <tr
              key={r.rfha}
              className={[sel ? 'selected' : '', draggingId === r.rfha ? 'dragging' : ''].filter(Boolean).join(' ') || undefined}
              tabIndex={0}
              title={'Click to select · double-click to display the transaction'}
              draggable={sel}
              onClick={() => {
                if (!sel) onSelect(r.rfha)
              }}
              onDoubleClick={() => onOpenDeal(r.rfha)}
              onKeyDown={(e) => onRowKey(e, r, sel)}
              onDragStart={(e) => {
                if (!sel) {
                  e.preventDefault()
                  return
                }
                onDragStart(e, r)
              }}
              onDragEnd={onDragEnd}
            >
              <td className="col-sel pin-1">
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  aria-label={`Select deal ${r.rfha}`}
                  checked={sel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onSelect(e.target.checked ? r.rfha : null)}
                />
              </td>
              {cols.map((c, i) => {
                const cls = [colClasses(c), i === 0 ? 'pin-2' : ''].filter(Boolean).join(' ')
                return (
                  <td key={c.key} className={cls || undefined}>
                    <Cell row={r} col={c} onOpenDeal={onOpenDeal} onOpenDoc={onOpenDoc} />
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
