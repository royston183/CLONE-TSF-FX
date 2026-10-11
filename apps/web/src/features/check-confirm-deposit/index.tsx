import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDetails } from '../../shared/ui/ConfirmDetails.tsx'
import type { CSSProperties } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  calcInterestRate,
  calcNetDeposit,
  calcTotalInterest,
  isoToDMY,
  money,
  parseAmount,
  parseDMY,
  rateFmt,
  statusBadgeClass,
} from './calc.ts'
import { EDIT_COLUMNS, MAIN_COLUMNS } from './columns.ts'
import { DUMMY_PAYLOAD } from './data.ts'
import type { DepositRecord, Toast } from './types.ts'
import './check-confirm-deposit.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './check-confirm-deposit.dark.css'

const VERSION = 'v8'
const PAGE_SIZE = 12
const READY_STATUS = 'Ready - ' + VERSION

type SortState = { index: number; direction: 'asc' | 'desc' }

/** The edit modal holds raw strings, as the original's input cells did. */
type EditDraft = {
  tradeValue: string
  startDate: string
  refInterestRate: string
  spreadRate: string
  noOfDays: string
}

/** The topbar's two groups. The original had no flex container for either, because it
 *  carried neither a Back nor a Sign out control. */
const GROUP: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }

function CalcRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-line">
      <div className="detail-label">{label}</div>
      <div className="detail-value size-md">
        <span className="code">{value}</span>
      </div>
    </div>
  )
}

export default function CheckConfirmDepositApp() {
  const [records, setRecords] = useState<DepositRecord[]>(() => DUMMY_PAYLOAD.records.map((r) => ({ ...r })))
  const [companyCode, setCompanyCode] = useState('')
  const [keyDateText, setKeyDateText] = useState('')
  // The legacy text field only reacted on change (i.e. on blur), so the results follow the
  // committed date rather than every keystroke.
  const [keyDate, setKeyDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [txnFilter, setTxnFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedTxn, setSelectedTxn] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [statusText, setStatusText] = useState(READY_STATUS)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  function pushToast(message: string, kind: Toast['kind']) {
    const id = (toastId.current += 1)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }

  function closeAllModals() {
    setEditDraft(null)
    setCalcOpen(false)
    setConfirmOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllModals()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const showResults = companyCode !== '' && keyDate !== ''

  const baseRows = useMemo(
    () => records.filter((r) => r.companyCode === companyCode),
    [records, companyCode],
  )

  const txnOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of baseRows) if (r.transactionNo) seen.add(r.transactionNo)
    return [...seen].sort()
  }, [baseRows])

  const filteredRows = useMemo(() => {
    // No status chosen means Contract only — the original's default, not "all".
    const effectiveStatus = statusFilter || 'Contract'
    return baseRows.filter(
      (r) => (!txnFilter || r.transactionNo === txnFilter) && r.status === effectiveStatus,
    )
  }, [baseRows, txnFilter, statusFilter])

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const col = MAIN_COLUMNS[sort.index]
    if (!col) return filteredRows
    const direction = sort.direction
    return [...filteredRows].sort((a, b) => {
      let av: string | number = col.value(a)
      let bv: string | number = col.value(b)
      if (col.number) {
        av = Number(av) || 0
        bv = Number(bv) || 0
      } else {
        av = String(av).toLowerCase()
        bv = String(bv).toLowerCase()
      }
      if (av < bv) return direction === 'asc' ? -1 : 1
      if (av > bv) return direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredRows, sort])

  const pages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = sortedRows.slice(start, Math.min(start + PAGE_SIZE, sortedRows.length))

  const selected = records.find((r) => r.transactionNo === selectedTxn) ?? null

  function applyBasicSelection(nextCompanyCode: string, nextKeyDate: string) {
    setPage(1)
    if (nextCompanyCode && nextKeyDate) {
      setStatusText('Records loaded for ' + nextCompanyCode + ' as of ' + nextKeyDate)
    } else {
      setSelectedTxn('')
      setStatusText('Enter Company Code and Key Date')
    }
  }

  function onCompanyCodeChange(value: string) {
    setCompanyCode(value)
    applyBasicSelection(value, keyDate)
  }

  function commitKeyDate(value: string) {
    setKeyDate(value)
    applyBasicSelection(companyCode, value)
  }

  function onNativeDateChange(iso: string) {
    if (!iso) return
    const dmy = isoToDMY(iso)
    setKeyDateText(dmy)
    commitKeyDate(dmy)
  }

  function toggleSort(index: number) {
    setSort((current) =>
      current && current.index === index && current.direction === 'asc'
        ? { index, direction: 'desc' }
        : { index, direction: 'asc' },
    )
    setPage(1)
  }

  function updateRecord(transactionNo: string, patch: Partial<DepositRecord>) {
    setRecords((current) =>
      current.map((r) => (r.transactionNo === transactionNo ? { ...r, ...patch } : r)),
    )
  }

  function onRefresh() {
    // The original called location.reload(); inside the shell that would tear down the SPA,
    // so the screen returns to its starting state instead.
    setRecords(DUMMY_PAYLOAD.records.map((r) => ({ ...r })))
    setCompanyCode('')
    setKeyDateText('')
    setKeyDate('')
    setFiltersOpen(false)
    setTxnFilter('')
    setStatusFilter('')
    setSelectedTxn('')
    setPage(1)
    setSort(null)
    closeAllModals()
    setToasts([])
    setStatusText(READY_STATUS)
  }

  function onSettle() {
    if (!selected) return
    if (selected.status === 'Contract Settlement') {
      pushToast('This deposit is already settled.', 'warning')
      return
    }
    setConfirmOpen(true)
  }

  function onConfirmYes() {
    setConfirmOpen(false)
    if (!selected) return
    updateRecord(selected.transactionNo, { status: 'Contract Settlement' })
    pushToast('Deposit ' + selected.transactionNo + ' has been settled successfully.', 'success')
    setStatusText('Deposit ' + selected.transactionNo + ' settled')
    setSelectedTxn('')
  }

  function onSendForApproval() {
    if (!selected) return
    updateRecord(selected.transactionNo, { sentForApproval: true })
    pushToast('Approval request for ' + selected.transactionNo + ' has been sent to the approver.', 'success')
    setStatusText('Approval requested for ' + selected.transactionNo)
  }

  function onEdit() {
    if (!selected) return
    setEditDraft({
      tradeValue: money(selected.tradeValue),
      startDate: selected.startDate,
      refInterestRate: rateFmt(selected.refInterestRate),
      spreadRate: rateFmt(selected.spreadRate),
      noOfDays: String(selected.noOfDays),
    })
  }

  function onEditSave() {
    if (!selected || !editDraft) return
    const patch: Partial<DepositRecord> = {
      tradeValue: parseAmount(editDraft.tradeValue),
      refInterestRate: Number(editDraft.refInterestRate) || 0,
      spreadRate: Number(editDraft.spreadRate) || 0,
      noOfDays: Number(editDraft.noOfDays) || 0,
    }
    // An unparseable date is left alone rather than written back, as in the original.
    if (parseDMY(editDraft.startDate)) patch.startDate = editDraft.startDate
    updateRecord(selected.transactionNo, patch)
    setEditDraft(null)
    pushToast('Deposit ' + selected.transactionNo + ' details updated successfully.', 'success')
    setStatusText('Deposit ' + selected.transactionNo + ' updated')
  }

  const draftFigures = editDraft
    ? {
        tradeValue: parseAmount(editDraft.tradeValue),
        refInterestRate: Number(editDraft.refInterestRate) || 0,
        spreadRate: Number(editDraft.spreadRate) || 0,
        noOfDays: Number(editDraft.noOfDays) || 0,
      }
    : null

  // The original shows a three page window around the current page.
  const pageEnd = Math.min(pages, Math.max(1, currentPage - 1) + 2)
  const pageStart = Math.max(1, pageEnd - 2)
  const pageNumbers: number[] = []
  for (let p = pageStart; p <= pageEnd; p++) pageNumbers.push(p)

  return (
    <div className="ccdeposit">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div style={GROUP}>
              <BackButton className="refresh-btn" />
              <div className="title">Check and Confirm Deposit</div>
            </div>
            <div style={GROUP}>
              <button id="refreshBtn" className="refresh-btn" type="button" onClick={onRefresh}>
                &#8635; Refresh
              </button>
              <SignOutButton className="refresh-btn" />
            </div>
          </div>
        </div>
        <div className="content">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Basic Selection</div>
              <div className="card-meta">Required</div>
            </div>
            <div className="card-body">
              <div className="selection-main-row">
                <div className="field structure-field cc-field">
                  <label htmlFor="ccCompanyCode">Company Code</label>
                  <select
                    id="ccCompanyCode"
                    className="select"
                    value={companyCode}
                    onChange={(e) => onCompanyCodeChange(e.target.value)}
                  >
                    <option value="">Select Company Code</option>
                    {DUMMY_PAYLOAD.companyCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field structure-field date-field">
                  <label htmlFor="ccKeyDate">Key Date</label>
                  <div className="date-input-wrap">
                    <input
                      id="ccKeyDate"
                      className="input"
                      type="text"
                      placeholder="DD-MM-YYYY"
                      value={keyDateText}
                      onChange={(e) => setKeyDateText(e.target.value)}
                      onBlur={(e) => commitKeyDate(e.target.value)}
                    />
                    <div className="calendar-btn-wrap">
                      <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true"></button>
                      <input
                        id="ccKeyDateNative"
                        className="calendar-native"
                        type="date"
                        aria-label="Open calendar"
                        onChange={(e) => onNativeDateChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <button
                  id="filterToggle"
                  className="filter-icon-btn"
                  type="button"
                  title="Filters"
                  aria-label="Filters"
                  onClick={() => setFiltersOpen((open) => !open)}
                ></button>
                <div id="filterBody" className={filtersOpen ? 'filter-body open' : 'filter-body'}>
                  <div className="filter-item">
                    <select
                      id="txnNoFilter"
                      className="select compact-filter"
                      value={txnFilter}
                      onChange={(e) => {
                        setTxnFilter(e.target.value)
                        setPage(1)
                      }}
                    >
                      <option value="">Transaction No.</option>
                      {txnOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="statusFilter"
                      className="select medium-filter"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value)
                        setPage(1)
                      }}
                    >
                      <option value="">Status</option>
                      {DUMMY_PAYLOAD.statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    id="clearFilters"
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setTxnFilter('')
                      setStatusFilter('')
                      setPage(1)
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div id="resultsArea" style={{ display: showResults ? 'block' : 'none' }}>
            <div className="toolbar">
              <div className="toolbar-right">
                <button
                  id="settleBtn"
                  className="btn btn-primary"
                  type="button"
                  disabled={!selected}
                  onClick={onSettle}
                >
                  Confirm/Settle
                </button>
                <button id="editBtn" className="btn btn-ghost" type="button" disabled={!selected} onClick={onEdit}>
                  Edit
                </button>
                <button
                  id="viewCalcBtn"
                  className="btn btn-ghost"
                  type="button"
                  disabled={!selected}
                  onClick={() => setCalcOpen(true)}
                >
                  View Deposit Calculation
                </button>
                <button
                  id="approvalBtn"
                  className="btn btn-ghost"
                  type="button"
                  disabled={!selected || selected.sentForApproval === true}
                  onClick={onSendForApproval}
                >
                  Send for Approval
                </button>
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">Deposit Overview</div>
                <div className="card-meta" id="rowCountMeta">
                  {filteredRows.length} record(s)
                </div>
              </div>
              <div className="table-wrap">
                <table id="mainTable" className="data-table">
                  <thead id="mainHead">
                    <tr>
                      <th style={{ width: '42px' }}>Select</th>
                      {MAIN_COLUMNS.map((c, i) => (
                        <th
                          key={c.label}
                          data-index={i}
                          style={{ width: c.width + 'px' }}
                          className={sort && sort.index === i ? 'sort-' + sort.direction : ''}
                          onClick={() => toggleSort(i)}
                        >
                          {c.label}
                          <span className="sort-arrows">
                            <span className="sort-up"></span>
                            <span className="sort-down"></span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="mainBody">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={MAIN_COLUMNS.length + 1} className="empty">
                          No records match the current filters.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((r) => (
                        <tr
                          key={r.transactionNo}
                          data-record={r.transactionNo}
                          className={r.transactionNo === selectedTxn ? 'selected' : ''}
                          onClick={() => setSelectedTxn(r.transactionNo)}
                        >
                          <td>
                            <input
                              type="radio"
                              name="recordPick"
                              value={r.transactionNo}
                              checked={r.transactionNo === selectedTxn}
                              onChange={() => setSelectedTxn(r.transactionNo)}
                            />
                          </td>
                          {MAIN_COLUMNS.map((c) => {
                            const val = c.value(r)
                            return (
                              <td key={c.label} className={c.number ? 'number' : ''}>
                                {c.badge ? (
                                  <span className={statusBadgeClass(String(val))}>{val}</span>
                                ) : c.rate ? (
                                  rateFmt(Number(val))
                                ) : c.number ? (
                                  money(Number(val))
                                ) : (
                                  val
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div id="paginationBar" className="pagination-bar">
                <button
                  className="page-btn"
                  data-page="prev"
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    className={p === currentPage ? 'page-btn active' : 'page-btn'}
                    data-page={p}
                    type="button"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="page-btn"
                  data-page="next"
                  type="button"
                  disabled={currentPage === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="editModal" className={editDraft ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Edit Deposit</div>
            <button id="editClose" className="modal-close" type="button" onClick={() => setEditDraft(null)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Deposit Details</div>
                <div className="card-meta">Selected Record</div>
              </div>
              <div id="editSummary" className="card-body">
                {selected ? (
                  <div className="detail-grid">
                    <CalcRow label="Transaction" value={selected.transactionNo} />
                    <CalcRow label="Company Code" value={selected.companyCode} />
                    <CalcRow label="Bank Name" value={selected.bankName} />
                    <CalcRow label="Currency" value={selected.currency} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">Editable Values</div>
              </div>
              <div className="table-wrap">
                <table id="editTable" className="edit-table">
                  <thead id="editHead">
                    <tr>
                      {EDIT_COLUMNS.map((c, i) => (
                        <th key={c.label} data-index={i} style={{ width: c.width + 'px' }}>
                          {c.label}
                          <span className="sort-arrows">
                            <span className="sort-up"></span>
                            <span className="sort-down"></span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="editBody">
                    {editDraft && draftFigures ? (
                      <tr>
                        <td className="editable">
                          <input
                            id="editTradeValue"
                            className="cell-input money"
                            type="text"
                            value={editDraft.tradeValue}
                            onChange={(e) => setEditDraft({ ...editDraft, tradeValue: e.target.value })}
                          />
                        </td>
                        <td className="editable">
                          <input
                            id="editStartDate"
                            className="cell-input"
                            type="text"
                            value={editDraft.startDate}
                            onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                          />
                        </td>
                        <td className="editable">
                          <input
                            id="editRefRate"
                            className="cell-input money"
                            type="text"
                            value={editDraft.refInterestRate}
                            onChange={(e) => setEditDraft({ ...editDraft, refInterestRate: e.target.value })}
                          />
                        </td>
                        <td className="editable">
                          <input
                            id="editSpreadRate"
                            className="cell-input money"
                            type="text"
                            value={editDraft.spreadRate}
                            onChange={(e) => setEditDraft({ ...editDraft, spreadRate: e.target.value })}
                          />
                        </td>
                        <td className="editable">
                          <input
                            id="editNoOfDays"
                            className="cell-input"
                            type="text"
                            value={editDraft.noOfDays}
                            onChange={(e) => setEditDraft({ ...editDraft, noOfDays: e.target.value })}
                          />
                        </td>
                        <td id="editNetDeposit" className="money">
                          {money(calcNetDeposit(draftFigures))}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button id="editCancel" className="btn btn-ghost" type="button" onClick={() => setEditDraft(null)}>
              Cancel
            </button>
            <button id="editSave" className="btn btn-primary" type="button" onClick={onEditSave}>
              Save
            </button>
          </div>
        </div>
      </div>

      <div id="calcModal" className={calcOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">View Deposit Calculation</div>
            <button id="calcClose" className="modal-close" type="button" onClick={() => setCalcOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div id="calcBody" className="card-body">
              {selected ? (
                <div className="detail-grid">
                  <CalcRow label="Transaction" value={selected.transactionNo} />
                  <CalcRow label="Trade Value" value={money(selected.tradeValue) + ' ' + selected.currency} />
                  <CalcRow label="Ref. Interest Rate" value={rateFmt(selected.refInterestRate) + ' %'} />
                  <CalcRow label="Spread Rate" value={rateFmt(selected.spreadRate) + ' %'} />
                  <CalcRow label="Interest Rate" value={rateFmt(calcInterestRate(selected)) + ' %'} />
                  <CalcRow label="No Of Days" value={String(selected.noOfDays)} />
                  <CalcRow
                    label="Total Interest Amount"
                    value={money(calcTotalInterest(selected)) + ' ' + selected.currency}
                  />
                  <CalcRow label="Net Deposit Amt" value={money(calcNetDeposit(selected)) + ' ' + selected.currency} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="modal-foot">
            <button id="calcOkay" className="btn btn-primary" type="button" onClick={() => setCalcOpen(false)}>
              Okay
            </button>
          </div>
        </div>
      </div>

      <div id="confirmModal" className={confirmOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Confirm Action</div>
            <button id="confirmClose" className="modal-close" type="button" onClick={() => setConfirmOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div id="confirmMessage">
              <div className="confirm-text">Are you sure you want to confirm/settle this deposit?</div>
              {selected ? (
                <ConfirmDetails
                  rows={[
                    { label: 'Transaction No', value: selected.transactionNo },
                    { label: 'Deal ID', value: selected.dealId },
                    { label: 'Company', value: selected.companyName },
                    { label: 'Bank', value: selected.bankName },
                    { label: 'Trade Value', value: `${selected.currency} ${selected.tradeValue}` },
                    { label: 'Start Date', value: selected.startDate },
                    { label: 'No. of Days', value: String(selected.noOfDays) },
                  ]}
                />
              ) : null}
            </div>
          </div>
          <div className="modal-foot">
            <button id="confirmNo" className="btn btn-ghost" type="button" onClick={() => setConfirmOpen(false)}>
              No
            </button>
            <button id="confirmYes" className="btn btn-primary" type="button" onClick={onConfirmYes}>
              Yes
            </button>
          </div>
        </div>
      </div>

      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.kind === 'information' ? 'toast ' : 'toast ' + t.kind}>
            <div className="toast-icon">{t.kind === 'success' ? 'OK' : 'i'}</div>
            <div>
              <div className="toast-title">
                {t.kind === 'success' ? 'Success' : t.kind === 'warning' ? 'Warning' : 'Information'}
              </div>
              <div className="toast-message">{t.message}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="statusbar">
        <span className="status-dot"></span>
        <span id="statusText">{statusText}</span>
      </div>
    </div>
  )
}
