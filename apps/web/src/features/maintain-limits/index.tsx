import { useEffect, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { DMS_COLUMNS, MAIN_COLUMNS } from './columns.ts'
import {
  BANK_TYPES,
  BUSINESS_PARTNERS,
  COMPANY_CODES,
  DOCUMENT_TYPES,
  GROUP_BPS,
  LIMIT_LEVEL_CHECKS,
  LIMIT_TYPES,
  LIMIT_RECORDS,
  NEXT_GROUP_SEQ,
  STATUS_MAP,
  TRADER_MAP,
} from './data.ts'
import {
  dayDiff,
  displayDate,
  generateDmsCode,
  isoFromDisplay,
  money,
  parseAmountShorthand,
  statusBadgeClass,
} from './format.ts'
import type {
  BusinessPartner,
  CodeName,
  LimitDocument,
  LimitRecord,
  MainColumn,
  ToastItem,
  ToastKind,
} from './types.ts'
import './maintain-limits.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './maintain-limits.dark.css'
import { CalendarPicker } from '../../shared/ui/CalendarPicker.tsx'

const PAGE_SIZE = 10
const VERSION = 'v1'

type Selection = {
  companyCode: string
  keyDate: string
  bankType: string
  businessPartner: string
  limitLevelCheck: string
  trader: string
}

const EMPTY_SELECTION: Selection = {
  companyCode: '',
  keyDate: '',
  bankType: '',
  businessPartner: '',
  limitLevelCheck: '',
  trader: '',
}

type CreateForm = {
  limitType: string
  startDate: string
  endDate: string
  amount: string
  tenor: string
  emailNote: string
}

const EMPTY_CREATE_FORM: CreateForm = {
  limitType: LIMIT_TYPES[0]?.code ?? '',
  startDate: '',
  endDate: '',
  amount: '',
  tenor: '',
  emailNote: '',
}

function allFieldsFilled(s: Selection): boolean {
  return Boolean(
    s.companyCode && s.keyDate && s.bankType && s.businessPartner && s.limitLevelCheck && s.trader,
  )
}

function emptyDocument(keyDate: string): LimitDocument {
  return { date: keyDate, fileName: '', uploaded: false, dmsCode: '' }
}

function documentCount(record: LimitRecord): number {
  return Object.values(record.documents).filter((d) => d.uploaded).length
}

function cellText(record: LimitRecord, column: MainColumn): string {
  switch (column.key) {
    case 'limitType':
      return record.limitType
    case 'bpCode':
      return record.bpCode
    case 'bpName':
      return record.bpName
    case 'startDate':
      return displayDate(record.startDate)
    case 'endDate':
      return displayDate(record.endDate)
    case 'amount':
      return money(record.amount)
    case 'statusCode':
      return `${record.statusCode} - ${STATUS_MAP[record.statusCode] ?? ''}`
    default:
      return ''
  }
}

function labelFor(list: readonly CodeName[], code: string): string {
  const hit = list.find((it) => it.code === code)
  return `${code} ${hit ? hit.name : ''}`
}

/** The sort chevrons the original paints into every header cell; neither one is wired. */
function SortArrows() {
  return (
    <span className="sort-arrows">
      <span className="sort-up"></span>
      <span className="sort-down"></span>
    </span>
  )
}

export default function MaintainLimitsApp() {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [records, setRecords] = useState<LimitRecord[]>(() => LIMIT_RECORDS.map((r) => ({ ...r })))
  const [groupBps, setGroupBps] = useState<CodeName[]>(() => GROUP_BPS.map((g) => ({ ...g })))
  const [groupSeq, setGroupSeq] = useState(NEXT_GROUP_SEQ)

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bankTypeFilter, setBankTypeFilter] = useState('')
  const [limitLevelFilter, setLimitLevelFilter] = useState('')
  const [listPage, setListPage] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalNote, setApprovalNote] = useState('')
  const [dmsOpen, setDmsOpen] = useState(false)
  const [dmsIndex, setDmsIndex] = useState(-1)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignGroupBp, setAssignGroupBp] = useState('')
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')

  /** Files chosen in the DMS grid but not yet uploaded, keyed by document type. */
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filePicker = useRef<{ docCode: string; mode: 'pick' | 'edit' } | null>(null)

  const [statusText, setStatusText] = useState(`Ready - ${VERSION}`)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)

  function pushToast(message: string, kind: ToastKind = '') {
    const id = (toastSeq.current += 1)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }

  function closeAllModals() {
    setCreateOpen(false)
    setApprovalOpen(false)
    setDmsOpen(false)
    setAssignOpen(false)
    setGroupOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllModals()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const bpOptions: readonly BusinessPartner[] = BUSINESS_PARTNERS.filter(
    (bp) => bp.bankType === selection.bankType,
  )
  const currentBp =
    bpOptions.find((bp) => bp.code === selection.businessPartner) ?? null
  const ready = allFieldsFilled(selection)

  /** The original re-evaluates the whole Basic Selection block on every field change. */
  function changeSelection(patch: Partial<Selection>) {
    const next = { ...selection, ...patch }
    setSelection(next)
    setListPage(1)
    setSelectedIndex(-1)
    if (allFieldsFilled(next)) {
      setStatusText(`Records loaded for ${next.companyCode} as of ${next.keyDate}`)
    } else {
      setStatusText('Enter Company Code, Key Date, Bank Type, Business Partner and Limit Level Check')
    }
  }

  const rows = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      if (record.companyCode !== selection.companyCode) return false
      if (record.bankType !== selection.bankType) return false
      if (record.bpCode !== selection.businessPartner) return false
      if (selection.limitLevelCheck && record.limitLevelCheck !== selection.limitLevelCheck) return false
      if (bankTypeFilter && record.bankType !== bankTypeFilter) return false
      if (limitLevelFilter && record.limitLevelCheck !== limitLevelFilter) return false
      return true
    })

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(listPage, pageCount)
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE)
  const firstPageButton = Math.max(1, Math.min(pageCount, Math.max(1, page - 1) + 2) - 2)
  const lastPageButton = Math.min(pageCount, firstPageButton + 2)
  const pageButtons: number[] = []
  for (let p = firstPageButton; p <= lastPageButton; p++) pageButtons.push(p)

  const selectedRecord = selectedIndex >= 0 ? records[selectedIndex] : undefined
  const dmsRecord = dmsIndex >= 0 ? records[dmsIndex] : undefined

  function updateRecord(index: number, patch: Partial<LimitRecord>) {
    setRecords((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function updateDocument(index: number, docCode: string, patch: Partial<LimitDocument>) {
    setRecords((current) =>
      current.map((r, i) => {
        if (i !== index) return r
        const existing = r.documents[docCode] ?? emptyDocument(selection.keyDate)
        return { ...r, documents: { ...r.documents, [docCode]: { ...existing, ...patch } } }
      }),
    )
  }

  function selectRow(index: number) {
    setSelectedIndex(index)
    const record = records[index]
    if (record && record.statusCode === '01') openApprovalModal(index)
  }

  function openCreateLimitModal() {
    if (!currentBp) {
      pushToast('Select a Business Partner first.', 'warning')
      return
    }
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateOpen(true)
  }

  function changeCreateForm(patch: Partial<CreateForm>) {
    const next = { ...createForm, ...patch }
    // Tenor follows the dates, so it is recomputed whenever either one lands.
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      const startIso = isoFromDisplay(next.startDate)
      const endIso = isoFromDisplay(next.endDate)
      if (startIso && endIso) next.tenor = String(dayDiff(startIso, endIso))
    }
    setCreateForm(next)
  }

  function submitCreateLimit() {
    const startIso = isoFromDisplay(createForm.startDate)
    const endIso = isoFromDisplay(createForm.endDate)
    const amount = Number(String(createForm.amount).replace(/,/g, '')) || 0
    if (!startIso || !endIso || !amount || !currentBp) {
      pushToast('Enter Start Date, End Date and Limit Amount.', 'warning')
      return
    }
    const record: LimitRecord = {
      companyCode: selection.companyCode,
      bankType: selection.bankType,
      bpCode: currentBp.code,
      bpName: currentBp.name,
      limitType: createForm.limitType,
      limitLevelCheck: selection.limitLevelCheck,
      startDate: startIso,
      endDate: endIso,
      amount,
      statusCode: '01',
      documents: {},
      emailNote: createForm.emailNote,
    }
    const newIndex = records.length
    setRecords((current) => [...current, record])
    setCreateOpen(false)
    setListPage(1)
    pushToast('Limit created successfully.', 'success')
    setStatusText(`New limit created for ${currentBp.code} ${currentBp.name}`)
    openDmsModal(newIndex)
  }

  function openApprovalModal(index: number) {
    setSelectedIndex(index)
    setApprovalNote(records[index]?.emailNote ?? '')
    setApprovalOpen(true)
  }

  function saveApprovalDraft() {
    if (selectedIndex >= 0) updateRecord(selectedIndex, { emailNote: approvalNote })
    setApprovalOpen(false)
    pushToast('Draft saved.')
  }

  function sendForApproval() {
    const record = records[selectedIndex]
    if (!record) return
    updateRecord(selectedIndex, { statusCode: '02', emailNote: approvalNote })
    setApprovalOpen(false)
    pushToast('Limit has been sent for approval successfully.', 'success')
    setStatusText(`Limit ${record.bpCode} sent for approval`)
  }

  function openDmsModal(index: number) {
    if (index < 0) {
      pushToast('Select a record to attach documents.', 'warning')
      return
    }
    setDmsIndex(index)
    setPendingFiles({})
    setDmsOpen(true)
  }

  function pickFile(docCode: string, mode: 'pick' | 'edit') {
    filePicker.current = { docCode, mode }
    fileInputRef.current?.click()
  }

  function onFileChosen(file: File | null) {
    const request = filePicker.current
    filePicker.current = null
    if (!file || !request) return
    if (request.mode === 'pick') {
      setPendingFiles((current) => ({ ...current, [request.docCode]: file }))
      return
    }
    updateDocument(dmsIndex, request.docCode, {
      fileName: file.name,
      file,
      dmsCode: generateDmsCode(),
    })
    pushToast(`Document updated successfully for ${request.docCode}.`, 'success')
  }

  function uploadDocument(docCode: string, date: string) {
    const file = pendingFiles[docCode]
    if (!file) {
      pushToast('Select a file before uploading.', 'warning')
      return
    }
    updateDocument(dmsIndex, docCode, {
      fileName: file.name,
      file,
      uploaded: true,
      dmsCode: generateDmsCode(),
      date,
    })
    pushToast(`Document uploaded successfully for ${docCode}.`, 'success')
  }

  function downloadDocument(doc: LimitDocument) {
    if (!doc.uploaded || !doc.file) return
    const url = URL.createObjectURL(doc.file)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function openAssignBpModal() {
    if (selectedIndex < 0) {
      pushToast('Select a record to assign business partner.', 'warning')
      return
    }
    setAssignGroupBp('')
    setAssignOpen(true)
  }

  function assignBp() {
    if (!assignGroupBp) {
      pushToast('Select a Group BP.', 'warning')
      return
    }
    setAssignOpen(false)
    pushToast('Business Partner assigned to group successfully.', 'success')
  }

  const proposedGroupCode = 'GRP' + String(groupSeq).padStart(3, '0')

  function createGroupBp() {
    if (!groupName) {
      pushToast('Enter a Group BP name.', 'warning')
      return
    }
    setGroupBps((current) => [...current, { code: proposedGroupCode, name: groupName }])
    setGroupSeq((current) => current + 1)
    setGroupOpen(false)
    pushToast(`Group BP ${proposedGroupCode} created successfully.`, 'success')
  }

  function refreshList() {
    setBankTypeFilter('')
    setLimitLevelFilter('')
    setListPage(1)
    pushToast('Data refreshed.', 'success')
    setStatusText('Data refreshed')
  }

  /** The original's top-right button called location.reload(); this is the same reset. */
  function reloadPage() {
    setSelection(EMPTY_SELECTION)
    setRecords(LIMIT_RECORDS.map((r) => ({ ...r })))
    setGroupBps(GROUP_BPS.map((g) => ({ ...g })))
    setGroupSeq(NEXT_GROUP_SEQ)
    setFiltersOpen(false)
    setBankTypeFilter('')
    setLimitLevelFilter('')
    setListPage(1)
    setSelectedIndex(-1)
    setPendingFiles({})
    closeAllModals()
    setToasts([])
    setStatusText(`Ready - ${VERSION}`)
  }

  /** Enter expands "1.5m" style shorthand, otherwise it just reformats what was typed. */
  function onAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>, value: string) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const shorthand = parseAmountShorthand(value)
    if (shorthand !== null) {
      changeCreateForm({ amount: money(shorthand) })
      return
    }
    const plain = Number(String(value).replace(/,/g, ''))
    if (value !== '' && !isNaN(plain)) changeCreateForm({ amount: money(plain) })
  }

  const approvalLimitType = selectedRecord ? labelFor(LIMIT_TYPES, selectedRecord.limitType) : ''

  return (
    <div className="maintainlimits">
      <div className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div className="toolbar-left">
              <BackButton className="refresh-btn" />
              <div className="title">Maintain Limits for Existing Banks</div>
            </div>
            <div className="toolbar-right">
              <button className="refresh-btn" type="button" onClick={reloadPage}>
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
                <div className="ml-field cc">
                  <label htmlFor="mlCompanyCode">
                    Company Code<span className="required-mark">*</span>
                  </label>
                  <select
                    id="mlCompanyCode"
                    className="select"
                    value={selection.companyCode}
                    onChange={(e) =>
                      changeSelection({
                        companyCode: e.target.value,
                        trader: TRADER_MAP[e.target.value] ?? '',
                      })
                    }
                  >
                    <option value="">Select Company Code</option>
                    {COMPANY_CODES.map((it) => (
                      <option key={it.code} value={it.code}>
                        {it.code} - {it.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-field narrow">
                  <label htmlFor="mlKeyDate">
                    Key Date<span className="required-mark">*</span>
                  </label>
                  <div className="date-input-wrap">
                    <input
                      id="mlKeyDate"
                      className="input"
                      type="text"
                      placeholder="DD-MM-YYYY"
                      value={selection.keyDate}
                      onChange={(e) => changeSelection({ keyDate: e.target.value })}
                    />
                    <div className="calendar-btn-wrap">
                      <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true"></button>
                      <CalendarPicker
                        id="mlKeyDateNative"
                        className="calendar-native"
                        aria-label="Open calendar"
                        onChange={(e) => {
                          if (e.target.value) changeSelection({ keyDate: displayDate(e.target.value) })
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-field bt">
                  <label htmlFor="mlBankType">
                    Bank Type<span className="required-mark">*</span>
                  </label>
                  <select
                    id="mlBankType"
                    className="select"
                    value={selection.bankType}
                    // Changing the bank type reloads the partner list, so the old pick cannot stand.
                    onChange={(e) => changeSelection({ bankType: e.target.value, businessPartner: '' })}
                  >
                    <option value="">Select Bank Type</option>
                    {BANK_TYPES.map((it) => (
                      <option key={it.code} value={it.code}>
                        {it.code} {it.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-field wide">
                  <label htmlFor="mlBusinessPartner">
                    Business Partner<span className="required-mark">*</span>
                  </label>
                  <select
                    id="mlBusinessPartner"
                    className="select"
                    value={selection.businessPartner}
                    onChange={(e) => changeSelection({ businessPartner: e.target.value })}
                  >
                    <option value="">Select Business Partner</option>
                    {bpOptions.map((it) => (
                      <option key={`${it.bankType}-${it.code}`} value={it.code}>
                        {it.code} {it.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-field llc">
                  <label htmlFor="mlLimitLevelCheck">
                    Limit Level Check<span className="required-mark">*</span>
                  </label>
                  <select
                    id="mlLimitLevelCheck"
                    className="select"
                    value={selection.limitLevelCheck}
                    onChange={(e) => changeSelection({ limitLevelCheck: e.target.value })}
                  >
                    <option value="">Select Limit Level Check</option>
                    {LIMIT_LEVEL_CHECKS.map((it) => (
                      <option key={it.code} value={it.code}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-field narrow">
                  <label htmlFor="mlTrader">Trader</label>
                  <input
                    id="mlTrader"
                    className="input detail-readonly-input"
                    type="text"
                    readOnly
                    value={selection.trader}
                  />
                </div>
              </div>
            </div>
          </div>
          <div id="mlResultsArea" style={{ display: ready ? 'block' : 'none' }}>
            <div className="toolbar">
              <div className="toolbar-left">
                <button
                  className="filter-icon-btn"
                  type="button"
                  title="Filters"
                  aria-label="Filters"
                  onClick={() => setFiltersOpen((open) => !open)}
                ></button>
                <div className={filtersOpen ? 'filter-body open' : 'filter-body'}>
                  <div className="filter-item">
                    <select
                      className="select compact-filter"
                      value={bankTypeFilter}
                      onChange={(e) => {
                        setBankTypeFilter(e.target.value)
                        setListPage(1)
                      }}
                    >
                      <option value="">Bank Type</option>
                      {BANK_TYPES.map((it) => (
                        <option key={it.code} value={it.code}>
                          {it.code} {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-item">
                    <select
                      className="select medium-filter"
                      value={limitLevelFilter}
                      onChange={(e) => {
                        setLimitLevelFilter(e.target.value)
                        setListPage(1)
                      }}
                    >
                      <option value="">Limit Level Check</option>
                      {LIMIT_LEVEL_CHECKS.map((it) => (
                        <option key={it.code} value={it.code}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setBankTypeFilter('')
                      setLimitLevelFilter('')
                      setListPage(1)
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              <div className="toolbar-right">
                <button className="btn btn-primary" type="button" onClick={openCreateLimitModal}>
                  Create Limit
                </button>
                <button className="btn btn-ghost" type="button" onClick={refreshList}>
                  Refresh
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={selectedIndex < 0}
                  onClick={() => openDmsModal(selectedIndex)}
                >
                  DMS
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={selectedIndex < 0}
                  onClick={openAssignBpModal}
                >
                  Assign BP
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setGroupName('')
                    setGroupOpen(true)
                  }}
                >
                  Create Group BP
                </button>
              </div>
            </div>
            <div className="card table-card">
              <div className="card-head">
                <div className="card-title">Limits Overview</div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {MAIN_COLUMNS.map((c) => (
                        <th key={c.key} style={{ width: c.width }}>
                          {c.label}
                          <SortArrows />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={MAIN_COLUMNS.length} className="empty">
                          No records match the current selection.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map(({ record, index }) => (
                        <tr
                          key={index}
                          className={index === selectedIndex ? 'selected' : ''}
                          onClick={() => selectRow(index)}
                        >
                          {MAIN_COLUMNS.map((c) =>
                            c.key === 'statusCode' ? (
                              <td key={c.key}>
                                <span className={statusBadgeClass(record.statusCode)}>
                                  {cellText(record, c)}
                                </span>
                              </td>
                            ) : (
                              <td key={c.key} className={c.number ? 'number' : ''}>
                                {cellText(record, c)}
                              </td>
                            ),
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="pagination-bar">
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

      <div className={createOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Maintain Limits for Existing Banks</div>
            <button className="modal-close" type="button" onClick={() => setCreateOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="subhead">Create Limit</div>
            <div className="cl-grid">
              <div className="cl-field cl-bp">
                <label>Business Partner</label>
                <div className="detail-value">
                  <span className="code">{currentBp ? `${currentBp.code} ${currentBp.name}` : ''}</span>
                </div>
              </div>
              <div className="cl-field">
                <label>Limit Type</label>
                <select
                  className="select"
                  value={createForm.limitType}
                  onChange={(e) => changeCreateForm({ limitType: e.target.value })}
                >
                  {LIMIT_TYPES.map((it) => (
                    <option key={it.code} value={it.code}>
                      {it.code} {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cl-field cl-fit">
                <label>Start Date<span className="required-mark">*</span></label>
                <div className="date-input-wrap">
                  <input
                    className="input"
                    type="text"
                    placeholder="DD-MM-YYYY"
                    value={createForm.startDate}
                    onChange={(e) => changeCreateForm({ startDate: e.target.value })}
                  />
                  <div className="calendar-btn-wrap">
                    <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true"></button>
                    <CalendarPicker
                      className="calendar-native"
                      onChange={(e) => {
                        if (e.target.value) changeCreateForm({ startDate: displayDate(e.target.value) })
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="cl-field">
                <label>End Date<span className="required-mark">*</span></label>
                <div className="date-input-wrap">
                  <input
                    className="input"
                    type="text"
                    placeholder="DD-MM-YYYY"
                    value={createForm.endDate}
                    onChange={(e) => changeCreateForm({ endDate: e.target.value })}
                  />
                  <div className="calendar-btn-wrap">
                    <button className="calendar-btn" type="button" tabIndex={-1} aria-hidden="true"></button>
                    <CalendarPicker
                      className="calendar-native"
                      onChange={(e) => {
                        if (e.target.value) changeCreateForm({ endDate: displayDate(e.target.value) })
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="cl-field cl-fit">
                <label>Limit Amount<span className="required-mark">*</span></label>
                <input
                  className="input money amount-input"
                  type="text"
                  placeholder="0.00"
                  value={createForm.amount}
                  onChange={(e) => changeCreateForm({ amount: e.target.value })}
                  onKeyDown={(e) => onAmountKeyDown(e, createForm.amount)}
                />
              </div>
              <div className="cl-field">
                <label>Tenor</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Days"
                  value={createForm.tenor}
                  onChange={(e) => changeCreateForm({ tenor: e.target.value })}
                />
              </div>
            </div>
            <div className="subhead" style={{ marginTop: 12 }}>
              Email Note
            </div>
            <textarea
              className="email-note"
              value={createForm.emailNote}
              onChange={(e) => changeCreateForm({ emailNote: e.target.value })}
            />
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" type="button" onClick={submitCreateLimit}>
              Create Limit
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className={approvalOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Send for Approval</div>
            <button className="modal-close" type="button" onClick={() => setApprovalOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="subhead">Create Limit</div>
            <div className="cl-grid">
              <div className="cl-field cl-bp">
                <label>Business Partner</label>
                <div className="detail-value">
                  <span className="code">
                    {selectedRecord ? `${selectedRecord.bpCode} ${selectedRecord.bpName}` : ''}
                  </span>
                </div>
              </div>
              <div className="cl-field">
                <label>Limit Type</label>
                <div className="detail-value">
                  <span className="code">{approvalLimitType}</span>
                </div>
              </div>
              <div className="cl-field cl-fit">
                <label>Start Date</label>
                <div className="detail-value">
                  <span className="code">
                    {selectedRecord ? displayDate(selectedRecord.startDate) : ''}
                  </span>
                </div>
              </div>
              <div className="cl-field">
                <label>End Date</label>
                <div className="detail-value">
                  <span className="code">{selectedRecord ? displayDate(selectedRecord.endDate) : ''}</span>
                </div>
              </div>
              <div className="cl-field cl-fit">
                <label>Limit Amount</label>
                <div className="detail-value money">
                  <span className="code">{selectedRecord ? money(selectedRecord.amount) : ''}</span>
                </div>
              </div>
              <div className="cl-field">
                <label>Tenor</label>
                <div className="detail-value">
                  <span className="code">
                    {selectedRecord ? dayDiff(selectedRecord.startDate, selectedRecord.endDate) : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="subhead" style={{ marginTop: 12 }}>
              Email Note
            </div>
            <textarea
              className="email-note"
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
            />
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" type="button" onClick={sendForApproval}>
              Send For Approval
            </button>
            <button className="btn" type="button" onClick={saveApprovalDraft}>
              Save
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setApprovalOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className={dmsOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal large">
          <div className="modal-head">
            <div className="modal-title">Attach Document</div>
            <button className="modal-close" type="button" onClick={() => setDmsOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="subhead">Bank Details</div>
            <div className="dms-info-row">
              <div className="cl-field dms-bp">
                <label>Business Partner</label>
                <div className="detail-value">
                  <span className="code">{dmsRecord ? `${dmsRecord.bpCode} ${dmsRecord.bpName}` : ''}</span>
                </div>
              </div>
              <div className="cl-field dms-bt">
                <label>Bank Type</label>
                <div className="detail-value">
                  <span className="code">{dmsRecord ? labelFor(BANK_TYPES, dmsRecord.bankType) : ''}</span>
                </div>
              </div>
              <div className="cl-field dms-lt">
                <label>Limit Type</label>
                <div className="detail-value">
                  <span className="code">{dmsRecord ? labelFor(LIMIT_TYPES, dmsRecord.limitType) : ''}</span>
                </div>
              </div>
              <div className="cl-field dms-sd">
                <label>Start Date</label>
                <div className="detail-value">
                  <span className="code">{dmsRecord ? displayDate(dmsRecord.startDate) : ''}</span>
                </div>
              </div>
              <div className="cl-field dms-dc">
                <label>Document count</label>
                <div className="detail-value">
                  <span className="code">{dmsRecord ? documentCount(dmsRecord) : ''}</span>
                </div>
              </div>
            </div>
            <div className="dms-card">
              <div className="dms-card-head">DMS DATA</div>
              <div className="table-wrap">
                <table className="edit-table">
                  <thead>
                    <tr>
                      {DMS_COLUMNS.map((c) => (
                        <th key={c.label} style={{ width: c.width }}>
                          {c.label}
                          <SortArrows />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DOCUMENT_TYPES.map((d) => {
                      const doc = dmsRecord?.documents[d.code] ?? emptyDocument(selection.keyDate)
                      const pending = pendingFiles[d.code]
                      return (
                        <tr key={d.code}>
                          <td>{d.code}</td>
                          <td>{d.desc}</td>
                          <td className="editable">
                            <div className="date-input-wrap compact">
                              <input
                                className="cell-input dms-date"
                                type="text"
                                placeholder="DD-MM-YYYY"
                                value={doc.date || selection.keyDate}
                                onChange={(e) =>
                                  updateDocument(dmsIndex, d.code, { date: e.target.value })
                                }
                              />
                              <div className="calendar-btn-wrap">
                                <button
                                  className="calendar-btn"
                                  type="button"
                                  tabIndex={-1}
                                  aria-hidden="true"
                                ></button>
                                <CalendarPicker
                                  className="calendar-native dms-date-native"
                                  onChange={(e) => {
                                    if (e.target.value)
                                      updateDocument(dmsIndex, d.code, {
                                        date: displayDate(e.target.value),
                                      })
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="editable">
                            <input
                              className="cell-input dms-file"
                              type="text"
                              readOnly
                              value={pending ? pending.name : doc.fileName}
                              style={doc.uploaded ? undefined : { cursor: 'pointer' }}
                              onClick={() => {
                                if (!doc.uploaded) pickFile(d.code, 'pick')
                              }}
                            />
                          </td>
                          <td>{doc.dmsCode}</td>
                          <td className="icon-cell">
                            <button
                              className="dms-action-btn dms-upload"
                              type="button"
                              disabled={doc.uploaded}
                              onClick={() => uploadDocument(d.code, doc.date || selection.keyDate)}
                            >
                              Upload
                            </button>
                          </td>
                          <td className="icon-cell">
                            <button
                              className="dms-action-btn dms-download"
                              type="button"
                              disabled={!doc.uploaded}
                              onClick={() => downloadDocument(doc)}
                            >
                              Download
                            </button>
                          </td>
                          <td className="icon-cell">
                            <button
                              className="dms-action-btn dms-edit"
                              type="button"
                              disabled={!doc.uploaded}
                              onClick={() => pickFile(d.code, 'edit')}
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
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                onFileChosen(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
          </div>
          <div className="modal-foot">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setDmsOpen(false)
                pushToast('Documents approved successfully.', 'success')
              }}
            >
              &#10003; Approve
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDmsOpen(false)}>
              &#10005; Cancel
            </button>
          </div>
        </div>
      </div>

      <div className={assignOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Assign BP</div>
            <button className="modal-close" type="button" onClick={() => setAssignOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="subhead">Assign Business Partner</div>
            <div className="cl-row-single">
              <div className="cl-field cl-bp">
                <label>Business Partner</label>
                <div className="detail-value">
                  <span className="code">
                    {selectedRecord ? `${selectedRecord.bpCode} ${selectedRecord.bpName}` : ''}
                  </span>
                </div>
              </div>
              <div className="cl-field cl-mid">
                <label>Group BP<span className="required-mark">*</span></label>
                <select
                  className="select"
                  value={assignGroupBp}
                  onChange={(e) => setAssignGroupBp(e.target.value)}
                >
                  <option value="">Select Group BP</option>
                  {groupBps.map((it) => (
                    <option key={it.code} value={it.code}>
                      {it.code} {it.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" type="button" onClick={assignBp}>
              Assign
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setAssignOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className={groupOpen ? 'modal-bg open' : 'modal-bg'}>
        <div className="modal small">
          <div className="modal-head">
            <div className="modal-title">Create Group BP</div>
            <button className="modal-close" type="button" onClick={() => setGroupOpen(false)}>
              X
            </button>
          </div>
          <div className="modal-body">
            <div className="subhead">Create Group BP</div>
            <div className="cl-row-single">
              <div className="cl-field cl-fit">
                <label>Group BP Code</label>
                <div className="detail-value">
                  <span className="code">{proposedGroupCode}</span>
                </div>
              </div>
              <div className="cl-field cl-mid">
                <label>Group BP Name<span className="required-mark">*</span></label>
                <input
                  className="input"
                  type="text"
                  placeholder="Enter group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" type="button" onClick={createGroupBp}>
              Create
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setGroupOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
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
        <span>{statusText}</span>
      </div>
    </div>
  )
}
