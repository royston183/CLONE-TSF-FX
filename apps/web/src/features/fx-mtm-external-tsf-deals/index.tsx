import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { flushSync } from 'react-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { DEFAULTS, DEFAULT_PAGE_SIZE, LAYOUTS, PAGE_SIZES, PAIRS, TEXTS } from './data.ts'
import { CompanyDropdown } from './CompanyDropdown.tsx'
import { DealTable } from './DealTable.tsx'
import { normalizeDate, ymdToDmy } from './format.ts'
import { KeyDatePicker } from './KeyDatePicker.tsx'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  applySelectionCriteria,
  buildCsv,
  clampPage,
  csvFileName,
  digitsOnly,
  emptyText,
  exportToastText,
  filterSortRows,
  freshScreen,
  getVisibleColumns,
  hasErrors,
  loadAccountingDocument,
  nextSort,
  pageSlice,
  postBlockReason,
  postButtonTitle,
  postDeal,
  postingContextOf,
  recordCountText,
  showingText,
  executeScreen,
  thbColumnActive,
  totalPages,
  validateKeyDate,
  validateParams,
} from './logic.ts'
import { DealModal, DocumentModal, MessageLogModal } from './Modals.tsx'
import { useModal } from './modal.tsx'
import './fx-mtm-external-tsf-deals.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fx-mtm-external-tsf-deals.dark.css'
import type { ColumnKey, Deal, Filters, MsgRow, ParamErrors, PostingType, Sort, Store, Toast } from './types.ts'

const TOAST_MS = 3200
const NO_ERRORS: ParamErrors = { bukrs: '', keyDate: '' }

/**
 * FX MTM - External and TSF Deals - SG00 (ZSGTSF_RMTM_FX_EXT / ZSGTSFR084), converted from
 * legacy/fx-mtm-external-tsf-deals.html.
 *
 * UI only: the deals, market rates and accounting table are the original page's demo data in
 * data.ts, and "Post" just simulates the MTM and reversal documents locally. No SAP or
 * middleware call is made from this page.
 */
export default function FxMtmExternalTsfDeals() {
  const [initial] = useState(freshScreen)
  // Run parameters: bukrs/keyDate/posting/layout are what the boxes show right now; `executed`
  // is what the list was last run with.
  const [bukrs, setBukrs] = useState<string>(DEFAULTS.bukrs)
  const [keyDate, setKeyDate] = useState<string>(DEFAULTS.keyDate)
  const [posting, setPosting] = useState<PostingType>(DEFAULTS.posting)
  const [layout, setLayout] = useState<string>(DEFAULTS.layout)
  const [errors, setErrors] = useState<ParamErrors>(NO_ERRORS)
  const [executed, setExecuted] = useState(initial.executed)
  const [dataset, setDataset] = useState<Deal[]>(initial.dataset)
  const [store, setStore] = useState<Store>(initial.store)
  const [msgLog, setMsgLog] = useState<MsgRow[]>(initial.msgLog)
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [ghostText, setGhostText] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [docNo, setDocNo] = useState('')
  const [dealId, setDealId] = useState('')
  const logModal = useModal()
  const docModal = useModal()
  const dealModal = useModal()

  const dragged = useRef<Deal | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ------------------------------------------------------------------ derived view

  const cols = useMemo(() => getVisibleColumns(layout, thbColumnActive(executed, filters)), [layout, executed, filters])
  const scope = useMemo(() => applySelectionCriteria(dataset, filters, executed.bukrs), [dataset, filters, executed.bukrs])
  const list = useMemo(() => filterSortRows(scope, cols, search, sort), [scope, cols, search, sort])
  const pages = totalPages(list.length, pageSize)
  const current = clampPage(page, list.length, pageSize)
  const pageRows = pageSlice(list, current, pageSize)
  // A selected row that has been filtered out is no longer selected.
  const selected = selectedId && list.some((r) => r.rfha === selectedId) ? selectedId : null
  const selectedRow = selected ? (dataset.find((r) => r.rfha === selected) ?? null) : null
  const blockReason = postBlockReason(selectedRow)

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  const showToast = (message: string, error = false) => {
    setToast({ message, error })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Escape closes the topmost open popup: document, then transaction, then the Message Log.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const top = [docModal, dealModal, logModal].find((m) => m.state !== 'closed')
      top?.close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [docModal, dealModal, logModal])

  // ------------------------------------------------------------------ handlers

  /** Any search or filter edit returns to page 1. */
  const editFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const commitKeyDate = () => {
    const text = normalizeDate(keyDate)
    setKeyDate(text)
    setErrors((e) => ({ ...e, keyDate: validateKeyDate(text) }))
  }
  const pickKeyDate = (text: string) => {
    setKeyDate(text)
    setErrors((e) => ({ ...e, keyDate: validateKeyDate(text) }))
  }

  const execute = () => {
    const errs = validateParams(bukrs, keyDate)
    setErrors(errs)
    if (hasErrors(errs)) return
    const res = executeScreen({ bukrs, keyDate, posting }, executed, filters, store)
    setExecuted(res.executed)
    setDataset(res.dataset)
    setFilters(res.filters)
    setStore(res.store)
    setMsgLog(res.msgLog)
    setPage(1)
    setSelectedId(null)
    if (res.msgLog.length) logModal.open()
  }

  /** Reset: search, filters, sort, pagination and selection only; no data reload. */
  const resetFilters = () => {
    setSearch('')
    setFilters(DEFAULT_FILTERS)
    setSort(DEFAULT_SORT)
    setPage(1)
    setSelectedId(null)
  }

  /** Refresh: back to the initial screen, the demo book and its posting history re-seeded. */
  const refresh = () => {
    logModal.hide()
    docModal.hide()
    dealModal.hide()
    const fresh = freshScreen()
    setExecuted(fresh.executed)
    setDataset(fresh.dataset)
    setStore(fresh.store)
    setMsgLog(fresh.msgLog)
    setFilters(fresh.filters)
    setBukrs(DEFAULTS.bukrs)
    setKeyDate(DEFAULTS.keyDate)
    setPosting(DEFAULTS.posting)
    setLayout(DEFAULTS.layout)
    setErrors(NO_ERRORS)
    setSearch('')
    setSort(DEFAULT_SORT)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setSelectedId(null)
  }

  const openDeal = (rfha: string) => {
    if (!dataset.some((r) => r.rfha === rfha)) return
    setDealId(rfha)
    dealModal.open()
  }
  const openDocument = (no: string) => {
    if (!loadAccountingDocument(store, no)) {
      showToast(`Document ${no} could not be found.`, true)
      return
    }
    setDocNo(no)
    docModal.open()
  }

  /** POST function code: the same handler for the button click and for a row dropped on the button. */
  const postSelected = (row: Deal | null) => {
    const reason = postBlockReason(row)
    if (reason || !row) {
      showToast(reason, true)
      return
    }
    const res = postDeal(row, postingContextOf(executed), store)
    setStore(res.store)
    setDataset((rows) => rows.map((r) => (r.rfha === res.row.rfha ? res.row : r)))
    setMsgLog(res.msgs)
    logModal.open()
  }

  const exportCsv = () => {
    const name = csvFileName(executed)
    const blob = new Blob([buildCsv(cols, list)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }, 0)
    showToast(exportToastText(list.length, name))
  }

  const onSort = (field: ColumnKey) => setSort((s) => nextSort(s, field))

  // ------------------------------------------------------------------ drag a selected row onto Post

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, row: Deal) => {
    dragged.current = row
    // The ghost lives inside the scope root so the scoped .drag-ghost style reaches it; its
    // text must be in the DOM before setDragImage snapshots it.
    flushSync(() => setGhostText(`${row.rfha} — ${row.cpair}`))
    setDraggingId(row.rfha)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', row.rfha)
    } catch {
      /* some browsers refuse; the drop reads the dragged row instead */
    }
    if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 12, 14)
  }
  const onDragEnd = () => {
    dragged.current = null
    setDraggingId(null)
    setDragOver(false)
  }

  const modalRow = (id: string) => dataset.find((r) => r.rfha === id) ?? null
  const postClass = ['btn', 'btn-primary', 'btn-sm', draggingId ? 'drop-ready' : '', dragOver ? 'drag-over' : ''].filter(Boolean).join(' ')

  return (
    <div className="fx-mtm-external-tsf-deals">
      <div className="app">
        {/* ============ Page header (Refresh sits top-right) ============ */}
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>FX MTM - External and TSF Deals</h1>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" title="Restore the screen to its initial state" onClick={refresh}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>
              <span>{TEXTS.title}</span>
              <span className="key-chip">
                {executed.bukrs} &middot; Key Date <b>{ymdToDmy(executed.keyYmd)}</b>
              </span>
              <span className="title-spacer"></span>
              <span className="legend" aria-label="Colour coding">
                <span>
                  <span className="sw sw-ext"></span>Transaction Data - External
                </span>
                <span>
                  <span className="sw sw-mtm"></span>MTM Data
                </span>
              </span>
            </div>

            {/* ============ Run parameters: need an explicit Execute (valuation + optional FI posting) ============ */}
            <div className="run-bar">
              <div className={`field w-company${errors.bukrs ? ' has-error' : ''}`}>
                <label htmlFor="input-bukrs">
                  Company Code<span className="req">*</span>
                </label>
                <CompanyDropdown
                  value={bukrs}
                  onSelect={(code) => {
                    setBukrs(code)
                    setErrors((e) => ({ ...e, bukrs: '' }))
                  }}
                  onClear={() => setBukrs('')}
                />
                <div className="error-msg">{errors.bukrs}</div>
              </div>

              <div className={`field w-date${errors.keyDate ? ' has-error' : ''}`}>
                <label htmlFor="input-keyDate">
                  Key Date<span className="req">*</span>
                </label>
                <KeyDatePicker value={keyDate} onInput={setKeyDate} onCommit={commitKeyDate} onPick={pickKeyDate} />
                <div className="error-msg">{errors.keyDate}</div>
                <div className="hint">Key Date is the Month End Date</div>
              </div>

              <div className="field">
                <label id="lbl-posting">Posting Type</label>
                <div className="seg" role="radiogroup" aria-labelledby="lbl-posting">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={posting === 'post'}
                    className={posting === 'post' ? 'active' : undefined}
                    onClick={() => setPosting('post')}
                  >
                    View With FI Posting
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={posting === 'view'}
                    className={posting === 'view' ? 'active' : undefined}
                    onClick={() => setPosting('view')}
                  >
                    View Only
                  </button>
                </div>
              </div>

              <div className="field w-layout">
                <label htmlFor="selLayout">Layout</label>
                <select id="selLayout" className="control" value={layout} onChange={(e) => setLayout(e.target.value)}>
                  {LAYOUTS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.text}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>&nbsp;</label>
                <button className="btn btn-primary btn-md" type="button" onClick={execute}>
                  {posting === 'post' ? 'Execute & Post' : 'Execute'}
                </button>
              </div>
            </div>

            {/* ============ Search -> live filters -> Reset -> actions ============ */}
            <div className="table-toolbar">
              <div className="search-box">
                <span className="icon">&#128269;</span>
                <input
                  placeholder="Search deals, counterparties, documents..."
                  aria-label="Search deals"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <div className="range" title="Deal No range">
                <input
                  className="control"
                  placeholder="Deal No from"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="Deal No from"
                  value={filters.dealFrom}
                  onChange={(e) => editFilters({ dealFrom: digitsOnly(e.target.value) })}
                />
                <span className="range-sep">&ndash;</span>
                <input
                  className="control"
                  placeholder="to"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="Deal No to"
                  value={filters.dealTo}
                  onChange={(e) => editFilters({ dealTo: digitsOnly(e.target.value) })}
                />
              </div>
              <div className="range" title="Counterparty range">
                <input
                  className="control w-wide"
                  placeholder="Counterparty from"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="Counterparty from"
                  value={filters.bpFrom}
                  onChange={(e) => editFilters({ bpFrom: digitsOnly(e.target.value) })}
                />
                <span className="range-sep">&ndash;</span>
                <input
                  className="control"
                  placeholder="to"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="Counterparty to"
                  value={filters.bpTo}
                  onChange={(e) => editFilters({ bpTo: digitsOnly(e.target.value) })}
                />
              </div>
              <select
                className="control filter-select"
                title="Currency Pair"
                aria-label="Currency Pair"
                value={filters.pair}
                onChange={(e) => editFilters({ pair: e.target.value })}
              >
                <option value="">All pairs</option>
                {PAIRS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
              <select
                className="control filter-select"
                title="Deal Type"
                aria-label="Deal Type"
                value={filters.dealType}
                onChange={(e) => editFilters({ dealType: e.target.value as Filters['dealType'] })}
              >
                <option value="all">All deal types</option>
                <option value="ndf">NDF</option>
                <option value="deliverable">Deliverable Deals</option>
              </select>
              <select
                className="control filter-select"
                title="Source (DE2 / DE6)"
                aria-label="Source"
                style={executed.th10 ? undefined : { display: 'none' }}
                value={filters.source}
                onChange={(e) => editFilters({ source: e.target.value })}
              >
                <option value="DE2">Source DE2</option>
                <option value="DE6">Source DE6</option>
              </select>
              <button className="btn btn-secondary btn-sm" type="button" onClick={resetFilters}>
                Reset
              </button>
              <div className="toolbar-spacer"></div>
              <button
                className={postClass}
                type="button"
                aria-disabled={blockReason ? 'true' : 'false'}
                title={postButtonTitle(selectedRow)}
                onClick={() => {
                  if (blockReason) return
                  postSelected(selectedRow)
                }}
                onDragOver={(e) => {
                  if (!dragged.current) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (dragged.current) postSelected(dragged.current)
                }}
              >
                Post
              </button>
              <button className="btn btn-secondary btn-sm" type="button" title="Export the filtered list as CSV" onClick={exportCsv}>
                Export
              </button>
              <span className="result-count">{recordCountText(list.length)}</span>
            </div>

            <div className="table-scroll">
              <DealTable
                cols={cols}
                rows={pageRows}
                sort={sort}
                selectedId={selected}
                draggingId={draggingId}
                hidden={list.length === 0}
                onSort={onSort}
                onSelect={setSelectedId}
                onOpenDeal={openDeal}
                onOpenDoc={openDocument}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </div>
            <div className="empty-state" style={{ display: list.length === 0 ? 'block' : 'none' }}>
              <div className="big">&#128196;</div>
              <span>{emptyText(dataset.length)}</span>
            </div>

            <div className="table-footer">
              <div className="footer-left">
                <div className="page-size-select">
                  Rows per page
                  <select
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
                <span className="showing">{showingText(current, pageSize, list.length)}</span>
              </div>
              <div className="pagination">
                <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                  &#8249;
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={`Page ${p}`}
                    aria-current={p === current ? 'page' : undefined}
                    className={p === current ? 'active' : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                  &#8250;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MessageLogModal
        modal={logModal}
        executed={executed}
        rows={msgLog}
        dataset={dataset}
        onOpenDoc={openDocument}
        onClose={logModal.close}
      />
      <DocumentModal modal={docModal} doc={loadAccountingDocument(store, docNo)} onClose={docModal.close} />
      <DealModal modal={dealModal} row={modalRow(dealId)} keyYmd={executed.keyYmd} onClose={dealModal.close} />

      <div className={`toast${toast ? ' show' : ''}${toast?.error ? ' error' : ''}`} role="status" aria-live="polite">
        {toast?.message}
      </div>

      <div ref={ghostRef} className="drag-ghost">
        {ghostText}
      </div>
    </div>
  )
}

