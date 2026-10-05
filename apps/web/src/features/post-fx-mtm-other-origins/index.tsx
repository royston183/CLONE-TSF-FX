import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  COMPANY_REQUIRED,
  DEFAULT_KEY_DATE_ISO,
  DEFAULT_PAGE_SIZE,
  LAYOUT_VARIANTS,
  MOCK_COMPANIES,
  MOCK_CURRENCY_PAIRS,
  MOCK_PARTNERS,
  PAGE_SIZES,
  RFHA_DEBOUNCE_MS,
  TOAST_MS,
} from './data.ts'
import { Dropdown, MultiSelect } from './Dropdowns.tsx'
import { isoToDMY, maskKeyDate } from './format.ts'
import { KeyDateField } from './KeyDateField.tsx'
import {
  DEFAULT_SORT,
  NOT_POSTABLE_TOAST,
  buildDocumentView,
  clampPage,
  createMockDb,
  criteriaOf,
  dragLabel,
  emptyMessage,
  executeState,
  getFxTransactions,
  getViewRows,
  isPostable,
  nextSort,
  pageCount,
  postAll,
  postButtonTitle,
  postMtmDocument,
  resultCountText,
  selectionReady,
  showingText,
  sortForColumns,
  validateKeyDate,
  visibleColumns,
} from './logic.ts'
import { DocumentModal, MessageLogModal, TransactionModal } from './Modals.tsx'
import { useModal } from './modal.tsx'
import { MtmTable, Pager } from './MtmTable.tsx'
import './post-fx-mtm-other-origins.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './post-fx-mtm-other-origins.dark.css'
import type { ColumnKey, DealType, DocKind, LogMessage, PostingType, Row, SelectItem, Sort } from './types.ts'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

const DEFAULT_KEY_TEXT = isoToDMY(DEFAULT_KEY_DATE_ISO)
const ALL_COMPANIES = MOCK_COMPANIES.map((c) => c.bukrs)

const COMPANY_ITEMS: SelectItem[] = MOCK_COMPANIES.map((c) => ({ value: c.bukrs, label: c.name }))
const BP_ITEMS: SelectItem[] = [
  { value: '', label: 'All' },
  ...MOCK_PARTNERS.map((p) => ({ value: p.id, label: p.name, secondary: p.id })),
]
const PAIR_ITEMS: SelectItem[] = [{ value: '', label: 'All' }, ...MOCK_CURRENCY_PAIRS.map((p) => ({ value: p.pair, label: p.pair }))]

const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: 'NDF', label: 'NDF' },
  { value: 'DELIVERABLE', label: 'Deliverable Deals' },
  { value: 'ALL', label: 'All' },
]

type PanelId = 'company' | 'bp' | 'pair' | 'layout' | 'date'
type Toast = { text: string; error: boolean; show: boolean }

/**
 * Post FX MTM to Accounting - Other Origins (ZSGTSF_RMTM_OTHERS / ZSGTSFR023), converted from
 * legacy/post-fx-mtm-other-origins.html.
 *
 * UI only: the transactions, spot and swap curves and posting configuration are the demo data in
 * data.ts, and posting just stamps local document numbers. No SAP or middleware call is made from
 * this page.
 */
export default function PostFxMtmOtherOrigins() {
  const [db, setDb] = useState(createMockDb)
  // The Key Date as typed, the last date it was applied for, and why it was refused (if it was).
  const [keyText, setKeyText] = useState(DEFAULT_KEY_TEXT)
  const [keyIso, setKeyIso] = useState(DEFAULT_KEY_DATE_ISO)
  const [keyError, setKeyError] = useState('')
  const [companies, setCompanies] = useState<string[]>(ALL_COMPANIES)
  const [rfhaText, setRfhaText] = useState('')
  /** The transaction filter as last applied; typing is debounced like the original. */
  const [rfhaApplied, setRfhaApplied] = useState('')
  const [bp, setBp] = useState('')
  const [pair, setPair] = useState('')
  const [dealType, setDealType] = useState<DealType>('ALL')
  const [postingType, setPostingType] = useState<PostingType>('VIEW')
  const [layout, setLayout] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dropReady, setDropReady] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [logMsgs, setLogMsgs] = useState<LogMessage[]>([])
  const [docTarget, setDocTarget] = useState<{ key: string; which: DocKind } | null>(null)
  const [txnKey, setTxnKey] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>({ text: '', error: false, show: false })

  const logModal = useModal()
  const docModal = useModal()
  const txnModal = useModal()

  const keyAppliedRef = useRef(DEFAULT_KEY_TEXT)
  const rfhaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ------------------------------------------------------------------ derived
  const rows = useMemo(
    () =>
      selectionReady(keyError, companies)
        ? getFxTransactions(db, criteriaOf({ keyIso, companies, rfhaText: rfhaApplied, bp, pair, dealType }))
        : [],
    [db, keyError, keyIso, companies, rfhaApplied, bp, pair, dealType],
  )
  // A reload that no longer contains the selected transaction clears the selection.
  if (selectedKey !== null && !rows.some((r) => r.key === selectedKey)) setSelectedKey(null)

  const cols = visibleColumns(layout)
  const viewRows = getViewRows(rows, cols, search, sort)
  const total = viewRows.length
  const pages = pageCount(total, pageSize)
  const current = clampPage(page, total, pageSize)
  const pageRows = viewRows.slice((current - 1) * pageSize, current * pageSize)
  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null
  const canPost = isPostable(selectedRow)
  const exec = executeState(rows, postingType)
  const docRow = docTarget ? (rows.find((r) => r.key === docTarget.key) ?? null) : null
  const docView = docTarget && docRow ? buildDocumentView(db, docRow, docTarget.which, keyIso) : null
  const txnRow = txnKey ? (rows.find((r) => r.key === txnKey) ?? null) : null

  // -------------------------------------------------------- global listeners
  const escapeRef = useRef<() => void>(() => {})
  escapeRef.current = () => {
    // An open dropdown or calendar takes the Escape; otherwise it closes the popups.
    if (openPanel !== null) {
      setOpenPanel(null)
      return
    }
    docModal.close()
    txnModal.close()
    logModal.close()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    // Any click outside a dropdown or the calendar closes whatever is open.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !target.isConnected) return
      if (!target.closest('.dd, .date-field')) setOpenPanel(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
      clearTimeout(rfhaTimer.current)
      clearTimeout(toastTimer.current)
    }
  }, [])

  const panel = (id: PanelId) => ({
    open: openPanel === id,
    onOpenChange: (o: boolean) => setOpenPanel(o ? id : (cur) => (cur === id ? null : cur)),
  })

  // ----------------------------------------------------------------- handlers
  const showToast = (text: string, error: boolean) => {
    setToast({ text, error, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }

  /** PAI: month-end validation of the Key Date; a valid date reloads the transactions. */
  const applyKeyDate = (text: string) => {
    const v = validateKeyDate(text)
    keyAppliedRef.current = v.raw
    setKeyError(v.error)
    if (v.iso) setKeyIso(v.iso)
    setPage(1)
  }

  const onKeyType = (raw: string) => {
    const v = maskKeyDate(raw)
    setKeyText(v)
    if (v.length === 10) applyKeyDate(v)
  }

  const onKeyBlur = () => {
    // The original reacted to the box's change event, which only fires when the text changed.
    if (keyText.trim() !== keyAppliedRef.current) applyKeyDate(keyText)
  }

  const onRfhaType = (text: string) => {
    setRfhaText(text)
    clearTimeout(rfhaTimer.current)
    rfhaTimer.current = setTimeout(() => {
      setRfhaApplied(text)
      setPage(1)
    }, RFHA_DEBOUNCE_MS)
  }

  /** Reset: filters, search, sort, paging and selection go back to the opening state; data stays. */
  const resetFilters = (keepPageSize: boolean) => {
    clearTimeout(rfhaTimer.current)
    setKeyText(DEFAULT_KEY_TEXT)
    setKeyIso(DEFAULT_KEY_DATE_ISO)
    setKeyError('')
    keyAppliedRef.current = DEFAULT_KEY_TEXT
    setCompanies(ALL_COMPANIES)
    setRfhaText('')
    setRfhaApplied('')
    setBp('')
    setPair('')
    setDealType('ALL')
    setPostingType('VIEW')
    setLayout('')
    setSearch('')
    setSort(DEFAULT_SORT)
    setPage(1)
    if (!keepPageSize) setPageSize(DEFAULT_PAGE_SIZE)
    setSelectedKey(null)
  }

  /** Refresh: the whole demo is restored, including every posting made so far. */
  const refreshAll = () => {
    setDb(createMockDb())
    logModal.hide()
    docModal.hide()
    txnModal.hide()
    resetFilters(false)
  }

  const onCompanies = (list: string[]) => {
    setCompanies(list)
    setPage(1)
  }

  const onSort = (key: ColumnKey) => setSort((s) => nextSort(s, key))

  const onLayout = (v: string) => {
    setLayout(v)
    setSort((s) => sortForColumns(s, visibleColumns(v)))
    setPage(1)
  }

  const selectRow = (key: string) => setSelectedKey(key)
  const toggleRow = (key: string) => setSelectedKey((s) => (s === key ? null : key))

  const openLink = (row: Row, link: 'rfha' | 'mtm' | 'rev') => {
    if (link === 'rfha') {
      setTxnKey(row.key)
      txnModal.open()
    } else if (link === 'mtm' && row.mtmDoc) {
      setDocTarget({ key: row.key, which: 'mtm' })
      docModal.open()
    } else if (link === 'rev' && row.revDoc) {
      setDocTarget({ key: row.key, which: 'rev' })
      docModal.open()
    }
  }

  const showLog = (msgs: LogMessage[]) => {
    setLogMsgs(msgs)
    if (msgs.length) logModal.open()
  }

  // ALV toolbar POST: the selected row, only if MTM_DOC is initial and V_GL is not initial.
  const postSelected = () => {
    if (!isPostable(selectedRow)) return
    const res = postMtmDocument(db, selectedRow, keyIso)
    setDb(res.db)
    showLog(res.msgs)
  }

  // "View With FI Posting": ALL_POSTING over every unposted row in the selection.
  const executePosting = () => {
    if (postingType !== 'POST') return
    const res = postAll(db, rows, keyIso)
    setLogMsgs(res.msgs)
    if (res.msgs.length) {
      setDb(res.db)
      logModal.open()
    }
  }

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, row: Row) => {
    setSelectedKey(row.key)
    setDraggingKey(row.key)
    setDropReady(isPostable(row))
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = dragLabel(row)
    document.body.appendChild(ghost)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', row.key)
    } catch {
      /* some browsers refuse custom data on drag start */
    }
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }

  const onDragEnd = () => {
    setDraggingKey(null)
    setDropReady(false)
    setDragOver(false)
  }

  return (
    <div className="post-fx-mtm-other-origins">
      <div className="app">
        {/* ============ Page header ============ */}
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" src={BRAND_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Post FX MTM to Accounting - Other Origins</h1>
            <p id="headerSub">Key Date : {keyError ? '—' : isoToDMY(keyIso)}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            id="btnRefresh"
            style={{ marginLeft: 'auto' }}
            title="Reload the workbench with the initial demo data"
            onClick={refreshAll}
          >
            &#8635; Refresh
          </button>
          <SignOutButton className="btn btn-secondary" />
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>FX MTM Transactions
            </div>

            {/* ============ Search, filters, reset, actions ============ */}
            <div className="table-toolbar filter-bar">
              <div className="tb-row row-filters">
                <div className="tb-field f-search">
                  <label htmlFor="tableSearch">&nbsp;</label>
                  <div className="search-box">
                    <span className="icon">&#128269;</span>
                    <input
                      id="tableSearch"
                      placeholder="Search transactions..."
                      autoComplete="off"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                    />
                  </div>
                </div>

                <KeyDateField
                  text={keyText}
                  error={keyError}
                  {...panel('date')}
                  onType={onKeyType}
                  onBlur={onKeyBlur}
                  onEnter={() => applyKeyDate(keyText)}
                  onPick={(text) => {
                    setKeyText(text)
                    setOpenPanel(null)
                    applyKeyDate(text)
                  }}
                />

                <div className={`tb-field f-co${companies.length === 0 ? ' has-error' : ''}`} id="field-company">
                  <label>
                    Company Code<span className="req">*</span>
                  </label>
                  <MultiSelect id="company" items={COMPANY_ITEMS} value={companies} {...panel('company')} onChange={onCompanies} />
                  <div className="tb-error" id="err-company">
                    {COMPANY_REQUIRED}
                  </div>
                </div>

                <div className="tb-field f-rfha" id="field-rfha">
                  <label htmlFor="input-rfha">Transaction</label>
                  <input
                    className="control"
                    id="input-rfha"
                    placeholder="e.g. 1200003100-1200003130"
                    autoComplete="off"
                    title="Single number, range (from-to) or comma separated list"
                    value={rfhaText}
                    onChange={(e) => onRfhaType(e.target.value)}
                  />
                </div>

                <div className="tb-field f-bp">
                  <label>Business Partner</label>
                  <Dropdown
                    id="bp"
                    items={BP_ITEMS}
                    value={bp}
                    searchable
                    {...panel('bp')}
                    onChange={(v) => {
                      setBp(v)
                      setPage(1)
                    }}
                  />
                </div>

                <div className="tb-field f-pair">
                  <label>Currency Pair</label>
                  <Dropdown
                    id="pair"
                    items={PAIR_ITEMS}
                    value={pair}
                    {...panel('pair')}
                    onChange={(v) => {
                      setPair(v)
                      setPage(1)
                    }}
                  />
                </div>

                <div className="tb-field f-layout align-right">
                  <label>Layout</label>
                  <Dropdown id="layout" items={LAYOUT_VARIANTS} value={layout} {...panel('layout')} onChange={onLayout} />
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-reset"
                  id="btnResetFilters"
                  onClick={() => resetFilters(true)}
                >
                  Reset
                </button>
              </div>

              <div className="tb-row row-actions">
                <div className="seg-group">
                  <label id="lbl-dealType">Deal Type</label>
                  <div className="seg" id="seg-dealType" role="group" aria-labelledby="lbl-dealType">
                    {DEAL_TYPES.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={dealType === d.value}
                        className={dealType === d.value ? 'active' : undefined}
                        onClick={() => {
                          setDealType(d.value)
                          setPage(1)
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="seg-group">
                  <label id="lbl-postingType">Posting Type</label>
                  <div className="seg" id="seg-postingType" role="group" aria-labelledby="lbl-postingType">
                    <button
                      type="button"
                      title="Executing posts every unposted transaction in the selection"
                      aria-pressed={postingType === 'POST'}
                      className={postingType === 'POST' ? 'active' : undefined}
                      onClick={() => setPostingType('POST')}
                    >
                      View With FI Posting
                    </button>
                    <button
                      type="button"
                      aria-pressed={postingType === 'VIEW'}
                      className={postingType === 'VIEW' ? 'active' : undefined}
                      onClick={() => setPostingType('VIEW')}
                    >
                      View Only
                    </button>
                  </div>
                </div>

                <div className="tb-right">
                  <span className="result-count" id="resultCount">
                    {resultCountText(rows.length)}
                  </span>
                  <div className="action-cluster">
                    <span
                      className={`drop-wrap${dropReady ? ' drop-ready' : ''}`}
                      id="dropPost"
                      onDragOver={(e) => {
                        if (!draggingKey) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                        if (canPost) setDragOver(true)
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        setDropReady(false)
                        if (!draggingKey) return
                        if (canPost) postSelected()
                        else showToast(NOT_POSTABLE_TOAST, true)
                      }}
                    >
                      <button
                        type="button"
                        className={`btn btn-primary${dragOver ? ' drag-over' : ''}`}
                        id="btnPost"
                        disabled={!canPost}
                        title={postButtonTitle(selectedRow)}
                        onClick={postSelected}
                      >
                        Post Document
                      </button>
                    </span>
                    <button
                      type="button"
                      className={`btn btn-secondary${exec.visible ? '' : ' hidden'}`}
                      id="btnExecute"
                      disabled={exec.disabled}
                      title={exec.title}
                      onClick={executePosting}
                    >
                      {exec.label}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ============ Table ============ */}
            <MtmTable
              cols={cols}
              rows={pageRows}
              sort={sort}
              selectedKey={selectedKey}
              draggingKey={draggingKey}
              hidden={total === 0}
              onSort={onSort}
              onSelect={selectRow}
              onToggle={toggleRow}
              onOpenLink={openLink}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
            <div className="empty-state" id="emptyState" style={{ display: total === 0 ? '' : 'none' }}>
              <div className="big">&#128196;</div>
              <span id="emptyText">{emptyMessage(keyError, companies.length)}</span>
            </div>

            <div className="table-footer">
              <div className="foot-left">
                <div className="page-size-select">
                  Rows per page
                  <select
                    id="pageSizeSelect"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value, 10))
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="showing" id="showingText">
                  {showingText(current, pageSize, total, pageRows.length)}
                </span>
              </div>
              <Pager current={current} count={pages} onPage={setPage} />
            </div>
          </div>
        </div>
      </div>

      {/* ============ Message Log (screen 9000), accounting document, transaction details ============ */}
      <MessageLogModal modal={logModal} msgs={logMsgs} />
      <DocumentModal modal={docModal} view={docView} row={docRow} which={docTarget?.which ?? 'mtm'} />
      <TransactionModal modal={txnModal} row={txnRow} keyIso={keyIso} />

      <div className={`toast${toast.error ? ' error' : ''}${toast.show ? ' show' : ''}`} id="toast">
        {toast.text}
      </div>
    </div>
  )
}
