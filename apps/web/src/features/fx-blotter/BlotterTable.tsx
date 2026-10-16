import type { DragEvent, MouseEvent, ReactNode } from 'react'
import { txnTypeOf } from './data.ts'
import { fmtDate, fmtNum, RATE_DP } from './format.ts'
import { CommitInput } from './inputs.tsx'
import {
  STATUS_CLASS,
  STATUS_LABEL,
  assignmentOptions,
  bpOptions,
  bsOptions,
  businessAreaOptions,
  canReverse,
  currOptions,
  entityOptions,
  fixingRefOptions,
  hasDraftValue,
  isCompletelyBlankDraft,
  portfolioOptions,
  profitCenterOptions,
  txnTypeOptions,
} from './logic.ts'
import type { BlotterRow, BusinessPartner, DateField, NumField, Option, Sort, SortKey, TextField } from './types.ts'

const DASH = <span className="muted-dash">–</span>

export type TableHandlers = {
  onSort: (key: SortKey) => void
  onToggleAll: (on: boolean) => void
  onToggleCheck: (id: string, on: boolean) => void
  onRowClick: (e: MouseEvent<HTMLTableRowElement>, id: string) => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, id: string) => void
  onDragEnd: () => void
  onField: (id: string, field: TextField | NumField, value: string) => void
  onDate: (id: string, field: DateField, value: string) => void
  onView: (id: string) => void
  onDelete: (id: string) => void
  onReverse: (id: string) => void
  onViewMc: (mcNumber: string) => void
}

/**
 * The FX Deal Input grid (#fx-table). Draft rows are edited in place — selects commit on
 * change, text boxes when left — and everything else shows read-only values.
 */
export function BlotterTable({
  rows,
  checked,
  locked,
  partners,
  sort,
  draggingId,
  allChecked,
  h,
}: {
  rows: BlotterRow[]
  checked: string[]
  locked: boolean
  partners: BusinessPartner[]
  sort: Sort
  draggingId: string | null
  allChecked: boolean
  h: TableHandlers
}) {
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '')
  const sortTh = (key: SortKey, label: ReactNode, cls: string) => (
    <th className={cls} onClick={() => h.onSort(key)}>
      {label}{' '}
      <span className="arrow" id={`sort-${key}`}>
        {arrow(key)}
      </span>
    </th>
  )

  return (
    <table className="list-table" id="fx-table">
      <thead>
        <tr>
          <th className="sticky-col sticky-1">
            <input
              type="checkbox"
              id="chk-all"
              checked={allChecked}
              disabled={rows.length === 0}
              onChange={(e) => h.onToggleAll(e.target.checked)}
            />
          </th>
          <th className="left sticky-col sticky-2">Status</th>
          {sortTh('transactionNumber', 'RFHA / Draft', 'left sortable sticky-col sticky-3')}
          <th className="left">Deal ID</th>
          {sortTh('tradeDate', <>Trade Date<span className="req">*</span></>, 'sortable')}
          <th className="left">
            Company Code<span className="req">*</span>
          </th>
          <th className="left">
            Bank BP<span className="req">*</span>
          </th>
          <th className="left">
            Txn Type<span className="req">*</span>
          </th>
          <th className="left">B/S 1</th>
          <th className="left">
            Curr 1<span className="req">*</span>
          </th>
          <th className="num">
            Amount 1<span className="req">*</span>
          </th>
          <th className="left">B/S 2</th>
          <th className="left">
            Curr 2<span className="req">*</span>
          </th>
          <th className="num">Amount 2</th>
          <th className="num">
            All in Rate<span className="req">*</span>
          </th>
          <th className="num">Swap</th>
          <th className="num">Spot</th>
          {sortTh('valueDate', <>Value Date<span className="req">*</span></>, 'sortable')}
          <th className="left">Mode of Trade</th>
          <th className="left">Acc Category</th>
          <th className="left">Profit Center</th>
          <th className="left">Unit(BA)</th>
          <th>NDF Fixing Date</th>
          <th className="left">NDF Fixing Ref</th>
          <th className="left">MC Ref</th>
          <th className="left">Deal Type</th>
          <th className="left">Notes</th>
          <th className="left">Actions</th>
        </tr>
      </thead>
      <tbody id="fx-tbody">
        {rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={28}>No transactions match the current filters. Load a blotter context or add a new row.</td>
          </tr>
        ) : (
          rows.map((r) => (
            <Row
              key={r.id}
              r={r}
              checked={checked.includes(r.id)}
              editable={r.status === 'DRAFT' && !locked}
              dragging={draggingId === r.id}
              partners={partners}
              h={h}
            />
          ))
        )}
      </tbody>
    </table>
  )
}

function Row({
  r,
  checked,
  editable,
  dragging,
  partners,
  h,
}: {
  r: BlotterRow
  checked: boolean
  editable: boolean
  dragging: boolean
  partners: BusinessPartner[]
  h: TableHandlers
}) {
  const tt = txnTypeOf(r.txnType)
  const isDraft = r.status === 'DRAFT'
  const cls = [
    isDraft && 'row-draft',
    r.status === 'REVERSED' && 'row-reversed',
    checked && 'row-checked',
    dragging && 'dragging',
  ]
    .filter(Boolean)
    .join(' ')

  // The original's cellEditable(row, field, type, opts).
  const select = (field: TextField, options: Option[]): ReactNode => {
    if (!editable) return plain(r[field])
    return (
      <select className="cell-select" value={r[field]} onChange={(e) => h.onField(r.id, field, e.target.value)}>
        {r[field] === '' ? <option value="">Select...</option> : null}
        {options.map((o, i) => (
          <option key={`${i}:${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  const date = (field: DateField): ReactNode => {
    if (!editable) return r[field] ? fmtDate(r[field]) : DASH
    return <CommitInput className="cell-input" value={fmtDate(r[field])} onCommit={(v) => h.onDate(r.id, field, v)} />
  }
  // The All in Rate cell reads back at 4 decimals; the other number cells as entered.
  const numIn = (field: NumField) => (
    <CommitInput
      className="cell-input num-in"
      value={field === 'totalRate' && r[field] !== '' ? fmtNum(r[field], RATE_DP) : String(r[field])}
      onCommit={(v) => h.onField(r.id, field, v)}
    />
  )

  return (
    <tr
      className={cls}
      data-row-id={r.id}
      draggable
      onClick={(e) => h.onRowClick(e, r.id)}
      onDragStart={(e) => h.onDragStart(e, r.id)}
      onDragEnd={h.onDragEnd}
    >
      <td className="sticky-col sticky-1">
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => h.onToggleCheck(r.id, e.target.checked)}
        />
      </td>
      <td className="left sticky-col sticky-2">
        <span className={`status-cell ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      </td>
      <td className="left sticky-col sticky-3">
        {isDraft ? (
          isCompletelyBlankDraft(r) ? (
            DASH
          ) : (
            <span className="muted-dash">{r.draftLabel}</span>
          )
        ) : (
          r.transactionNumber
        )}
      </td>
      <td className="left">{r.dealId ? <span className="deal-id">{r.dealId}</span> : DASH}</td>
      <td>{date('tradeDate')}</td>
      <td className="left">{select('entity', entityOptions())}</td>
      <td className="left">{select('bp', bpOptions(partners))}</td>
      <td className="left">
        {select('txnType', txnTypeOptions())}
        {tt?.ndf ? (
          <>
            {' '}
            <span className="tag tag-ndf">NDF</span>
          </>
        ) : null}
      </td>
      <td className="left">{select('buySell', bsOptions())}</td>
      <td className="left">{select('curr1', currOptions())}</td>
      <td className="num">{editable ? numIn('amt1') : fmtNum(r.amt1)}</td>
      <td className="left">{select('buySell2', bsOptions())}</td>
      <td className="left">{select('curr2', currOptions())}</td>
      <td className="num">
        {isDraft && !hasDraftValue(r.amt2) ? <span className="computed-empty" /> : fmtNum(r.amt2)}
      </td>
      <td className="num">{editable ? numIn('totalRate') : fmtNum(r.totalRate, 4)}</td>
      <td className="num">{editable ? numIn('swapPoints') : fmtNum(r.swapPoints, 2)}</td>
      <td className="num">
        {isDraft && !hasDraftValue(r.spotRate) ? <span className="computed-empty" /> : fmtNum(r.spotRate, 4)}
      </td>
      <td>{date('valueDate')}</td>
      <td className="left">{select('assignment', assignmentOptions())}</td>
      <td className="left">{select('portfolio', portfolioOptions())}</td>
      <td className="left">{select('profitCenter', profitCenterOptions())}</td>
      <td className="left">{select('businessArea', businessAreaOptions())}</td>
      <td>{tt?.ndf ? date('ndfDate') : DASH}</td>
      <td className="left">{tt?.ndf ? select('ndfRef', fixingRefOptions()) : DASH}</td>
      <td className="left">
        {r.mcRef ? (
          <button
            type="button"
            className="mc-ref"
            onClick={(e) => {
              e.stopPropagation()
              h.onViewMc(r.mcRef)
            }}
          >
            {r.mcRef}
          </button>
        ) : (
          DASH
        )}
      </td>
      <td className="left">{r.dealType || DASH}</td>
      <td className="left">{r.notes ? <span title={r.notes}>Note</span> : DASH}</td>
      <td className="left" style={{ display: 'flex', gap: 4 }}>
        <RowAction disabled={!r.transactionNumber} onClick={() => h.onView(r.id)}>
          View
        </RowAction>
        {isDraft ? <RowAction onClick={() => h.onDelete(r.id)}>Del</RowAction> : null}
        {canReverse(r) ? <RowAction onClick={() => h.onReverse(r.id)}>Rev</RowAction> : null}
      </td>
    </tr>
  )
}

function plain(v: string): ReactNode {
  return v === '' ? DASH : v
}

function RowAction({
  disabled = false,
  onClick,
  children,
}: {
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="rowaction-btn"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}
