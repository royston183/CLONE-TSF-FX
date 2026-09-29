import { fmtAmount } from './format.ts'
import { sideClass } from './logic.ts'
import type { DetailKind, SortKey, Sort, SpotRow } from './types.ts'

type Column = { key: SortKey; label: string; num?: boolean }

const COLUMNS: Column[] = [
  { key: 'dealId', label: 'Deal ID' },
  { key: 'modelId', label: 'Model' },
  { key: 'dealType', label: 'FX Deal' },
  { key: 'dssType', label: 'DSS Deal' },
  { key: 'companyCode', label: 'Company Code' },
  { key: 'originalTxn', label: 'Original Txn' },
  { key: 'tradeType', label: 'Trade Type' },
  { key: 'finalAmt', label: 'Final Amt', num: true },
  { key: 'fxDealAmt', label: 'FX Deal Amt', num: true },
  { key: 'currency', label: 'Crcy' },
  { key: 'diffAmt', label: 'Diff Inv Amt', num: true },
  { key: 'spotTxn', label: 'Spot Txn' },
  { key: 'tradeDate', label: 'Trade Date' },
  { key: 'valueDate', label: 'Value Date' },
  { key: 'partner', label: 'Business Partner' },
  { key: 'group', label: 'Group' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'side', label: 'Side' },
  { key: 'tsfEntity', label: 'TSF Entity' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'createdDate', label: 'Created Date' },
]

export function SpotTable({
  rows,
  selectedId,
  sort,
  onSort,
  onSelect,
  onOpenDetail,
  onDragStart,
  onDragEnd,
}: {
  rows: SpotRow[]
  selectedId: string | null
  sort: Sort
  onSort: (key: SortKey) => void
  onSelect: (id: string) => void
  onOpenDetail: (row: SpotRow, kind: DetailKind) => void
  onDragStart: (row: SpotRow) => void
  onDragEnd: () => void
}) {
  return (
    <div className="table-scroll">
      <table id="spotTable" style={{ display: rows.length ? 'table' : 'none' }}>
        <thead>
          <tr>
            <th className="check-col no-sort">☐</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.num ? 'num' : undefined} onClick={() => onSort(c.key)}>
                {c.label}
                <span className="sort-arrow">{sort.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSel = selectedId === r.id
            return (
              <tr
                key={r.id}
                draggable
                className={isSel ? 'selected' : ''}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.txn-link')) return
                  onSelect(r.id)
                }}
                onDragStart={() => {
                  onSelect(r.id)
                  onDragStart(r)
                }}
                onDragEnd={onDragEnd}
              >
                <td className="check-col">
                  <input className="row-check" type="checkbox" checked={isSel} readOnly onClick={(e) => e.stopPropagation()} />
                </td>
                <td>
                  <b>{r.dealId}</b>
                </td>
                <td>{r.modelId}</td>
                <td>{r.dealType}</td>
                <td>{r.dssType}</td>
                <td>{r.companyCode}</td>
                <td>
                  <span
                    className="link txn-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenDetail(r, 'original')
                    }}
                  >
                    {r.originalTxn}
                  </span>
                </td>
                <td>{r.tradeType}</td>
                <td className="num">{fmtAmount(r.finalAmt)}</td>
                <td className="num">{fmtAmount(r.fxDealAmt)}</td>
                <td>{r.currency}</td>
                <td className="num">{fmtAmount(r.diffAmt)}</td>
                <td>
                  {r.spotTxn ? (
                    <span
                      className={`link txn-link${r.spotTxn ? ' created' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenDetail(r, 'spot')
                      }}
                    >
                      {r.spotTxn}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{r.tradeDate}</td>
                <td>{r.valueDate}</td>
                <td title={r.partnerName}>{r.partner}</td>
                <td>{r.group}</td>
                <td>{r.companyName}</td>
                <td className={sideClass(r.side)}>{r.side}</td>
                <td>{r.tsfEntity}</td>
                <td>{r.createdBy ? r.createdBy : <span className="muted">—</span>}</td>
                <td>{r.createdDate ? r.createdDate : <span className="muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="empty" style={{ display: rows.length ? 'none' : 'block' }}>
        No data found for the selected criteria.
      </div>
    </div>
  )
}
