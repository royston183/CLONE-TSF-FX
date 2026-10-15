import { useCallback, useMemo, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CashflowModal } from './CashflowModal.tsx'
import { IRS_COLUMNS, IRS_RECORDS, IRS_STATUSES } from './data.ts'
import {
  buildComboOptions,
  filterRows,
  isValidDate,
  sortRows,
} from './format.ts'
import { IrsTable } from './IrsTable.tsx'
import { SelectionCard } from './SelectionCard.tsx'
import { SettleModal } from './SettleModal.tsx'
import type { ComboKind, IrsRecord, SortDirection } from './types.ts'
import { ToastRegion, type Toast } from './ToastRegion.tsx'
import './check-confirm-irs.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './check-confirm-irs.dark.css'

const PAGE_SIZE = 15

let toastSeq = 0

export default function CheckConfirmIrsApp() {
  const [records, setRecords] = useState<IrsRecord[]>(() => IRS_RECORDS.map((row) => ({ ...row })))

  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [transactionFilter, setTransactionFilter] = useState('')
  const [dealFilter, setDealFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(IRS_STATUSES[0]?.code ?? '')
  const [openCombo, setOpenCombo] = useState<ComboKind | null>(null)

  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sortIndex, setSortIndex] = useState(-1)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [calendarOpen, setCalendarOpen] = useState(false)

  const [cashflowId, setCashflowId] = useState<number | null>(null)
  const [settleOpen, setSettleOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [statusText, setStatusText] = useState('Select Company Code and enter Key Date')

  const companies = useMemo(() => {
    const seen = new Set<string>()
    const list: { code: string; name: string }[] = []
    for (const row of records) {
      if (seen.has(row.companyCode)) continue
      seen.add(row.companyCode)
      list.push({ code: row.companyCode, name: row.companyName })
    }
    return list
  }, [records])

  const statusSettledValue = (code: string): boolean =>
    IRS_STATUSES.find((status) => status.code === code)?.settled ?? false

  const readyToLoad = companyCode !== '' && isValidDate(keyDate)

  const filteredRows = useMemo(() => {
    if (!readyToLoad) return []
    const filtered = filterRows(records, {
      companyCode,
      transaction: transactionFilter,
      deal: dealFilter,
      settled: statusSettledValue(statusFilter),
      keyDate,
    })
    if (sortIndex >= 0) {
      const column = IRS_COLUMNS[sortIndex]
      if (column) return sortRows(filtered, column, sortDirection)
    }
    return filtered
  }, [records, readyToLoad, companyCode, transactionFilter, dealFilter, statusFilter, keyDate, sortIndex, sortDirection])

  const selectedRow = records.find((row) => row.id === selectedId) ?? null

  function clearSelection() {
    setSelectedId(null)
  }

  function loadResults(nextCompanyCode = companyCode, nextKeyDate = keyDate) {
    const ready = nextCompanyCode !== '' && isValidDate(nextKeyDate)
    setPage(1)
    clearSelection()
    setStatusText(
      ready ? 'IRS records loaded' : 'Select Company Code and enter Key Date in DD-MM-YYYY format',
    )
  }

  function refreshFilters() {
    setPage(1)
    clearSelection()
  }

  function handleCompanyChange(code: string) {
    setCompanyCode(code)
    setTransactionFilter('')
    setDealFilter('')
    setOpenCombo(null)
    loadResults(code, keyDate)
  }

  function handleKeyDateChange(value: string) {
    setKeyDate(value)
  }

  function handleKeyDateCommit() {
    loadResults(companyCode, keyDate)
  }

  function handleClearFilters() {
    setTransactionFilter('')
    setDealFilter('')
    setOpenCombo(null)
    setStatusFilter(IRS_STATUSES[0]?.code ?? '')
    refreshFilters()
  }

  function handleStatusChange(code: string) {
    setStatusFilter(code)
    setTransactionFilter('')
    setDealFilter('')
    setOpenCombo(null)
    refreshFilters()
  }

  function handleSort(index: number) {
    if (sortIndex === index) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortIndex(index)
      setSortDirection('asc')
    }
    setPage(1)
    clearSelection()
  }

  function handleSelect(id: number) {
    setSelectedId(id)
  }

  function handleViewCashflow(id: number) {
    setCashflowId(id)
    const row = records.find((r) => r.id === id)
    if (row) setStatusText(`Cashflow details displayed for IRS ID ${row.irsId}`)
  }

  function handleEdit() {
    if (!selectedRow) return
    setStatusText(`Edit selected for IRS ID ${selectedRow.irsId}`)
  }

  function handleSettleYes() {
    if (!selectedRow || selectedRow.settled) {
      setSettleOpen(false)
      return
    }
    const transaction = selectedRow.transaction
    setRecords((current) =>
      current.map((row) => (row.id === selectedRow.id ? { ...row, settled: true } : row)),
    )
    setSettleOpen(false)
    const id = ++toastSeq
    const message = `IRS Transaction ${transaction} settled successfully.`
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
    setStatusText(`IRS Transaction ${transaction} settled successfully`)
    clearSelection()
  }

  function comboFilters() {
    return {
      companyCode,
      settled: statusSettledValue(statusFilter),
      keyDate,
    }
  }

  const transactionOptions = useMemo(
    () => buildComboOptions(records, 'txn', comboFilters(), transactionFilter),
    [records, companyCode, statusFilter, keyDate, transactionFilter],
  )
  const dealOptions = useMemo(
    () => buildComboOptions(records, 'deal', comboFilters(), dealFilter),
    [records, companyCode, statusFilter, keyDate, dealFilter],
  )

  function handleComboPick(kind: ComboKind, value: string) {
    if (kind === 'txn') setTransactionFilter(value)
    else setDealFilter(value)
    setOpenCombo(null)
    refreshFilters()
  }

  function handleCalendarPickDate(date: string) {
    setKeyDate(date)
    setCalendarOpen(false)
    loadResults(companyCode, date)
  }

  const closeCalendar = useCallback(() => setCalendarOpen(false), [])

  const cashflowRow = records.find((row) => row.id === cashflowId) ?? null

  return (
    <div className="ccirs">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BackButton className="btn btn-ghost" />
              <div className="title">Check &amp; Confirm IRS</div>
            </div>
            <div>
              <SignOutButton className="btn btn-ghost" />
            </div>
          </div>
        </div>
        <div className="content">
          <div className="screen">
            <SelectionCard
              companies={companies}
              companyCode={companyCode}
              onCompanyChange={handleCompanyChange}
              keyDate={keyDate}
              onKeyDateChange={handleKeyDateChange}
              onKeyDateCommit={handleKeyDateCommit}
              calendarOpen={calendarOpen}
              onCalendarToggle={() => setCalendarOpen((open) => !open)}
              onCalendarPickDate={handleCalendarPickDate}
              onCalendarClose={closeCalendar}
              filterOpen={filterOpen}
              onFilterToggle={() => setFilterOpen((open) => !open)}
              transactionFilter={transactionFilter}
              dealFilter={dealFilter}
              statusFilter={statusFilter}
              statuses={IRS_STATUSES}
              onTransactionChange={(value) => {
                setTransactionFilter(value)
                refreshFilters()
                setOpenCombo('txn')
              }}
              onDealChange={(value) => {
                setDealFilter(value)
                refreshFilters()
                setOpenCombo('deal')
              }}
              onStatusChange={handleStatusChange}
              onClearFilters={handleClearFilters}
              openCombo={openCombo}
              transactionOptions={transactionOptions}
              dealOptions={dealOptions}
              onComboFocus={(kind) => setOpenCombo(kind)}
              onComboToggle={(kind) => setOpenCombo((current) => (current === kind ? null : kind))}
              onComboPick={handleComboPick}
            />
            <div id="resultsArea" className={readyToLoad ? 'open' : ''}>
              <div className="toolbar">
                <div className="toolbar-left">
                  <span id="recordCount" className="record-count">
                    {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="toolbar-right">
                  <button
                    id="editBtn"
                    className="btn"
                    type="button"
                    disabled={!selectedRow}
                    onClick={handleEdit}
                  >
                    Edit
                  </button>
                  <button
                    id="settleBtn"
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedRow || selectedRow.settled}
                    onClick={() => setSettleOpen(true)}
                  >
                    Confirm / Settle
                  </button>
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">IRS Contracts</div>
                  <div id="selectionMeta" className="card-meta">
                    {!selectedRow
                      ? 'Select one line item'
                      : selectedRow.settled
                        ? 'Selected IRS is already settled'
                        : '1 line item selected'}
                  </div>
                </div>
                <IrsTable
                  columns={IRS_COLUMNS}
                  rows={filteredRows}
                  page={page}
                  pageSize={PAGE_SIZE}
                  selectedId={selectedId}
                  sortIndex={sortIndex}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onSelect={handleSelect}
                  onViewCashflow={handleViewCashflow}
                  onPageChange={setPage}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CashflowModal row={cashflowRow} onClose={() => setCashflowId(null)} />
      <SettleModal
        open={settleOpen}
        transaction={selectedRow?.transaction ?? ''}
        details={
          selectedRow
            ? [
                { label: 'IRS ID', value: selectedRow.irsId },
                { label: 'Deal No', value: selectedRow.dealNo },
                { label: 'Company', value: selectedRow.companyNameDisplay },
                { label: 'Bank', value: selectedRow.bankName },
                { label: 'Start Date', value: selectedRow.startDate },
                { label: 'End Date', value: selectedRow.endDate },
                { label: 'Incoming Amount', value: String(selectedRow.incomingAmount) },
                { label: 'Outgoing Amount', value: String(selectedRow.outgoingAmount) },
              ]
            : []
        }
        onNo={() => setSettleOpen(false)}
        onYes={handleSettleYes}
      />
      <ToastRegion toasts={toasts} />
      <div className="statusbar">
        <span className="status-dot"></span>
        <span id="statusText">{statusText}</span>
      </div>
    </div>
  )
}
