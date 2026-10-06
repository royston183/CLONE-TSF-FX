import type { ReactNode } from 'react'
import { STATUS } from './data.ts'
import { formatAmount } from './format.ts'
import { statusClass } from './logic.ts'
import type { NdfDeal, Sort, SortField } from './types.ts'

type DataKey = Exclude<keyof NdfDeal, 'id' | 'partnerCode' | 'traderCode' | 'internalRef'>
type Column = { key: DataKey; label: string; sortable: boolean; num?: boolean }

/** The page's COLUMNS, after the leading selection column. */
const COLUMNS: Column[] = [
  { key: 'transaction', label: 'Transaction', sortable: true },
  { key: 'coCode', label: 'CoCode', sortable: true },
  { key: 'busArea', label: 'Bus. Area', sortable: false },
  { key: 'tradeDate', label: 'Trade Date', sortable: true },
  { key: 'tsfEntity', label: 'TSF Entity', sortable: false },
  { key: 'txnTypeDesc', label: 'Transaction Type Desc', sortable: false },
  { key: 'partnerName', label: 'Partner Name', sortable: true },
  { key: 'buySell2', label: 'Buy/Sell 2', sortable: false },
  { key: 'currency2', label: 'Currency 2', sortable: false },
  { key: 'amount2', label: 'Amount 2', sortable: true, num: true },
  { key: 'currency1', label: 'Currency 1', sortable: false },
  { key: 'amount1', label: 'Amount 1', sortable: true, num: true },
  { key: 'allInRate', label: 'All in Rate', sortable: true, num: true },
  { key: 'txnStatus', label: 'Txn Status', sortable: true },
  { key: 'fixingDate', label: 'Fixing Date', sortable: true },
  { key: 'ndfValue', label: 'NDF Value', sortable: true, num: true },
  { key: 'valueDate', label: 'Value Date', sortable: true },
  { key: 'dealId', label: 'Deal ID', sortable: true },
  { key: 'mcReference', label: 'MC Reference', sortable: false },
  { key: 'businessArea', label: 'Business Area', sortable: false },
  { key: 'trader', label: 'Trader', sortable: true },
  { key: 'accounting', label: 'Accounting', sortable: false },
  { key: 'externalRef', label: 'External Ref.', sortable: false },
  { key: 'foRemark', label: 'FO Remark', sortable: false },
  { key: 'moRemark', label: 'MO Remark', sortable: false },
]

const DASH = <span className="remark-text">&mdash;</span>

function cellValue(d: NdfDeal, col: Column): ReactNode {
  switch (col.key) {
    case 'txnStatus':
      return <span className={`status-text ${statusClass(d.txnStatus)}`}>{d.txnStatus}</span>
    case 'moRemark':
      return d.moRemark ? (
        <span className={`remark-text${d.txnStatus === STATUS.CORRECTION ? ' correction' : ''}`}>{d.moRemark}</span>
      ) : (
        DASH
      )
    case 'foRemark':
    case 'externalRef':
      return d[col.key] || DASH
    default: {
      const v = d[col.key]
      return col.num && typeof v === 'number' ? formatAmount(v) : v
    }
  }
}

/**
 * #tableRegion: the "enter criteria" prompt until View Deals has run, the "no deals" notice
 * when nothing matches, otherwise the wide sortable table. Clicking a row selects it (one at a
 * time); its checkbox only mirrors that selection.
 */
export function NdfTable({
  loaded,
  rows,
  sort,
  selectedId,
  onSort,
  onSelect,
  emptyTitle = 'No NDF Fixing Deals Found',
  emptyDesc = 'No deals match the selected Company Code, Fixing Date and optional filters.',
}: {
  loaded: boolean
  /** The current page's rows. */
  rows: NdfDeal[]
  sort: Sort
  selectedId: string | null
  onSort: (field: SortField) => void
  onSelect: (id: string) => void
  /** The no-rows notice: why nothing is listed (e.g. WAITING FOR API). */
  emptyTitle?: string
  emptyDesc?: string
}) {
  if (!loaded) {
    return (
      <div id="tableRegion">
        <div className="empty-state">
          <div className="icon">🔍</div>
          <div className="title">Enter selection criteria to begin</div>
          <div className="desc">Select Company Code and Fixing Date to load NDF fixing deals.</div>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div id="tableRegion">
        <div className="empty-state">
          <div className="icon">📭</div>
          <div className="title">{emptyTitle}</div>
          <div className="desc">{emptyDesc}</div>
        </div>
      </div>
    )
  }

  return (
    <div id="tableRegion">
      <div className="table-wrap">
        <table className="ndf-table">
          <thead>
            <tr>
              <th className="col-select no-sort" />
              {COLUMNS.map((col) => {
                const sorted = sort.field === col.key
                const cls = [col.sortable ? '' : 'no-sort', sorted ? 'sorted' : '', col.num ? 'num' : ''].filter(Boolean).join(' ')
                return (
                  <th
                    key={col.key}
                    className={cls || undefined}
                    onClick={col.sortable ? () => onSort(col.key as SortField) : undefined}
                  >
                    <span className="th-inner">
                      {col.label}
                      {col.sortable ? (
                        <span className="sort-arrow">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      ) : null}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const isSelected = d.id === selectedId
              return (
                <tr key={d.id} className={isSelected ? 'selected' : undefined} onClick={() => onSelect(d.id)}>
                  <td className="col-select">
                    <input type="checkbox" className="chk" checked={isSelected} onChange={() => {}} />
                  </td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={col.num ? 'num' : undefined}>
                      {cellValue(d, col)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
