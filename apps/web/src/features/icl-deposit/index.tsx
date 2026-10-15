import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { addDaysIso, calcDepositAmt, displayDate, isoFromDisplay, money, rateFmt, toNumber } from './calc.ts'
import { BANK_COLUMNS, DEPOSIT_COLUMNS, ICL_COLUMNS, MAIN_COLUMNS } from './columns.ts'
import { BANKS, COMPANY_CODES, NEXT_NUMBERS, RECORDS } from './data.ts'
import type { Bank, EditColumn, IclRecord, MainColumn, ToastItem, ToastKind } from './types.ts'
import './icl-deposit.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './icl-deposit.dark.css'
import { CalendarPicker } from '../../shared/ui/CalendarPicker.tsx'

const VERSION = 'v1'
const PAGE_SIZE = 12

type SortState = { table: string; index: number; direction: 'asc' | 'desc' | '' }

/** The deposit grid plus the read-mostly controls above it, held as the text on screen. */
type DepositForm = {
  depositValue: string
  interestCategory: string
  interestRate: string
  interestFrequency: string
  noOfDays: string
  tradeValue: string
  amount: string
  rate: string
  fixing: string
  start: string
  end: string
}

type IclForm = {
  amount: string
  start: string
  end: string
  paymentMode: string
}

function newDepositForm(record: IclRecord): DepositForm {
  return {
    depositValue: record.depositValue,
    interestCategory: record.interestCategory,
    interestRate: rateFmt(record.interestRate),
    interestFrequency: record.interestFrequency === 'Arrears' ? 'Arrears' : 'Upfront',
    noOfDays: String(record.noOfDays),
    tradeValue: money(record.depositTradeValue ?? record.ottkAmount),
    amount: money(calcDepositAmt(record)),
    rate: rateFmt(record.interestRate),
    fixing: record.depositFixing === 'Floating' ? 'Floating' : 'Fixed',
    start: displayDate(record.startDate),
    end: displayDate(addDaysIso(record.startDate, record.noOfDays)),
  }
}

/** The ICL request is always planned ten days out from the deposit start. */
function newIclForm(record: IclRecord): IclForm {
  return {
    amount: money(calcDepositAmt(record)),
    start: displayDate(record.startDate),
    end: displayDate(addDaysIso(record.startDate, 10)),
    paymentMode: '01 Pay to Group Co. (Indirect)',
  }
}

function recalcDeposit(form: DepositForm): DepositForm {
  const rate = toNumber(form.rate)
  const days = toNumber(form.noOfDays)
  const isoStart = isoFromDisplay(form.start)
  return {
    ...form,
    amount: money(
      calcDepositAmt({
        ottkAmount: form.tradeValue,
        depositTradeValue: form.tradeValue,
        interestRate: rate,
        noOfDays: days,
      }),
    ),
    interestRate: rateFmt(rate),
    rate: rateFmt(rate),
    end: isoStart ? displayDate(addDaysIso(isoStart, days)) : form.end,
  }
}

function mainValue(record: IclRecord, column: MainColumn): string | number {
  if (column.compute) return column.compute(record)
  const raw = (record as unknown as Record<string, unknown>)[column.key]
  return typeof raw === 'number' ? raw : String(raw ?? '')
}

function uniqueSorted(rows: readonly IclRecord[], read: (r: IclRecord) => string): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = read(row)
    if (value) seen.add(value)
  }
  return [...seen].sort()
}

function DetailRow(props: { label: string; code: string; desc?: string; size?: string }) {
  return (
    <div className="detail-line">
      <div className="detail-label">{props.label}</div>
      <div className={`detail-value size-${props.size ?? 'md'}`}>
        <span className="code">{props.code}</span>
        {props.desc ? <span className="description">{props.desc}</span> : null}
      </div>
    </div>
  )
}

/**
 * Header cells for the two edit grids. The original wired them for sorting too, but a
 * one-row grid has nothing to sort, and its sort handler bailed out on these prefixes.
 */
function EditHead({ columns }: { columns: readonly EditColumn[] }) {
  return (
    <tr>
      {columns.map((column) => (
        <th key={column.label} style={{ width: `${column.width}px` }}>
          {column.label}
          {column.required ? <span className="req">*</span> : null}
          <span className="sort-arrows">
            <span className="sort-up" />
            <span className="sort-down" />
          </span>
        </th>
      ))}
    </tr>
  )
}

export default function IclDepositApp() {
  const [records, setRecords] = useState<IclRecord[]>(() => RECORDS.map((r) => ({ ...r })))
  const [numbers, setNumbers] = useState(() => ({ ...NEXT_NUMBERS }))

  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [txnFilter, setTxnFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ottkFilter, setOttkFilter] = useState('')

  const [listPage, setListPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ table: '', index: -1, direction: '' })
  const [selectedTxn, setSelectedTxn] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<'deposit' | 'icl'>('deposit')
  const [depositSaved, setDepositSaved] = useState(false)
  const [depositForm, setDepositForm] = useState<DepositForm | null>(null)
  const [iclForm, setIclForm] = useState<IclForm | null>(null)

  const [bankOpen, setBankOpen] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [selectedBank, setSelectedBank] = useState(-1)

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [statusText, setStatusText] = useState(`Ready - ${VERSION}`)
  const toastSeq = useRef(0)

  const showResults = companyCode !== '' && keyDate !== ''
  const record = records.find((r) => r.transactionNo === selectedTxn) ?? null

  function toast(message: string, kind: ToastKind = '') {
    toastSeq.current += 1
    const id = toastSeq.current
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }

  function patchRecord(txn: string, patch: Partial<IclRecord>) {
    setRecords((current) => current.map((r) => (r.transactionNo === txn ? { ...r, ...patch } : r)))
  }

  const companyRows = useMemo(
    () => records.filter((r) => r.companyCode === companyCode),
    [records, companyCode],
  )

  const txnOptions = useMemo(() => uniqueSorted(companyRows, (r) => r.transactionNo), [companyRows])
  const statusOptions = useMemo(() => uniqueSorted(companyRows, (r) => r.requestStatus), [companyRows])
  const ottkOptions = useMemo(() => uniqueSorted(companyRows, (r) => r.ottkNo), [companyRows])

  const filteredRows = useMemo(() => {
    const rows = companyRows.filter(
      (r) =>
        (!txnFilter || r.transactionNo === txnFilter) &&
        (!statusFilter || r.requestStatus === statusFilter) &&
        (!ottkFilter || r.ottkNo === ottkFilter),
    )
    const column = sort.table === 'main' ? MAIN_COLUMNS[sort.index] : undefined
    if (!column || !sort.direction) return rows
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      let av = mainValue(a, column)
      let bv = mainValue(b, column)
      if (column.number) {
        av = toNumber(av)
        bv = toNumber(bv)
      } else {
        av = String(av).toLowerCase()
        bv = String(bv).toLowerCase()
      }
      if (av < bv) return -factor
      if (av > bv) return factor
      return 0
    })
  }, [companyRows, txnFilter, statusFilter, ottkFilter, sort])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const page = Math.min(listPage, pageCount)
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const bankRows = useMemo(() => {
    const query = bankSearch.toLowerCase()
    const rows = BANKS.map((bank, index) => ({ bank, index })).filter(
      ({ bank }) => !query || Object.values(bank).join(' ').toLowerCase().includes(query),
    )
    const column = sort.table === 'bank' ? BANK_COLUMNS[sort.index] : undefined
    if (!column || !sort.direction) return rows
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a.bank[column.key].toLowerCase()
      const bv = b.bank[column.key].toLowerCase()
      if (av < bv) return -factor
      if (av > bv) return factor
      return 0
    })
  }, [bankSearch, sort])

  function toggleSort(table: string, index: number) {
    setSort((current) => {
      const direction =
        current.table === table && current.index === index && current.direction === 'asc' ? 'desc' : 'asc'
      return { table, index, direction }
    })
    if (table === 'main') setListPage(1)
  }

  function sortClass(table: string, index: number) {
    if (sort.table !== table || sort.index !== index || !sort.direction) return undefined
    return sort.direction === 'asc' ? 'sort-asc' : 'sort-desc'
  }

  function clearSelection() {
    setSelectedTxn('')
  }

  function announce(code: string, date: string) {
    if (code && date) setStatusText(`Records loaded for ${code} as of ${date}`)
    else setStatusText('Enter Deposit Company Code and Key Date')
  }

  function onCompanyCodeChange(next: string) {
    setCompanyCode(next)
    setListPage(1)
    clearSelection()
    // Filters are rebuilt from the new company's rows; a value that no longer exists there
    // would otherwise leave the select showing a filter the user cannot see or clear.
    const rows = records.filter((r) => r.companyCode === next)
    if (!rows.some((r) => r.transactionNo === txnFilter)) setTxnFilter('')
    if (!rows.some((r) => r.requestStatus === statusFilter)) setStatusFilter('')
    if (!rows.some((r) => r.ottkNo === ottkFilter)) setOttkFilter('')
    announce(next, keyDate)
  }

  function onKeyDateChange(next: string) {
    setKeyDate(next)
    setListPage(1)
    clearSelection()
    announce(companyCode, next)
  }

  function openDepositModal(mode: 'create' | 'edit') {
    if (!record) return
    if (mode === 'edit' && !record.depositId) {
      toast('Create a deposit for this record first.', 'warning')
      return
    }
    setDepositSaved(Boolean(record.depositId))
    setDepositForm(newDepositForm(record))
    setIclForm(newIclForm(record))
    setTab('deposit')
    setModalOpen(true)
  }

  function createDepositRow() {
    if (!record) return
    const index = records.findIndex((r) => r.transactionNo === record.transactionNo)
    const depositId = record.depositId || `DEP${84000 + index + 1}`
    const depositRequest = record.depositRequest || String(numbers.depositRequest)
    const depositTxn = record.depositTxn || String(numbers.depositTxn)
    const requestStatus = record.requestStatus === 'Open' ? 'Deposit Created' : record.requestStatus

    setNumbers((current) => ({
      ...current,
      depositRequest: record.depositRequest ? current.depositRequest : current.depositRequest + 1,
      depositTxn: record.depositTxn ? current.depositTxn : current.depositTxn + 1,
    }))
    patchRecord(record.transactionNo, { depositId, depositRequest, depositTxn, requestStatus })
    setDepositForm(newDepositForm({ ...record, depositId, depositRequest, depositTxn, requestStatus }))
    toast(`Transaction ${depositTxn} created successfully.`, 'success')
    setStatusText(`Transaction ${depositTxn} created successfully`)
  }

  function createIclRequest() {
    if (!record) return
    if (!record.paymentBank) {
      toast('Select Payment ID (Pay To) before creating the request.', 'warning')
      return
    }
    const requestNo = record.requestNo || String(numbers.requestNumber)
    if (!record.requestNo) setNumbers((current) => ({ ...current, requestNumber: current.requestNumber + 1 }))
    patchRecord(record.transactionNo, { requestNo, requestStatus: 'ICL Created' })
    toast(`ICL Request ${requestNo} created successfully.`, 'success')
    setStatusText(`ICL Request ${requestNo} created successfully`)
  }

  function openBankModal() {
    setSelectedBank(-1)
    setBankSearch('')
    setBankOpen(true)
  }

  function finalizeBank() {
    const bank: Bank | undefined = BANKS[selectedBank]
    if (!bank || !record) return
    patchRecord(record.transactionNo, { paymentBank: bank })
    setBankOpen(false)
    toast('Partner bank selected.', 'success')
  }

  /**
   * Refresh reloaded the whole document in the original. Inside the shell that would tear
   * down the SPA, so it resets this screen's own state instead — the same visible effect.
   */
  function refresh() {
    setRecords(RECORDS.map((r) => ({ ...r })))
    setNumbers({ ...NEXT_NUMBERS })
    setCompanyCode('')
    setKeyDate('')
    setTxnFilter('')
    setStatusFilter('')
    setOttkFilter('')
    setFiltersOpen(false)
    setListPage(1)
    setSort({ table: '', index: -1, direction: '' })
    setSelectedTxn('')
    setModalOpen(false)
    setBankOpen(false)
    setToasts([])
    setStatusText(`Ready - ${VERSION}`)
  }

  useEffect(() => {
    if (!modalOpen && !bankOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setBankOpen(false)
      setModalOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, bankOpen])

  const paymentBank = record?.paymentBank ?? null
  const bankText = paymentBank ? ` ${paymentBank.partnerBank || paymentBank.houseBank} - ${paymentBank.bankName}` : ''
  const hideBankButton = Boolean(paymentBank && record?.requestNo)

  const firstPage = Math.max(1, Math.min(page - 1, pageCount - 2))
  const pageButtons: number[] = []
  for (let p = firstPage; p <= Math.min(pageCount, firstPage + 2); p += 1) pageButtons.push(p)

  return (
    <div className="icldeposit">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            {/* The original header held only the title and Refresh; the shell's Back and Sign
                out controls need groups to sit in, so each side is a flex row of its own. */}
            <div className="toolbar-left">
              <BackButton className="refresh-btn" />
              <div className="title">Create Deposit</div>
            </div>
            <div className="toolbar-right">
              <button id="refreshBtn" className="refresh-btn" type="button" onClick={refresh}>
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
                  <label htmlFor="depCompanyCode">Company Code<span className="req">*</span></label>
                  <select
                    id="depCompanyCode"
                    className="select"
                    value={companyCode}
                    onChange={(e) => onCompanyCodeChange(e.target.value)}
                  >
                    <option value="">Select Company Code</option>
                    {COMPANY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field structure-field date-field">
                  <label htmlFor="depKeyDate">Key Date<span className="req">*</span></label>
                  <div className="date-input-wrap">
                    <input
                      id="depKeyDate"
                      className="input"
                      type="text"
                      placeholder="DD-MM-YYYY"
                      value={keyDate}
                      onChange={(e) => onKeyDateChange(e.target.value)}
                    />
                    <div className="calendar-btn-wrap">
                      <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true" />
                      <CalendarPicker
                        id="depKeyDateNative"
                        className="calendar-native"
                        aria-label="Open calendar"
                        value={isoFromDisplay(keyDate) ?? ''}
                        onChange={(e) => {
                          if (e.target.value) onKeyDateChange(displayDate(e.target.value))
                        }}
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
                      id="txnNoFilter"
                      className="select compact-filter"
                      value={txnFilter}
                      onChange={(e) => {
                        setTxnFilter(e.target.value)
                        setListPage(1)
                        clearSelection()
                      }}
                    >
                      <option value="">Transaction No.</option>
                      {txnOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="reqStatusFilter"
                      className="select medium-filter"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value)
                        setListPage(1)
                        clearSelection()
                      }}
                    >
                      <option value="">Request Status</option>
                      {statusOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      id="ottkNoFilter"
                      className="select compact-filter"
                      value={ottkFilter}
                      onChange={(e) => {
                        setOttkFilter(e.target.value)
                        setListPage(1)
                        clearSelection()
                      }}
                    >
                      <option value="">OTTK No.</option>
                      {ottkOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
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
                      setOttkFilter('')
                      setListPage(1)
                      clearSelection()
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
                  id="createDepositBtn"
                  className="btn btn-primary"
                  type="button"
                  disabled={!record}
                  onClick={() => openDepositModal('create')}
                >
                  Create Deposit
                </button>
                <button
                  id="editDepositBtn"
                  className="btn btn-ghost"
                  type="button"
                  disabled={!record?.depositId}
                  onClick={() => openDepositModal('edit')}
                >
                  Edit Deposit
                </button>
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">Deposit and ICL Overview</div>
              </div>
              <div className="table-wrap">
                <table id="mainTable" className="data-table">
                  <thead id="mainHead">
                    <tr>
                      <th style={{ width: '42px' }}>Select</th>
                      {MAIN_COLUMNS.map((column, index) => (
                        <th
                          key={column.key}
                          className={sortClass('main', index)}
                          style={{ width: `${column.width}px` }}
                          onClick={() => toggleSort('main', index)}
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
                            const value = mainValue(row, column)
                            return (
                              <td key={column.key} className={column.number ? 'number' : ''}>
                                {column.number && value !== '' ? money(value) : value}
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
                {pageButtons.map((p) => (
                  <button
                    key={p}
                    className={p === page ? 'page-btn active' : 'page-btn'}
                    type="button"
                    onClick={() => setListPage(p)}
                  >
                    {p}
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

      <div id="depositIclModal" className={modalOpen ? 'modal-bg open' : 'modal-bg'}>
        {record && depositForm && iclForm ? (
          <div className="modal large">
            <div className="modal-head">
              <div className="modal-title">Deposit and ICL Creation</div>
              <button id="depositIclClose" className="modal-close" type="button" onClick={() => setModalOpen(false)}>
                X
              </button>
            </div>
            <div className="modal-body">
              <div className="workspace-tabs">
                <button
                  id="depositTab"
                  className={
                    tab === 'icl' || depositSaved ? 'workspace-tab done' : 'workspace-tab active'
                  }
                  type="button"
                  onClick={() => setTab('deposit')}
                >
                  Deposit
                </button>
                <button
                  id="iclTab"
                  className={tab === 'icl' ? 'workspace-tab active' : 'workspace-tab'}
                  type="button"
                  onClick={() => {
                    setIclForm(newIclForm(record))
                    setTab('icl')
                  }}
                >
                  ICL Request
                </button>
              </div>
              <div id="depositPane" style={{ display: tab === 'deposit' ? 'block' : 'none' }}>
                <div className="card">
                  <div className="card-head">
                    <div className="card-title">Deposit Details</div>
                    <div className="card-meta">Selected Record</div>
                  </div>
                  <div id="depositDetails" className="card-body">
                    <div className="detail-grid">
                      <DetailRow label="OTTK No" code={record.ottkNo} size="xs" />
                      <DetailRow label="Company Code" code={record.companyCode} size="md" />
                      <DetailRow
                        label="Business Area"
                        code={record.businessArea}
                        desc={record.businessAreaName}
                        size="md"
                      />
                      <DetailRow
                        label="LC Issuance Bank"
                        code={record.lcIssuanceBank}
                        desc={record.lcIssuanceBankName}
                        size="lg"
                      />
                      <DetailRow
                        label="OTTK Trade Value"
                        code={money(record.ottkAmount)}
                        desc={record.ottkCurr}
                        size="sm"
                      />
                      <div className="detail-line">
                        <div className="detail-label">Deposit Value</div>
                        <select id="depositValue" className="select detail-control-md" value={depositForm.depositValue} onChange={() => undefined}>
                          <option>{record.depositValue}</option>
                        </select>
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">Interest Category</div>
                        <select
                          id="interestCategory"
                          className="select detail-control-sm detail-readonly-select"
                          disabled
                          value={depositForm.interestCategory}
                          onChange={() => undefined}
                        >
                          <option>{record.interestCategory}</option>
                        </select>
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">Interest Rate</div>
                        <input
                          id="interestRate"
                          className="input detail-control-xs money detail-readonly-input"
                          type="text"
                          readOnly
                          value={depositForm.interestRate}
                        />
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">Interest Frequency</div>
                        <select
                          id="interestFrequency"
                          className="select detail-control-sm"
                          value={depositForm.interestFrequency}
                          onChange={(e) =>
                            setDepositForm({ ...depositForm, interestFrequency: e.target.value })
                          }
                        >
                          <option>Upfront</option>
                          <option>Arrears</option>
                        </select>
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">No Of Days</div>
                        <input
                          id="noOfDays"
                          className="input detail-control-xs detail-readonly-input"
                          type="text"
                          readOnly
                          value={depositForm.noOfDays}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card table-card">
                  <div className="card-head">
                    <div className="card-title">Create Deposit</div>
                  </div>
                  <div className="table-wrap">
                    <table id="depositTable" className="edit-table">
                      <thead id="depositHead">
                        <EditHead columns={DEPOSIT_COLUMNS} />
                      </thead>
                      <tbody id="depositBody">
                        <tr>
                          <td>{record.depositId}</td>
                          <td className="editable">
                            <input
                              id="depTradeValue"
                              className="cell-input money"
                              type="text"
                              value={depositForm.tradeValue}
                              onChange={(e) => setDepositForm({ ...depositForm, tradeValue: e.target.value })}
                              onBlur={() => setDepositForm(recalcDeposit(depositForm))}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="depAmount"
                              className="cell-input money"
                              type="text"
                              value={depositForm.amount}
                              onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="depRate"
                              className="cell-input money"
                              type="text"
                              value={depositForm.rate}
                              onChange={(e) => setDepositForm({ ...depositForm, rate: e.target.value })}
                              onBlur={() => setDepositForm(recalcDeposit(depositForm))}
                            />
                          </td>
                          <td className="editable">
                            <select
                              id="depFixing"
                              className="cell-select"
                              value={depositForm.fixing}
                              onChange={(e) => setDepositForm({ ...depositForm, fixing: e.target.value })}
                            >
                              <option>Fixed</option>
                              <option>Floating</option>
                            </select>
                          </td>
                          <td className="editable">
                            <input
                              id="depStart"
                              className="cell-input"
                              type="text"
                              value={depositForm.start}
                              onChange={(e) => setDepositForm({ ...depositForm, start: e.target.value })}
                              onBlur={() => setDepositForm(recalcDeposit(depositForm))}
                            />
                          </td>
                          <td className="editable">
                            <input id="depEnd" className="cell-input" type="text" value={depositForm.end} readOnly />
                          </td>
                          <td>{record.depositTxn}</td>
                          <td className="icon-cell">
                            {/* Disabled in the original too: its saveDeposit() was never wired up. */}
                            <button id="saveDeposit" className="btn btn-ghost" type="button" title="Save" disabled>
                              Save
                            </button>
                          </td>
                          <td className="icon-cell">
                            <button
                              id="createDepositRow"
                              className="btn btn-primary"
                              type="button"
                              title="Create"
                              disabled={Boolean(record.depositTxn)}
                              onClick={createDepositRow}
                            >
                              Create
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div id="iclPane" style={{ display: tab === 'icl' ? 'block' : 'none' }}>
                <div className="card">
                  <div className="card-head">
                    <div className="card-title">Basic Details</div>
                    <div className="card-meta">ICL Request</div>
                  </div>
                  <div id="iclDetails" className="card-body">
                    <div className="detail-grid">
                      <DetailRow label="OTTK No" code={record.ottkNo} size="xs" />
                      <DetailRow
                        label="ICL Given Comp."
                        code={record.iclGivenComp}
                        desc={record.iclGivenName}
                        size="md"
                      />
                      <DetailRow
                        label="Business Area"
                        code={record.businessArea}
                        desc={record.businessAreaName}
                        size="md"
                      />
                      <DetailRow
                        label="ICL Received Comp."
                        code={record.iclReceivedComp}
                        desc={record.iclReceivedName}
                        size="md"
                      />
                      <DetailRow
                        label="Deposit Bank"
                        code={record.lcIssuanceBank}
                        desc={record.lcIssuanceBankName}
                        size="lg"
                      />
                      <DetailRow label="Entity String" code={record.entityString} size="md" />
                    </div>
                  </div>
                </div>
                <div className="card table-card">
                  <div className="card-head">
                    <div className="card-title">Create ICL Request</div>
                  </div>
                  <div className="table-wrap">
                    <table id="iclTable" className="edit-table">
                      <thead id="iclHead">
                        <EditHead columns={ICL_COLUMNS} />
                      </thead>
                      <tbody id="iclBody">
                        <tr>
                          <td className="money">{money(record.ottkAmount)}</td>
                          <td className="editable">
                            <input
                              id="iclAmount"
                              className="cell-input money"
                              type="text"
                              value={iclForm.amount}
                              onChange={(e) => setIclForm({ ...iclForm, amount: e.target.value })}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="iclStart"
                              className="cell-input"
                              type="text"
                              value={iclForm.start}
                              onChange={(e) => setIclForm({ ...iclForm, start: e.target.value })}
                              onBlur={() => {
                                const iso = isoFromDisplay(iclForm.start)
                                if (iso) setIclForm({ ...iclForm, end: displayDate(addDaysIso(iso, 10)) })
                              }}
                            />
                          </td>
                          <td className="editable">
                            <input id="iclEnd" className="cell-input" type="text" value={iclForm.end} readOnly />
                          </td>
                          <td className="editable">
                            <select
                              id="paymentMode"
                              className="cell-select"
                              value={iclForm.paymentMode}
                              onChange={(e) => setIclForm({ ...iclForm, paymentMode: e.target.value })}
                            >
                              <option>01 Pay to Group Co. (Indirect)</option>
                              <option>02 Pay Direct</option>
                            </select>
                          </td>
                          <td className="editable">
                            <span className="inline-actions">
                              {hideBankButton ? null : (
                                <button id="paymentBankBtn" className="link-button" type="button" onClick={openBankModal}>
                                  {paymentBank ? 'Change' : 'Select bank'}
                                </button>
                              )}
                              <span id="paymentBankText">{bankText}</span>
                            </span>
                          </td>
                          <td>
                            <input id="requestNo" className="cell-input" type="text" readOnly value={record.requestNo} />
                          </td>
                          <td className="icon-cell">
                            <button
                              id="createRequestBtn"
                              className="btn btn-primary"
                              type="button"
                              disabled={Boolean(record.requestNo)}
                              onClick={createIclRequest}
                            >
                              Create
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button id="depositIclOkay" className="btn btn-primary" type="button" onClick={() => setModalOpen(false)}>
                Okay
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div id="bankModal" className={bankOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Partner Bank</div>
            <button id="bankClose" className="modal-close" type="button" onClick={() => setBankOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="search-row">
              <input
                id="bankSearch"
                className="search-input"
                type="text"
                placeholder="Search bank, house bank or account"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
              />
            </div>
            <div className="table-wrap" style={{ maxHeight: '390px' }}>
              <table id="bankTable" className="bank-table">
                <thead id="bankHead">
                  <tr>
                    {BANK_COLUMNS.map((column, index) => (
                      <th
                        key={column.key}
                        className={sortClass('bank', index)}
                        style={{ width: '110px' }}
                        onClick={() => toggleSort('bank', index)}
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
                <tbody id="bankBody">
                  {bankRows.map(({ bank, index }) => (
                    <tr
                      key={`${index}`}
                      className={index === selectedBank ? 'selected' : ''}
                      onClick={() => setSelectedBank(index)}
                      onDoubleClick={finalizeBank}
                    >
                      {BANK_COLUMNS.map((column) => (
                        <td key={column.key}>{bank[column.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-foot">
            <button id="bankCancel" className="btn btn-ghost" type="button" onClick={() => setBankOpen(false)}>
              Cancel
            </button>
            <button
              id="bankSelect"
              className="btn btn-primary"
              type="button"
              disabled={selectedBank < 0}
              onClick={finalizeBank}
            >
              Select Bank
            </button>
          </div>
        </div>
      </div>

      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            <div className="toast-icon">{item.kind === 'success' ? 'OK' : 'i'}</div>
            <div>
              <div className="toast-title">
                {item.kind === 'success' ? 'Success' : item.kind === 'warning' ? 'Warning' : 'Information'}
              </div>
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
