import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  addDays,
  calcDeposit,
  money,
  normalizeDate,
  rate as formatRate,
  rateValue,
  toNumber,
} from './calc.ts'
import { BANK_COLUMNS, DEPOSIT_COLUMNS, ICL_COLUMNS, LIST_COLUMNS } from './columns.ts'
import { DUMMY_BANKS, DUMMY_OTTKS, FIRST_REQUEST_NUMBER, STRUCTURES } from './data.ts'
import type {
  Bank,
  HeaderColumn,
  ListColumnKey,
  Ottk,
  SortPrefix,
  SortState,
  Toast,
} from './types.ts'
import './icl-request.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './icl-request.dark.css'

const PAGE_SIZE = 12

type DepositForm = {
  depositValue: string
  interestCategory: string
  interestRate: string
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

function buildDepositForm(row: Ottk): DepositForm {
  const start = normalizeDate(row.depositStart ?? row.expectedDate)
  const end = row.depositEnd ? normalizeDate(row.depositEnd) : addDays(start, row.noOfDays || 180)
  const tradeValue = row.depositTradeValue ?? row.ottkValue
  const amount = row.depositAmount ?? calcDeposit(tradeValue, row.interestRate, row.noOfDays)
  return {
    depositValue: 'DTY Discounted Value',
    interestCategory: row.interestCategory || 'Fixed',
    interestRate: formatRate(row.interestRate),
    noOfDays: String(row.noOfDays),
    tradeValue: money(tradeValue),
    amount: money(amount),
    rate: formatRate(row.interestRate),
    fixing: row.depositFixing === 'Floating' ? 'Floating' : 'Fixed',
    start,
    end,
  }
}

function buildIclForm(row: Ottk): IclForm {
  const start = normalizeDate(row.depositStart ?? row.expectedDate)
  return {
    amount: money(row.depositAmount ?? calcDeposit(row.ottkValue, row.interestRate, row.noOfDays)),
    start,
    // The ICL request runs ten days from the deposit start, per the original.
    end: addDays(start, 10),
    paymentMode: '01 Pay to Group Co. (Indirect)',
  }
}

function listValue(row: Ottk, key: ListColumnKey): string | number {
  return row[key] ?? ''
}

function sortClass(sort: SortState, prefix: SortPrefix, index: number): string {
  if (sort.table !== prefix || sort.index !== index) return ''
  return sort.direction === 'asc' ? 'sort-asc' : 'sort-desc'
}

function HeaderCells({
  columns,
  prefix,
  sort,
  onSort,
}: {
  columns: readonly HeaderColumn[]
  prefix: SortPrefix
  sort: SortState
  onSort: (prefix: SortPrefix, index: number) => void
}) {
  return (
    <>
      {columns.map((column, index) => (
        <th
          key={column.label}
          className={sortClass(sort, prefix, index)}
          style={{ width: `${column.width}px` }}
          onClick={() => onSort(prefix, index)}
        >
          {column.label}
          {column.required ? <span className="req">*</span> : null}
          <span className="sort-arrows">
            <span className="sort-up" />
            <span className="sort-down" />
          </span>
        </th>
      ))}
    </>
  )
}

function DetailLine({
  label,
  code,
  desc,
  size = 'md',
}: {
  label: string
  code: string
  desc?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  return (
    <div className="detail-line">
      <div className="detail-label">{label}</div>
      <div className={`detail-value size-${size}`}>
        <span className="code">{code}</span>
        {desc ? <span className="description">{desc}</span> : null}
      </div>
    </div>
  )
}

export default function IclRequestApp() {
  const [rows, setRows] = useState<readonly Ottk[]>(DUMMY_OTTKS)
  const [nextRequestNumber, setNextRequestNumber] = useState(FIRST_REQUEST_NUMBER)

  const [screen, setScreen] = useState<'selection' | 'request'>('selection')
  const [statusText, setStatusText] = useState('Ready')
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const toastId = useRef(0)

  const [structure, setStructure] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [ottkFilter, setOttkFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [sort, setSort] = useState<SortState>({ table: '', index: -1, direction: '' })
  const [listPage, setListPage] = useState(1)
  const [selectedNo, setSelectedNo] = useState('')

  const [pane, setPane] = useState<'deposit' | 'icl'>('deposit')
  const [depositSaved, setDepositSaved] = useState(false)
  const [requestNo, setRequestNo] = useState('')
  const [deposit, setDeposit] = useState<DepositForm | null>(null)
  const [icl, setIcl] = useState<IclForm | null>(null)

  const [bankOpen, setBankOpen] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)

  const selectedRow = rows.find((row) => row.ottkNo === selectedNo) ?? null

  function toast(message: string, kind: Toast['kind'] = '') {
    const id = (toastId.current += 1)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }

  useEffect(() => {
    if (!bankOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBankOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [bankOpen])

  // The three filter dropdowns list only what the chosen structure contains, so they are
  // rebuilt whenever it changes — which is also why changing it clears the filters.
  const structureRows = useMemo(
    () => rows.filter((row) => !structure || !row.tsfStructure || row.tsfStructure === structure),
    [rows, structure],
  )

  const ottkOptions = useMemo(() => structureRows.map((row) => row.ottkNo), [structureRows])

  const entityOptions = useMemo(
    () => [...new Set(structureRows.map((row) => row.entityId).filter(Boolean))].sort(),
    [structureRows],
  )

  const statusOptions = useMemo(
    () => [...new Set(structureRows.map((row) => row.ottkStatDesc).filter(Boolean))].sort(),
    [structureRows],
  )

  const filteredRows = useMemo(() => {
    const matched = structureRows.filter(
      (row) =>
        (!ottkFilter || row.ottkNo === ottkFilter) &&
        (!entityFilter || row.entityId === entityFilter) &&
        (!statusFilter || row.ottkStatDesc === statusFilter),
    )
    const column = sort.table === 'list' ? LIST_COLUMNS[sort.index] : undefined
    if (!column || !sort.direction) return matched
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...matched].sort((a, b) => {
      const av = column.number
        ? Number(listValue(a, column.key) || 0)
        : String(listValue(a, column.key)).toLowerCase()
      const bv = column.number
        ? Number(listValue(b, column.key) || 0)
        : String(listValue(b, column.key)).toLowerCase()
      if (av < bv) return -factor
      if (av > bv) return factor
      return 0
    })
  }, [structureRows, ottkFilter, entityFilter, statusFilter, sort])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const page = Math.min(listPage, pageCount)
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const pageButtons = useMemo(() => {
    const end = Math.min(pageCount, Math.max(1, page - 1) + 2)
    const start = Math.max(1, end - 2)
    const numbers: number[] = []
    for (let p = start; p <= end; p++) numbers.push(p)
    return numbers
  }, [page, pageCount])

  const shownBanks = useMemo(() => {
    const query = bankSearch.toLowerCase()
    const matched = DUMMY_BANKS.filter(
      (bank) => !query || JSON.stringify(bank).toLowerCase().includes(query),
    )
    const column = sort.table === 'bank' ? BANK_COLUMNS[sort.index] : undefined
    if (!column || !sort.direction) return matched
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...matched].sort((a, b) => {
      const av = String(a[column.key]).toLowerCase()
      const bv = String(b[column.key]).toLowerCase()
      if (av < bv) return -factor
      if (av > bv) return factor
      return 0
    })
  }, [bankSearch, sort])

  function onSort(prefix: SortPrefix, index: number) {
    setSort((current) => ({
      table: prefix,
      index,
      direction:
        current.table === prefix && current.index === index && current.direction === 'asc'
          ? 'desc'
          : 'asc',
    }))
    // The deposit and ICL grids hold a single row, so their headers only show the marker.
    if (prefix === 'list') {
      setListPage(1)
      setSelectedNo('')
    }
  }

  function onStructureChange(value: string) {
    setStructure(value)
    setOttkFilter('')
    setEntityFilter('')
    setStatusFilter('')
    setListPage(1)
    setSelectedNo('')
    setStatusText(value ? 'Open OTTKs loaded' : 'Select TSF Structure')
  }

  function onFilterChange(apply: () => void) {
    apply()
    setListPage(1)
    setSelectedNo('')
  }

  function openRequest() {
    if (!selectedRow || selectedRow.requestNo) return
    setDepositSaved(false)
    setRequestNo('')
    setSelectedBank(null)
    setDeposit(buildDepositForm(selectedRow))
    setIcl(null)
    setPane('deposit')
    setScreen('request')
    setStatusText('Deposit calculator opened')
  }

  function recalcDeposit() {
    setDeposit((current) => {
      if (!current) return current
      const start = normalizeDate(current.start)
      const applied = current.rate || current.interestRate
      return {
        ...current,
        start,
        end: addDays(start, current.noOfDays),
        amount: money(calcDeposit(current.tradeValue, toNumber(applied), current.noOfDays)),
        interestRate: rateValue(applied),
        rate: rateValue(applied),
      }
    })
  }

  function saveDeposit() {
    if (!selectedRow || !deposit) return
    const updated: Ottk = {
      ...selectedRow,
      depositTradeValue: toNumber(deposit.tradeValue),
      depositAmount: toNumber(deposit.amount),
      interestRate: Number(deposit.rate) || 0,
      depositFixing: deposit.fixing,
      noOfDays: Number(deposit.noOfDays) || 0,
      depositStart: normalizeDate(deposit.start),
      depositEnd: normalizeDate(deposit.end),
    }
    setRows((current) => current.map((row) => (row.ottkNo === updated.ottkNo ? updated : row)))
    setDepositSaved(true)
    setIcl(buildIclForm(updated))
    setPane('icl')
    toast('Deposit details saved successfully.', 'success')
    setStatusText('Deposit saved')
  }

  function openDepositPane() {
    setPane('deposit')
  }

  function openIclPane() {
    if (!selectedRow) return
    setIcl(buildIclForm(selectedRow))
    setPane('icl')
  }

  function openBankModal() {
    setSelectedBank(null)
    setBankSearch('')
    setBankOpen(true)
  }

  function finalizeBank() {
    if (!selectedBank || !selectedRow) return
    const updated: Ottk = { ...selectedRow, paymentBank: selectedBank }
    setRows((current) => current.map((row) => (row.ottkNo === updated.ottkNo ? updated : row)))
    setBankOpen(false)
    toast('Partner bank selected.', 'success')
  }

  function createRequest() {
    if (!selectedRow || !icl) return
    if (!selectedRow.paymentBank) {
      toast('Select Payment ID (Pay To) before creating the request.', 'warning')
      return
    }
    if (requestNo) return
    const created = String(nextRequestNumber)
    setNextRequestNumber(nextRequestNumber + 1)
    setRequestNo(created)
    setRows((current) =>
      current.map((row) =>
        row.ottkNo === selectedRow.ottkNo
          ? { ...row, iclRequestAmount: icl.amount, requestNo: created }
          : row,
      ),
    )
    toast(`ICL Request ${created} created successfully.`, 'success')
    setStatusText(`ICL Request ${created} created successfully`)
  }

  const paymentBank = selectedRow?.paymentBank ?? null
  const paymentBankText = paymentBank
    ? `${paymentBank.partnerBank || paymentBank.houseBank} - ${paymentBank.bankName}`
    : ''

  const stepDepositClass = pane === 'deposit' ? 'step active' : 'step done'
  const stepIclClass =
    pane === 'icl' ? (requestNo ? 'step done' : 'step active') : 'step'

  return (
    <div className="iclrequest">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BackButton className="btn btn-ghost" />
              <div className="title">Create ICL Request</div>
            </div>
            <div>
              <SignOutButton className="btn btn-ghost" />
            </div>
          </div>
        </div>
        <div className="content">
          <div
            id="selectionScreen"
            className={screen === 'selection' ? 'screen active' : 'screen'}
          >
            <div className="card">
              <div className="card-head">
                <div className="card-title">Basic Selection</div>
                <div className="card-meta">Required</div>
              </div>
              <div className="card-body">
                <div className="selection-main-row">
                  <div className="field structure-field">
                    <label htmlFor="tsfStructure">TSF Structure<span className="req">*</span></label>
                    <select
                      id="tsfStructure"
                      className="select"
                      value={structure}
                      onChange={(event) => onStructureChange(event.target.value)}
                    >
                      <option value="">Select TSF Structure</option>
                      {STRUCTURES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* inline filters: filter button + dropdowns on same row, right side */}
                  <div className="filter-inline-group">
                    <button
                      id="filterToggle"
                      className="filter-icon-btn"
                      type="button"
                      title="Filters"
                      aria-label="Filters"
                      onClick={() => setFiltersOpen((open) => !open)}
                    />
                    <div
                      id="filterBody"
                      className="filter-body"
                      style={{
                        display: filtersOpen ? 'flex' : 'none',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        margin: 0,
                        padding: 0,
                        border: 0,
                      }}
                    >
                      <div className="filter-item">
                        <label htmlFor="ottkNumber">OTTK No</label>
                        <select
                          id="ottkNumber"
                          className="select compact-filter"
                          value={ottkFilter}
                          onChange={(event) =>
                            onFilterChange(() => setOttkFilter(event.target.value))
                          }
                        >
                          <option value="">All OTTK Numbers</option>
                          {ottkOptions.map((no, index) => (
                            <option key={`${no}-${index}`} value={no}>
                              {no}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-item">
                        <label htmlFor="entityFrom">Entity ID</label>
                        <select
                          id="entityFrom"
                          className="select compact-filter"
                          value={entityFilter}
                          onChange={(event) =>
                            onFilterChange(() => setEntityFilter(event.target.value))
                          }
                        >
                          <option value="">All Entity IDs</option>
                          {entityOptions.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-item">
                        <label htmlFor="statusFrom">OTTK Status</label>
                        <select
                          id="statusFrom"
                          className="select medium-filter"
                          value={statusFilter}
                          onChange={(event) =>
                            onFilterChange(() => setStatusFilter(event.target.value))
                          }
                        >
                          <option value="">All OTTK Statuses</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-actions">
                        <button
                          id="clearFilters"
                          className="btn btn-ghost"
                          type="button"
                          onClick={() =>
                            onFilterChange(() => {
                              setOttkFilter('')
                              setEntityFilter('')
                              setStatusFilter('')
                            })
                          }
                        >
                          Clear filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="resultsArea" style={{ display: structure ? 'flex' : 'none' }}>
              <div className="toolbar">
                <div className="toolbar-right">
                  <button
                    id="openRequestBtn"
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedRow || !!selectedRow.requestNo}
                    onClick={openRequest}
                  >
                    Create ICL Request
                  </button>
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">Create ICL Request</div>
                </div>
                <div className="table-wrap results-table-wrap">
                  <table id="ottkTable" className="data-table">
                    <thead id="ottkHead">
                      <tr>
                        <th style={{ width: '42px' }}>Select</th>
                        <HeaderCells
                          columns={LIST_COLUMNS}
                          prefix="list"
                          sort={sort}
                          onSort={onSort}
                        />
                      </tr>
                    </thead>
                    <tbody id="ottkBody">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={LIST_COLUMNS.length + 1} className="empty">
                            No open OTTKs match the current filters.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => (
                          <tr
                            key={row.ottkNo}
                            className={row.ottkNo === selectedNo ? 'selected' : ''}
                            onClick={() => setSelectedNo(row.ottkNo)}
                          >
                            <td>
                              <input
                                type="radio"
                                name="ottkPick"
                                value={row.ottkNo}
                                checked={row.ottkNo === selectedNo}
                                onChange={() => setSelectedNo(row.ottkNo)}
                              />
                            </td>
                            {LIST_COLUMNS.map((column) => {
                              const value = listValue(row, column.key)
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
                  {pageButtons.map((number) => (
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

          <div id="requestScreen" className={screen === 'request' ? 'screen active' : 'screen'}>
            <div className="toolbar">
              <div className="toolbar-left">
                <button
                  id="backToList"
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setScreen('selection')
                    setSelectedNo('')
                  }}
                >
                  Back to OTTK List
                </button>
              </div>
            </div>
            {/* progress tracker instead of tabs */}
            <div className="progress" style={{ padding: '8px 0 12px 0' }}>
              <div className="progress-track">
                <div className={stepDepositClass} id="stepDeposit" onClick={openDepositPane}>
                  <div className="step-dot">1</div>
                  <div className="step-label">Deposit Calculator</div>
                </div>
                <div
                  className="step-line"
                  id="stepLine1"
                  style={{ background: pane === 'icl' ? '#107e3e' : '#d9d9d9' }}
                />
                <div
                  className={stepIclClass}
                  id="stepIcl"
                  onClick={() => {
                    if (depositSaved) openIclPane()
                    else toast('Please save deposit first.', 'warning')
                  }}
                >
                  <div className="step-dot">2</div>
                  <div className="step-label">ICL Request</div>
                </div>
              </div>
            </div>
            <div id="depositPane" style={{ display: pane === 'deposit' ? 'block' : 'none' }}>
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Deposit Details</div>
                  <div className="card-meta">Selected OTTK</div>
                </div>
                <div id="depositDetails" className="card-body">
                  {selectedRow && deposit ? (
                    <div className="detail-grid">
                      <DetailLine label="OTTK No" code={selectedRow.ottkNo} size="xs" />
                      <DetailLine
                        label="Company Code"
                        code={selectedRow.companyCode}
                        desc={selectedRow.companyName}
                        size="md"
                      />
                      <DetailLine
                        label="Business Area"
                        code={selectedRow.businessArea}
                        desc={selectedRow.businessAreaName}
                        size="md"
                      />
                      <DetailLine
                        label="LC Issuance Bank"
                        code={selectedRow.lcIssuanceBank}
                        desc={selectedRow.lcIssuanceBankName}
                        size="lg"
                      />
                      <DetailLine
                        label="OTTK Trade Value"
                        code={money(selectedRow.ottkValue)}
                        desc={selectedRow.ottkCurr}
                        size="sm"
                      />
                      <div className="detail-line">
                        <div className="detail-label">Deposit Value</div>
                        <select
                          id="depositValue"
                          className="select detail-control-md"
                          value={deposit.depositValue}
                          onChange={(event) =>
                            setDeposit({ ...deposit, depositValue: event.target.value })
                          }
                        >
                          <option>DTY Discounted Value</option>
                        </select>
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">Interest Category</div>
                        <select
                          id="interestCategory"
                          className="select detail-control-sm detail-readonly-select"
                          disabled
                          value={deposit.interestCategory}
                          onChange={() => undefined}
                        >
                          <option>{deposit.interestCategory}</option>
                        </select>
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">Interest Rate</div>
                        <input
                          id="interestRate"
                          className="input detail-control-xs money detail-readonly-input"
                          type="text"
                          readOnly
                          value={deposit.interestRate}
                        />
                      </div>
                      <div className="detail-line">
                        <div className="detail-label">No Of Days</div>
                        <input
                          id="noOfDays"
                          className="input detail-control-xs detail-readonly-input"
                          type="text"
                          readOnly
                          value={deposit.noOfDays}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Create Deposit</div>
                  </div>
                </div>
                <div className="table-wrap">
                  <table id="depositTable" className="edit-table">
                    <thead id="depositHead">
                      <tr>
                        <HeaderCells
                          columns={DEPOSIT_COLUMNS}
                          prefix="deposit"
                          sort={sort}
                          onSort={onSort}
                        />
                      </tr>
                    </thead>
                    <tbody id="depositBody">
                      {deposit ? (
                        <tr>
                          <td />
                          <td className="editable">
                            <input
                              id="depTradeValue"
                              className="cell-input money"
                              type="text"
                              value={deposit.tradeValue}
                              onChange={(event) =>
                                setDeposit({ ...deposit, tradeValue: event.target.value })
                              }
                              onBlur={recalcDeposit}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="depAmount"
                              className="cell-input money"
                              type="text"
                              value={deposit.amount}
                              onChange={(event) =>
                                setDeposit({ ...deposit, amount: event.target.value })
                              }
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="depRate"
                              className="cell-input money"
                              type="text"
                              value={deposit.rate}
                              onChange={(event) =>
                                setDeposit({ ...deposit, rate: event.target.value })
                              }
                              onBlur={recalcDeposit}
                            />
                          </td>
                          <td className="editable">
                            <select
                              id="depFixing"
                              className="cell-select"
                              value={deposit.fixing}
                              onChange={(event) =>
                                setDeposit({ ...deposit, fixing: event.target.value })
                              }
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
                              value={deposit.start}
                              onChange={(event) =>
                                setDeposit({ ...deposit, start: event.target.value })
                              }
                              onBlur={recalcDeposit}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="depEnd"
                              className="cell-input"
                              type="text"
                              value={deposit.end}
                              onChange={(event) =>
                                setDeposit({ ...deposit, end: event.target.value })
                              }
                            />
                          </td>
                          <td />
                          <td className="icon-cell">
                            <button
                              id="saveDeposit"
                              className="btn btn-primary"
                              type="button"
                              onClick={saveDeposit}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div id="iclPane" style={{ display: pane === 'icl' ? 'block' : 'none' }}>
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Basic Details</div>
                  <div className="card-meta">ICL Request</div>
                </div>
                <div id="iclDetails" className="card-body">
                  {selectedRow ? (
                    <div className="detail-grid">
                      <DetailLine label="OTTK No" code={selectedRow.ottkNo} size="xs" />
                      <DetailLine
                        label="ICL Given Comp."
                        code={selectedRow.iclGivenComp}
                        desc={selectedRow.iclGivenName}
                        size="md"
                      />
                      <DetailLine
                        label="Business Area"
                        code={selectedRow.businessArea}
                        desc={selectedRow.businessAreaName}
                        size="md"
                      />
                      <DetailLine
                        label="ICL Received Comp."
                        code={selectedRow.iclReceivedComp}
                        desc={selectedRow.iclReceivedName}
                        size="md"
                      />
                      <DetailLine
                        label="Deposit Bank"
                        code={selectedRow.lcIssuanceBank}
                        desc={selectedRow.lcIssuanceBankName}
                        size="lg"
                      />
                      <DetailLine
                        label="Entity String"
                        code={selectedRow.entityStringFull}
                        size="md"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Create ICL Request</div>
                  </div>
                </div>
                <div className="table-wrap">
                  <table id="iclTable" className="edit-table">
                    <thead id="iclHead">
                      <tr>
                        <HeaderCells
                          columns={ICL_COLUMNS}
                          prefix="icl"
                          sort={sort}
                          onSort={onSort}
                        />
                      </tr>
                    </thead>
                    <tbody id="iclBody">
                      {selectedRow && icl ? (
                        <tr>
                          <td className="money">{money(selectedRow.ottkValue)}</td>
                          <td className="editable">
                            <input
                              id="iclAmount"
                              className="cell-input money"
                              type="text"
                              value={icl.amount}
                              onChange={(event) => setIcl({ ...icl, amount: event.target.value })}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="iclStart"
                              className="cell-input"
                              type="text"
                              value={icl.start}
                              onChange={(event) => setIcl({ ...icl, start: event.target.value })}
                              onBlur={() => {
                                const start = normalizeDate(icl.start)
                                setIcl({ ...icl, start, end: addDays(start, 10) })
                              }}
                            />
                          </td>
                          <td className="editable">
                            <input
                              id="iclEnd"
                              className="cell-input"
                              type="text"
                              value={icl.end}
                              onChange={(event) => setIcl({ ...icl, end: event.target.value })}
                              onBlur={() => setIcl({ ...icl, end: normalizeDate(icl.end) })}
                            />
                          </td>
                          <td className="editable">
                            <select
                              id="paymentMode"
                              className="cell-select"
                              value={icl.paymentMode}
                              onChange={(event) =>
                                setIcl({ ...icl, paymentMode: event.target.value })
                              }
                            >
                              <option>01 Pay to Group Co. (Indirect)</option>
                              <option>02 Pay Direct</option>
                            </select>
                          </td>
                          <td className="editable">
                            {paymentBank && requestNo ? null : (
                              <button
                                id="paymentBankBtn"
                                className="link-button"
                                type="button"
                                onClick={openBankModal}
                              >
                                {paymentBank ? 'Change' : 'Select bank'}
                              </button>
                            )}
                            <span id="paymentBankText">
                              {paymentBank ? ` ${paymentBankText}` : ''}
                            </span>
                          </td>
                          <td>
                            <input
                              id="requestNo"
                              className="cell-input"
                              type="text"
                              readOnly
                              value={requestNo}
                            />
                          </td>
                          <td className="icon-cell">
                            <button
                              id="createRequestBtn"
                              className="btn btn-primary"
                              type="button"
                              disabled={!!requestNo}
                              onClick={createRequest}
                            >
                              Create
                            </button>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="bankModal" className={bankOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Partner Bank</div>
            <button
              id="bankClose"
              className="modal-close"
              type="button"
              onClick={() => setBankOpen(false)}
            >
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
                onChange={(event) => setBankSearch(event.target.value)}
              />
            </div>
            <div className="table-wrap" style={{ maxHeight: '390px' }}>
              <table id="bankTable" className="bank-table">
                <thead id="bankHead">
                  <tr>
                    <HeaderCells
                      columns={BANK_COLUMNS}
                      prefix="bank"
                      sort={sort}
                      onSort={onSort}
                    />
                  </tr>
                </thead>
                <tbody id="bankBody">
                  {shownBanks.map((bank, index) => (
                    <tr
                      key={`${bank.houseBank}-${bank.bankAccount}-${bank.partnerBank}-${index}`}
                      className={bank === selectedBank ? 'selected' : ''}
                      onClick={() => setSelectedBank(bank)}
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
            <button
              id="bankCancel"
              className="btn btn-ghost"
              type="button"
              onClick={() => setBankOpen(false)}
            >
              Cancel
            </button>
            <button
              id="bankSelect"
              className="btn btn-primary"
              type="button"
              disabled={!selectedBank}
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
                {item.kind === 'success'
                  ? 'Success'
                  : item.kind === 'warning'
                    ? 'Warning'
                    : 'Information'}
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
