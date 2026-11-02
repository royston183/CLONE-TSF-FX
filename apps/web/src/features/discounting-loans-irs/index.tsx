import { useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  amountColorClass,
  amountDisplay,
  genIrsId,
  genIrsTxnNo,
  generateCashflow,
  irsFromRecord,
  irsStatus,
  isoToDMY,
  isValidDMY,
  money,
  parseDMY,
  rateFmt,
  statusBadgeClass,
} from './calc.ts'
import { CASHFLOW_COLUMNS, MAIN_COLUMNS } from './columns.ts'
import {
  COMPANY_CODES,
  INTEREST_PAYMENT_DATE,
  LOAN_RECORDS,
  OUTGOING_INT_CAT,
  OUTGOING_INT_FRQ,
  PARTNERS,
  SPECIAL_CASE,
} from './data.ts'
import type { CashflowRow, IrsForm, LoanRecord, Toast, ToastKind } from './types.ts'
import './discounting-loans-irs.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './discounting-loans-irs.dark.css'
import { CalendarPicker } from '../../shared/ui/CalendarPicker.tsx'

const VERSION = 'v18'
const PAGE_SIZE = 12

type SortState = { index: number; direction: 'asc' | 'desc' } | null

/**
 * The IRS form as the original seeds it from a record: an already-assigned record shows the
 * terms it was created with, an unassigned one is pre-filled from the loan and left open.
 * The outgoing rates always start empty — the original re-renders that pair from scratch.
 */
function initialIrsForm(r: LoanRecord): IrsForm {
  const already = !!r.irsTxn
  return {
    coCode: r.companyCode,
    partnerName: already ? r.partnerName : r.bankName,
    startDate: r.startDate,
    endDate: r.endDate,
    incomingRef1: rateFmt(r.refInterestRate),
    incomingRef2: rateFmt(r.spreadRate),
    outgoingIntCat: already ? '01' : '',
    outgoingIntFrq: already ? r.resetFrequency : '',
    interestPaymentDate: '',
    specialCase: already ? r.specialCase : '',
    outgoingRate1: '',
    outgoingRate2: '',
  }
}

/** The loan summary strip, shown identically on the detail screen and inside the popup. */
function LoanDetailStats({ record }: { record: LoanRecord }) {
  const items: ReadonlyArray<readonly [string, string]> = [
    ['Deal ID', record.dealId],
    ['Transaction No.', record.discLoanTxn],
    ['BP Name', record.bankName],
    ['Start Date', record.startDate],
    ['End Date', record.endDate],
    ['Ref. Int. Rate', rateFmt(record.refInterestRate)],
    ['Reset Frequency', record.resetFrequency],
    ['Accounting Type', record.accountingType],
    ['Special Case', record.specialCase],
  ]
  return (
    <div className="stat-row">
      {items.map(([label, value]) => (
        <div className="stat-item" key={label}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  )
}

function CashflowBody({ rows }: { rows: readonly CashflowRow[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={CASHFLOW_COLUMNS.length} className="empty">
          No cashflow rows generated.
        </td>
      </tr>
    )
  }
  return (
    <>
      {rows.map((row, index) => (
        <tr key={`${row.paymentDate}-${row.flowType}-${index}`}>
          {CASHFLOW_COLUMNS.map((column) => {
            const value = column.value(row)
            const display = column.rate
              ? rateFmt(value)
              : column.amount
                ? amountDisplay(value)
                : column.number
                  ? money(value)
                  : String(value)
            const className =
              (column.number ? 'number' : '') +
              (column.amount ? ` amount${amountColorClass(value)}` : '') +
              (column.center ? ' center' : '')
            return (
              <td className={className} key={column.id}>
                {display}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

type DateInputProps = {
  id: string
  value: string
  invalid: boolean
  disabled?: boolean
  onChange: (next: string) => void
  onCommit: (next: string) => void
}

/** The text field plus the hidden native picker overlay the legacy page pairs with it. */
function DateInput({ id, value, invalid, disabled = false, onChange, onCommit }: DateInputProps) {
  const lockedClass = disabled ? ' detail-readonly-input' : ''
  return (
    <div className="date-input-wrap">
      <input
        id={id}
        className={`input${invalid ? ' input-error' : ''}${lockedClass}`}
        type="text"
        placeholder="DD-MM-YYYY"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        // The original validated on the DOM's change event, which only fires on commit;
        // blur is the React equivalent, and avoids warning on every keystroke.
        onBlur={(event) => onCommit(event.target.value)}
      />
      <div className="calendar-btn-wrap">
        <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true" />
        <CalendarPicker
          id={`${id}Native`}
          className="calendar-native"
          aria-label="Open calendar"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value) onCommit(isoToDMY(event.target.value))
          }}
        />
      </div>
    </div>
  )
}

export default function DiscountingLoansIrsApp() {
  const [records, setRecords] = useState<LoanRecord[]>(() => LOAN_RECORDS.map((r) => ({ ...r })))
  const [screen, setScreen] = useState<'list' | 'cashflow'>('list')
  const [statusText, setStatusText] = useState(`Ready - ${VERSION}`)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const [keyDate, setKeyDate] = useState('')
  const [keyDateInvalid, setKeyDateInvalid] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dealIdFilter, setDealIdFilter] = useState('')
  const [discTxnFilter, setDiscTxnFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [listPage, setListPage] = useState(1)
  const [sort, setSort] = useState<SortState>(null)

  const [selectedDealId, setSelectedDealId] = useState('')
  const [irsForm, setIrsForm] = useState<IrsForm | null>(null)
  const [irsDateInvalid, setIrsDateInvalid] = useState({ start: false, end: false })
  const [cashflowRows, setCashflowRows] = useState<CashflowRow[]>([])
  const [cashflowVisible, setCashflowVisible] = useState(false)
  const [popup, setPopup] = useState<{ record: LoanRecord; rows: CashflowRow[] } | null>(null)

  function toast(message: string, kind: ToastKind) {
    const id = (toastId.current += 1)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }

  const selectedRecord = records.find((r) => r.dealId === selectedDealId) ?? null
  const keyDateReady = parseDMY(keyDate) !== null

  const ordered = useMemo(() => {
    if (!sort) return records
    const column = MAIN_COLUMNS[sort.index]
    if (!column) return records
    return [...records].sort((a, b) => {
      let av: string | number = column.value(a)
      let bv: string | number = column.value(b)
      if (column.number) {
        av = Number(av || 0)
        bv = Number(bv || 0)
      } else {
        av = String(av || '').toLowerCase()
        bv = String(bv || '').toLowerCase()
      }
      if (av < bv) return sort.direction === 'asc' ? -1 : 1
      if (av > bv) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [records, sort])

  const filtered = useMemo(
    () =>
      ordered.filter((r) => {
        if (dealIdFilter && r.dealId !== dealIdFilter) return false
        if (discTxnFilter && r.discLoanTxn !== discTxnFilter) return false
        if (statusFilter && irsStatus(r) !== statusFilter) return false
        return true
      }),
    [ordered, dealIdFilter, discTxnFilter, statusFilter],
  )

  const dealIdOptions = useMemo(
    () => [...new Set(records.map((r) => r.dealId).filter(Boolean))].sort(),
    [records],
  )
  const discTxnOptions = useMemo(
    () => [...new Set(records.map((r) => r.discLoanTxn).filter(Boolean))].sort(),
    [records],
  )

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(listPage, pages)
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE)

  let firstPageButton = Math.max(1, page - 1)
  const lastPageButton = Math.min(pages, firstPageButton + 2)
  firstPageButton = Math.max(1, lastPageButton - 2)
  const pageButtons: number[] = []
  for (let p = firstPageButton; p <= lastPageButton; p++) pageButtons.push(p)

  function commitKeyDate(next: string) {
    setKeyDate(next)
    if (next !== '' && !isValidDMY(next)) {
      setKeyDateInvalid(true)
      toast(`Invalid date "${next}". Please use DD-MM-YYYY format.`, 'warning')
      setStatusText('Enter Key Date')
      return
    }
    setKeyDateInvalid(false)
    setListPage(1)
    setStatusText(parseDMY(next) ? `Records loaded as of ${next}` : 'Enter Key Date')
    if (!parseDMY(next)) setSelectedDealId('')
  }

  function toggleSort(index: number) {
    setSort((current) =>
      current && current.index === index && current.direction === 'asc'
        ? { index, direction: 'desc' }
        : { index, direction: 'asc' },
    )
    setListPage(1)
  }

  function openCashflowScreen(r: LoanRecord) {
    setSelectedDealId(r.dealId)
    setScreen('cashflow')
    setIrsForm(initialIrsForm(r))
    setIrsDateInvalid({ start: false, end: false })
    if (r.irsTxn) {
      setCashflowRows(generateCashflow(r, irsFromRecord(r)))
      setCashflowVisible(true)
    } else {
      setCashflowRows([])
      setCashflowVisible(false)
    }
  }

  function backToList() {
    setScreen('list')
  }

  function createIrs() {
    const r = selectedRecord
    if (!r || !irsForm) return
    const form = irsForm
    if (
      !form.coCode ||
      !form.partnerName ||
      !parseDMY(form.startDate) ||
      !parseDMY(form.endDate) ||
      !form.incomingRef1 ||
      !form.incomingRef2 ||
      !form.outgoingIntCat ||
      !form.outgoingIntFrq ||
      !form.interestPaymentDate ||
      !form.specialCase ||
      !form.outgoingRate1
    ) {
      toast('Please fill all required IRS fields before creating.', 'warning')
      return
    }
    if (form.outgoingIntCat === '02' && !form.outgoingRate2) {
      toast('Please fill both Outgoing Int Rate values.', 'warning')
      return
    }

    const irsTxn = genIrsTxnNo()
    const updated: LoanRecord = {
      ...r,
      irsId: genIrsId(),
      irsCompanyName: COMPANY_CODES.find((c) => c.code === form.coCode)?.name ?? '',
      irsTxn,
      partnerName: form.partnerName,
    }
    setRecords((current) => current.map((x) => (x.dealId === updated.dealId ? updated : x)))
    setCashflowRows(generateCashflow(updated, form))
    setCashflowVisible(true)
    // The original re-renders the IRS panel from the saved record, which locks every field.
    setIrsForm(initialIrsForm(updated))
    toast(`IRS transaction created successfully: ${irsTxn}`, 'success')
    setStatusText(`IRS transaction created: ${irsTxn}`)
  }

  function openCashflowPopup(r: LoanRecord) {
    setPopup({ record: r, rows: generateCashflow(r, irsFromRecord(r)) })
  }

  function resetListScreen() {
    setKeyDate('')
    setKeyDateInvalid(false)
    setDealIdFilter('')
    setDiscTxnFilter('')
    setStatusFilter('')
    setFiltersOpen(false)
    setSelectedDealId('')
    setListPage(1)
    setStatusText(`Ready - ${VERSION}`)
    toast('List screen has been refreshed.', 'success')
  }

  function resetCashflowScreen() {
    if (!selectedRecord) {
      setStatusText(`Ready - ${VERSION}`)
      toast('Nothing to refresh.', 'warning')
      return
    }
    openCashflowScreen(selectedRecord)
    setStatusText('Cashflow screen refreshed')
    toast('Cashflow screen has been refreshed.', 'success')
  }

  const locked = !!selectedRecord?.irsTxn
  const lockedInputClass = locked ? 'input detail-readonly-input' : 'input'

  function setForm(patch: Partial<IrsForm>) {
    setIrsForm((current) => (current ? { ...current, ...patch } : current))
  }

  function commitIrsDate(which: 'start' | 'end', next: string) {
    setForm(which === 'start' ? { startDate: next } : { endDate: next })
    const invalid = next !== '' && !isValidDMY(next)
    setIrsDateInvalid((current) => ({ ...current, [which]: invalid }))
    if (invalid) toast(`Invalid date "${next}". Please use DD-MM-YYYY format.`, 'warning')
  }

  return (
    <div className="discloansirs">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BackButton className="refresh-btn" />
              <div className="title" id="screenTitle">
                {screen === 'cashflow' ? 'All Cashflow Details' : 'View Discounting Loans and Create IRS'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {screen === 'cashflow' ? (
                <button id="backToListBtn" className="refresh-btn" type="button" onClick={backToList}>
                  &#8592; Back
                </button>
              ) : null}
              <button
                id="refreshBtn"
                className="refresh-btn"
                type="button"
                onClick={() => (screen === 'cashflow' ? resetCashflowScreen() : resetListScreen())}
              >
                &#8635; Refresh
              </button>
              <SignOutButton className="refresh-btn" />
            </div>
          </div>
        </div>

        <div className="content">
          <div id="listScreen" className={screen === 'list' ? 'screen active' : 'screen'}>
            <div className="card">
              <div className="card-head">
                <div className="card-title">Basic Selection</div>
                <div className="card-meta">Required</div>
              </div>
              <div className="card-body">
                <div className="selection-main-row">
                  <div className="field structure-field date-field">
                    <label htmlFor="keyDate">Key Date<span className="req">*</span></label>
                    <DateInput
                      id="keyDate"
                      value={keyDate}
                      invalid={keyDateInvalid}
                      onChange={setKeyDate}
                      onCommit={commitKeyDate}
                    />
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
                        id="dealIdFilter"
                        className="select filter-md"
                        value={dealIdFilter}
                        onChange={(event) => {
                          setDealIdFilter(event.target.value)
                          setListPage(1)
                        }}
                      >
                        <option value="">Deal ID</option>
                        {dealIdOptions.map((value) => (
                          <option value={value} key={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-item">
                      <select
                        id="discTxnFilter"
                        className="select filter-md"
                        value={discTxnFilter}
                        onChange={(event) => {
                          setDiscTxnFilter(event.target.value)
                          setListPage(1)
                        }}
                      >
                        <option value="">Disc Loan Txn No.</option>
                        {discTxnOptions.map((value) => (
                          <option value={value} key={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-item">
                      <select
                        id="statusFilter"
                        className="select filter-lg"
                        value={statusFilter}
                        onChange={(event) => {
                          setStatusFilter(event.target.value)
                          setListPage(1)
                        }}
                      >
                        <option value="">Status</option>
                        <option value="Assigned to IRS">Assigned to IRS</option>
                        <option value="Not Assigned to IRS">Not Assigned to IRS</option>
                      </select>
                    </div>
                    <button
                      id="clearFilters"
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setDealIdFilter('')
                        setDiscTxnFilter('')
                        setStatusFilter('')
                        setListPage(1)
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div id="resultsArea" style={{ display: keyDateReady ? 'block' : 'none' }}>
              <div className="toolbar">
                <div className="toolbar-left">
                  <button
                    id="printLoanCfBtn"
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setStatusText('Preparing print for the current loan overview')
                      window.print()
                    }}
                  >
                    Print Loan CF
                  </button>
                </div>
                <div className="toolbar-right" />
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">Discounting Loan Overview</div>
                  <div className="card-meta" id="rowCountMeta">{`${filtered.length} record(s)`}</div>
                </div>
                <div className="table-wrap">
                  <table id="mainTable" className="data-table">
                    <thead id="mainHead">
                      <tr>
                        <th style={{ width: 110 }}>Action</th>
                        <th style={{ width: 90 }}>View</th>
                        {MAIN_COLUMNS.map((column, index) => {
                          // The original replaced the header's class outright when sorting,
                          // which dropped the "number" alignment; keeping both is the fix.
                          const base = column.number ? 'number' : ''
                          const sorted =
                            sort && sort.index === index
                              ? sort.direction === 'asc'
                                ? ' sort-asc'
                                : ' sort-desc'
                              : ''
                          return (
                            <th
                              key={column.id}
                              className={`${base}${sorted}`}
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
                        <th style={{ width: 150 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody id="mainBody">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={MAIN_COLUMNS.length + 3} className="empty">
                            No records match the current filters.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((r) => {
                          const status = irsStatus(r)
                          return (
                            <tr key={r.dealId}>
                              <td>
                                <button
                                  className="btn btn-primary row-action-btn"
                                  type="button"
                                  disabled={!!r.irsTxn}
                                  onClick={() => openCashflowScreen(r)}
                                >
                                  Create IRS
                                </button>
                              </td>
                              <td>
                                <button
                                  className="link-button"
                                  type="button"
                                  disabled={!r.irsTxn}
                                  onClick={() => openCashflowPopup(r)}
                                >
                                  <span className="link-icon">&#8595;</span>Cashflow
                                </button>
                              </td>
                              {MAIN_COLUMNS.map((column) => {
                                const value = column.value(r)
                                const display = column.rate
                                  ? rateFmt(value)
                                  : column.number
                                    ? money(value)
                                    : String(value)
                                return (
                                  <td className={column.number ? 'number' : ''} key={column.id}>
                                    {display}
                                  </td>
                                )
                              })}
                              <td>
                                <span className={statusBadgeClass(status)}>{status}</span>
                              </td>
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
                    disabled={page === 1}
                    onClick={() => setListPage(page - 1)}
                  >
                    Previous
                  </button>
                  {pageButtons.map((p) => (
                    <button
                      className={p === page ? 'page-btn active' : 'page-btn'}
                      type="button"
                      key={p}
                      onClick={() => setListPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="page-btn"
                    type="button"
                    disabled={page === pages}
                    onClick={() => setListPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div id="cashflowScreen" className={screen === 'cashflow' ? 'screen active' : 'screen'}>
            <div className="card">
              <div className="card-head">
                <div className="card-title">Discounting Loan Details</div>
                <div className="card-meta">Selected Record</div>
              </div>
              <div id="loanDetailBody" className="card-body">
                {selectedRecord ? <LoanDetailStats record={selectedRecord} /> : null}
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <div className="card-title">IRS Details</div>
                <button
                  id="createIrsBtn"
                  className="btn btn-primary"
                  type="button"
                  disabled={locked}
                  onClick={createIrs}
                >
                  Create IRS
                </button>
              </div>
              <div id="irsDetailBody" className="card-body">
                {selectedRecord && irsForm ? (
                  <div className="irs-grid">
                    <div className="irs-field">
                      <label htmlFor="irsCoCode">IRS Co Code<span className="req">*</span></label>
                      <select
                        id="irsCoCode"
                        className="select"
                        value={irsForm.coCode}
                        disabled={locked}
                        onChange={(event) => setForm({ coCode: event.target.value })}
                      >
                        <option value="">Select</option>
                        {COMPANY_CODES.map((company) => (
                          <option value={company.code} key={company.code}>
                            {company.code}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="irs-field">
                      <label htmlFor="irsTransactionNo">IRS Transaction</label>
                      <input
                        id="irsTransactionNo"
                        className="input detail-readonly-input"
                        type="text"
                        value={selectedRecord.irsTxn}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="irs-field">
                      <label htmlFor="irsBp">IRS BP<span className="req">*</span></label>
                      <select
                        id="irsBp"
                        className="select"
                        value={irsForm.partnerName}
                        disabled={locked}
                        onChange={(event) => setForm({ partnerName: event.target.value })}
                      >
                        <option value="">Select</option>
                        {PARTNERS.map((partner) => (
                          <option value={partner.name} key={partner.id}>
                            {partner.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="irs-field">
                      <label htmlFor="irsStartDate">Start Date<span className="req">*</span></label>
                      <DateInput
                        id="irsStartDate"
                        value={irsForm.startDate}
                        invalid={irsDateInvalid.start}
                        disabled={locked}
                        onChange={(next) => setForm({ startDate: next })}
                        onCommit={(next) => commitIrsDate('start', next)}
                      />
                    </div>

                    <div className="irs-field">
                      <label htmlFor="irsEndDate">End Date<span className="req">*</span></label>
                      <DateInput
                        id="irsEndDate"
                        value={irsForm.endDate}
                        invalid={irsDateInvalid.end}
                        disabled={locked}
                        onChange={(next) => setForm({ endDate: next })}
                        onCommit={(next) => commitIrsDate('end', next)}
                      />
                    </div>

                    <div className="irs-field">
                      <label>Incoming Int Ref<span className="req">*</span></label>
                      <div className="twin-input-wrap">
                        <input
                          id="incomingRef1"
                          className={lockedInputClass}
                          type="text"
                          value={irsForm.incomingRef1}
                          disabled={locked}
                          onChange={(event) => setForm({ incomingRef1: event.target.value })}
                        />
                        <input
                          id="incomingRef2"
                          className={lockedInputClass}
                          type="text"
                          value={irsForm.incomingRef2}
                          disabled={locked}
                          onChange={(event) => setForm({ incomingRef2: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="irs-field">
                      <label htmlFor="outgoingIntCat">Outgoing Int Cat<span className="req">*</span></label>
                      <select
                        id="outgoingIntCat"
                        className="select"
                        value={irsForm.outgoingIntCat}
                        disabled={locked}
                        onChange={(event) =>
                          setForm({ outgoingIntCat: event.target.value, outgoingRate1: '', outgoingRate2: '' })
                        }
                      >
                        <option value="">Select</option>
                        {OUTGOING_INT_CAT.map((option) => (
                          <option value={option.code} key={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div id="outgoingRateWrap">
                      {irsForm.outgoingIntCat === '01' ? (
                        <div className="irs-field">
                          <label htmlFor="outgoingRate1">Outgoing Int Rate<span className="req">*</span></label>
                          <input
                            id="outgoingRate1"
                            className="input"
                            type="text"
                            value={irsForm.outgoingRate1}
                            onChange={(event) => setForm({ outgoingRate1: event.target.value })}
                          />
                        </div>
                      ) : irsForm.outgoingIntCat === '02' ? (
                        <div className="irs-field">
                          <label>Outgoing Int Rate<span className="req">*</span></label>
                          <div className="twin-input-wrap">
                            <input
                              id="outgoingRate1"
                              className="input"
                              type="text"
                              value={irsForm.outgoingRate1}
                              onChange={(event) => setForm({ outgoingRate1: event.target.value })}
                            />
                            <input
                              id="outgoingRate2"
                              className="input"
                              type="text"
                              value={irsForm.outgoingRate2}
                              onChange={(event) => setForm({ outgoingRate2: event.target.value })}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="irs-field">
                      <label htmlFor="outgoingIntFrq">Outgoing Int Frq<span className="req">*</span></label>
                      <select
                        id="outgoingIntFrq"
                        className="select"
                        value={irsForm.outgoingIntFrq}
                        disabled={locked}
                        onChange={(event) => setForm({ outgoingIntFrq: event.target.value })}
                      >
                        <option value="">Select</option>
                        {OUTGOING_INT_FRQ.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="irs-field">
                      <label htmlFor="interestPaymentDate">Interest Payment Date<span className="req">*</span></label>
                      <select
                        id="interestPaymentDate"
                        className="select"
                        value={irsForm.interestPaymentDate}
                        disabled={locked}
                        onChange={(event) => setForm({ interestPaymentDate: event.target.value })}
                      >
                        <option value="">Select</option>
                        {INTEREST_PAYMENT_DATE.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="irs-field">
                      <label htmlFor="irsSpecialCase">Special Case<span className="req">*</span></label>
                      <select
                        id="irsSpecialCase"
                        className="select"
                        value={irsForm.specialCase}
                        disabled={locked}
                        onChange={(event) => setForm({ specialCase: event.target.value })}
                      >
                        <option value="">Select</option>
                        {SPECIAL_CASE.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div
              id="cashflowTableCard"
              className="card table-card"
              style={{ display: cashflowVisible ? 'block' : 'none' }}
            >
              <div className="card-head">
                <div className="card-title">Cashflow Details</div>
                <div className="card-meta" id="cashflowCountMeta">
                  {cashflowVisible ? `${cashflowRows.length} row(s)` : ''}
                </div>
              </div>
              <div className="table-wrap">
                <table id="cashflowTable" className="data-table">
                  <thead id="cashflowHead">
                    <tr>
                      {CASHFLOW_COLUMNS.map((column) => (
                        <th
                          key={column.id}
                          className={(column.number ? 'number' : '') + (column.center ? ' center' : '')}
                          style={{ width: column.width }}
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
                  <tbody id="cashflowBody">
                    <CashflowBody rows={cashflowRows} />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="cashflowPopup" className={popup ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal large">
          <div className="modal-head">
            <div className="modal-title" id="cashflowPopupTitle">
              {popup ? `Cashflow Details - ${popup.record.discLoanTxn}` : 'Cashflow Details'}
            </div>
            <button id="cashflowPopupClose" className="modal-close" type="button" onClick={() => setPopup(null)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Discounting Loan Details</div>
                <div className="card-meta">Selected Record</div>
              </div>
              <div id="popupLoanDetailBody" className="card-body">
                {popup ? <LoanDetailStats record={popup.record} /> : null}
              </div>
            </div>
            <div className="card table-card">
              <div className="table-wrap">
                <table id="popupCashflowTable" className="data-table">
                  <thead id="popupCashflowHead">
                    <tr>
                      {CASHFLOW_COLUMNS.map((column) => (
                        <th
                          key={column.id}
                          className={(column.number ? 'number' : '') + (column.center ? ' center' : '')}
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="popupCashflowBody">
                    <CashflowBody rows={popup ? popup.rows : []} />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.kind === 'information' ? '' : t.kind}`} key={t.id}>
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
        <span className="status-dot" />
        <span id="statusText">{statusText}</span>
      </div>
    </div>
  )
}
