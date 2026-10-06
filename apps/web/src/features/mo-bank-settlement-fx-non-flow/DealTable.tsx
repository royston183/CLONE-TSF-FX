import type { DragEvent } from 'react'
import { DASH, fmtDate, fmtNum } from './format.ts'
import { bankClass, bankLabel, statusClass } from './logic.ts'
import type { Deal, Sort } from './types.ts'

function LegCell({ side, amt, curr }: { side: Deal['bs1']; amt: number; curr: string }) {
  return (
    <td className="left">
      <span className={`leg-${side === 'BUY' ? 'buy' : 'sell'}`}>{side}</span> {fmtNum(amt)} {curr}
    </td>
  )
}

export function DealTable({
  rows,
  companies,
  emptyText,
  checkedId,
  draggingId,
  sort,
  showArrow,
  onSort,
  onRowClick,
  onViewTxn,
  onViewDoc,
  onDragStart,
  onDragEnd,
}: {
  rows: Deal[]
  /** T001 code -> name. */
  companies: Readonly<Record<string, string>>
  /** The empty-state text: a filter miss, or why SAP has nothing to list (WAITING FOR API). */
  emptyText: string
  checkedId: string | null
  draggingId: string | null
  sort: Sort
  /** The original showed no sort arrow until the Value Date header was first clicked. */
  showArrow: boolean
  onSort: (key: 'valueDate') => void
  onRowClick: (dealId: string) => void
  onViewTxn: (dealId: string) => void
  onViewDoc: (dealId: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, dealId: string) => void
  onDragEnd: () => void
}) {
  return (
    <div className="table-wrap">
      <table className="list-table" id="deal-table">
        <thead>
          <tr>
            <th className="sticky-col sticky-1"></th>
            <th className="sticky-col sticky-2 left">Deal ID</th>
            <th className="sticky-col sticky-3 left">Txn No</th>
            <th className="left">Company</th>
            <th className="left">MC Ref No</th>
            <th className="left">Counterparty</th>
            <th className="left">Trader</th>
            <th className="left sortable" onClick={() => onSort('valueDate')}>
              Value Date{' '}
              <span className="arrow" id="sort-valueDate">
                {showArrow && sort.key === 'valueDate' ? (sort.dir === 1 ? '▲' : '▼') : ''}
              </span>
            </th>
            <th className="left">Ccy Pair</th>
            <th className="left">Buy Leg</th>
            <th className="left">Sell Leg</th>
            <th className="left">Sett. Amount</th>
            <th className="left">Bank Details</th>
            <th className="left">Sett. Doc</th>
            <th className="left">Status</th>
          </tr>
        </thead>
        <tbody id="deal-tbody">
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={15}>{emptyText}</td>
            </tr>
          ) : (
            rows.map((d) => {
              const checked = d.dealId === checkedId
              return (
                <tr
                  key={d.dealId}
                  className={`actionable-row${checked ? ' row-checked' : ''}${draggingId === d.dealId ? ' dragging-row' : ''}`}
                  draggable={checked}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a,button')) return
                    onRowClick(d.dealId)
                  }}
                  onDragStart={(e) => onDragStart(e, d.dealId)}
                  onDragEnd={onDragEnd}
                >
                  <td className="sticky-col sticky-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRowClick(d.dealId)
                      }}
                    />
                  </td>
                  <td className="sticky-col sticky-2 left">
                    <span className="deal-id">{d.dealId}</span>
                  </td>
                  <td className="sticky-col sticky-3 left">
                    <a
                      className="tbl-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewTxn(d.dealId)
                      }}
                    >
                      {d.rfha}
                    </a>
                  </td>
                  <td className="left">
                    {d.bukrs} · {companies[d.bukrs] ?? d.bukrs}
                  </td>
                  <td className="left">{d.mcRef}</td>
                  <td className="left">{d.counterparty}</td>
                  <td className="left">{d.trader}</td>
                  <td className="left">{fmtDate(d.valueDate)}</td>
                  <td className="left">{d.ccyPair}</td>
                  <LegCell side={d.bs1} amt={d.amt1} curr={d.curr1} />
                  <LegCell side={d.bs2} amt={d.amt2} curr={d.curr2} />
                  <td className="left">
                    {fmtNum(d.settleAmt)} {d.settleCurr}
                  </td>
                  <td className="left">
                    <span className={bankClass(d.bankStatus)}>{bankLabel(d.bankStatus)}</span>
                  </td>
                  <td className="left">
                    {d.fiDoc ? (
                      <a
                        className="tbl-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewDoc(d.dealId)
                        }}
                      >
                        {d.fiDoc}
                      </a>
                    ) : (
                      <span className="muted-dash">{DASH}</span>
                    )}
                  </td>
                  <td className="left">
                    <span className={statusClass(d.status)}>{d.status}</span>
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
