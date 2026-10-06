import { ENTITIES, FX_MODELS, STATUS_META } from './data.ts'
import { fmtAmt } from './format.ts'
import { fxUtilAmt, originEntityOf, totalInvoiced, utilizationKnown } from './logic.ts'
import type { Deal, Sort, SortKey } from './types.ts'

function SortArrow({ active, dir }: { active: boolean; dir: 1 | -1 }) {
  return <span className="arrow">{active ? (dir === 1 ? '▲' : '▼') : ''}</span>
}

export function DealTable({
  deals,
  sort,
  onSort,
  onOpenDetail,
  onOpenMcDetails,
  emptyText,
}: {
  deals: readonly Deal[]
  sort: Sort
  onSort: (key: SortKey) => void
  onOpenDetail: (dealId: string) => void
  onOpenMcDetails: (dealId: string) => void
  /** Why there are no rows when the list could not be read; the filter message otherwise. */
  emptyText?: string
}) {
  return (
    <div className="table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th className="left sortable" onClick={() => onSort('dealId')}>
              Deal ID <SortArrow active={sort.key === 'dealId'} dir={sort.dir} />
            </th>
            <th className="left">Deal Description</th>
            <th className="left">Status</th>
            <th className="left">MC Ref No</th>
            <th className="left">Origin Entity</th>
            <th className="left">Model</th>
            <th className="left">Commodity</th>
            <th className="sortable" onClick={() => onSort('dealStart')}>
              Deal Start <SortArrow active={sort.key === 'dealStart'} dir={sort.dir} />
            </th>
            <th className="sortable" onClick={() => onSort('dealEnd')}>
              Deal End <SortArrow active={sort.key === 'dealEnd'} dir={sort.dir} />
            </th>
            <th className="sortable" onClick={() => onSort('mcAmtUsd')}>
              MC Amount (USD) <SortArrow active={sort.key === 'mcAmtUsd'} dir={sort.dir} />
            </th>
            <th>FX Utilization Amt</th>
            <th>Total Invoiced Amt</th>
            <th>Current Balance</th>
            <th className="left">Invoice Legs (T1/T2/T3)</th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={14}>{emptyText || 'No Deal ID matches the current filters.'}</td>
            </tr>
          ) : (
            deals.map((d) => {
              const meta = STATUS_META[d.dealStat]!
              const originEntity = originEntityOf(d)
              const util = fxUtilAmt(d)
              const totInv = totalInvoiced(d)
              const bal = util - totInv
              return (
                <tr key={d.dealId}>
                  <td className="left">
                    <button className="deal-id-link" onClick={() => onOpenDetail(d.dealId)}>
                      {d.dealId}
                    </button>
                  </td>
                  <td className="left">{d.dealDesc}</td>
                  <td className="left">
                    <span className={`status-cell ${meta.cls}`}>
                      <span className="dot" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="left">
                    <button className="tbl-link" onClick={() => onOpenMcDetails(d.dealId)}>
                      {d.mcRef}
                    </button>
                  </td>
                  <td className="left">
                    {originEntity} - {ENTITIES[originEntity]!.name}
                  </td>
                  <td className="left">
                    {d.model} - {FX_MODELS[d.model]!.desc}
                  </td>
                  <td className="left">{d.commodity}</td>
                  <td className="num">{d.dealStart}</td>
                  <td className="num">{d.dealEnd}</td>
                  <td className="num">{fmtAmt(d.mcAmtUsd)}</td>
                  <td className="num">{utilizationKnown(d) ? fmtAmt(util) : ''}</td>
                  <td className="num">{fmtAmt(totInv)}</td>
                  <td className="num">{utilizationKnown(d) ? fmtAmt(bal) : ''}</td>
                  <td className="left">
                    {d.inv.map((r) => (
                      <span className={`badge ${r.invoiced ? 'badge-green' : 'badge-orange'}`} style={{ marginRight: 4 }} key={r.ttype}>
                        {r.ttype}
                        {r.invoiced ? ' ✓' : ''}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
