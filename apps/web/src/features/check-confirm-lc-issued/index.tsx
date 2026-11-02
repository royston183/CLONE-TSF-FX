import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDetails } from '../../shared/ui/ConfirmDetails.tsx'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { Calendar } from './Calendar.tsx'
import { COLUMNS } from './columns.ts'
import { COMPANY_OPTIONS, LC_ROWS } from './data.ts'
import { money, parseDate, sortRows } from './format.ts'
import type { LcRow, SortDirection, StatusFilter } from './types.ts'
import './check-confirm-lc-issued.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './check-confirm-lc-issued.dark.css'

const PAGE_SIZE = 12

type SortState = { index: number; direction: SortDirection } | null

type Toast = { id: number; message: string }

let nextToastId = 1

export default function CheckConfirmLcIssued() {
  const [rows, setRows] = useState<LcRow[]>(LC_ROWS)

  // Basic selection.
  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')

  // Filters.
  const [filterOpen, setFilterOpen] = useState(false)
  const [transactionFilter, setTransactionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('CONTRACT')
  const [transactionListOpen, setTransactionListOpen] = useState(false)

  // Results grid.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [page, setPage] = useState(1)

  // Settle modal + toasts.
  const [settleOpen, setSettleOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Calendar popup.
  const [calendarOpen, setCalendarOpen] = useState(false)
  const dateShellRef = useRef<HTMLDivElement>(null)

  const readyToLoad = companyCode !== '' && parseDate(keyDate) !== null

  const filteredRows = useMemo(() => {
    if (!readyToLoad) return []
    const typedTxn = transactionFilter.toLowerCase()
    const parsedKeyDate = parseDate(keyDate)
    const result = rows.filter((row) => {
      if (companyCode && row.companyCode !== companyCode) return false
      if (typedTxn && !row.lcTxn.toLowerCase().includes(typedTxn)) return false
      if (statusFilter === 'CONTRACT' && row.settled) return false
      if (statusFilter === 'SETTLED' && !row.settled) return false
      if (parsedKeyDate) {
        const start = parseDate(row.startDate)
        const end = parseDate(row.endDate)
        if (start && parsedKeyDate < start) return false
        if (end && parsedKeyDate > end) return false
      }
      return true
    })
    if (sort) {
      const column = COLUMNS[sort.index]
      if (column) return sortRows(result, column, sort.direction)
    }
    return result
  }, [rows, readyToLoad, companyCode, transactionFilter, statusFilter, keyDate, sort])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)

  const selectedRow = selectedId != null ? (rows.find((row) => row.id === selectedId) ?? null) : null

  const statusText = !readyToLoad
    ? 'Select Company Code and enter Key Date in DD-MM-YYYY format'
    : selectedRow
      ? `LC Transaction ${selectedRow.lcTxn} settled successfully`
      : 'LC issued records loaded'

  const selectionMeta = !selectedRow
    ? 'Select one line item'
    : selectedRow.settled
      ? 'Selected LC is already settled'
      : '1 line item selected'

  const transactionOptions = useMemo(() => {
    const typed = transactionFilter.toLowerCase()
    const seen = new Set<string>()
    const options: string[] = []
    for (const row of rows) {
      if (companyCode && row.companyCode !== companyCode) continue
      if (statusFilter === 'CONTRACT' && row.settled) continue
      if (statusFilter === 'SETTLED' && !row.settled) continue
      if (typed && !row.lcTxn.toLowerCase().includes(typed)) continue
      if (seen.has(row.lcTxn)) continue
      seen.add(row.lcTxn)
      options.push(row.lcTxn)
    }
    return options
  }, [rows, companyCode, statusFilter, transactionFilter])

  // Esc closes whichever overlay is open, same as the original's single document listener.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSettleOpen(false)
        setCalendarOpen(false)
        setTransactionListOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function pushToast(message: string) {
    const id = nextToastId++
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }

  function resetSelection() {
    setSelectedId(null)
  }

  function onCompanyChange(value: string) {
    setCompanyCode(value)
    setTransactionFilter('')
    setTransactionListOpen(false)
    setPage(1)
    resetSelection()
  }

  function onKeyDateChange(value: string) {
    setKeyDate(value)
    if (value.length === 10) {
      setPage(1)
      resetSelection()
    }
  }

  function onKeyDateBlur() {
    setPage(1)
    resetSelection()
  }

  function onStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setTransactionFilter('')
    setTransactionListOpen(false)
    setPage(1)
    resetSelection()
  }

  function onClearFilters() {
    setTransactionFilter('')
    setTransactionListOpen(false)
    setStatusFilter('CONTRACT')
    setPage(1)
    resetSelection()
  }

  function toggleSort(index: number) {
    setSort((current) =>
      current && current.index === index
        ? { index, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { index, direction: 'asc' },
    )
    setPage(1)
  }

  function selectRow(id: number) {
    setSelectedId(id)
  }

  function goToPage(target: number) {
    setPage(Math.min(pageCount, Math.max(1, target)))
    resetSelection()
  }

  function openSettleModal() {
    if (!selectedRow || selectedRow.settled) return
    setSettleOpen(true)
  }

  function settleSelected() {
    if (!selectedRow || selectedRow.settled) {
      setSettleOpen(false)
      return
    }
    const txn = selectedRow.lcTxn
    setRows((current) => current.map((row) => (row.id === selectedRow.id ? { ...row, settled: true } : row)))
    setSettleOpen(false)
    pushToast(`LC Transaction ${txn} settled successfully.`)
    if (statusFilter === 'CONTRACT') resetSelection()
  }

  const closeCalendar = useCallback(() => setCalendarOpen(false), [])

  function onCalendarPickDate(text: string) {
    setKeyDate(text)
    closeCalendar()
    setPage(1)
    resetSelection()
  }

  const startPageRaw = Math.max(1, currentPage - 1)
  const endPage = Math.min(pageCount, startPageRaw + 2)
  const startPage = Math.max(1, endPage - 2)
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  return (
    <div className="cclcissued">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div className="toolbar-left">
              <BackButton className="btn btn-ghost" />
              <div className="title">Check &amp; Confirm LC Issued</div>
            </div>
            <div className="toolbar-right">
              <SignOutButton className="btn btn-ghost" />
            </div>
          </div>
        </div>
        <div className="content">
          <div className="screen">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Basic Selection</div>
                <div className="card-meta">Required</div>
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
                      value={companyCode}
                      onChange={(event) => onCompanyChange(event.target.value)}
                    >
                      <option value="">Select Company Code</option>
                      {COMPANY_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-inline">
                    <label htmlFor="keyDate">
                      Key Date <span className="required">*</span>
                    </label>
                    <div className="date-shell" ref={dateShellRef}>
                      <input
                        id="keyDate"
                        className="input date-input"
                        type="text"
                        placeholder="DD-MM-YYYY"
                        value={keyDate}
                        onChange={(event) => onKeyDateChange(event.target.value)}
                        onBlur={onKeyDateBlur}
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
                        anchorRef={dateShellRef}
                        selected={parseDate(keyDate)}
                        onPickDate={onCalendarPickDate}
                        onClose={closeCalendar}
                      />
                    </div>
                  </div>
                  <button
                    id="filterToggle"
                    className="filter-icon-btn"
                    type="button"
                    title="Filters"
                    aria-label="Filters"
                    onClick={() => setFilterOpen((open) => !open)}
                  />
                  <div id="filterBody" className={filterOpen ? 'filter-body open' : 'filter-body'}>
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
                              setPage(1)
                              resetSelection()
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
                          <div id="transactionList" className={transactionListOpen ? 'combo-list open' : 'combo-list'}>
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
                                    setPage(1)
                                    resetSelection()
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
                          onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
                        >
                          <option value="CONTRACT">Contract</option>
                          <option value="SETTLED">Contract Settlement</option>
                        </select>
                      </div>
                      <div className="filter-item">
                        <button id="clearFilters" className="btn btn-ghost" type="button" onClick={onClearFilters}>
                          Clear filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="resultsArea" className={readyToLoad ? 'open' : ''}>
              <div className="toolbar">
                <div className="toolbar-left">
                  <span id="recordCount" className="record-count">
                    {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="toolbar-right">
                  <button
                    id="settleBtn"
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedRow || selectedRow.settled}
                    onClick={openSettleModal}
                  >
                    Confirm / Settle
                  </button>
                  <button id="editBtn" className="btn" type="button" disabled={!selectedRow}>
                    Edit
                  </button>
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">LC Issued</div>
                  <div id="selectionMeta" className="card-meta">
                    {selectionMeta}
                  </div>
                </div>
                <div className="table-wrap">
                  <table id="lcTable" className="data-table">
                    <thead id="lcHead">
                      <tr>
                        <th style={{ width: 52 }}>Select</th>
                        {COLUMNS.map((column, index) => {
                          const sortClass =
                            sort && sort.index === index ? (sort.direction === 'asc' ? 'sort-asc' : 'sort-desc') : ''
                          return (
                            <th
                              key={column.key}
                              className={sortClass}
                              style={{ width: column.width }}
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
                    <tbody id="lcBody">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="empty">
                            No LC issued records match the current selection.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => {
                          const classes: string[] = []
                          if (row.settled) classes.push('settled')
                          if (row.id === selectedId) classes.push('selected')
                          return (
                            <tr
                              key={row.id}
                              data-id={row.id}
                              className={classes.join(' ')}
                              onClick={() => selectRow(row.id)}
                            >
                              <td className="select-cell">
                                <input
                                  type="radio"
                                  name="lcPick"
                                  value={row.id}
                                  checked={row.id === selectedId}
                                  onChange={() => selectRow(row.id)}
                                />
                              </td>
                              {COLUMNS.map((column) => (
                                <td key={column.key} className={column.number ? 'number' : ''}>
                                  {column.number ? money(row[column.key] as number) : row[column.key]}
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
                  {pageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={pageNumber === currentPage ? 'page-btn active' : 'page-btn'}
                      type="button"
                      onClick={() => goToPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    className="page-btn"
                    type="button"
                    disabled={currentPage === pageCount}
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
      <div id="settleModal" className={settleOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Confirm Settlement</div>
            <button id="settleClose" className="modal-close" type="button" onClick={() => setSettleOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div id="settleText" className="confirm-copy">
              {selectedRow ? (
                <>
                  Are you sure you want to settle LC Transaction <b>{selectedRow.lcTxn}</b>?
                  <ConfirmDetails
                    rows={[
                      { label: 'Deal ID', value: selectedRow.dealId },
                      { label: 'Applicant', value: selectedRow.applicant },
                      { label: 'Beneficiary', value: selectedRow.beneficiary },
                      { label: 'Bank', value: selectedRow.bank },
                      { label: 'LC Amount', value: `${selectedRow.currency} ${selectedRow.lcAmount}` },
                      { label: 'Start Date', value: selectedRow.startDate },
                      { label: 'End Date', value: selectedRow.endDate },
                    ]}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="modal-foot">
            <button id="settleNo" className="btn btn-ghost" type="button" onClick={() => setSettleOpen(false)}>
              No
            </button>
            <button id="settleYes" className="btn btn-primary" type="button" onClick={settleSelected}>
              Yes
            </button>
          </div>
        </div>
      </div>
      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <div className="toast-icon">OK</div>
            <div>
              <div className="toast-title">Success</div>
              <div className="toast-message">{toast.message}</div>
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
