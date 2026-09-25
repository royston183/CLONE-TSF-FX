import { formatAmount, formatRate } from './format.ts'
import { statusClass } from './logic.ts'
import type { MasterContract, PostingMode, Sort, SortField } from './types.ts'

type Column = { key: SortField; label: string; cls?: string }

/** Every data column is sortable; "MC View Only" adds the checkbox column in front. */
const COLUMNS: Column[] = [
  { key: 'status', label: 'Status', cls: 'col-status' },
  { key: 'mcNumber', label: 'MC Number' },
  { key: 'mcReferenceNo', label: 'MC Reference No' },
  { key: 'originEntity', label: 'Origin Entity' },
  { key: 'mcDescription', label: 'MC Description' },
  { key: 'mcDate', label: 'MC Date' },
  { key: 'mcAmount', label: 'MC Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'exchangeRate', label: 'Exchange Rate' },
  { key: 'shipmentStart', label: 'Shipment Start' },
  { key: 'shipmentEnd', label: 'Shipment End' },
]

/**
 * The results table. Row clicks, double-clicks and drags are delegated to the surrounding
 * .table-wrap by the screen, as in the original, and find their row through data-id.
 */
export function ContractsTable({
  mode,
  rows,
  sort,
  selected,
  allPageSelected,
  draggingId,
  hoverId,
  onSort,
  onSelectAll,
  onCheck,
  onOpen,
}: {
  mode: PostingMode
  rows: MasterContract[]
  sort: Sort
  selected: ReadonlySet<string>
  allPageSelected: boolean
  draggingId: string | null
  hoverId: string | null
  onSort: (field: SortField) => void
  onSelectAll: (checked: boolean) => void
  onCheck: (id: string, checked: boolean) => void
  onOpen: (id: string) => void
}) {
  const withAction = mode === 'view'
  return (
    <table className="data-table" id="dataTable">
      <thead>
        <tr>
          {withAction ? (
            <th className="no-sort col-action">
              <input
                type="checkbox"
                className="chk"
                title="Select all"
                checked={allPageSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
          ) : null}
          {COLUMNS.map((col) => {
            const sorted = sort.field === col.key
            return (
              <th
                key={col.key}
                className={[col.cls ?? '', sorted ? 'sorted' : ''].filter(Boolean).join(' ') || undefined}
                data-key={col.key}
                onClick={() => onSort(col.key)}
              >
                <span className="th-inner">
                  {col.label}
                  <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isSelected = selected.has(r.mcNumber)
          const cls = [
            isSelected ? 'row-selected' : '',
            draggingId === r.mcNumber ? 'dragging' : '',
            hoverId === r.mcNumber ? 'drag-range-hover' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <tr key={r.mcNumber} className={cls || undefined} data-id={r.mcNumber} draggable={isSelected}>
              {withAction ? (
                <td className="col-action">
                  <input
                    type="checkbox"
                    className="chk row-chk"
                    checked={isSelected}
                    disabled={r.status !== 'In Use'}
                    onChange={(e) => onCheck(r.mcNumber, e.target.checked)}
                  />
                </td>
              ) : null}
              <td className="col-status">
                <span className={`status-text ${statusClass(r.status)}`}>{r.status}</span>
              </td>
              <td>
                <button className="mc-link" type="button" onClick={() => onOpen(r.mcNumber)}>
                  {r.mcNumber}
                </button>
              </td>
              <td>{r.mcReferenceNo}</td>
              <td>{r.originEntity}</td>
              <td>{r.mcDescription}</td>
              <td className="date-cell">{r.mcDate}</td>
              <td className="num-cell">{formatAmount(r.mcAmount)}</td>
              <td>{r.currency}</td>
              <td className="num-cell">{formatRate(r.exchangeRate)}</td>
              <td className="date-cell">{r.shipmentStart}</td>
              <td className="date-cell">{r.shipmentEnd}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
