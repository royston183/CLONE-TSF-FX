import { formatAmount } from './format.ts'
import type { DealRow, Sort, SortKey } from './types.ts'

type Column = { key: SortKey; label: string; width: string; hotspot?: 'deal' | 'mc'; amount?: boolean; num?: boolean; status?: boolean; sticky?: boolean }

const COLUMNS: Column[] = [
  { key: 'dealId', label: 'Deal ID', width: '105px', hotspot: 'deal', sticky: true },
  { key: 'dealDesc', label: 'Deal ID Description', width: '210px' },
  { key: 'mcRef', label: 'MC Ref No', width: '105px', hotspot: 'mc' },
  { key: 'commodity', label: 'Commodity', width: '150px' },
  { key: 'dealStart', label: 'Deal Start Date', width: '112px' },
  { key: 'dealEnd', label: 'Deal End Date', width: '112px' },
  { key: 'earliestStart', label: 'Earliest Shipment Start', width: '145px' },
  { key: 'status', label: 'Deal Status', width: '88px' },
  { key: 'statusDesc', label: 'Deal Status Description', width: '185px', status: true },
  { key: 'origin', label: 'Origin Entity', width: '105px' },
  { key: 'model', label: 'FX Model', width: '92px' },
  { key: 'region', label: 'Region', width: '74px' },
  { key: 'modelDesc', label: 'FX Model Description', width: '180px' },
  { key: 'amount', label: 'Deal Amt (USD)', width: '126px', amount: true },
  { key: 'shipStart', label: 'MC Shipment Start', width: '126px' },
  { key: 'shipEnd', label: 'MC Shipment End', width: '126px' },
  { key: 'daysShip', label: 'Days-Ship Start', width: '108px', num: true },
  { key: 'daysEnd', label: 'Days (Deal End)', width: '112px', num: true },
  { key: 'daysStart', label: 'Days (Deal Start)', width: '116px', num: true },
]

export function DealTable({
  rows,
  selected,
  sort,
  onSort,
  onToggleAll,
  onToggleRow,
  onOpenDeal,
  onOpenMc,
  onDragStart,
  onDragEnd,
  emptyReason,
}: {
  rows: DealRow[]
  selected: ReadonlySet<string>
  sort: Sort
  onSort: (key: SortKey) => void
  onToggleAll: (checked: boolean) => void
  onToggleRow: (id: string, checked: boolean) => void
  onOpenDeal: (row: DealRow) => void
  onOpenMc: (row: DealRow) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  /** Why there are no rows when the list could not be read (WAITING FOR DEAL ID API). */
  emptyReason?: string
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.dealId))

  return (
    <div className="table-scroll">
      <table id="dealTable" style={{ display: rows.length ? 'table' : 'none' }}>
        <thead>
          <tr>
            <th className="check-col">
              <input id="checkAll" type="checkbox" checked={allChecked} disabled={rows.length === 0} onChange={(e) => onToggleAll(e.target.checked)} aria-label="Select all visible deals" />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} className={`sortable ${col.hotspot === 'deal' ? 'deal-col' : ''}`} style={{ minWidth: col.width }} onClick={() => onSort(col.key)}>
                {col.label}
                <span className="sort-arrow">{sort.key === col.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dealId} className={`deal-row${selected.has(row.dealId) ? ' row-selected' : ''}`} draggable onDragStart={() => onDragStart(row.dealId)} onDragEnd={onDragEnd} onClick={() => onToggleRow(row.dealId, !selected.has(row.dealId))}>
              <td className="check-col">
                <input className="row-check" type="checkbox" checked={selected.has(row.dealId)} onChange={(e) => onToggleRow(row.dealId, e.target.checked)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${row.dealId}`} />
              </td>
              {COLUMNS.map((col) => {
                if (col.hotspot === 'deal') {
                  return (
                    <td key={col.key} className="deal-col">
                      <button
                        type="button"
                        className="hotspot hotspot-deal"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDeal(row)
                        }}
                      >
                        {row.dealId}
                      </button>
                    </td>
                  )
                }
                if (col.hotspot === 'mc') {
                  return (
                    <td key={col.key}>
                      <button
                        type="button"
                        className="hotspot hotspot-mc"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenMc(row)
                        }}
                      >
                        {row.mcRef}
                      </button>
                    </td>
                  )
                }
                if (col.amount) return <td key={col.key} className="amount">{row[col.key] === null ? '' : formatAmount(row[col.key] as number)}</td>
                if (col.num) {
                  const v = Number(row[col.key])
                  return (
                    <td key={col.key} className={`num ${v < 0 ? 'days-negative' : 'days-positive'}`}>
                      {v === 0 ? '' : v}
                    </td>
                  )
                }
                if (col.status) {
                  return (
                    <td key={col.key} className={row.status === '03' ? 'status-marked' : 'status-ready'}>
                      {row.statusDesc}
                    </td>
                  )
                }
                return <td key={col.key}>{row[col.key] as string}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="empty-state show">
          <svg width="42" height="42" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <strong>No record found</strong>
          <span>{emptyReason || 'Adjust the live filters or refresh the workbench.'}</span>
        </div>
      ) : null}
    </div>
  )
}
