import { fmtDate, fmtNum } from './format.ts'
import { regionName, sortArrow, statusIsSettled } from './logic.ts'
import type { Deal, Sort, SortKey } from './types.ts'

/** The coloured status pill: green once Ready for Settlement / Settled, orange before that. */
export function StatusCell({ deal }: { deal: Deal }) {
  const cls = statusIsSettled(deal.status) ? 'st-inuse' : 'st-pending'
  return (
    <span className={`status-cell ${cls}`}>
      <span className="dot"></span>
      {deal.status} - {deal.statusDesc}
    </span>
  )
}

function SortableTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th className="left sortable" onClick={() => onSort(k)}>
      {label} <span className="arrow">{sortArrow(sort, k)}</span>
    </th>
  )
}

export function DealTable({
  rows,
  sort,
  onSort,
  onOpenDeal,
  onOpenMc,
  emptyText,
}: {
  emptyText: string
  rows: readonly Deal[]
  sort: Sort
  onSort: (key: SortKey) => void
  onOpenDeal: (dealId: string) => void
  onOpenMc: (mcRef: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <SortableTh label="Deal ID" k="dealId" sort={sort} onSort={onSort} />
            <th className="left">Type</th>
            <th className="left">Deal Description</th>
            <SortableTh label="Master Contract" k="mcRef" sort={sort} onSort={onSort} />
            <th className="left">FX Model</th>
            <th className="left">Origin &#8594; Region</th>
            <SortableTh label="Status" k="statusDesc" sort={sort} onSort={onSort} />
            <SortableTh label="Trade Date" k="tradeDate" sort={sort} onSort={onSort} />
            <SortableTh label="Value Date" k="valueDate" sort={sort} onSort={onSort} />
            <th className="left">Partner name</th>
            <th>P&amp;L</th>
            <th className="sortable" onClick={() => onSort('utiAmt')}>
              Utilized Amt (USD) <span className="arrow">{sortArrow(sort, 'utiAmt')}</span>
            </th>
            <th title="Save Spot Data">Spot</th>
            <th className="left">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((d) => (
              <tr key={d.dealId} onDoubleClick={() => onOpenDeal(d.dealId)}>
                <td>
                  <a
                    className="tbl-link deal-id"
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onOpenDeal(d.dealId)
                    }}
                  >
                    {d.dealId}
                  </a>
                </td>
                <td>
                  {d.dealType} &middot; {d.subType}
                </td>
                <td>{d.shortDesc}</td>
                <td>
                  <a
                    className="tbl-link"
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onOpenMc(d.mcRef)
                    }}
                  >
                    {d.mcRef}
                  </a>
                </td>
                <td>{d.fxModel}</td>
                <td>
                  {d.origin} &#8594; {regionName(d.region)}
                </td>
                <td>
                  <StatusCell deal={d} />
                </td>
                <td>{fmtDate(d.tradeDate)}</td>
                <td>{fmtDate(d.valueDate)}</td>
                <td>{d.partner}</td>
                <td style={{ textAlign: 'right' }}>
                  {d.plCurr} {fmtNum(d.plAmt)}
                </td>
                <td style={{ textAlign: 'right' }}>{fmtNum(d.utiAmt)}</td>
                <td style={{ textAlign: 'center' }}>{d.spot ? '✓' : '—'}</td>
                <td>
                  <button className="rowaction-btn" onClick={() => onOpenDeal(d.dealId)}>
                    View
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
