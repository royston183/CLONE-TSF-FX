import { StatusText } from './DetailModals.tsx'
import { formatCell, isNumericColumn, pageInfo, pageWindow, PAGE_SIZES } from './logic.ts'
import type { Column, ColumnKey, Deal, Sort } from './types.ts'

function SortIndicator({ active, desc }: { active: boolean; desc: boolean }) {
  return (
    <svg className={`sort-ind${active ? ' active' : ''}`} viewBox="0 0 24 24" fill="none">
      <path
        d={active && desc ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Cell({
  deal,
  col,
  onDeal,
  onMc,
}: {
  deal: Deal
  col: Column
  onDeal: (id: string) => void
  onMc: (ref: string) => void
}) {
  const text = formatCell(deal, col)
  switch (col.type) {
    case 'hotspot-green':
      return (
        <button className="hotspot green" onClick={() => onDeal(deal.zdeal_id)}>
          {text}
        </button>
      )
    case 'hotspot-blue':
      return (
        <button className="hotspot" onClick={() => onMc(deal.zmc_ref)}>
          {text}
        </button>
      )
    case 'currency-blue':
      return <span className="num-blue">{text}</span>
    case 'currency-green':
      return <span className="num-green">{text}</span>
    case 'pl': {
      const v = deal[col.key]
      const n = typeof v === 'number' ? v : 0
      return <span className={n < 0 ? 'pl-neg' : n > 0 ? 'pl-pos' : ''}>{text}</span>
    }
    case 'status':
      return <StatusText deal={deal} />
    case 'flag':
      return deal[col.key] === 'X' ? <span className="flag-yes">Yes</span> : <span className="flag-no">No</span>
    case 'desc':
      return (
        <span className="cell-desc" title={text}>
          {text}
        </span>
      )
    default:
      return <>{text}</>
  }
}

/** The report grid, its empty state and the pager below it. */
export function DealTable({
  columns,
  rows,
  total,
  sort,
  onSort,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
  onDeal,
  onMc,
}: {
  columns: readonly Column[]
  rows: readonly Deal[]
  total: number
  sort: Sort
  onSort: (key: ColumnKey) => void
  page: number
  totalPages: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  onDeal: (id: string) => void
  onMc: (ref: string) => void
}) {
  const empty = total === 0
  return (
    <>
      <div className="table-scroll">
        {empty ? null : (
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => {
                  const cls = [isNumericColumn(col.type) ? 'num' : '', col.sortable ? '' : 'no-sort'].filter(Boolean).join(' ')
                  const active = sort.key === col.key
                  return (
                    <th
                      key={col.key}
                      className={cls || undefined}
                      onClick={col.sortable ? () => onSort(col.key) : undefined}
                    >
                      <span className="th-inner">
                        <span>{col.label}</span>
                        {col.sortable ? <SortIndicator active={active} desc={sort.dir === 'desc'} /> : null}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.zdeal_id}>
                  {columns.map((col) => (
                    <td key={col.key} className={isNumericColumn(col.type) ? 'num' : undefined}>
                      <Cell deal={d} col={col} onDeal={onDeal} onMc={onMc} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {empty ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h4M8 17h.01M12 17h4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <h4>No Data Found</h4>
            <p>No deal IDs match the selected criteria for this key date.</p>
          </div>
        ) : null}
      </div>

      {empty ? null : (
        <div className="pagination">
          <span className="page-info">{pageInfo(page, pageSize, total)}</span>
          <div className="page-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              ‹
            </button>
            {pageWindow(page, totalPages).map((p) => (
              <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>
                {p}
              </button>
            ))}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
              ›
            </button>
          </div>
          <div className="page-size-select">
            Rows per page
            <select value={pageSize} onChange={(e) => onPageSize(parseInt(e.target.value, 10))}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </>
  )
}
