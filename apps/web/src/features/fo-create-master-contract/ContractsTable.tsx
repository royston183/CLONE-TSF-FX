import type { DragEvent } from 'react'
import { DEFAULT_STATUS_META, STATUS_META } from './data.ts'
import { formatAmount, formatRate } from './format.ts'
import { commodityNames } from './logic.ts'
import type { MasterContract, Sort, SortField } from './types.ts'

const COLUMNS: Array<{ field: SortField; label: string; num?: boolean }> = [
  { field: 'status', label: 'Status' },
  { field: 'mcNumber', label: 'MC Number' },
  { field: 'originEntity', label: 'Origin Entity' },
  { field: 'fxModelCode', label: 'FX Model' },
  { field: 'commodityName', label: 'Commodity' },
  { field: 'mcDate', label: 'MC Date' },
  { field: 'mcAmountUsd', label: 'MC Amount (USD)', num: true },
  { field: 'exchangeRate', label: 'Exchange Rate', num: true },
  { field: 'shipStart', label: 'Shipment Start' },
  { field: 'shipEnd', label: 'Shipment End' },
]

export function ContractsTable({
  rows,
  sort,
  selectedRow,
  checked,
  flashMcNumber,
  onSort,
  onRowClick,
  onOpen,
  onCheck,
  onDragStart,
  onDragEnd,
}: {
  rows: MasterContract[]
  sort: Sort
  selectedRow: number | null
  checked: ReadonlySet<number>
  /** The contract just created, which gets the original's green flash. */
  flashMcNumber: number | null
  onSort: (field: SortField) => void
  onRowClick: (c: MasterContract) => void
  onOpen: (c: MasterContract) => void
  onCheck: (c: MasterContract, checked: boolean) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, c: MasterContract) => void
  onDragEnd: (e: DragEvent<HTMLTableRowElement>) => void
}) {
  return (
    <table className="mc-table">
      <thead>
        <tr>
          <th className="no-sort action-col">Action</th>
          {COLUMNS.map((col) => {
            const sorted = sort.field === col.field
            return (
              <th
                key={col.field}
                className={[col.num ? 'num' : '', sorted ? 'sorted' : ''].filter(Boolean).join(' ') || undefined}
                onClick={() => onSort(col.field)}
              >
                {col.label}
                <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const meta = STATUS_META[c.status] ?? DEFAULT_STATUS_META
          const isSelected = selectedRow === c.mcNumber
          const cls = [c.mcNumber === flashMcNumber ? 'row-new' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ')
          return (
            <tr
              key={c.mcNumber}
              className={cls || undefined}
              title="Click to select · double-click to view contract details"
              // Only the single selected row can be dragged onto Copy or Send to M.O.
              draggable={isSelected}
              onClick={() => onRowClick(c)}
              onDoubleClick={() => onOpen(c)}
              onDragStart={(e) => {
                if (!isSelected) {
                  e.preventDefault()
                  return
                }
                onDragStart(e, c)
              }}
              onDragEnd={onDragEnd}
            >
              <td className="action-col">
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  title="Select contract"
                  checked={checked.has(c.mcNumber)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onCheck(c, e.target.checked)}
                />
              </td>
              <td>
                <span className={`status-text ${meta.textCls}`}>{c.status}</span>
              </td>
              <td>
                <span
                  className="mc-link mono"
                  title="Click to view contract details"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(c)
                  }}
                >
                  {c.mcNumber}
                </span>
              </td>
              <td>{c.originEntity}</td>
              <td>{c.fxModelCode}</td>
              <td title={c.selectedCommodities && c.selectedCommodities.length ? commodityNames(c.selectedCommodities).join(', ') : undefined}>
                {c.commodityName}
              </td>
              <td className="mono">{c.mcDate}</td>
              <td className="num mono">{formatAmount(c.mcAmountUsd)}</td>
              <td className="num mono">{formatRate(c.exchangeRate)}</td>
              <td className="mono">{c.shipStart}</td>
              <td className="mono">{c.shipEnd}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
