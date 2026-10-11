import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDetails } from '../../shared/ui/ConfirmDetails.tsx'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  calcNetDiscounted,
  isoToDMY,
  money,
  parseDMY,
  parseMoney,
  rateFmt,
  statusBadgeClass,
} from './calc.ts'
import { EDIT_COLUMNS, MAIN_COLUMNS, columnValue } from './columns.ts'
import { SEED_PAYLOAD } from './data.ts'
import type { DiscountingLoanRecord, EditForm, Toast, ToastKind } from './types.ts'
import './check-confirm-discounting-loans.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './check-confirm-discounting-loans.dark.css'

const VERSION = 'v3'
const PAGE_SIZE = 12
/** The narrow filter dropdowns show short labels; the option values stay the SAP text. */
const FILTER_LABEL_MAP: Record<string, string> = {
  Contract: 'Contract',
  'Contract Settlement': 'Settled',
}

const EMPTY_EDIT_FORM: EditForm = {
  discountValue: '',
  startDate: '',
  refInterestRate: '',
  spreadRate: '',
  noOfDays: '',
}

type SortState = { index: number; direction: 'asc' | 'desc' | '' }

type Filters = {
  productType: string
  transactionTypeDesc: string
  transactionNo: string
  status: string
}

const NO_FILTERS: Filters = {
  productType: '',
  transactionTypeDesc: '',
  transactionNo: '',
  status: '',
}

function shortLabel(value: string): string {
  return FILTER_LABEL_MAP[value] ?? value
}

function distinct(
  rows: readonly DiscountingLoanRecord[],
  key: keyof DiscountingLoanRecord,
): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = String(row[key] ?? '')
    if (value) seen.add(value)
  }
  return [...seen].sort()
}

function seedRecords(): DiscountingLoanRecord[] {
  return SEED_PAYLOAD.records.map((record) => ({ ...record }))
}

export default function CheckConfirmDiscountingLoansApp() {
  const [records, setRecords] = useState<DiscountingLoanRecord[]>(seedRecords)
  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [keyDateIso, setKeyDateIso] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [selectedTxn, setSelectedTxn] = useState('')
  const [listPage, setListPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ index: -1, direction: '' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [statusText, setStatusText] = useState(`Ready - ${VERSION}`)
  const nextToastId = useRef(0)

  const pushToast = useCallback((message: string, kind: ToastKind = '') => {
    const id = (nextToastId.current += 1)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      4200,
    )
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setEditOpen(false)
      setConfirmOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const resultsVisible = Boolean(companyCode && keyDate)

  const companyRows = useMemo(
    () => records.filter((record) => record.companyCode === companyCode),
    [records, companyCode],
  )

  const productOptions = useMemo(() => distinct(companyRows, 'productType'), [companyRows])
  const transactionTypeOptions = useMemo(
    () => distinct(companyRows, 'transactionTypeDesc'),
    [companyRows],
  )
  const transactionNoOptions = useMemo(
    () => distinct(companyRows, 'transactionNo'),
    [companyRows],
  )

  const filteredRows = useMemo(() => {
    // No status chosen means Contract only - settled loans are opt-in, as in the original.
    const effectiveStatus = filters.status || 'Contract'
    return companyRows.filter((row) => {
      if (filters.productType && row.productType !== filters.productType) return false
      if (filters.transactionTypeDesc && row.transactionTypeDesc !== filters.transactionTypeDesc) {
        return false
      }
      if (filters.transactionNo && row.transactionNo !== filters.transactionNo) return false
      return row.status === effectiveStatus
    })
  }, [companyRows, filters])

  const sortedRows = useMemo(() => {
    const column = MAIN_COLUMNS[sort.index]
    if (!column || !sort.direction) return filteredRows
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      const rawA = columnValue(column, a)
      const rawB = columnValue(column, b)
      const left = column.number ? Number(rawA) || 0 : String(rawA ?? '').toLowerCase()
      const right = column.number ? Number(rawB) || 0 : String(rawB ?? '').toLowerCase()
      if (left < right) return -direction
      if (left > right) return direction
      return 0
    })
  }, [filteredRows, sort])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const page = Math.min(listPage, pageCount)
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const pageNumbers = useMemo(() => {
    const endPage = Math.min(pageCount, Math.max(1, page - 1) + 2)
    const startPage = Math.max(1, endPage - 2)
    const numbers: number[] = []
    for (let p = startPage; p <= endPage; p += 1) numbers.push(p)
    return numbers
  }, [page, pageCount])

  const selected = records.find((record) => record.transactionNo === selectedTxn) ?? null

  const editNetDiscounted = calcNetDiscounted({
    discountValue: parseMoney(editForm.discountValue),
    refInterestRate: Number(editForm.refInterestRate) || 0,
    spreadRate: Number(editForm.spreadRate) || 0,
    noOfDays: Number(editForm.noOfDays) || 0,
  })

  function applyBasicSelection(nextCompanyCode: string, nextKeyDate: string) {
    if (nextCompanyCode && nextKeyDate) {
      setListPage(1)
      setStatusText(`Records loaded for ${nextCompanyCode} as of ${nextKeyDate}`)
    } else {
      setSelectedTxn('')
      setStatusText('Enter Company Code and Key Date')
    }
  }

  function onCompanyCodeChange(value: string) {
    setCompanyCode(value)
    // The filter dropdowns are rebuilt from the new company's rows, so a chosen value that
    // no longer exists there is dropped rather than silently hiding every row.
    const rows = records.filter((record) => record.companyCode === value)
    setFilters((current) => ({
      productType: distinct(rows, 'productType').includes(current.productType)
        ? current.productType
        : '',
      transactionTypeDesc: distinct(rows, 'transactionTypeDesc').includes(
        current.transactionTypeDesc,
      )
        ? current.transactionTypeDesc
        : '',
      transactionNo: distinct(rows, 'transactionNo').includes(current.transactionNo)
        ? current.transactionNo
        : '',
      status: current.status,
    }))
    applyBasicSelection(value, keyDate)
  }

  function onKeyDateChange(value: string) {
    setKeyDate(value)
    applyBasicSelection(companyCode, value)
  }

  function onKeyDateNativeChange(value: string) {
    setKeyDateIso(value)
    if (!value) return
    const dmy = isoToDMY(value)
    setKeyDate(dmy)
    applyBasicSelection(companyCode, dmy)
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
    setListPage(1)
  }

  function onClearFilters() {
    setFilters(NO_FILTERS)
    setListPage(1)
  }

  function toggleSort(index: number) {
    setSort((current) => ({
      index,
      direction: current.index === index && current.direction === 'asc' ? 'desc' : 'asc',
    }))
    setListPage(1)
  }

  function onSettle() {
    if (!selected) return
    if (selected.status === 'Contract Settlement') {
      pushToast('This discounting loan is already settled.', 'warning')
      return
    }
    setConfirmOpen(true)
  }

  function onConfirmYes() {
    setConfirmOpen(false)
    if (!selected) return
    const txn = selected.transactionNo
    setRecords((current) =>
      current.map((record) =>
        record.transactionNo === txn ? { ...record, status: 'Contract Settlement' } : record,
      ),
    )
    pushToast(`Discounting loan ${txn} has been settled successfully.`, 'success')
    setStatusText(`Discounting loan ${txn} settled`)
    setSelectedTxn('')
  }

  function onEdit() {
    if (!selected) return
    setEditForm({
      discountValue: money(selected.discountValue),
      startDate: selected.startDate,
      refInterestRate: rateFmt(selected.refInterestRate),
      spreadRate: rateFmt(selected.spreadRate),
      noOfDays: String(selected.noOfDays),
    })
    setEditOpen(true)
  }

  function onEditSave() {
    if (!selected) return
    const txn = selected.transactionNo
    // An unparseable date is ignored rather than stored, as the original does.
    const startDate = parseDMY(editForm.startDate) ? editForm.startDate : selected.startDate
    setRecords((current) =>
      current.map((record) =>
        record.transactionNo === txn
          ? {
              ...record,
              discountValue: parseMoney(editForm.discountValue),
              refInterestRate: Number(editForm.refInterestRate) || 0,
              spreadRate: Number(editForm.spreadRate) || 0,
              noOfDays: Number(editForm.noOfDays) || 0,
              startDate,
            }
          : record,
      ),
    )
    setEditOpen(false)
    pushToast(`Discounting loan ${txn} details updated successfully.`, 'success')
    setStatusText(`Discounting loan ${txn} updated`)
  }

  /**
   * The original's Refresh called location.reload(). Inside the shell that would tear down
   * the whole SPA, so it reloads this screen's data instead - the same observable effect.
   */
  function onRefresh() {
    setRecords(seedRecords())
    setSelectedTxn('')
    setSort({ index: -1, direction: '' })
    setListPage(1)
    setStatusText(`Ready - ${VERSION}`)
  }

  const summaryLines: readonly [string, string][] = [
    ['Transaction', selected?.transactionNo ?? ''],
    ['Company Code', selected?.companyCode ?? ''],
    ['Bank Name', selected?.bankName ?? ''],
    ['Currency', selected?.currency ?? ''],
  ]

  return (
    <div className="ccdiscloans">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            {/* The legacy header had a bare div and a bare button; the page's own toolbar
                group classes hold the added Back and Sign out controls in line with them. */}
            <div className="toolbar-left">
              <BackButton className="refresh-btn" />
              <div className="title">Check and Confirm Discounting Loans</div>
            </div>
            <div className="toolbar-right">
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
                    onChange={(event) => onCompanyCodeChange(event.target.value)}
                  >
                    <option value="">Select Company Code</option>
                    {SEED_PAYLOAD.companyCodes.map((company) => (
                      <option key={company.code} value={company.code}>
                        {company.code} - {company.name}
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
                      value={keyDate}
                      onChange={(event) => onKeyDateChange(event.target.value)}
                    />
                    <div className="calendar-btn-wrap">
                      <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true" />
                      <input
                        id="ccKeyDateNative"
                        className="calendar-native"
                        type="date"
                        aria-label="Open calendar"
                        value={keyDateIso}
                        onChange={(event) => onKeyDateNativeChange(event.target.value)}
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
                />
                <div id="filterBody" className={filtersOpen ? 'filter-body open' : 'filter-body'}>
                  <div className="filter-item">
                    <select
                      id="productTypeFilter"
                      className="select filter-lg"
                      title={filters.productType || 'Product'}
                      value={filters.productType}
                      onChange={(event) => setFilter('productType', event.target.value)}
                    >
                      <option value="">Product</option>
                      {productOptions.map((value) => (
                        <option key={value} value={value} data-full={value}>
                          {shortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="transactionTypeFilter"
                      className="select filter-sm"
                      title={filters.transactionTypeDesc || 'Txn Type'}
                      value={filters.transactionTypeDesc}
                      onChange={(event) => setFilter('transactionTypeDesc', event.target.value)}
                    >
                      <option value="">Txn Type</option>
                      {transactionTypeOptions.map((value) => (
                        <option key={value} value={value} data-full={value}>
                          {shortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="txnNoFilter"
                      className="select filter-sm"
                      title={filters.transactionNo || 'Txn No.'}
                      value={filters.transactionNo}
                      onChange={(event) => setFilter('transactionNo', event.target.value)}
                    >
                      <option value="">Txn No.</option>
                      {transactionNoOptions.map((value) => (
                        <option key={value} value={value} data-full={value}>
                          {shortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="statusFilter"
                      className="select filter-xs"
                      title={filters.status || 'Status'}
                      value={filters.status}
                      onChange={(event) => setFilter('status', event.target.value)}
                    >
                      <option value="">Status</option>
                      {SEED_PAYLOAD.statuses.map((value) => (
                        <option key={value} value={value} data-full={value}>
                          {shortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    id="clearFilters"
                    className="btn btn-ghost"
                    type="button"
                    onClick={onClearFilters}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div id="resultsArea" style={{ display: resultsVisible ? 'block' : 'none' }}>
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
                <button
                  id="editBtn"
                  className="btn btn-ghost"
                  type="button"
                  disabled={!selected}
                  onClick={onEdit}
                >
                  Edit
                </button>
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">Discounting Loan Overview</div>
                <div className="card-meta" id="rowCountMeta">
                  {sortedRows.length} record(s)
                </div>
              </div>
              <div className="table-wrap">
                <table id="mainTable" className="data-table">
                  <thead id="mainHead">
                    <tr>
                      <th style={{ width: 42 }}>Select</th>
                      {MAIN_COLUMNS.map((column, index) => (
                        <th
                          key={column.id}
                          data-index={index}
                          style={{ width: column.width }}
                          className={
                            sort.index === index && sort.direction
                              ? sort.direction === 'asc'
                                ? 'sort-asc'
                                : 'sort-desc'
                              : ''
                          }
                          onClick={() => toggleSort(index)}
                        >
                          {column.label}
                          <span className="sort-arrows">
                            <span className="sort-up" />
                            <span className="sort-down" />
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
                      pageRows.map((row) => (
                        <tr
                          key={row.transactionNo}
                          data-record={row.transactionNo}
                          className={row.transactionNo === selectedTxn ? 'selected' : ''}
                          onClick={() => setSelectedTxn(row.transactionNo)}
                        >
                          <td>
                            <input
                              type="radio"
                              name="recordPick"
                              value={row.transactionNo}
                              checked={row.transactionNo === selectedTxn}
                              onChange={() => setSelectedTxn(row.transactionNo)}
                            />
                          </td>
                          {MAIN_COLUMNS.map((column) => {
                            const value = columnValue(column, row)
                            return (
                              <td key={column.id} className={column.number ? 'number' : ''}>
                                {column.badge ? (
                                  <span className={statusBadgeClass(String(value))}>
                                    {String(value)}
                                  </span>
                                ) : column.rate ? (
                                  rateFmt(Number(value))
                                ) : column.number ? (
                                  money(Number(value))
                                ) : (
                                  value
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
                  type="button"
                  disabled={page === 1}
                  onClick={() => setListPage(page - 1)}
                >
                  Previous
                </button>
                {pageNumbers.map((number) => (
                  <button
                    key={number}
                    className={number === page ? 'page-btn active' : 'page-btn'}
                    type="button"
                    onClick={() => setListPage(number)}
                  >
                    {number}
                  </button>
                ))}
                <button
                  className="page-btn"
                  type="button"
                  disabled={page === pageCount}
                  onClick={() => setListPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="editModal" className={editOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Edit Discounting Loan</div>
            <button
              id="editClose"
              className="modal-close"
              type="button"
              onClick={() => setEditOpen(false)}
            >
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Loan Details</div>
                <div className="card-meta">Selected Record</div>
              </div>
              <div id="editSummary" className="card-body">
                <div className="detail-grid">
                  {summaryLines.map(([label, value]) => (
                    <div className="detail-line" key={label}>
                      <div className="detail-label">{label}</div>
                      <div className="detail-value size-md">
                        <span className="code">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
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
                      {EDIT_COLUMNS.map((column, index) => (
                        <th key={column.label} data-index={index} style={{ width: column.width }}>
                          {column.label}
                          <span className="sort-arrows">
                            <span className="sort-up" />
                            <span className="sort-down" />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="editBody">
                    <tr>
                      <td className="editable">
                        <input
                          id="editDiscountValue"
                          className="cell-input money"
                          type="text"
                          value={editForm.discountValue}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, discountValue: event.target.value }))
                          }
                        />
                      </td>
                      <td className="editable">
                        <input
                          id="editStartDate"
                          className="cell-input"
                          type="text"
                          value={editForm.startDate}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, startDate: event.target.value }))
                          }
                        />
                      </td>
                      <td className="editable">
                        <input
                          id="editRefRate"
                          className="cell-input money"
                          type="text"
                          value={editForm.refInterestRate}
                          onChange={(event) =>
                            setEditForm((form) => ({
                              ...form,
                              refInterestRate: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="editable">
                        <input
                          id="editSpreadRate"
                          className="cell-input money"
                          type="text"
                          value={editForm.spreadRate}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, spreadRate: event.target.value }))
                          }
                        />
                      </td>
                      <td className="editable">
                        <input
                          id="editNoOfDays"
                          className="cell-input"
                          type="text"
                          value={editForm.noOfDays}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, noOfDays: event.target.value }))
                          }
                        />
                      </td>
                      <td id="editNetDiscounted" className="money">
                        {money(editNetDiscounted)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button
              id="editCancel"
              className="btn btn-ghost"
              type="button"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
            <button id="editSave" className="btn btn-primary" type="button" onClick={onEditSave}>
              Save
            </button>
          </div>
        </div>
      </div>

      <div id="confirmModal" className={confirmOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Confirm Action</div>
            <button
              id="confirmClose"
              className="modal-close"
              type="button"
              onClick={() => setConfirmOpen(false)}
            >
              X
            </button>
          </div>
          <div className="modal-body">
            <div id="confirmMessage">
              <div className="confirm-text">
                Are you sure you want to confirm/settle this transaction?
              </div>
              {selected ? (
                <ConfirmDetails
                  rows={[
                    { label: 'Transaction No', value: selected.transactionNo },
                    { label: 'Deal No', value: selected.dealNo },
                    { label: 'Company', value: selected.companyName },
                    { label: 'Bank', value: selected.bankName },
                    { label: 'Discount Value', value: `${selected.currency} ${selected.discountValue}` },
                    { label: 'Start Date', value: selected.startDate },
                    { label: 'No. of Days', value: String(selected.noOfDays) },
                  ]}
                />
              ) : null}
            </div>
          </div>
          <div className="modal-foot">
            <button
              id="confirmNo"
              className="btn btn-ghost"
              type="button"
              onClick={() => setConfirmOpen(false)}
            >
              No
            </button>
            <button id="confirmYes" className="btn btn-primary" type="button" onClick={onConfirmYes}>
              Yes
            </button>
          </div>
        </div>
      </div>

      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <div className="toast-icon">{toast.kind === 'success' ? 'OK' : 'i'}</div>
            <div>
              <div className="toast-title">
                {toast.kind === 'success'
                  ? 'Success'
                  : toast.kind === 'warning'
                    ? 'Warning'
                    : 'Information'}
              </div>
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
