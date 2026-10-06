import { COLUMNS } from './data.ts'
import { fmtAmount, fmtDate, fmtRate } from './format.ts'
import { statusClass } from './logic.ts'
import type { Column, Deal, Sort, SortKey } from './types.ts'

const isNumeric = (col: Column) => col.type === 'amount' || col.type === 'rate'

function headClass(col: Column, sort: Sort): string | undefined {
  if (col.key === 'select') return 'col-select no-sort'
  const cls = [isNumeric(col) ? 'num' : '', col.sortable ? '' : 'no-sort', sort.key === col.key ? 'sorted' : '']
    .filter(Boolean)
    .join(' ')
  return cls || undefined
}

function cellText(deal: Deal, col: Exclude<Column, { key: 'select' }>): string {
  const v = deal[col.key]
  if (v instanceof Date) return fmtDate(v)
  if (typeof v === 'number') return col.type === 'rate' ? fmtRate(v) : fmtAmount(v)
  return v || ''
}

/**
 * The wide deal table. A mousedown on a row's checkbox cell starts a drag-range selection
 * (entering other checkbox cells extends it; a plain click toggles that row); a click
 * anywhere else on the row makes it the single selected row.
 */
export function DealsTable({
  rows,
  sort,
  selected,
  dragging,
  onSort,
  onRowClick,
  onCheckboxDown,
  onCheckboxEnter,
  emptyTitle = 'No deals found',
  emptyText = 'No FX or Option deals match the selected criteria.',
}: {
  /** The current page only. */
  rows: readonly Deal[]
  sort: Sort
  selected: ReadonlySet<string>
  dragging: boolean
  onSort: (key: SortKey) => void
  onRowClick: (deal: Deal) => void
  onCheckboxDown: (rowIndex: number, deal: Deal) => void
  onCheckboxEnter: (rowIndex: number) => void
  /** The empty row's heading and line: why there are no rows (e.g. WAITING FOR API). */
  emptyTitle?: string
  emptyText?: string
}) {
  return (
    <table className={`deals-table${dragging ? ' dragging' : ''}`} id="dealsTable">
      <thead>
        <tr id="tableHeadRow">
          {COLUMNS.map((col) => {
            if (col.key === 'select') return <th key={col.key} className={headClass(col, sort)} />
            const sortKey = col.sortable ? col.key : null
            return (
              <th key={col.key} className={headClass(col, sort)} onClick={sortKey ? () => onSort(sortKey) : undefined}>
                <div className="th-inner">
                  <span>{col.label}</span>
                  {sortKey ? (
                    <span className="sort-arrow">{sort.key === sortKey ? (sort.dir === 'asc' ? '▲' : '▼') : '⇵'}</span>
                  ) : null}
                </div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody id="tableBody">
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={COLUMNS.length}>
              <div className="state-icon" style={{ margin: '0 auto 10px auto' }}>
                &#128203;
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{emptyTitle}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{emptyText}</div>
            </td>
          </tr>
        ) : (
          rows.map((deal, rowIndex) => {
            const isSelected = selected.has(deal.id)
            return (
              <tr
                key={deal.transaction}
                data-id={deal.id}
                className={isSelected ? 'selected' : undefined}
                onClick={(e) => {
                  if (e.target instanceof Element && e.target.closest('.col-select')) return
                  onRowClick(deal)
                }}
              >
                {COLUMNS.map((col) => {
                  if (col.key === 'select') {
                    return (
                      <td
                        key={col.key}
                        className="col-select"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onCheckboxDown(rowIndex, deal)
                        }}
                        onMouseEnter={() => onCheckboxEnter(rowIndex)}
                      >
                        <span className={`checkbox${isSelected ? ' checked' : ''}`} />
                      </td>
                    )
                  }
                  if (col.key === 'status') {
                    return (
                      <td key={col.key}>
                        <span className={`status-text ${statusClass(deal.status)}`}>{deal.status}</span>
                      </td>
                    )
                  }
                  return (
                    <td key={col.key} className={isNumeric(col) ? 'num' : undefined}>
                      {cellText(deal, col)}
                    </td>
                  )
                })}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
