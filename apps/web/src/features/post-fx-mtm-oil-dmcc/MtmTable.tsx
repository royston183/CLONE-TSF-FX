import type { DragEvent } from 'react'
import { COLUMNS } from './data.ts'
import { cellText, type EmptyState } from './logic.ts'
import type { ColumnKey, MtmRow, Sort } from './types.ts'

type Props = {
  cols: readonly ColumnKey[]
  rows: MtmRow[]
  sort: Sort
  selectedId: string | null
  draggingId: string | null
  /** Placeholder shown instead of the table (nothing run, no data, nothing matching). */
  empty: EmptyState | null
  onSort: (key: ColumnKey) => void
  onSelect: (id: string | null) => void
  onOpenTransaction: (row: MtmRow) => void
  onOpenDocument: (row: MtmRow, kind: 'MTM' | 'REV') => void
  onDragStart: (row: MtmRow, e: DragEvent<HTMLTableRowElement>) => void
  onDragEnd: () => void
}

const isNumeric = (key: ColumnKey) => {
  const t = COLUMNS[key].type
  return t === 'amt' || t === 'rate' || t === 'num'
}

function cellClass(key: ColumnKey, withMono: boolean): string {
  const c = COLUMNS[key]
  const cls: string[] = []
  if (isNumeric(key)) cls.push(withMono ? 'num mono' : 'num')
  if (withMono && c.type === 'date') cls.push('mono')
  if (c.grp) cls.push(`grp-${c.grp}`)
  if (c.pin) cls.push('pin pin-1')
  return cls.join(' ')
}

/** The MTM list: pinned select and Transaction columns, sortable headers, selectable draggable rows. */
export function MtmTable({
  cols,
  rows,
  sort,
  selectedId,
  draggingId,
  empty,
  onSort,
  onSelect,
  onOpenTransaction,
  onOpenDocument,
  onDragStart,
  onDragEnd,
}: Props) {
  return (
    <>
      <div className="table-scroll" id="tableScroll" style={empty ? { display: 'none' } : undefined}>
        <table className="mc-table" id="mtmTable">
          <thead>
            <tr id="theadRow">
              <th className="no-sort act-col pin pin-0" scope="col" aria-label="Select"></th>
              {cols.map((k) => {
                const sorted = sort.field === k
                const cls = [cellClass(k, false), sorted ? 'sorted' : ''].filter(Boolean).join(' ')
                return (
                  <th
                    key={k}
                    scope="col"
                    data-col={k}
                    className={cls}
                    aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onClick={() => onSort(k)}
                  >
                    {COLUMNS[k].label}
                    <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody id="tableBody">
            {rows.map((r) => {
              const selected = selectedId === r.id
              return (
                <tr
                  key={r.id}
                  data-id={r.id}
                  tabIndex={0}
                  draggable
                  className={`${selected ? 'selected' : ''}${draggingId === r.id ? ' dragging' : ''}`.trim() || undefined}
                  onClick={() => onSelect(selected ? null : r.id)}
                  onKeyDown={(e) => {
                    if ((e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget) {
                      e.preventDefault()
                      onSelect(selected ? null : r.id)
                    }
                  }}
                  onDragStart={(e) => onDragStart(r, e)}
                  onDragEnd={onDragEnd}
                >
                  <td className="act-col pin pin-0">
                    <input
                      type="checkbox"
                      className="row-select-checkbox"
                      aria-label={`Select transaction ${r.rfha}`}
                      checked={selected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onSelect(e.target.checked ? r.id : null)}
                    />
                  </td>
                  {cols.map((k) => (
                    <td key={k} className={cellClass(k, true)}>
                      <CellContent colKey={k} row={r} onOpenTransaction={onOpenTransaction} onOpenDocument={onOpenDocument} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {empty && (
        <div className="empty-state" id="emptyState" style={{ display: 'block' }}>
          <div className="big">{empty.icon}</div>
          <div className="es-title">{empty.title}</div>
          {empty.text}
        </div>
      )}
    </>
  )
}

function CellContent({
  colKey,
  row,
  onOpenTransaction,
  onOpenDocument,
}: {
  colKey: ColumnKey
  row: MtmRow
  onOpenTransaction: Props['onOpenTransaction']
  onOpenDocument: Props['onOpenDocument']
}) {
  const txt = cellText(colKey, row)
  if (colKey === 'rfha') {
    return (
      <a
        href="#"
        className="mc-link mono"
        title="View transaction details"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenTransaction(row)
        }}
      >
        {txt}
      </a>
    )
  }
  if (COLUMNS[colKey].link === 'doc') {
    if (!txt) return <span className="dash">—</span>
    return (
      <a
        href="#"
        className="doc-link mono"
        title="Display accounting document"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenDocument(row, colKey === 'rev_doc' ? 'REV' : 'MTM')
        }}
      >
        {txt}
      </a>
    )
  }
  if (colKey === 'msg') {
    return txt ? (
      <span className="msg-cell" title={txt}>
        {txt}
      </span>
    ) : (
      <span className="dash">—</span>
    )
  }
  return <>{txt}</>
}
