import type { DragEvent, MouseEvent, ReactNode } from 'react'
import { STATUS_KEY, STATUS_SHORT } from './data.ts'
import { fmtDate, fmtDateTime, fmtNum } from './format.ts'
import { isActionable } from './logic.ts'
import type { MasterContract, Sort, SortKey, StatusValue } from './types.ts'

const STATUS_CLASS = {
  RELEASE: 'st-pending',
  ERRCORR: 'st-errcorr',
  CONFIRMED: 'st-confirmed',
  INUSE: 'st-inuse',
  REJECTED: 'st-rejected',
} as const

export function StatusCell({ status }: { status: StatusValue }) {
  return <span className={`status-cell ${STATUS_CLASS[STATUS_KEY[status]]}`}>{STATUS_SHORT[status]}</span>
}

const Dash = ({ children = '–' }: { children?: ReactNode }) => <span className="muted-dash">{children}</span>

/** Clicks on the row's own controls keep their behaviour and never toggle its selection. */
const isControlClick = (e: MouseEvent) =>
  e.target instanceof Element && e.target.closest('button,input,a,select,textarea,label') !== null

export function ContractsTable({
  rows,
  sort,
  checked,
  draggingRow,
  onSort,
  onToggleRow,
  onCheck,
  onCheckAll,
  onOpenChild,
  onEdit,
  onDragStart,
  onDragEnd,
}: {
  /** The current page only. */
  rows: MasterContract[]
  sort: Sort
  checked: ReadonlySet<number>
  draggingRow: number | null
  onSort: (key: SortKey) => void
  onToggleRow: (mc: MasterContract) => void
  onCheck: (mc: MasterContract, checked: boolean) => void
  onCheckAll: (checked: boolean) => void
  onOpenChild: (mc: MasterContract) => void
  onEdit: (mc: MasterContract) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, mc: MasterContract) => void
  onDragEnd: () => void
}) {
  const eligible = rows.filter(isActionable)
  const allChecked = eligible.length > 0 && eligible.every((mc) => checked.has(mc.mcNumber))

  const sortable = (key: SortKey, label: string, className: string) => (
    <th className={`${className} sortable`.trim()} onClick={() => onSort(key)}>
      {label} <span className="arrow" id={`sort-${key}`}>{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  )

  return (
    <table className="list-table" id="mc-table">
      <thead>
        <tr>
          <th className="sticky-col sticky-1">
            <input
              type="checkbox"
              id="chk-all"
              title="Select all pending rows"
              checked={allChecked}
              disabled={eligible.length === 0}
              onChange={(e) => onCheckAll(e.target.checked)}
            />
          </th>
          <th className="left sticky-col sticky-2">Status</th>
          {sortable('mcNumber', 'MC Number', 'left sticky-col sticky-3')}
          <th className="left">Created MC</th>
          <th
            className="left"
            title="A Deal ID is only assigned once a Master Contract is Confirmed and an FX Deal is booked against it. Confirmed contracts leave this queue, so it always shows blank here."
          >
            Deal ID
          </th>
          <th className="left">Origin Entity</th>
          <th className="left">Entity ID</th>
          <th className="left">Entity String</th>
          {sortable('fxModel', 'FX Model', 'left')}
          <th className="left">Model Description</th>
          <th className="left">GT Commodity</th>
          <th className="left">Comm Desc</th>
          {sortable('mcDate', 'MC Date', '')}
          {sortable('amtUSD', 'MC Amt (USD)', '')}
          <th>MC Amt (Origin)</th>
          <th className="left">Curr1</th>
          <th>Exchange Rate</th>
          <th className="left">Currency ID</th>
          <th className="left">Currency String</th>
          <th className="left">Payment Terms</th>
          <th>Payment Date</th>
          <th>Shipment Start</th>
          <th>Shipment End</th>
          <th className="left">Port of Shipment</th>
          <th className="left">Port of Destination</th>
          <th>Utilized Amt</th>
          <th className="left">MO Remarks</th>
          <th className="left">FO Remarks</th>
          <th className="left">Entered By</th>
          <th className="left">Entered On</th>
          <th className="left">Changed By</th>
          <th className="left">Changed On</th>
          <th className="left">Actions</th>
        </tr>
      </thead>
      <tbody id="mc-tbody">
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={33}>No Master Contracts match the selection criteria.</td>
          </tr>
        ) : (
          rows.map((mc) => {
            const canAct = isActionable(mc)
            const isChecked = checked.has(mc.mcNumber)
            const cls = [canAct ? 'actionable-row' : '', isChecked ? 'row-checked' : '', draggingRow === mc.mcNumber ? 'dragging-row' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={mc.mcNumber}
                className={cls || undefined}
                aria-selected={isChecked}
                // Only a selected row can be dragged; it carries the whole selection with it.
                draggable={canAct && isChecked}
                onClick={(e) => {
                  if (!isControlClick(e)) onToggleRow(mc)
                }}
                onDragStart={(e) => onDragStart(e, mc)}
                onDragEnd={onDragEnd}
              >
                <td className="sticky-col sticky-1">
                  <input
                    type="checkbox"
                    disabled={!canAct}
                    checked={isChecked}
                    onChange={(e) => onCheck(mc, e.target.checked)}
                    title={canAct ? 'Select for bulk action' : 'This Master Contract cannot be selected for bulk action in its current status'}
                  />
                </td>
                <td className="left sticky-col sticky-2">
                  <StatusCell status={mc.status} />
                </td>
                <td className="left sticky-col sticky-3">
                  <button className="tbl-link" type="button" onClick={() => onOpenChild(mc)}>
                    {mc.mcNumber}
                  </button>
                </td>
                <td className="left">{mc.mcReference}</td>
                <td className="left">{mc.dealId ? <span className="deal-id">{mc.dealId}</span> : <Dash />}</td>
                <td className="left">{mc.originEntity}</td>
                <td className="left">{mc.entityId}</td>
                <td className="left">{mc.entities.join('-')}</td>
                <td className="left">{mc.fxModel}</td>
                <td className="left">{mc.modelDesc}</td>
                <td className="left">{mc.commodityCode}</td>
                <td className="left">{mc.commodityDesc}</td>
                <td>{fmtDate(mc.mcDate)}</td>
                <td className="num">{fmtNum(mc.amtUSD)}</td>
                <td className="num">{fmtNum(mc.amtOrigin)}</td>
                <td className="left">{mc.currOrigin}</td>
                <td className="num">{mc.exRate.toFixed(4)}</td>
                <td className="left">{mc.currId}</td>
                <td className="left">{mc.currChain.join('-')}</td>
                <td className="left">{mc.paymentTerms}</td>
                <td>{fmtDate(mc.paymentDate)}</td>
                <td>{fmtDate(mc.shipStart)}</td>
                <td>{fmtDate(mc.shipEnd)}</td>
                <td className="left">{mc.portOfShipment}</td>
                <td className="left">{mc.portOfDestination}</td>
                <td className="num">{fmtNum(mc.utilizedAmt)}</td>
                <td className="left">{mc.moRemarks || <Dash />}</td>
                <td className="left">{mc.foRemarks || <Dash />}</td>
                <td className="left">{mc.enteredBy}</td>
                <td className="left">{fmtDateTime(mc.enteredOn, mc.entryTime)}</td>
                <td className="left">{mc.changedBy || <Dash />}</td>
                <td className="left">{mc.changedOn ? fmtDate(mc.changedOn) : <Dash />}</td>
                <td className="left">
                  <button className="rowaction-btn" type="button" onClick={() => onEdit(mc)}>
                    Edit
                  </button>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
