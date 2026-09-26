import { fmtDate } from './format.ts'
import { currStr, entStr, pagerWindow, statusText } from './logic.ts'
import type { Deal } from './types.ts'

/** The Open Deal IDs grid. A click anywhere on a row, or on its Deal ID link, opens it. */
export function DealTable({ rows, onOpen }: { rows: Deal[]; onOpen: (dealId: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="list-table" id="deal-table">
        <thead>
          <tr>
            <th className="sticky-col sticky-1">Deal ID</th>
            <th>Status</th>
            <th>MC Reference No</th>
            <th>FX Model</th>
            <th>Model Description</th>
            <th>Trader</th>
            <th>Deal Start</th>
            <th>Deal End</th>
            <th>Ship Start</th>
            <th>Ship End</th>
            <th>Entity String</th>
            <th>Currency String</th>
            <th>Origin</th>
          </tr>
        </thead>
        <tbody id="deal-tbody">
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={13}>No Deal IDs match the current filters.</td>
            </tr>
          ) : (
            rows.map((d) => (
              <tr key={d.dealId} onClick={() => onOpen(d.dealId)}>
                <td className="sticky-col sticky-1">
                  <button
                    className="deal-link"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(d.dealId)
                    }}
                  >
                    {d.dealId}
                  </button>
                </td>
                <td className={`status-cell st-${d.status}`}>{statusText(d.status)}</td>
                <td className="mc-link">{d.mcRef}</td>
                <td>{d.model}</td>
                <td>{d.modelDesc}</td>
                <td>{d.trader}</td>
                <td>{fmtDate(d.dealStart)}</td>
                <td>{fmtDate(d.dealEnd)}</td>
                <td>{fmtDate(d.shipStart)}</td>
                <td>{fmtDate(d.shipEnd)}</td>
                <td>{entStr(d.entityId)}</td>
                <td>{currStr(d.currId)}</td>
                <td>{d.origin}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** «, ‹, the page numbers, ›, ». */
export function PagerControls({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div className="pager-controls" id="pager-controls">
      <button className="pager-btn" type="button" disabled={page <= 1} onClick={() => onPage(1)}>
        «
      </button>
      <button className="pager-btn" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      {pagerWindow(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} style={{ padding: '0 4px', color: 'var(--text-faint)' }}>
            …
          </span>
        ) : (
          <button key={p} className={`pager-btn ${p === page ? 'active' : ''}`} type="button" onClick={() => onPage(p)}>
            {p}
          </button>
        ),
      )}
      <button className="pager-btn" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        ›
      </button>
      <button className="pager-btn" type="button" disabled={page >= totalPages} onClick={() => onPage(totalPages)}>
        »
      </button>
    </div>
  )
}
