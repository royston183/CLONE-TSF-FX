import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  DMS_COLUMNS,
  MAIN_COLUMNS,
  STATUS_CLASS_MAP,
  STATUS_TEXT_MAP,
  TRANSACTION_COLUMNS,
  columnValue,
  compareRecords,
} from './columns.ts'
import {
  COMPANY_CODES,
  DMS_DOC_TYPES,
  FACILITIES,
  SBLC_RECORDS,
  STATUSES,
  TRANSACTIONS_BY_FACILITY,
  TSF_STRUCTURES,
} from './data.ts'
import {
  calcFeeAmount,
  diffDaysDMY,
  expandShorthand,
  formatDMY,
  isoToDMY,
  money,
} from './format.ts'
import './sblc-allocate-bank.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './sblc-allocate-bank.dark.css'
import type { DmsDoc, FacilityTransaction, SblcRecord, Toast, ToastKind } from './types.ts'
import { CalendarPicker } from '../../shared/ui/CalendarPicker.tsx'

const VERSION = 'v8'
const PAGE_SIZE = 12
const MAX_KNOWN_TXN_NO = 2802001246

function uniqueSorted(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  out.sort()
  return out
}

/** The original's date-input-wrap: a DD-MM-YYYY text box plus a hidden native date picker
 * behind the calendar glyph. Reused verbatim everywhere the page has a date field. */
function LegacyDateInput({
  id,
  value,
  onChange,
  onCommit,
  wide,
}: {
  id?: string | undefined
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
  wide?: boolean | undefined
}) {
  return (
    <div className="date-input-wrap" style={wide ? { width: '100%', maxWidth: 'none' } : undefined}>
      <input
        id={id}
        className="input"
        type="text"
        placeholder="DD-MM-YYYY"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
      />
      <div className="calendar-btn-wrap">
        <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true" />
        <CalendarPicker
          className="calendar-native"
          aria-label="Open calendar"
          value=""
          onChange={(e) => {
            if (e.target.value) onCommit(isoToDMY(e.target.value))
          }}
        />
      </div>
    </div>
  )
}

export default function SblcAllocateBankApp() {
  // Basic Selection
  const [companyCode, setCompanyCode] = useState('')
  const [keyDate, setKeyDate] = useState('')
  const [tsfStructure, setTsfStructure] = useState('')

  // Records — mutated in place on approve/reject, exactly as the legacy DATA.records was.
  const [records, setRecords] = useState<SblcRecord[]>(() => SBLC_RECORDS.map((r) => ({ ...r })))
  const [selectedReq, setSelectedReq] = useState('')
  const [sort, setSort] = useState<{ index: number; direction: '' | 'asc' | 'desc' }>({
    index: -1,
    direction: '',
  })
  const [listPage, setListPage] = useState(1)

  // Filters
  const [filterOpen, setFilterOpen] = useState(false)
  const [txnFilter, setTxnFilter] = useState('')
  const [reqFilter, setReqFilter] = useState('')
  const [reqTypeFilter, setReqTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Approve SBLC Txn modal
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveCompanyCode, setApproveCompanyCode] = useState('')
  const [approveFacility, setApproveFacility] = useState('')
  const [approveIssuingBank, setApproveIssuingBank] = useState('')
  const [approveIssuanceFee, setApproveIssuanceFee] = useState('')
  const [approveLcNumber, setApproveLcNumber] = useState('')

  // Transaction (facility search) modal
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transactionCompanyCode, setTransactionCompanyCode] = useState('')
  const [transactionRows, setTransactionRows] = useState<readonly FacilityTransaction[]>([])

  // LC Charges modal
  const [lcOpen, setLcOpen] = useState(false)
  const [lcAmountRaw, setLcAmountRaw] = useState(0)
  const [lcStartDate, setLcStartDate] = useState('')
  const [lcEndDate, setLcEndDate] = useState('')
  const [lcFeePercent, setLcFeePercent] = useState('')
  const [lcNoOfDays, setLcNoOfDays] = useState('0')
  const [lcFeeAmount, setLcFeeAmount] = useState('0.00')

  // DMS modal
  const [dmsOpen, setDmsOpen] = useState(false)
  const [dmsReq, setDmsReq] = useState('')
  const [dmsTransaction, setDmsTransaction] = useState('')
  const [dmsDocsByReq, setDmsDocsByReq] = useState<Record<string, Record<string, DmsDoc>>>({})
  const dmsFiles = useRef<Record<string, File>>({})
  const dmsFileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  // Confirm modal (reject is the only action this page ever confirms)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const [statusText, setStatusText] = useState(`Ready - ${VERSION}`)
  const firstSelectionRun = useRef(true)

  const resultsVisible = Boolean(companyCode && keyDate && tsfStructure)

  // The legacy page only reacts to Basic Selection once a value actually changes — on load,
  // with everything blank, the status stays "Ready - v8" rather than jumping to the prompt.
  useEffect(() => {
    if (firstSelectionRun.current) {
      firstSelectionRun.current = false
      return
    }
    if (companyCode && keyDate && tsfStructure) {
      setStatusText(`Records loaded for ${companyCode} as of ${keyDate}`)
    } else {
      setSelectedReq('')
      setStatusText('Enter Company Code, Key Date and TSF Structure')
    }
  }, [companyCode, keyDate, tsfStructure])

  const baseRows = useMemo(
    () => records.filter((r) => r.companyCode === companyCode && r.tsfStructure === tsfStructure),
    [records, companyCode, tsfStructure],
  )

  const txnOptions = useMemo(() => uniqueSorted(baseRows.map((r) => r.ottkNo)), [baseRows])
  const reqOptions = useMemo(() => uniqueSorted(baseRows.map((r) => r.sblcRequestNumber)), [baseRows])
  const reqTypeOptions = useMemo(() => uniqueSorted(baseRows.map((r) => r.sblcRequestType)), [baseRows])

  // A dropdown rebuilt from a new base loses any option that no longer exists — the browser
  // resets the selection to the placeholder, which this mirrors explicitly.
  useEffect(() => {
    if (txnFilter && !txnOptions.includes(txnFilter)) setTxnFilter('')
  }, [txnOptions, txnFilter])
  useEffect(() => {
    if (reqFilter && !reqOptions.includes(reqFilter)) setReqFilter('')
  }, [reqOptions, reqFilter])
  useEffect(() => {
    if (reqTypeFilter && !reqTypeOptions.includes(reqTypeFilter)) setReqTypeFilter('')
  }, [reqTypeOptions, reqTypeFilter])

  const filteredRows = useMemo(() => {
    return baseRows.filter((r) => {
      if (txnFilter && r.ottkNo !== txnFilter) return false
      if (reqFilter && r.sblcRequestNumber !== reqFilter) return false
      if (reqTypeFilter && r.sblcRequestType !== reqTypeFilter) return false
      if (statusFilter && r.sblcRequestStatusDesc !== statusFilter) return false
      return true
    })
  }, [baseRows, txnFilter, reqFilter, reqTypeFilter, statusFilter])

  useEffect(() => {
    setListPage(1)
  }, [companyCode, tsfStructure, txnFilter, reqFilter, reqTypeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(listPage, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)

  const selectedRecord = records.find((r) => r.sblcRequestNumber === selectedReq)

  function pushToast(kind: ToastKind, message: string) {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 4200)
  }

  function sortByColumn(index: number) {
    const col = MAIN_COLUMNS[index]
    if (!col) return
    const direction = sort.index === index && sort.direction === 'asc' ? 'desc' : 'asc'
    setRecords((current) => [...current].sort((a, b) => compareRecords(a, b, col, direction)))
    setSort({ index, direction })
    setListPage(1)
  }

  function clearFilters() {
    setTxnFilter('')
    setReqFilter('')
    setReqTypeFilter('')
    setStatusFilter('')
  }

  function selectRow(reqNo: string) {
    setSelectedReq(reqNo)
  }

  function openApprove() {
    const r = selectedRecord
    if (!r) return
    if (r.sblcRequestStatusDesc === 'TSF Approval/SBLC Created') {
      pushToast('warning', 'This SBLC request is already approved.')
      return
    }
    if (r.sblcRequestStatusDesc === 'Reject By TSF') {
      pushToast('warning', 'This SBLC request has already been rejected.')
      return
    }
    setApproveCompanyCode(r.companyCode)
    setApproveFacility('')
    setApproveIssuingBank('')
    setApproveIssuanceFee('')
    setApproveLcNumber('')
    setApproveOpen(true)
  }

  function openTransactionSearch() {
    const r = selectedRecord
    if (!r) return
    const facilityRec = FACILITIES.find((f) => f.companyCode === r.companyCode)
    const facilityNo = facilityRec?.facilityNo ?? ''
    setTransactionCompanyCode(r.companyCode)
    setTransactionRows(TRANSACTIONS_BY_FACILITY[facilityNo] ?? [])
    setTransactionOpen(true)
  }

  function pickTransaction(t: FacilityTransaction) {
    setApproveFacility(t.transNo)
    setApproveIssuingBank(`${t.issuingBankCode} ${t.issuingBankName}`)
    setTransactionOpen(false)
  }

  function openLcCharges() {
    const r = selectedRecord
    if (!r) return
    setLcAmountRaw(r.sblcAmount)
    setLcStartDate('')
    setLcEndDate('')
    setLcFeePercent('')
    setLcNoOfDays('0')
    setLcFeeAmount('0.00')
    setLcOpen(true)
  }

  function recalcLcCharges(start: string, end: string, feePercentRaw: string) {
    const feePercent = expandShorthand(feePercentRaw)
    const days = diffDaysDMY(start, end)
    setLcFeePercent(feePercent)
    setLcNoOfDays(String(days))
    setLcFeeAmount(money(calcFeeAmount(lcAmountRaw, Number(feePercent) || 0, days)))
  }

  function commitLcStart(value: string) {
    setLcStartDate(value)
    recalcLcCharges(value, lcEndDate, lcFeePercent)
  }
  function commitLcEnd(value: string) {
    setLcEndDate(value)
    recalcLcCharges(lcStartDate, value, lcFeePercent)
  }
  function commitLcFee(value: string) {
    recalcLcCharges(lcStartDate, lcEndDate, value)
  }

  function confirmLcCharges() {
    setApproveIssuanceFee(lcFeePercent)
    setLcOpen(false)
  }

  function nextSblcTransactionNo(): string {
    let maxNo = MAX_KNOWN_TXN_NO
    for (const r of records) {
      const n = parseInt(r.sblcTransaction || '0', 10)
      if (n > maxNo) maxNo = n
    }
    return String(maxNo + 1)
  }

  function createSblcTxn() {
    const r = selectedRecord
    if (!r) return
    if (!approveFacility) {
      pushToast('warning', 'Please select a transaction for the facility.')
      return
    }
    if (!approveIssuingBank) {
      pushToast('warning', 'Issuing Bank could not be determined. Select a transaction.')
      return
    }
    if (!approveIssuanceFee) {
      pushToast('warning', 'Please enter the Issuance Fee.')
      return
    }
    if (!approveLcNumber) {
      pushToast('warning', 'Please enter the Unique LC Number.')
      return
    }
    const txnNo = nextSblcTransactionNo()
    const bankParts = approveIssuingBank.split(' ')
    const issuingBankCode = bankParts.shift() ?? ''
    const issuingBankName = bankParts.join(' ')
    setRecords((current) =>
      current.map((rec) =>
        rec.sblcRequestNumber === r.sblcRequestNumber
          ? {
              ...rec,
              sblcTransaction: txnNo,
              issuingBankCode,
              issuingBankName,
              issuanceFee: approveIssuanceFee,
              lcNumber: approveLcNumber,
              sblcRequestStatusDesc: 'TSF Approval/SBLC Created',
            }
          : rec,
      ),
    )
    setApproveOpen(false)
    pushToast('success', `SBLC transaction created successfully with number ${txnNo}`)
    setStatusText(`SBLC transaction ${txnNo} created for request ${r.sblcRequestNumber}`)
    setSelectedReq('')
  }

  function openReject() {
    const r = selectedRecord
    if (!r) return
    if (r.sblcRequestStatusDesc === 'Reject By TSF') {
      pushToast('warning', 'This SBLC request is already rejected.')
      return
    }
    if (r.sblcRequestStatusDesc === 'TSF Approval/SBLC Created') {
      pushToast('warning', 'An approved SBLC request cannot be rejected.')
      return
    }
    setConfirmOpen(true)
  }

  function confirmReject() {
    const r = selectedRecord
    setConfirmOpen(false)
    if (!r) return
    setRecords((current) =>
      current.map((rec) =>
        rec.sblcRequestNumber === r.sblcRequestNumber ? { ...rec, sblcRequestStatusDesc: 'Reject By TSF' } : rec,
      ),
    )
    pushToast('success', `SBLC request ${r.sblcRequestNumber} has been rejected successfully.`)
    setStatusText(`SBLC request ${r.sblcRequestNumber} rejected`)
    setSelectedReq('')
  }

  function openDms() {
    const r = selectedRecord
    if (!r) return
    setDmsReq(r.sblcRequestNumber)
    setDmsTransaction(r.sblcTransaction || '-')
    setDmsOpen(true)
  }

  function patchDoc(docCode: string, patch: Partial<DmsDoc>) {
    setDmsDocsByReq((current) => {
      const forReq = current[dmsReq] ?? {}
      const existing = forReq[docCode] ?? { docDate: '', fileName: '', dmsCode: '', uploaded: false }
      return { ...current, [dmsReq]: { ...forReq, [docCode]: { ...existing, ...patch } } }
    })
  }

  function docFileKey(docCode: string) {
    return `${dmsReq}_${docCode}`
  }

  function pickDocFile(docCode: string, file: File) {
    dmsFiles.current[docFileKey(docCode)] = file
    const saved = dmsDocsByReq[dmsReq]?.[docCode]
    if (saved?.uploaded) {
      const todayVal = saved.docDate || formatDMY(new Date())
      patchDoc(docCode, { fileName: file.name, docDate: todayVal })
      pushToast('success', `Document replaced for ${docCode}.`)
    } else {
      patchDoc(docCode, { fileName: file.name })
    }
  }

  function uploadDoc(docCode: string) {
    const file = dmsFiles.current[docFileKey(docCode)]
    if (!file) {
      pushToast('warning', `Please select a file before uploading for ${docCode}.`)
      return
    }
    const saved = dmsDocsByReq[dmsReq]?.[docCode]
    const docDateVal = saved?.docDate || formatDMY(new Date())
    const dmsCode = `DMS${docCode}${dmsReq}`
    patchDoc(docCode, { docDate: docDateVal, fileName: file.name, dmsCode, uploaded: true })
    pushToast('success', `Document uploaded for ${docCode}.`)
  }

  function downloadDoc(docCode: string) {
    const file = dmsFiles.current[docFileKey(docCode)]
    if (!file) {
      pushToast('warning', `No document uploaded yet for ${docCode}.`)
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    pushToast('', `Downloading ${file.name}`)
  }

  function closeAllModals() {
    setApproveOpen(false)
    setTransactionOpen(false)
    setLcOpen(false)
    setDmsOpen(false)
    setConfirmOpen(false)
  }

  // Esc closing every open modal is real keyboard behaviour, not SAP wiring — there is no
  // JSX prop for a document-level key handler, so it stays a plain effect.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAllModals()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const dmsDocsForReq = dmsDocsByReq[dmsReq] ?? {}

  return (
    <div className="sblcallocate">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BackButton className="refresh-btn" />
              <div>
                <div className="title">View Pending SBLC Requests and Allocate Bank</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="refresh-btn" type="button" onClick={() => window.location.reload()}>
                {'↻'} Refresh
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
                  <label htmlFor="ccCompanyCode">
                    Company Code<span className="required-mark">*</span>
                  </label>
                  <select
                    id="ccCompanyCode"
                    className="select"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
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
                  <label htmlFor="ccKeyDate">
                    Key Date<span className="required-mark">*</span>
                  </label>
                  <LegacyDateInput id="ccKeyDate" value={keyDate} onChange={setKeyDate} onCommit={setKeyDate} />
                </div>
                <div className="field structure-field tsf-field">
                  <label htmlFor="ccTsfStructure">
                    TSF Structure<span className="required-mark">*</span>
                  </label>
                  <select
                    id="ccTsfStructure"
                    className="select"
                    value={tsfStructure}
                    onChange={(e) => setTsfStructure(e.target.value)}
                  >
                    <option value="">Select TSF Structure</option>
                    {TSF_STRUCTURES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          {resultsVisible ? (
            <div id="resultsArea">
              <div className="toolbar">
                <div className="toolbar-left">
                  <button
                    id="filterToggle"
                    className="filter-icon-btn"
                    type="button"
                    title="Filters"
                    aria-label="Filters"
                    onClick={() => setFilterOpen((v) => !v)}
                  />
                  <div id="filterBody" className={filterOpen ? 'filter-body open' : 'filter-body'}>
                    <div className="filter-item">
                      <select
                        id="txnNoFilter"
                        className="select filter-sm"
                        value={txnFilter}
                        onChange={(e) => setTxnFilter(e.target.value)}
                      >
                        <option value="">Transaction No.</option>
                        {txnOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-item">
                      <select
                        id="reqNoFilter"
                        className="select filter-sm"
                        value={reqFilter}
                        onChange={(e) => setReqFilter(e.target.value)}
                      >
                        <option value="">Request No.</option>
                        {reqOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-item">
                      <select
                        id="reqTypeFilter"
                        className="select filter-lg"
                        value={reqTypeFilter}
                        onChange={(e) => setReqTypeFilter(e.target.value)}
                      >
                        <option value="">SBLC Request Type</option>
                        {reqTypeOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-item">
                      <select
                        id="statusFilter"
                        className="select filter-lg"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="">Status</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button id="clearFilters" className="btn btn-ghost" type="button" onClick={clearFilters}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="toolbar-right">
                  <button
                    id="approveBtn"
                    className="btn btn-primary"
                    type="button"
                    disabled={!selectedRecord}
                    onClick={openApprove}
                  >
                    Approve SBLC Request
                  </button>
                  <button
                    id="rejectBtn"
                    className="btn btn-ghost"
                    type="button"
                    disabled={!selectedRecord}
                    onClick={openReject}
                  >
                    Reject SBLC Request
                  </button>
                  <button id="dmsBtn" className="btn btn-ghost" type="button" disabled={!selectedRecord} onClick={openDms}>
                    DMS
                  </button>
                </div>
              </div>
              <div className="card table-card">
                <div className="card-head">
                  <div className="card-title">Pending SBLC Requests</div>
                  <div className="card-meta" id="rowCountMeta">
                    {filteredRows.length} record(s)
                  </div>
                </div>
                <div className="table-wrap">
                  <table id="mainTable" className="data-table">
                    <thead id="mainHead">
                      <tr>
                        <th style={{ width: 42 }}>Select</th>
                        {MAIN_COLUMNS.map((col, index) => (
                          <th
                            key={col.key}
                            data-index={index}
                            style={{ width: col.width }}
                            className={sort.index === index ? (sort.direction === 'asc' ? 'sort-asc' : 'sort-desc') : ''}
                            onClick={() => sortByColumn(index)}
                          >
                            {col.label}
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
                        pageRows.map((r) => (
                          <tr
                            key={r.sblcRequestNumber}
                            data-record={r.sblcRequestNumber}
                            className={r.sblcRequestNumber === selectedReq ? 'selected' : ''}
                            onClick={() => selectRow(r.sblcRequestNumber)}
                          >
                            <td>
                              <input
                                type="radio"
                                name="recordPick"
                                value={r.sblcRequestNumber}
                                checked={r.sblcRequestNumber === selectedReq}
                                onChange={() => selectRow(r.sblcRequestNumber)}
                              />
                            </td>
                            {MAIN_COLUMNS.map((col) =>
                              col.statusText ? (
                                <td key={col.key} className="">
                                  <span className={`badge ${STATUS_CLASS_MAP[r.sblcRequestStatusDesc] ?? ''}`}>
                                    {STATUS_TEXT_MAP[r.sblcRequestStatusDesc] ?? r.sblcRequestStatusDesc}
                                  </span>
                                </td>
                              ) : (
                                <td key={col.key} className={col.number ? 'number' : ''}>
                                  {columnValue(col, r)}
                                </td>
                              ),
                            )}
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
                    disabled={currentPage === 1}
                    onClick={() => setListPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  {paginationRange(currentPage, totalPages).map((p) => (
                    <button
                      key={p}
                      className={p === currentPage ? 'page-btn active' : 'page-btn'}
                      type="button"
                      onClick={() => setListPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="page-btn"
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setListPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div id="approveModal" className={approveOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">View Pending SBLC Requests and Allocate Bank</div>
            <button id="approveClose" className="modal-close" type="button" onClick={() => setApproveOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card">
              <div className="card-head">
                <div className="card-title">Create SBLC Txn</div>
                <div className="card-meta">Selected Request</div>
              </div>
              <div className="card-body">
                <div className="approve-grid">
                  <div className="approve-cell">
                    <label htmlFor="approveCompanyCode">Company Code</label>
                    <input id="approveCompanyCode" className="input readonly-input" type="text" readOnly value={approveCompanyCode} />
                  </div>
                  <div className="approve-cell has-icon">
                    <label htmlFor="approveFacility">
                      Facility<span className="required-mark">*</span>
                    </label>
                    <input
                      id="approveFacility"
                      className="input"
                      type="text"
                      readOnly
                      placeholder="Select facility"
                      value={approveFacility}
                    />
                    <button
                      id="approveFacilitySearch"
                      className="search-btn"
                      type="button"
                      title="Select Transaction"
                      onClick={openTransactionSearch}
                    />
                  </div>
                  <div className="approve-cell-wide">
                    <label htmlFor="approveIssuingBank">Issuing Bank</label>
                    <input id="approveIssuingBank" className="input readonly-input" type="text" readOnly value={approveIssuingBank} />
                  </div>
                  <div className="approve-cell">
                    <label htmlFor="approveLcNumber">
                      LC Number<span className="required-mark">*</span>
                    </label>
                    <input
                      id="approveLcNumber"
                      className="input"
                      type="text"
                      placeholder="Unique LC Number"
                      value={approveLcNumber}
                      onChange={(e) => setApproveLcNumber(e.target.value)}
                    />
                  </div>
                  <div className="approve-cell has-icon">
                    <label htmlFor="approveIssuanceFee">
                      Issuance Fee<span className="required-mark">*</span>
                    </label>
                    <input
                      id="approveIssuanceFee"
                      className="input input-right"
                      type="text"
                      value={approveIssuanceFee}
                      onChange={(e) => setApproveIssuanceFee(e.target.value)}
                      onBlur={(e) => setApproveIssuanceFee(expandShorthand(e.target.value))}
                    />
                    <button id="approveLcChargesBtn" className="calc-btn" type="button" title="LC Charges" onClick={openLcCharges} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button id="approveCancel" className="btn btn-ghost" type="button" onClick={() => setApproveOpen(false)}>
              Cancel
            </button>
            <button id="createSblcTxnBtn" className="btn btn-primary" type="button" onClick={createSblcTxn}>
              Create SBLC Txn
            </button>
          </div>
        </div>
      </div>

      <div id="transactionModal" className={transactionOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title" id="transactionModalTitle">
              Transaction
            </div>
            <button id="transactionClose" className="modal-close" type="button" onClick={() => setTransactionOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card table-card">
              <div className="table-wrap">
                <table id="transactionTable" className="data-table compact">
                  <thead id="transactionHead">
                    <tr>
                      {TRANSACTION_COLUMNS.map((c) => (
                        <th key={c.label} style={{ width: c.width }}>
                          {c.label}
                          <span className="sort-arrows">
                            <span className="sort-up" />
                            <span className="sort-down" />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="transactionBody">
                    {transactionRows.length === 0 ? (
                      <tr>
                        <td colSpan={TRANSACTION_COLUMNS.length} className="empty">
                          No transactions found for this facility.
                        </td>
                      </tr>
                    ) : (
                      transactionRows.map((t, i) => (
                        <tr key={t.transNo} data-idx={i} onClick={() => pickTransaction(t)}>
                          <td>{transactionCompanyCode}</td>
                          <td>{t.transNo}</td>
                          <td>{t.productType}</td>
                          <td>{t.bankName}</td>
                          <td>{t.termEnd}</td>
                          <td className="number">{money(t.limitAmount)}</td>
                          <td className="number">{money(t.availableLimit)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button id="transactionCancel" className="btn btn-ghost" type="button" onClick={() => setTransactionOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div id="lcChargesModal" className={lcOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">LC Charges</div>
            <button id="lcChargesClose" className="modal-close" type="button" onClick={() => setLcOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="approve-field">
              <label htmlFor="lcAmount">SBLC Amount</label>
              <input id="lcAmount" className="input readonly-input" type="text" readOnly value={money(lcAmountRaw)} />
            </div>
            <div className="approve-field">
              <label htmlFor="lcStartDate">
                Start Date<span className="required-mark">*</span>
              </label>
              <LegacyDateInput id="lcStartDate" value={lcStartDate} onChange={setLcStartDate} onCommit={commitLcStart} wide />
            </div>
            <div className="approve-field">
              <label htmlFor="lcEndDate">
                End Date<span className="required-mark">*</span>
              </label>
              <LegacyDateInput id="lcEndDate" value={lcEndDate} onChange={setLcEndDate} onCommit={commitLcEnd} wide />
            </div>
            <div className="approve-field">
              <label htmlFor="lcFeePercent">
                Fee(%)<span className="required-mark">*</span>
              </label>
              <input
                id="lcFeePercent"
                className="input"
                type="text"
                value={lcFeePercent}
                onChange={(e) => setLcFeePercent(e.target.value)}
                onBlur={(e) => commitLcFee(e.target.value)}
              />
            </div>
            <div className="approve-field">
              <label>No of Days</label>
              <input className="input readonly-input" type="text" readOnly value={lcNoOfDays} />
            </div>
            <div className="approve-field">
              <label className="fee-amount-value">Fee Amount</label>
              <input className="input readonly-input fee-amount-value" type="text" readOnly value={lcFeeAmount} />
            </div>
          </div>
          <div className="modal-foot">
            <button id="lcChargesCancel" className="btn btn-ghost" type="button" onClick={() => setLcOpen(false)}>
              Cancel
            </button>
            <button id="lcChargesOk" className="btn btn-primary" type="button" onClick={confirmLcCharges}>
              OK
            </button>
          </div>
        </div>
      </div>

      <div id="dmsModal" className={dmsOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal large">
          <div className="modal-head">
            <div className="modal-title">DMS</div>
            <button id="dmsClose" className="modal-close" type="button" onClick={() => setDmsOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="card">
              <div className="card-head">
                <div className="card-title">SBLC Request</div>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  <div className="detail-line">
                    <div className="detail-label">SBLC Request No</div>
                    <div className="detail-value">
                      <span className="code" id="dmsRequestNo">
                        {dmsReq}
                      </span>
                    </div>
                  </div>
                  <div className="detail-line">
                    <div className="detail-label">SBLC Transaction</div>
                    <div className="detail-value">
                      <span className="code" id="dmsTransaction">
                        {dmsTransaction}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">DMS Data</div>
              </div>
              <div className="table-wrap">
                <table id="dmsTable" className="edit-table">
                  <thead id="dmsHead">
                    <tr>
                      {DMS_COLUMNS.map((c) => (
                        <th key={c.label} style={{ width: c.width }}>
                          {c.label}
                          <span className="sort-arrows">
                            <span className="sort-up" />
                            <span className="sort-down" />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="dmsBody">
                    {DMS_DOC_TYPES.map((doc) => {
                      const saved = dmsDocsForReq[doc.code]
                      const uploaded = !!saved?.uploaded
                      return (
                        <tr key={doc.code} data-doc={doc.code}>
                          <td>{doc.code}</td>
                          <td>{doc.desc}</td>
                          <td className="editable">
                            <LegacyDmsDate
                              value={saved?.docDate ?? ''}
                              onChange={(v) => patchDoc(doc.code, { docDate: v })}
                            />
                          </td>
                          <td className="editable">
                            <input
                              className="cell-input dms-path"
                              type="text"
                              readOnly
                              style={{ cursor: 'pointer' }}
                              placeholder="Click to select file"
                              value={saved?.fileName ?? ''}
                              onClick={() => dmsFileInputs.current[doc.code]?.click()}
                            />
                            <input
                              ref={(el) => {
                                dmsFileInputs.current[doc.code] = el
                              }}
                              className="dms-file-input"
                              type="file"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) pickDocFile(doc.code, file)
                                e.target.value = ''
                              }}
                            />
                          </td>
                          <td>
                            <input className="cell-input dms-code" type="text" readOnly value={saved?.dmsCode ?? ''} />
                          </td>
                          <td className="icon-cell">
                            <button
                              className="btn btn-ghost small-btn dms-upload"
                              type="button"
                              disabled={uploaded}
                              onClick={() => uploadDoc(doc.code)}
                            >
                              Upload
                            </button>
                          </td>
                          <td className="icon-cell">
                            <button
                              className="btn btn-ghost small-btn dms-download"
                              type="button"
                              disabled={!uploaded}
                              onClick={() => downloadDoc(doc.code)}
                            >
                              Download
                            </button>
                          </td>
                          <td className="icon-cell">
                            <button
                              className="btn btn-ghost small-btn dms-edit"
                              type="button"
                              disabled={!uploaded}
                              onClick={() => dmsFileInputs.current[doc.code]?.click()}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button id="dmsCancel" className="btn btn-ghost" type="button" onClick={() => setDmsOpen(false)}>
              Cancel
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
              <div className="confirm-text">Are you sure you want to reject the SBLC request?</div>
            </div>
          </div>
          <div className="modal-foot">
            <button id="confirmNo" className="btn btn-ghost" type="button" onClick={() => setConfirmOpen(false)}>
              No
            </button>
            <button id="confirmYes" className="btn btn-primary" type="button" onClick={confirmReject}>
              Yes
            </button>
          </div>
        </div>
      </div>

      <div id="toastRegion" className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div className="toast-icon">{t.kind === 'success' ? 'OK' : 'i'}</div>
            <div>
              <div className="toast-title">{t.kind === 'success' ? 'Success' : t.kind === 'warning' ? 'Warning' : 'Information'}</div>
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

/** Same date-input-wrap markup as LegacyDateInput, sized for the DMS grid's narrower cell. */
function LegacyDmsDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="date-input-wrap" style={{ width: 140, maxWidth: 140 }}>
      <input
        className="cell-input dms-date"
        type="text"
        placeholder="DD-MM-YYYY"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="calendar-btn-wrap">
        <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true" />
        <CalendarPicker
          className="calendar-native dms-date-native"
          aria-label="Open calendar"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(isoToDMY(e.target.value))
          }}
        />
      </div>
    </div>
  )
}

function paginationRange(current: number, total: number): number[] {
  let start = Math.max(1, current - 1)
  const end = Math.min(total, start + 2)
  start = Math.max(1, end - 2)
  const range: number[] = []
  for (let p = start; p <= end; p++) range.push(p)
  return range
}
