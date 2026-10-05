import type { DragEvent, MouseEvent } from 'react'
import { STATUS_KEY, STATUS_SHORT } from './data.ts'
import { fmtDate, fmtNum, fmtRate } from './format.ts'
import { isActionable, selectAllState } from './logic.ts'
import type { Sort, SortKey, StatusValue, Txn } from './types.ts'

const STATUS_CLASS = { ERRCORR: 'st-errcorr', RESUB: 'st-resub', REVERSED: 'st-reversed', OPEN: 'st-open' } as const

export function StatusCell({ status }: { status: StatusValue }) {
  return <span className={`status-cell ${STATUS_CLASS[STATUS_KEY[status]]}`}>{STATUS_SHORT[status]}</span>
}

const Dash = () => <span className="muted-dash">–</span>

/** Clicks on the row's own controls keep their behaviour and never toggle its selection. */
const isControlClick = (e: MouseEvent) =>
  e.target instanceof Element && e.target.closest('button,input,a,select,textarea,label') !== null

export function TxnTable({
  rows,
  sort,
  checked,
  draggingRow,
  onSort,
  onToggleRow,
  onCheck,
  onCheckAll,
  onOpen,
  onReverse,
  onDragStart,
  onDragEnd,
}: {
  /** The current page only. */
  rows: Txn[]
  sort: Sort
  checked: readonly string[]
  draggingRow: string | null
  onSort: (key: SortKey) => void
  onToggleRow: (t: Txn) => void
  onCheck: (t: Txn, checked: boolean) => void
  onCheckAll: (checked: boolean) => void
  onOpen: (t: Txn) => void
  onReverse: (t: Txn) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, t: Txn) => void
  onDragEnd: () => void
}) {
  const all = selectAllState(rows, checked)

  const arrow = (key: SortKey) => (
    <span className="arrow" id={`sort-${key}`}>
      {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </span>
  )

  return (
    <table className="list-table" id="mc-table">
      <thead>
        <tr>
          <th className="sticky-col sticky-1">
            <input
              type="checkbox"
              id="chk-all"
              title="Select all correctable rows"
              checked={all.checked}
              disabled={all.disabled}
              onChange={(e) => onCheckAll(e.target.checked)}
            />
          </th>
          <th className="left sticky-col sticky-2">Txn Status Desc</th>
          <th className="left sortable sticky-col sticky-3" onClick={() => onSort('rfha')}>
            Transaction {arrow('rfha')}
          </th>
          <th className="left sortable" onClick={() => onSort('dealId')}>
            Deal ID {arrow('dealId')}
          </th>
          <th className="left">Deal ID Description</th>
          <th className="left">Master Contract</th>
          <th className="left">CoCode</th>
          <th className="left">Company Name</th>
          <th className="left">TSF Entity</th>
          <th className="left">Product ty</th>
          <th className="left">Product Type Desc</th>
          <th className="left">Transactio</th>
          <th className="left">Transaction Type Description</th>
          <th className="left">Partner</th>
          <th className="left">Partner Name</th>
          <th className="left">Buy/Sell 1</th>
          <th className="left">Currency 1</th>
          <th>Amount 1</th>
          <th className="left">Currency 2</th>
          <th>Amount 2</th>
          <th>Spot Rate</th>
          <th>Swap Rate</th>
          <th>All in Rate</th>
          <th className="sortable" onClick={() => onSort('tradeDate')}>
            Trade Date {arrow('tradeDate')}
          </th>
          <th>Value Date</th>
          <th>Blotter Date</th>
          <th className="left">Bus. Area</th>
          <th className="left">Profit Center</th>
          <th className="left">Trader Cod</th>
          <th className="left">Trader Name</th>
          <th className="left">Mode Of Trade</th>
          <th className="left">Account Cat</th>
          <th className="left">MO Remark</th>
          <th className="left">Changed By</th>
          <th className="left">Changed On</th>
          <th className="left">Actions</th>
        </tr>
      </thead>
      <tbody id="mc-tbody">
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={35}>No transactions match the selection criteria.</td>
          </tr>
        ) : (
          rows.map((t) => {
            const eligible = isActionable(t)
            const isChecked = checked.includes(t.rfha)
            const cls = [eligible ? 'actionable-row' : '', isChecked ? 'row-checked' : '', draggingRow === t.rfha ? 'dragging-row' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={t.rfha}
                className={cls}
                draggable={eligible}
                onClick={(e) => {
                  if (!isControlClick(e)) onToggleRow(t)
                }}
                onDragStart={(e) => onDragStart(e, t)}
                onDragEnd={onDragEnd}
              >
                <td className="sticky-col sticky-1">
                  <input
                    type="checkbox"
                    disabled={!eligible}
                    checked={isChecked}
                    onChange={(e) => onCheck(t, e.target.checked)}
                    title={eligible ? 'Select for Reverse / Error Correction' : 'Only open rows can be selected'}
                  />
                </td>
                <td className="left sticky-col sticky-2">
                  <StatusCell status={t.status} />
                </td>
                <td className="left sticky-col sticky-3">
                  <button className="tbl-link" onClick={() => onOpen(t)}>
                    {t.rfha}
                  </button>
                </td>
                <td className="left">{t.dealId}</td>
                <td className="left">{t.dealIdDesc}</td>
                <td className="left">{t.mc}</td>
                <td className="left">{t.coCode}</td>
                <td className="left">{t.companyName}</td>
                <td className="left">{t.tsfEntity}</td>
                <td className="left">{t.prodType}</td>
                <td className="left">{t.prodTypeDesc}</td>
                <td className="left">{t.txnType}</td>
                <td className="left">{t.txnTypeDesc}</td>
                <td className="left">{t.partnerCode}</td>
                <td className="left">{t.partnerName}</td>
                <td className="left">{t.buySell1}</td>
                <td className="left">{t.ccy1}</td>
                <td className="num">{fmtNum(t.amt1)}</td>
                <td className="left">{t.ccy2}</td>
                <td className="num">{fmtNum(t.amt2)}</td>
                <td className="num">{fmtRate(t.spotRate)}</td>
                <td className="num">{fmtRate(t.swapRate)}</td>
                <td className="num">{fmtRate(t.allInRate)}</td>
                <td>{fmtDate(t.tradeDate)}</td>
                <td>{fmtDate(t.valueDate)}</td>
                <td>{t.blotterDate ? fmtDate(t.blotterDate) : <Dash />}</td>
                <td className="left">
                  {t.busArea} - {t.busAreaDesc}
                </td>
                <td className="left">{t.profitCenterDesc}</td>
                <td className="left">{t.traderCode}</td>
                <td className="left">{t.traderName}</td>
                <td className="left">{t.modeOfTrade}</td>
                <td className="left">{t.acctCat}</td>
                <td className="left">{t.moRemark || <Dash />}</td>
                <td className="left">{t.changedBy || <Dash />}</td>
                <td className="left">{t.changedOn ? fmtDate(t.changedOn) : <Dash />}</td>
                <td className="left">
                  {eligible ? (
                    <>
                      <button className="rowaction-btn" onClick={() => onOpen(t)}>
                        FX Error Correction
                      </button>
                      <button className="rowaction-btn danger" onClick={() => onReverse(t)}>
                        Reverse
                      </button>
                    </>
                  ) : (
                    <button className="rowaction-btn" onClick={() => onOpen(t)}>
                      View
                    </button>
                  )}
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
