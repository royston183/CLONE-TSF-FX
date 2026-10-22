import { NAMES, STATUS_CLASS, STATUS_LABEL } from './data.ts'
import { fmtAmt, fmtRate } from './format.ts'
import { allPageSelected, sortArrow } from './logic.ts'
import type { Deal, FiDocWhich, Sort, SortKey } from './types.ts'

type Props = {
  rows: Deal[]
  /** The empty-state text: a filter miss, or why SAP has nothing to list (WAITING FOR API). */
  emptyText: string
  selected: ReadonlySet<string>
  sort: Sort
  onSort: (key: SortKey) => void
  onToggleRow: (rfha: string) => void
  onToggleAll: (on: boolean) => void
  onOpenDeal: (rfha: string) => void
  onOpenFiDoc: (rfha: string, which: FiDocWhich) => void
}

function Dash() {
  return <span className="muted-dash">&ndash;</span>
}

function Leg({ side, curr, amt }: { side: 'BUY' | 'SELL'; curr: string; amt: number }) {
  return (
    <td>
      <span className={side === 'SELL' ? 'leg-sell' : 'leg-buy'}>{side}</span> {curr} {fmtAmt(amt)}
    </td>
  )
}

export function DealTable({ rows, emptyText, selected, sort, onSort, onToggleRow, onToggleAll, onOpenDeal, onOpenFiDoc }: Props) {
  return (
    <div className="table-wrap" id="table-wrap">
      <table className="list-table" id="deal-table">
        <thead>
          <tr>
            <th className="sticky-col sticky-1">
              <input
                type="checkbox"
                checked={allPageSelected(selected, rows)}
                onChange={(e) => onToggleAll(e.target.checked)}
                title="Select all visible rows"
              />
            </th>
            <th className="sticky-col sticky-2">Status</th>
            <th className="sticky-col sticky-3 sortable" onClick={() => onSort('rfha')}>
              Transaction <span className="arrow">{sortArrow(sort, 'rfha')}</span>
            </th>
            <th className="sortable" onClick={() => onSort('dealId')}>
              Deal ID <span className="arrow">{sortArrow(sort, 'dealId')}</span>
            </th>
            <th>MC Ref No</th>
            <th>Company Code</th>
            <th>TSF Entity</th>
            <th>Product</th>
            <th>Trade Date</th>
            <th className="sortable" onClick={() => onSort('valueDateSort')}>
              Value Date <span className="arrow">{sortArrow(sort, 'valueDateSort')}</span>
            </th>
            <th>Leg 1 (Buy/Sell)</th>
            <th>Leg 2 (Buy/Sell)</th>
            <th>Spot Rate</th>
            <th>Swap Rate</th>
            <th>All-in Rate</th>
            <th>Business Partner</th>
            <th>Trader</th>
            <th>FI Doc 1</th>
            <th>FI Doc 2</th>
            <th>Buy Trf</th>
            <th>Sell Trf</th>
            <th>Entered By</th>
            <th>NDF Fixing Date</th>
            <th>NDF Ref</th>
            <th>NDF Settlement Rate</th>
            <th>Cash Settlement Amount</th>
            <th>Cash Currency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const isChecked = selected.has(d.rfha)
            return (
              <tr key={d.rfha} className={isChecked ? 'row-checked' : ''} onClick={() => onToggleRow(d.rfha)}>
                <td className="sticky-col sticky-1">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleRow(d.rfha)}
                  />
                </td>
                <td className="sticky-col sticky-2">
                  <span className={`status-cell ${STATUS_CLASS[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                </td>
                <td className="sticky-col sticky-3">
                  <button
                    type="button"
                    className="tbl-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenDeal(d.rfha)
                    }}
                  >
                    {d.rfha}
                  </button>
                </td>
                <td className="deal-id">{d.dealId}</td>
                <td>{d.mcRef}</td>
                <td>
                  {d.bukrs} &middot; {NAMES.company[d.bukrs] ?? ''}
                </td>
                <td>{d.entity}</td>
                <td>{d.product}</td>
                <td>{d.tradeDate}</td>
                <td>{d.valueDate}</td>
                <Leg side={d.bs1} curr={d.curr1} amt={d.amt1} />
                <Leg side={d.bs2} curr={d.curr2} amt={d.amt2} />
                <td>{fmtRate(d.spot)}</td>
                <td>{d.swap ? fmtRate(d.swap) : <Dash />}</td>
                <td>{fmtRate(d.allIn)}</td>
                <td>
                  {d.kontrh} &middot; {NAMES.partner[d.kontrh] ?? ''}
                </td>
                <td>{d.trader}</td>
                {(['doc1', 'doc2'] as const).map((which) => (
                  <td key={which}>
                    {d[which] ? (
                      <button
                        type="button"
                        className="tbl-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenFiDoc(d.rfha, which)
                        }}
                      >
                        {d[which]}
                      </button>
                    ) : (
                      <Dash />
                    )}
                  </td>
                ))}
                <td>{NAMES.transfer[d.trf1] ?? d.trf1}</td>
                <td>{NAMES.transfer[d.trf2] ?? d.trf2}</td>
                <td>{d.cruser}</td>
                <td>{d.ndfDate || <Dash />}</td>
                <td>{d.ndfRef || <Dash />}</td>
                <td>{d.ndfRate ? fmtRate(d.ndfRate) : <Dash />}</td>
                <td>{d.cashAmt ? fmtAmt(d.cashAmt) : <Dash />}</td>
                <td>{d.cashCurr || <Dash />}</td>
              </tr>
            )
          })}
          {!rows.length && (
            <tr>
              <td colSpan={26} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 26 }}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
