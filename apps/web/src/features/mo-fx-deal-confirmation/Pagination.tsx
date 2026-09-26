import { pagerWindow, paginationInfo } from './logic.ts'

export const PAGE_SIZES = [10, 20, 25, 50]

/** The bar under the table: "Showing a-b of n deals", the page buttons and Rows per page. */
export function Pagination({
  total,
  page,
  totalPages,
  startIdx,
  shown,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  totalPages: number
  startIdx: number
  shown: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  return (
    <div className="pagination-bar">
      <div className="pagination-info" id="paginationInfo">
        {paginationInfo(total, startIdx, shown)}
      </div>
      <div className="pagination-controls" id="paginationControls">
        <button className="page-btn" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {'<'}
        </button>
        {pagerWindow(page, totalPages).map((p) => (
          <button key={p} className={`page-btn${p === page ? ' active' : ''}`} type="button" onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        <button className="page-btn" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {'>'}
        </button>
      </div>
      <div className="page-size-select">
        <span>Rows per page</span>
        <select id="pageSizeSelect" value={pageSize} onChange={(e) => onPageSize(parseInt(e.target.value, 10))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
