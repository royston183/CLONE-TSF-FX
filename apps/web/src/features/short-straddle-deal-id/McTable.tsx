import type { DragEvent, MouseEvent } from 'react'
import { CANCELLED_DEAL_STATUS, STATUS_CLASS } from './data.ts'
import { fmtDate, fmtDateTime, fmtNum } from './format.ts'
import { computeAmounts, dealsForMc, payTermLabel, statusLabel } from './logic.ts'
import type { Deal, MasterContract } from './types.ts'

const DASH = <span className="muted-dash">–</span>

const HEADERS: Array<[string, boolean]> = [
  ['MC Description', true],
  ['Origin Entity', true],
  ['Entity ID', true],
  ['Entity String', true],
  ['FX Model', true],
  ['Model Description', true],
  ['Commodity', true],
  ['Comm Desc', true],
  ['MC Date', false],
  ['MC Amt(USD)', false],
  ['MC Amt(Origin)', false],
  ['Origin Curr', true],
  ['Exchange Rate', false],
  ['Currency ID', true],
  ['Currency String', true],
  ['Payment Terms', true],
  ['Ship Start', false],
  ['Ship End', false],
  ['Port of Shipment', true],
  ['Port of Destination', true],
  ['Uti-Deal ID Amt(USD)', false],
  ['MC Balance Amt(USD)', false],
  ['Expiry Amount', false],
  ['Deal ID(s)', true],
  ['MO Remarks', true],
  ['FO Remarks', true],
  ['Document Date', false],
  ['Source Path', true],
  ['Created By / On', true],
  ['Changed By / On', true],
]

/** The ALV result list: single-row selection, two hotspots, the selected row draggable. */
export function McTable({
  rows,
  deals,
  selected,
  draggingRef,
  onSelect,
  onOpenDetail,
  onOpenBreakdown,
  onDragStart,
  onDragEnd,
}: {
  rows: MasterContract[]
  deals: Deal[]
  selected: number | null
  draggingRef: number | null
  onSelect: (mcRef: number) => void
  onOpenDetail: (mcRef: number) => void
  onOpenBreakdown: (mcRef: number) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, mcRef: number) => void
  onDragEnd: () => void
}) {
  const hotspot = (e: MouseEvent, open: () => void) => {
    e.stopPropagation()
    open()
  }

  return (
    <table className="list-table" id="mc-table">
      <thead>
        <tr>
          <th className="sticky-col sticky-1" />
          <th className="left sticky-col sticky-2">MC Status</th>
          <th className="left sticky-col sticky-3">MC Ref No</th>
          {HEADERS.map(([label, left]) => (
            <th key={label} className={left ? 'left' : undefined}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={33}>No Master Contracts match the selection criteria.</td>
          </tr>
        ) : (
          rows.map((mc) => {
            const a = computeAmounts(mc, deals)
            const mcDeals = dealsForMc(deals, mc.mcRef)
            const isSelected = mc.mcRef === selected
            const cls = [isSelected ? 'row-selected' : '', draggingRef === mc.mcRef ? 'dragging-row' : ''].filter(Boolean).join(' ')
            return (
              <tr
                key={mc.mcRef}
                className={cls || undefined}
                draggable={isSelected}
                onClick={(e) => {
                  // A click on either hotspot button is not a row selection.
                  if ((e.target as HTMLElement).closest('button')) return
                  onSelect(mc.mcRef)
                }}
                onDragStart={(e) => onDragStart(e, mc.mcRef)}
                onDragEnd={onDragEnd}
              >
                <td className="sticky-col sticky-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    title="Select this row, then drag it onto Create Deal ID / Reverse MC"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onSelect(mc.mcRef)}
                  />
                </td>
                <td className="left sticky-col sticky-2">
                  <span data-status={mc.mcStat} className={`status-cell ${STATUS_CLASS[mc.mcStat] ?? ''}`}>{statusLabel(mc.mcStat)}</span>
                </td>
                <td className="left sticky-col sticky-3">
                  <button className="tbl-link" type="button" onClick={(e) => hotspot(e, () => onOpenDetail(mc.mcRef))}>
                    {mc.mcRef}
                  </button>
                </td>
                <td className="left">{mc.mcDesc}</td>
                <td className="left">{mc.origin}</td>
                <td className="left">{mc.entityId}</td>
                <td className="left">{mc.entityDesc}</td>
                <td className="left">{mc.fxModel}</td>
                <td className="left">{mc.modelDesc}</td>
                <td className="left">{mc.commodityCode}</td>
                <td className="left">{mc.commodityDesc}</td>
                <td>{fmtDate(mc.mcDate)}</td>
                <td className="num">{fmtNum(mc.amtUSD)}</td>
                <td className="num">{fmtNum(mc.amtOrigin)}</td>
                <td className="left">{mc.origCurr}</td>
                <td className="num">{mc.exRate.toFixed(4)}</td>
                <td className="left">{mc.currId}</td>
                <td className="left">{mc.currDesc}</td>
                <td className="left">{payTermLabel(mc.payTerms)}</td>
                <td>{fmtDate(mc.shipStart)}</td>
                <td>{fmtDate(mc.shipEnd)}</td>
                <td className="left">{mc.pos}</td>
                <td className="left">{mc.pod}</td>
                <td className="num">
                  <button className="tbl-link" type="button" onClick={(e) => hotspot(e, () => onOpenBreakdown(mc.mcRef))}>
                    {fmtNum(a.uti)}
                  </button>
                </td>
                <td className="num">{fmtNum(a.bal)}</td>
                <td className={`num ${a.exp > 0 ? 'exp-amt' : 'zero-amt'}`}>{fmtNum(a.exp)}</td>
                <td className="left">
                  {mcDeals.length ? (
                    mcDeals.map((d) => d.dealId + (d.dealStat === CANCELLED_DEAL_STATUS ? ' (cancelled)' : '')).join(', ')
                  ) : (
                    <span className="muted-dash">– none yet</span>
                  )}
                </td>
                <td className="left">{mc.moRemarks || DASH}</td>
                <td className="left">{mc.foRemarks || DASH}</td>
                <td>{fmtDate(mc.docDate)}</td>
                <td className="left">{mc.sourcePath}</td>
                <td className="left">
                  {mc.createdBy}, {fmtDateTime(mc.createdOn, mc.createdTime)}
                </td>
                <td className="left">{mc.changedBy ? `${mc.changedBy}, ${fmtDate(mc.changedOn)}` : DASH}</td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
