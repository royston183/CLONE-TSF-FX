import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDetails } from '../../shared/ui/ConfirmDetails.tsx'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { Calendar } from './Calendar.tsx'
import { COLUMNS, PREPAYMENT_RECORDS, STATUSES } from './data.ts'
import { isValidDate, money, parseDate } from './format.ts'
import { filterRows, settledForStatus, sortRows, uniqueCompanies } from './rows.ts'
import type { SortState } from './rows.ts'
import type { PrepaymentRecord } from './types.ts'
import './check-confirm-prepayment.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './check-confirm-prepayment.dark.css'

const PAGE_SIZE = 15
const FIRST_STATUS = STATUSES[0]?.code ?? ''
const PROMPT = 'Select Company Code and enter Key Date in DD-MM-YYYY format'

type Toast = { id: number; message: string }

export default function CheckConfirmPrepaymentApp() {
  // Settling flips a record in place, so the seed list is copied rather than read directly.
  const [records, setRecords] = useState<PrepaymentRecord[]>(() =>
    PREPAYMENT_RECORDS.map((row) => ({ ...row })),
  )
  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [transactionFilter, setTransactionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(FIRST_STATUS)
  const [transactionListOpen, setTransactionListOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [statusText, setStatusText] = useState('Select Company Code and enter Key Date')

  const toastSeq = useRef(0)
  const toastTimers = useRef<number[]>([])

  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [])

  // Escape dismisses whatever is open, as in the original.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setModalOpen(false)
      setCalendarOpen(false)
      setTransactionListOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const companies = useMemo(() => uniqueCompanies(records), [records])
  const settledWanted = settledForStatus(STATUSES, statusFilter)
  const ready = companyCode !== '' && isValidDate(keyDate)

  const rows = useMemo(() => {
    const filtered = filterRows(records, {
      companyCode,
      transaction: transactionFilter,
      settled: settledWanted,
      keyDate: parseDate(keyDate),
    })
    return sort ? sortRows(filtered, COLUMNS, sort) : filtered
  }, [records, companyCode, transactionFilter, settledWanted, keyDate, sort])

  /** The combo list ignores the typed value's position in the result set, only its text. */
  const transactionOptions = useMemo(() => {
    const typed = transactionFilter.toLowerCase()
    const matches = filterRows(records, {
      companyCode,
      transaction: '',
      settled: settledWanted,
      keyDate: parseDate(keyDate),
    })
      .map((row) => row.transaction)
      .filter((value) => !typed || value.toLowerCase().includes(typed))
    return [...new Set(matches)]
  }, [records, companyCode, transactionFilter, settledWanted, keyDate])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(start, start + PAGE_SIZE)

  const selectedRow = records.find((row) => row.id === selectedId) ?? null
  const selectionMeta = !selectedRow
    ? 'Select one line item'
    : selectedRow.settled
      ? 'Selected prepayment is already settled'
      : '1 line item selected'

  const pageNumbers = useMemo(() => {
    const endPage = Math.min(pages, Math.max(1, currentPage - 1) + 2)
    const startPage = Math.max(1, endPage - 2)
    const list: number[] = []
    for (let p = startPage; p <= endPage; p++) list.push(p)
    return list
  }, [pages, currentPage])

  function loadResults(nextCompany: string, nextKeyDate: string) {
    setSelectedId(null)
    if (!(nextCompany !== '' && isValidDate(nextKeyDate))) {
      setStatusText(PROMPT)
      return
    }
    setPage(1)
    setStatusText('Prepayment records loaded')
  }

  function refreshFilters() {
    if (!ready) {
      loadResults(companyCode, keyDate)
      return
    }
    setPage(1)
    setSelectedId(null)
  }

  function toast(message: string) {
    const id = ++toastSeq.current
    setToasts((current) => [...current, { id, message }])
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
    toastTimers.current.push(timer)
  }

  function toggleSort(index: number) {
    setSort((current) =>
      current && current.index === index
        ? { index, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { index, direction: 'asc' },
    )
    setPage(1)
    setSelectedId(null)
  }

  function settleSelected() {
    if (!selectedRow || selectedRow.settled) {
      setModalOpen(false)
      return
    }
    const { id, transaction } = selectedRow
    setRecords((current) =>
      current.map((row) => (row.id === id ? { ...row, settled: true } : row)),
    )
    setModalOpen(false)
    toast(`Prepayment Transaction ${transaction} settled successfully.`)
    setStatusText(`Prepayment Transaction ${transaction} settled successfully`)
    setSelectedId(null)
  }

  function goToPage(next: number) {
    setPage(Math.min(pages, Math.max(1, next)))
    setSelectedId(null)
  }

  return (
    <div className="ccprepayment">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            {/* The original topbar-inner held only .title; these header controls are new,
                so they get a plain flex group rather than a borrowed content-area class. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BackButton className="btn" />
              <div className="title">Check &amp; Confirm Prepayment</div>
            </div>
            <SignOutButton className="btn" />
          </div>
        </div>
        <div className="content">
          <div className="screen">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Basic Selection</div>
              </div>
              <div className="card-body">
                <div className="selection-main-row">
                  <div className="field-inline">
                    <label htmlFor="companyCode">
                      Company Code <span className="required">*</span>
                    </label>
                    <select
                      id="companyCode"
                      className="select company-select"
                      required
                      value={companyCode}
                      onChange={(event) => {
                        const value = event.target.value
                        setCompanyCode(value)
                        setTransactionFilter('')
                        setTransactionListOpen(false)
                        loadResults(value, keyDate)
                      }}
                    >
                      <option value="">Select Company Code</option>
                      {companies.map((company) => (
                        <option key={company.code} value={company.code}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-inline">
                    <label htmlFor="keyDate">
                      Key Date <span className="required">*</span>
                    </label>
                    <div className="date-shell">
                      <input
                        id="keyDate"
                        className="input date-input"
                        type="text"
                        placeholder="DD-MM-YYYY"
                        required
                        value={keyDate}
                        onChange={(event) => {
                          const value = event.target.value
                          setKeyDate(value)
                          loadResults(companyCode, value)
                        }}
                      />
                      <button
                        id="calendarBtn"
                        className="calendar-btn"
                        type="button"
                        title="Open calendar"
                        onClick={() => setCalendarOpen((open) => !open)}
                      />
                      <Calendar
                        open={calendarOpen}
                        value={keyDate}
                        onPick={(value) => {
                          setKeyDate(value)
                          setCalendarOpen(false)
                          loadResults(companyCode, value)
                        }}
                      />
                    </div>
                  </div>
                  <button
                    id="filterToggle"
                    className="filter-icon-btn"
                    type="button"
                    title="Filters"
                    aria-label="Filters"
                    onClick={() => setFiltersOpen((open) => !open)}
                  />
                  <div id="filterBody" className={filtersOpen ? 'filter-body open' : 'filter-body'}>
                    <div className="filter-grid">
                      <div className="filter-item">
                        <label htmlFor="transactionFilter">Transaction No</label>
                        <div className="combo-shell">
                          <input
                            id="transactionFilter"
                            className="input combo-input"
                            type="text"
                            placeholder="Transaction No"
                            value={transactionFilter}
                            onChange={(event) => {
                              setTransactionFilter(event.target.value)
                              refreshFilters()
                              setTransactionListOpen(true)
                            }}
                            onClick={() => setTransactionListOpen(true)}
                          />
                          <button
                            id="transactionDropBtn"
                            className="combo-btn"
                            type="button"
                            aria-label="Transaction list"
                            onClick={() => setTransactionListOpen((open) => !open)}
                          />
                          <div
                            id="transactionList"
                            className={transactionListOpen ? 'combo-list open' : 'combo-list'}
                          >
                            {transactionOptions.length === 0 ? (
                              <div className="combo-empty">No matching transactions</div>
                            ) : (
                              transactionOptions.map((value) => (
                                <button
                                  key={value}
                                  className="combo-option"
                                  type="button"
                                  onClick={() => {
                                    setTransactionFilter(value)
                                    setTransactionListOpen(false)
                                    refreshFilters()
                                  }}
                                >
                                  {value}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="filter-item">
                        <label htmlFor="statusFilter">Status Selection</label>
                        <select
                          id="statusFilter"
                          className="select status-filter"
                          value={statusFilter}
                          onChange={(event) => {
                            setStatusFilter(event.target.value)
                            setTransactionFilter('')
                            setTransactionListOpen(false)
                            refreshFilters()
                          }}
                        >
                          {STATUSES.map((status) => (
                            <option key={status.code} value={status.code}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-item">
                        <button
                          id="clearFilters"
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => {
                            setTransactionFilter('')
                            setTransactionListOpen(false)
                            setStatusFilter(FIRST_STATUS)
                            refreshFilters()
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="resultsArea" className={ready ? 'open' : ''}>
              <div className="toolbar">
                <div className="toolbar-left">
                  <span id="recordCount" className="record-count">
                    {rows.length} record{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="toolbar-right">
                  <button
                    id="settleBtn"
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedRow || selectedRow.settled}
                    onClick={() => setModalOpen(true)}
                  >
                    Confirm / Settle
                  </button>
                  {/* Edit has no behaviour in the original beyond becoming enabled. */}
                  <button id="editBtn" className="btn" type="button" disabled={!selectedRow}>
                    Edit
                  </button>
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">Prepayments</div>
                  <div id="selectionMeta" className="card-meta">
                    {selectionMeta}
                  </div>
                </div>
                <div className="table-wrap">
                  <table id="prepaymentTable" className="data-table">
                    <thead id="prepaymentHead">
                      <tr>
                        <th style={{ width: '64px' }}>Select</th>
                        {COLUMNS.map((column, index) => {
                          const active = sort && sort.index === index
                          const cls = active ? `sort-${sort.direction}` : ''
                          return (
                            <th
                              key={column.key}
                              className={cls}
                              style={{ width: `${column.width}px` }}
                              onClick={() => toggleSort(index)}
                            >
                              {column.label}
                              <span className="sort-arrows">
                                <span className="sort-up" />
                                <span className="sort-down" />
                              </span>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody id="prepaymentBody">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={COLUMNS.length + 1} className="empty">
                            No prepayment records match the current selection.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => {
                          const picked = row.id === selectedId
                          let cls = row.settled ? 'settled' : ''
                          if (picked) cls += (cls ? ' ' : '') + 'selected'
                          return (
                            <tr
                              key={row.id}
                              data-id={row.id}
                              className={cls}
                              onClick={() => setSelectedId(row.id)}
                            >
                              <td className="select-cell">
                                <input
                                  type="radio"
                                  name="prepaymentPick"
                                  value={row.id}
                                  checked={picked}
                                  onChange={() => setSelectedId(row.id)}
                                />
                              </td>
                              {COLUMNS.map((column) => (
                                <td
                                  key={column.key}
                                  className={column.type === 'number' ? 'number' : ''}
                                >
                                  {column.type === 'number'
                                    ? money(Number(row[column.key]))
                                    : row[column.key]}
                                </td>
                              ))}
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div id="paginationBar" className="pagination-bar">
                  <button
                    className="page-btn"
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    &lt;
                  </button>
                  {pageNumbers.map((p) => (
                    <button
                      key={p}
                      className={p === currentPage ? 'page-btn active' : 'page-btn'}
                      type="button"
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="page-btn"
                    type="button"
                    disabled={currentPage === pages}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="settleModal" className={modalOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Confirm Settlement</div>
            <button
              id="settleClose"
              className="modal-close"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              X
            </button>
          </div>
          <div className="modal-body">
            <div id="settleText" className="confirm-copy">
              Are you sure you want to settle Transaction <b>{selectedRow?.transaction ?? ''}</b>?
            </div>
            {selectedRow ? (
              <ConfirmDetails
                rows={[
                  { label: 'Deal No', value: selectedRow.dealNo },
                  { label: 'Company', value: selectedRow.companyName },
                  { label: 'Bank', value: selectedRow.bankName },
                  { label: 'Prepayment', value: `${selectedRow.currency} ${selectedRow.prepayment}` },
                  { label: 'Start Date', value: selectedRow.startDate },
                  { label: 'End Date', value: selectedRow.endDate },
                ]}
              />
            ) : null}
          </div>
          <div className="modal-foot">
            <button
              id="settleNo"
              className="btn btn-ghost"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              No
            </button>
            <button
              id="settleYes"
              className="btn btn-primary"
              type="button"
              onClick={settleSelected}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="toast">
            <div className="toast-icon">OK</div>
            <div>
              <div className="toast-title">Success</div>
              <div className="toast-message">{item.message}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="statusbar">
        <span className="status-dot" />
        <span id="statusText">{statusText}</span>
      </div>
    </div>
  )
}
