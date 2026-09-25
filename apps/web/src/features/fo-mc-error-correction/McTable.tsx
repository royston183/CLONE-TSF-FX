import { COLUMN_DEFS } from './data.ts'
import { STATUS_TEXT_CLASS, cellText } from './logic.ts'
import type { ColumnKey, ErrorRow, Sort, SortField } from './types.ts'

/** Status and MC Reference stay frozen while the wide ALV-style table scrolls sideways. */
function freezeClassFor(key: ColumnKey): string {
  if (key === 'status') return ' freeze-status'
  if (key === 'mcRef') return ' freeze-ref'
  return ''
}

function Cell({ row, colKey }: { row: ErrorRow; colKey: ColumnKey }) {
  if (colKey === 'status')
    return <span className={`status-text ${STATUS_TEXT_CLASS[row.status]}`}>{cellText(row, 'status')}</span>
  if (colKey === 'mcRef') return <span className="mc-link mono">{row.mcRef}</span>
  if (colKey === 'foRemarks' && !row.foRemarks) return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>—</span>
  return <>{cellText(row, colKey)}</>
}

export function McTable({
  rows,
  sort,
  selectedRef,
  flashRef,
  onSort,
  onSelect,
  onOpen,
}: {
  rows: ErrorRow[]
  sort: Sort
  selectedRef: number | null
  /** The row just corrected or reversed, which gets the original's green flash. */
  flashRef: number | null
  onSort: (field: SortField) => void
  onSelect: (mcRef: number | null) => void
  onOpen: (mcRef: number) => void
}) {
  return (
    <table className="mc-table" id="mcTable">
      <thead>
        <tr>
          {COLUMN_DEFS.map((c) => {
            if (c.key === 'select') return <th key={c.key} className="no-sort action-col" />
            const field = c.sort ? (c.key as SortField) : null
            const sorted = field !== null && sort.field === field
            const cls = `${c.sort ? '' : 'no-sort'}${freezeClassFor(c.key)}${c.num ? ' num' : ''}${sorted ? ' sorted' : ''}`.trim()
            return (
              <th key={c.key} className={cls || undefined} onClick={field ? () => onSort(field) : undefined}>
                {c.label}
                <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = row.mcRef === selectedRef
          const cls = [
            row.status !== 'correction' ? 'row-resolved' : '',
            isSelected ? 'selected' : '',
            row.mcRef === flashRef ? 'row-flash' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <tr
              key={row.mcRef}
              className={cls || undefined}
              title="Double-click for Error Correction"
              onClick={() => onSelect(row.mcRef)}
              onDoubleClick={() => onOpen(row.mcRef)}
            >
              {COLUMN_DEFS.map((c) => {
                if (c.key === 'select')
                  return (
                    <td key={c.key} className="action-col">
                      <input
                        type="checkbox"
                        className="row-select-checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelect(e.target.checked ? row.mcRef : null)}
                      />
                    </td>
                  )
                const tdCls = `${c.num ? ' num mono' : ''}${freezeClassFor(c.key)}`.trim()
                return (
                  <td key={c.key} className={tdCls || undefined}>
                    <Cell row={row} colKey={c.key} />
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
