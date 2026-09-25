import type { DragEvent, MouseEvent } from 'react'
import { STATUS_CLASS } from './data.ts'
import { formatAmount } from './format.ts'
import { isRejectable } from './logic.ts'
import type { Column, MasterContract, Sort, SortField } from './types.ts'

const NUM_KEYS: ReadonlySet<string> = new Set([
  'mcAmountUSD',
  'utilization',
  'balanceAmount',
  'mcAmountOrigin',
  'utilizationOrigin',
  'balanceOrigin',
])
const DATE_KEYS: ReadonlySet<string> = new Set(['mcDate', 'shipmentStart', 'shipmentEnd'])

/** Clicks on these never toggle the row: they have a job of their own. */
export const isInteractiveTarget = (target: EventTarget) =>
  target instanceof Element && !!target.closest('.row-chk, .mc-link, button, input, select, a, .chk')

export function StatusText({ status }: { status: string }) {
  return <span className={`status-text ${STATUS_CLASS[status] ?? ''}`}>{status}</span>
}

function Cell({ col, row, onOpen }: { col: Column; row: MasterContract; onOpen: (mcNumber: string) => void }) {
  const key = col.key
  if (key === 'action') return null
  if (key === 'status')
    return (
      <td className="col-status">
        <StatusText status={row.status} />
      </td>
    )
  if (key === 'mcNumber')
    return (
      <td>
        <button className="mc-link" data-id={row.mcNumber} onClick={() => onOpen(row.mcNumber)}>
          {row.mcNumber}
        </button>
      </td>
    )
  const v = row[key]
  if (NUM_KEYS.has(key)) return <td className="num-cell">{formatAmount(typeof v === 'number' ? v : Number(v))}</td>
  if (DATE_KEYS.has(key)) return <td className="date-cell">{v || ''}</td>
  return <td>{v}</td>
}

/**
 * The results grid (#dataTable). Every selection path — checkbox, row click, header
 * checkbox and the drag-range sweep — goes through the one `selected` set that Reject uses.
 */
export function ContractsTable({
  columns,
  rows,
  sort,
  selected,
  draggingId,
  hoverId,
  onSort,
  onSelectAll,
  onCheck,
  onToggle,
  onOpen,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  columns: Column[]
  rows: MasterContract[]
  sort: Sort
  selected: ReadonlySet<string>
  draggingId: string | null
  hoverId: string | null
  onSort: (field: SortField) => void
  onSelectAll: (checked: boolean) => void
  onCheck: (mcNumber: string, checked: boolean) => void
  onToggle: (mcNumber: string) => void
  onOpen: (mcNumber: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, mcNumber: string) => void
  onDragOver: (e: DragEvent<HTMLTableRowElement>, mcNumber: string) => void
  onDragEnd: () => void
}) {
  const selectable = rows.filter(isRejectable)
  // The original re-drew this box unticked after every change; it now shows whether the
  // page's selectable rows are all selected, so a second click can clear them again.
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.mcNumber))

  return (
    <table className="data-table rmc-table" id="dataTable">
      <thead>
        <tr id="tableHeadRow">
          {columns.map((col) => {
            if (col.key === 'action')
              return (
                <th key={col.key} className={`no-sort ${col.cls ?? ''}`}>
                  <input
                    type="checkbox"
                    className="chk"
                    id="selectAllChk"
                    title="Select all"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                  />
                </th>
              )
            const field = col.key
            const sorted = sort.field === field
            const cls = [col.cls ?? '', col.sortable ? '' : 'no-sort', sorted ? 'sorted' : ''].filter(Boolean).join(' ')
            return (
              <th
                key={field}
                className={cls || undefined}
                data-key={field}
                data-sortable={col.sortable ? 1 : 0}
                onClick={col.sortable ? () => onSort(field) : undefined}
              >
                <span className="th-inner">
                  {col.label}
                  {col.sortable ? <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span> : null}
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody id="tableBody">
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
            <tr
              key={r.mcNumber}
              className={cls}
              data-id={r.mcNumber}
              // Only selected rows can be dragged onto Reject.
              draggable={isSelected}
              onClick={(e: MouseEvent<HTMLTableRowElement>) => {
                if (!isInteractiveTarget(e.target)) onToggle(r.mcNumber)
              }}
              onDoubleClick={() => onOpen(r.mcNumber)}
              onDragStart={(e) => onDragStart(e, r.mcNumber)}
              onDragOver={(e) => onDragOver(e, r.mcNumber)}
              onDragEnd={onDragEnd}
            >
              {columns.map((col) =>
                col.key === 'action' ? (
                  <td key={col.key} className="col-action">
                    <input
                      type="checkbox"
                      className="chk row-chk"
                      data-id={r.mcNumber}
                      checked={isSelected}
                      disabled={!isRejectable(r)}
                      onChange={(e) => onCheck(r.mcNumber, e.target.checked)}
                    />
                  </td>
                ) : (
                  <Cell key={col.key} col={col} row={r} onOpen={onOpen} />
                ),
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
