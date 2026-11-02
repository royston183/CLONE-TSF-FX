import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CompanySelect } from './CompanySelect.tsx'
import {
  BUSINESS_PARTNERS,
  CURRENCY_PAIRS,
  DEFAULT_PAGE_SIZE,
  INITIAL_KEY_DATE,
  LAYOUTS,
  PAGE_SIZES,
} from './data.ts'
import { isoToDMY } from './format.ts'
import { KeyDateField } from './KeyDateField.tsx'
import { PAGE_LOGO } from './logo.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  MSG_CHECK_FIELDS,
  MSG_REFRESHED,
  allCompanyCodes,
  clampPage,
  createMockDb,
  documentView,
  emptyState,
  fetchMtmRows,
  layoutColumns,
  massPost,
  nextSort,
  pageCount,
  planExecution,
  postBlockReason,
  postMtmDocument,
  resultCountText,
  showingText,
  transactionView,
  validateCompany,
  validateKeyDate,
  visibleRows,
} from './logic.ts'
import { ConfirmModal, DocumentModal, MessageLogModal, TransactionModal } from './Modals.tsx'
import { MtmTable } from './MtmTable.tsx'
import './post-fx-mtm-oil-dmcc.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './post-fx-mtm-oil-dmcc.dark.css'
import type {
  ColumnKey,
  DocView,
  FieldErrors,
  Filters,
  LogMsg,
  MtmRow,
  PendingRun,
  Posting,
  SelectionParams,
  Sort,
  TxnView,
} from './types.ts'

const TOAST_MS = 3200
const INITIAL_KEY_TEXT = isoToDMY(INITIAL_KEY_DATE)
const NO_RUN: SelectionParams = { company: [], keyDate: '', posting: 'view' }
const NO_ERRORS: FieldErrors = { company: null, keyDate: null }

type ModalState =
  | { kind: 'confirm'; run: PendingRun }
  | { kind: 'log'; msgs: LogMsg[] }
  | { kind: 'doc'; view: DocView }
  | { kind: 'txn'; view: TxnView }
  | null

type Toast = { text: string; error: boolean; show: boolean }

/**
 * Post FX MTM to Accounting - OIL, OGA & DMCC (USD) (ZSGTSF_RMTM_OIL / ZSGTSFR022), converted from
 * legacy/post-fx-mtm-oil-dmcc.html.
 *
 * UI only: the transactions, rates and posted documents are demo data in data.ts, and posting just
 * simulates the MTM document and its reversal against local tables. No SAP or middleware call is
 * made from this page.
 */
export default function PostFxMtmOilDmcc() {
  const rootRef = useRef<HTMLDivElement>(null)

  // The mock tables (posted documents, number range) and the run that produced the list.
  const [db, setDb] = useState(createMockDb)
  const [executed, setExecuted] = useState(false)
  const [run, setRun] = useState<SelectionParams>(NO_RUN)
  const [rows, setRows] = useState<MtmRow[]>([])

  // Selection screen.
  const [company, setCompany] = useState<string[]>(allCompanyCodes)
  const [keyText, setKeyText] = useState(INITIAL_KEY_TEXT)
  const [posting, setPosting] = useState<Posting>('view')
  const [layoutId, setLayoutId] = useState('')
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS)

  // List.
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<Toast>({ text: '', error: false, show: false })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState(false)
  const draggedRef = useRef<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cols = layoutColumns(layoutId)
  const list = useMemo(() => visibleRows(rows, filters, search, sort, layoutId), [rows, filters, search, sort, layoutId])
  const total = list.length
  const pages = pageCount(total, pageSize)
  const current = clampPage(page, total, pageSize)
  const pageRows = list.slice((current - 1) * pageSize, (current - 1) * pageSize + pageSize)
  const selectedRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const blockReason = postBlockReason(selectedRow)
  const hasRows = executed && total > 0

  const showToast = (text: string, error: boolean) => {
    setToast({ text, error, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Escape closes the popup on top (the confirmation counts as a cancel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------------ list state
  const resetFilters = () => {
    setSearch('')
    setFilters(DEFAULT_FILTERS)
    setSort(DEFAULT_SORT)
    setPage(1)
    setSelectedId(null)
  }

  /** Header Refresh: the whole screen back to its initial state. */
  const refreshScreen = () => {
    setDb(createMockDb())
    setModal(null)
    setExecuted(false)
    setRows([])
    setRun(NO_RUN)
    setLayoutId('')
    // Demo defaults so the screen is ready to run; the SAP selection screen starts empty.
    setCompany(allCompanyCodes())
    setKeyText(INITIAL_KEY_TEXT)
    setPosting('view')
    setErrors(NO_ERRORS)
    resetFilters()
    showToast(MSG_REFRESHED, false)
  }

  const edit = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  // ------------------------------------------------------------------ selection / execute
  const commitKeyDate = (text: string) => {
    const r = validateKeyDate(text)
    setKeyText(r.text)
    setErrors((e) => ({ ...e, keyDate: r.ok ? null : r.error }))
  }

  const commitRun = (params: SelectionParams, newRows: MtmRow[]) => {
    setExecuted(true)
    setRun(params)
    setRows(newRows)
    setSelectedId(null)
    setPage(1)
  }

  /** START-OF-SELECTION. */
  const onExecute = () => {
    const companyError = validateCompany(company)
    const key = validateKeyDate(keyText)
    setKeyText(key.text)
    setErrors({ company: companyError, keyDate: key.ok ? null : key.error })
    if (companyError || !key.ok) {
      showToast(MSG_CHECK_FIELDS, true)
      return
    }
    const params: SelectionParams = { company: [...company], keyDate: key.iso, posting }
    const fetched = fetchMtmRows(db, params)
    const plan = planExecution(fetched, params, filters)
    if (plan.kind === 'confirm') {
      setModal({ kind: 'confirm', run: plan.run })
      return
    }
    commitRun(params, fetched)
  }

  /** FORM ALL_POSTING + POST_DISPLAY. */
  const runMassPosting = (pending: PendingRun) => {
    setModal(null)
    const res = massPost(db, pending)
    setDb(res.db)
    commitRun(pending.params, fetchMtmRows(res.db, pending.params))
    if (res.msgs.length) setModal({ kind: 'log', msgs: res.msgs })
  }

  /** The Post Document button, or a row dropped on it. */
  const triggerPost = (row: MtmRow | null) => {
    const reason = postBlockReason(row)
    if (reason || !row) {
      showToast(reason, true)
      return
    }
    const res = postMtmDocument(db, row, run.keyDate)
    setDb(res.db)
    setRows(fetchMtmRows(res.db, run))
    setSelectedId(null)
    if (res.msgs.length) setModal({ kind: 'log', msgs: res.msgs })
  }

  // ------------------------------------------------------------------ drag a row onto Post Document
  const onDragStart = (row: MtmRow, e: DragEvent<HTMLTableRowElement>) => {
    setSelectedId(row.id)
    draggedRef.current = row.id
    setDraggingId(row.id)
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = `${row.rfha} — ${row.cpair}`
    // Inside the page root so the scoped .drag-ghost rule applies.
    rootRef.current?.appendChild(ghost)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', row.rfha)
    } catch {
      /* some browsers refuse; the drop reads the dragged row from state instead */
    }
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }
  const onDragEnd = () => {
    draggedRef.current = null
    setDraggingId(null)
    setDropOver(false)
  }
  const onDrop = (e: DragEvent<HTMLSpanElement>) => {
    e.preventDefault()
    setDropOver(false)
    setDraggingId(null)
    const id = draggedRef.current
    draggedRef.current = null
    if (id) triggerPost(rows.find((r) => r.id === id) ?? null)
  }

  const openDocument = (row: MtmRow, kind: 'MTM' | 'REV') => {
    const view = documentView(row, kind, run.keyDate)
    if (view) setModal({ kind: 'doc', view })
  }

  const dropClass = `drop-wrap${draggingId ? ' drop-ready' : ''}${dropOver ? ' drag-over' : ''}`

  return (
    <div className="post-fx-mtm-oil-dmcc" ref={rootRef}>
      <div className="app">
        <div className="page-header">
          <img className="logo-img" src={PAGE_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Post FX MTM to Accounting</h1>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <BackButton className="btn btn-secondary" />
            <button
              type="button"
              className="btn btn-secondary"
              id="btnRefresh"
              title="Reload the screen to its initial state"
              onClick={refreshScreen}
            >
              ↻ Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* ============ Selection ============ */}
        <div className="card" id="selectionCard">
          <div className="section-title">
            <span className="dot"></span>Selection Screen
          </div>
          <div className="section-body">
            <div className="sel-row">
              <CompanySelect
                company={company}
                error={errors.company}
                onChange={(next) => {
                  setCompany(next)
                  if (next.length) setErrors((e) => ({ ...e, company: null }))
                }}
              />

              <KeyDateField
                text={keyText}
                error={errors.keyDate}
                onTyping={(text) => {
                  setKeyText(text)
                  setErrors((e) => ({ ...e, keyDate: null }))
                }}
                onCommit={commitKeyDate}
                onEnter={onExecute}
              />

              <div className="field f-posting" id="field-posting">
                <label id="lbl-posting">Posting Type</label>
                <div className="seg" role="radiogroup" aria-labelledby="lbl-posting" id="segPosting">
                  <label className={posting === 'view' ? 'on' : undefined} htmlFor="rb-view">
                    <input
                      type="radio"
                      name="postingType"
                      id="rb-view"
                      value="view"
                      checked={posting === 'view'}
                      onChange={() => setPosting('view')}
                    />
                    View Only
                  </label>
                  <label className={posting === 'post' ? 'on' : undefined} htmlFor="rb-post">
                    <input
                      type="radio"
                      name="postingType"
                      id="rb-post"
                      value="post"
                      checked={posting === 'post'}
                      onChange={() => setPosting('post')}
                    />
                    View With FI Posting
                  </label>
                </div>
                <div className="hint" id="hint-posting" style={{ visibility: posting === 'post' ? 'visible' : 'hidden' }}>
                  Posts an MTM document and its reversal for every listed transaction on Execute.
                </div>
              </div>

              <div className="field f-layout">
                <label htmlFor="select-layout">Layout</label>
                <select
                  className="control"
                  id="select-layout"
                  value={layoutId}
                  onChange={(e) => setLayoutId(e.target.value)}
                >
                  {LAYOUTS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sel-actions">
                <button type="button" className="btn btn-primary" id="btnExecute" onClick={onExecute}>
                  ▶ Execute
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ============ MTM list ============ */}
        <div className="card list-card" id="listCard">
          <div className="section-title">
            <span className="st-left">
              <span className="dot"></span>MTM-TSF OIL &amp; OGA
            </span>
            <span className="st-right" id="keyDateTitle">
              {executed && (
                <>
                  Key Date : <b>{isoToDMY(run.keyDate)}</b>
                </>
              )}
            </span>
          </div>

          <div className="table-toolbar">
            <div className="search-box">
              <span className="icon">🔍</span>
              <input
                id="tableSearch"
                placeholder="Search transactions..."
                autoComplete="off"
                aria-label="Search transactions"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <input
              className="control tb-input"
              id="filterRfha"
              placeholder="Transaction"
              autoComplete="off"
              aria-label="Transaction"
              title="Transaction"
              value={filters.rfha}
              onChange={(e) => edit({ rfha: e.target.value })}
            />
            <select
              className="control filter-select sel-bp"
              id="filterBp"
              aria-label="Business Partner"
              title="Business Partner"
              value={filters.bp}
              onChange={(e) => edit({ bp: e.target.value })}
            >
              <option value="">All partners</option>
              {BUSINESS_PARTNERS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              className="control filter-select sel-pair"
              id="filterPair"
              aria-label="Currency Pair"
              title="Currency Pair"
              value={filters.pair}
              onChange={(e) => edit({ pair: e.target.value })}
            >
              <option value="">All pairs</option>
              {CURRENCY_PAIRS.map((p) => (
                <option key={p.pair} value={p.pair}>
                  {p.pair}
                </option>
              ))}
            </select>
            <select
              className="control filter-select sel-deal"
              id="filterDeal"
              aria-label="Deal Type"
              title="Deal Type"
              value={filters.deal}
              onChange={(e) => edit({ deal: e.target.value as Filters['deal'] })}
            >
              <option value="all">All deals</option>
              <option value="ndf">NDF</option>
              <option value="del">Deliverable Deals</option>
            </select>
            <button type="button" className="btn btn-secondary btn-sm" id="btnResetFilters" onClick={resetFilters}>
              Reset
            </button>
            <span className="tb-sep"></span>
            <span
              className={dropClass}
              id="postDrop"
              title={blockReason ? blockReason : 'Post the MTM document and its reversal'}
              onDragOver={(e) => {
                if (!draggedRef.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setDropOver(true)
              }}
              onDragLeave={() => setDropOver(false)}
              onDrop={onDrop}
            >
              <button
                type="button"
                className="btn btn-primary btn-sm"
                id="btnPost"
                disabled={!!blockReason}
                onClick={() => triggerPost(selectedRow)}
              >
                Post Document
              </button>
            </span>
            <div className="toolbar-spacer"></div>
            <div className="legend" id="legend" style={{ display: hasRows ? 'flex' : 'none' }}>
              <span className="chip">
                <span className="sw ext"></span>Transaction Data – External
              </span>
              <span className="chip">
                <span className="sw mtm"></span>MTM Data
              </span>
            </div>
            <span className="result-count" id="resultCount">
              {executed ? resultCountText(total) : ''}
            </span>
          </div>

          <MtmTable
            cols={cols}
            rows={pageRows}
            sort={sort}
            selectedId={selectedId}
            draggingId={draggingId}
            empty={emptyState(executed, rows.length, total)}
            onSort={(key: ColumnKey) => setSort((s) => nextSort(s, key))}
            onSelect={setSelectedId}
            onOpenTransaction={(row) => setModal({ kind: 'txn', view: transactionView(row) })}
            onOpenDocument={openDocument}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />

          <div className="table-footer" style={{ display: hasRows ? 'flex' : 'none' }}>
            <div className="tf-left">
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
            <div className="pagination" id="pagination">
              <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                ‹
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Page ${p}`}
                  className={p === current ? 'active' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {modal?.kind === 'confirm' && (
        <ConfirmModal run={modal.run} onPost={() => runMassPosting(modal.run)} onCancel={() => setModal(null)} />
      )}
      {modal?.kind === 'log' && <MessageLogModal msgs={modal.msgs} onClose={() => setModal(null)} />}
      {modal?.kind === 'doc' && <DocumentModal view={modal.view} onClose={() => setModal(null)} />}
      {modal?.kind === 'txn' && <TransactionModal view={modal.view} onClose={() => setModal(null)} />}

      <div
        className={`toast${toast.show ? ' show' : ''}${toast.error ? ' error' : ''}`}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {toast.text}
      </div>
    </div>
  )
}
