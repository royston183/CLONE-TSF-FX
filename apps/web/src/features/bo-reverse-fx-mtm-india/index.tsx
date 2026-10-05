import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CalendarPopup } from './CalendarPopup.tsx'
import { DataTable } from './DataTable.tsx'
import {
  COMPANY_NAMES,
  DEAL_TYPE_OPTIONS,
  DEFAULT_KEY_DATE_TEXT,
  INITIAL_COUNTERS,
  INITIAL_KEY_DATE,
  PAGE_SIZE,
  TOAST_MS,
  seedRows,
} from './data.ts'
import { parseDisplayDate, toDisplay, toIso } from './format.ts'
import {
  CSV_FILENAME,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  POST_DISABLED_TITLE,
  POST_ENABLED_TITLE,
  REFRESH_MESSAGE,
  buildCsv,
  clampPage,
  companyOptions,
  filterRows,
  isEligible,
  nextSort,
  pageCount,
  pageSlice,
  pagerWindow,
  partnerOptions,
  plainOptions,
  showingText,
  simulatePosting,
  validKeyDate,
  withMonat,
} from './logic.ts'
import { ModalHost } from './Modals.tsx'
import type { ColumnField, Counters, DocField, Filters, ModalState, Row, Sort, ToastKind, ToastState } from './types.ts'
import './bo-reverse-fx-mtm-india.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './bo-reverse-fx-mtm-india.dark.css'
// Hand-written deviation from the generated sheet (the app-shell height) — see inside.
import './bo-reverse-fx-mtm-india.overrides.css'

type DateState = 'idle' | 'ok' | 'bad'

/**
 * Reverse FX MTM - India (ZSGTSF_RREV_MTM_INDIA / ZSGTSFR021), converted from
 * legacy/bo-reverse-fx-mtm-india.html.
 *
 * UI only: the transactions are the demo data in data.ts, Posting Document only changes local
 * state. No SAP or middleware call is made from this page.
 */
export default function BoReverseFxMtmIndia() {
  const [rows, setRows] = useState<Row[]>(seedRows)
  const [counters, setCounters] = useState<Counters>(INITIAL_COUNTERS)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [keyText, setKeyText] = useState(DEFAULT_KEY_DATE_TEXT)
  // The key date the table is filtered by; follows keyText when it is applied (blur, Enter, pick).
  const [appliedKey, setAppliedKey] = useState(DEFAULT_KEY_DATE_TEXT)
  // The last valid key date, which the expiry-month bucket is measured from.
  const [monatKey, setMonatKey] = useState(INITIAL_KEY_DATE)
  const [dateState, setDateState] = useState<DateState>('idle')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropReady, setDropReady] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  const [cal, setCal] = useState({ open: false, left: 0, top: 0, year: 2026, month: 8 })

  const [toast, setToast] = useState<ToastState>({ text: '', kind: 'info', show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = (text: string, kind: ToastKind) => {
    clearTimeout(toastTimer.current)
    setToast({ text, kind, show: true })
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const dateFieldRef = useRef<HTMLDivElement>(null)

  // ------------------------------------------------------------ derived
  const view = useMemo(() => withMonat(rows, monatKey), [rows, monatKey])
  const filtered = useMemo(() => filterRows(view, filters, appliedKey, sort), [view, filters, appliedKey, sort])
  const pages = pageCount(filtered.length, PAGE_SIZE)
  const current = clampPage(page, filtered.length, PAGE_SIZE)
  const slice = pageSlice(filtered, current, PAGE_SIZE)
  const companies = useMemo(() => companyOptions(rows, COMPANY_NAMES), [rows])
  const transactions = useMemo(() => plainOptions(rows, 'rfha'), [rows])
  const partners = useMemo(() => partnerOptions(rows), [rows])
  const currencies = useMemo(() => plainOptions(rows, 'cpair'), [rows])
  const selectedRow = view.find((r) => r.rfha === selectedId) ?? null
  const eligible = isEligible(selectedRow)
  const headerKey = parseDisplayDate(appliedKey)

  // ---------------------------------------------------- global listeners
  const closeCalendar = () => setCal((c) => ({ ...c, open: false }))
  const closeRef = useRef(() => {})
  closeRef.current = () => {
    setModal(null)
    closeCalendar()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t?.closest('#dateField, #calendarPop')) setCal((c) => (c.open ? { ...c, open: false } : c))
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  // ----------------------------------------------------------- handlers
  /** Any toolbar edit: back to page 1, selection cleared, key date applied as typed. */
  const editFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setAppliedKey(keyText)
    setSelectedId(null)
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setKeyText(DEFAULT_KEY_DATE_TEXT)
    setAppliedKey(DEFAULT_KEY_DATE_TEXT)
    setMonatKey(INITIAL_KEY_DATE)
    setDateState('idle')
    setSelectedId(null)
    setPage(1)
    setSort(DEFAULT_SORT)
  }

  const refreshAll = () => {
    setRows(seedRows())
    setCounters(INITIAL_COUNTERS)
    resetFilters()
    showToast(REFRESH_MESSAGE, 'success')
  }

  /** The original's validateAndApplyDate(): month-end dates only; either way the table re-renders. */
  const applyKeyDate = (text: string) => {
    const d = validKeyDate(text)
    setAppliedKey(text)
    if (!d) {
      setDateState('bad')
      return
    }
    setDateState('ok')
    setMonatKey(toIso(d))
    setPage(1)
  }

  const toggleCalendar = () => {
    if (cal.open) {
      closeCalendar()
      return
    }
    const d = parseDisplayDate(keyText) ?? new Date()
    const rect = dateFieldRef.current?.getBoundingClientRect()
    setCal({
      open: true,
      year: d.getFullYear(),
      month: d.getMonth(),
      left: rect ? Math.max(8, Math.min(window.innerWidth - 286, rect.left)) : 8,
      top: rect ? rect.bottom + 4 : 0,
    })
  }

  const shiftCalendar = (delta: number) =>
    setCal((c) => {
      let month = c.month + delta
      let year = c.year
      if (month < 0) {
        month = 11
        year--
      }
      if (month > 11) {
        month = 0
        year++
      }
      return { ...c, month, year }
    })

  const onSort = (field: ColumnField) => {
    setSort((s) => nextSort(s, field))
    setPage(1)
  }

  const postSelected = () => {
    if (!selectedRow || !isEligible(selectedRow)) return
    const result = simulatePosting(selectedRow, counters)
    setRows((all) => all.map((r) => (r.rfha === result.row.rfha ? { ...r, ...docFields(result.row) } : r)))
    setCounters(result.counters)
    setModal({ kind: 'log', logs: result.logs })
  }

  const exportCsv = () => {
    const blob = new Blob([buildCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = CSV_FILENAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  // ------------------------------------------------ drag the row onto Posting Document
  const onDragStart = (e: DragEvent<HTMLTableRowElement>, rfha: string) => {
    setSelectedId(rfha)
    setDraggingId(rfha)
    setDropReady(isEligible(view.find((r) => r.rfha === rfha)))
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', rfha)
    } catch {
      // some browsers refuse; the drop does not need the payload
    }
  }
  const onDragEnd = () => {
    setDraggingId(null)
    setDropReady(false)
    setDropHover(false)
  }

  const openDocument = (rfha: string, field: DocField) => setModal({ kind: 'doc', rfha, field })

  return (
    <div className="bo-reverse-fx-mtm-india">
      <div className="app">
        <header className="topbar">
          <div className="top-left">
            <BackButton className="btn" />
            <div className="brand">
              <svg className="logo" viewBox="0 0 28 36" aria-hidden="true">
                <rect x="5" y="2" width="19" height="7" rx="3.5" fill="#D93636"></rect>
                <rect x="5" y="11" width="13" height="7" rx="3.5" fill="#F3B51B"></rect>
                <rect x="5" y="20" width="10" height="7" rx="3.5" fill="#2E9B59"></rect>
                <circle cx="8.5" cy="31" r="3.5" fill="#7C8A90"></circle>
              </svg>
              <div className="title-wrap">
                <span className="page-title">Reverse FX MTM</span>
                <span className="subtitle">India / INR</span>
              </div>
            </div>
          </div>
          <div className="top-right">
            <span className="status-dot" title="Demo ready"></span>
            <button className="btn" type="button" title="Restore initial data and filters" onClick={refreshAll}>
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0 2 5"></path>
                <path d="M20 4v7h-7"></path>
              </svg>
              Refresh
            </button>
            <SignOutButton className="btn" />
          </div>
        </header>

        <main className="main">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="card-title">Reverse MTM-TSF India</span>
                <span className="record-count" id="recordCount">
                  {filtered.length} records
                </span>
              </div>
              <div className="head-meta">
                <div className="legend" title="Source note: Grey = Transaction Data - External; Blue = MTM Data">
                  <span className="legend-item">
                    <span className="legend-swatch legend-ext"></span>Transaction Data - External
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch legend-mtm"></span>MTM Data
                  </span>
                </div>
                <span className="key-date-text" id="keyDateHeader">
                  {headerKey ? `Key Date: ${toDisplay(headerKey)}` : ''}
                </span>
              </div>
            </div>

            <div className="toolbar">
              <div className="field search-field">
                <label htmlFor="searchInput">Search</label>
                <input
                  id="searchInput"
                  className="control"
                  type="text"
                  placeholder="Search transactions..."
                  value={filters.search}
                  onChange={(e) => editFilters({ search: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="companyFilter">
                  Company Code<span className="required">*</span>
                </label>
                <select
                  id="companyFilter"
                  className="control"
                  value={filters.company}
                  onChange={(e) => editFilters({ company: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {companies.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" id="dateField" ref={dateFieldRef}>
                <label htmlFor="keyDateInput">
                  Key Date<span className="required">*</span>{' '}
                  <span title="Key Date is the Month End Date" style={{ cursor: 'help', color: '#0874D1' }}>
                    ⓘ
                  </span>
                </label>
                <div className="date-wrap">
                  <input
                    id="keyDateInput"
                    className="control"
                    type="text"
                    maxLength={10}
                    value={keyText}
                    style={dateState === 'idle' ? undefined : { borderColor: dateState === 'bad' ? '#D64545' : '#B8C6D3' }}
                    onChange={(e) => setKeyText(e.target.value)}
                    onBlur={() => applyKeyDate(keyText)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyKeyDate(keyText)
                        closeCalendar()
                      }
                    }}
                  />
                  <button className="calendar-btn" type="button" title="Open calendar" onClick={toggleCalendar}>
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2"></rect>
                      <path d="M8 3v4M16 3v4M3 10h18"></path>
                    </svg>
                  </button>
                </div>
                <div className="inline-error" id="dateError" style={{ display: dateState === 'bad' ? 'block' : 'none' }}>
                  Key Date should be Month End Date only.
                </div>
              </div>
              <div className="field">
                <label htmlFor="transactionFilter">Transaction</label>
                <select
                  id="transactionFilter"
                  className="control"
                  value={filters.transaction}
                  onChange={(e) => editFilters({ transaction: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {transactions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="partnerFilter">Business Partner</label>
                <select
                  id="partnerFilter"
                  className="control"
                  value={filters.partner}
                  onChange={(e) => editFilters({ partner: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {partners.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="currencyFilter">Currency Pair</label>
                <select
                  id="currencyFilter"
                  className="control"
                  value={filters.currency}
                  onChange={(e) => editFilters({ currency: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {currencies.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dealFilter">Deal Type</label>
                <select
                  id="dealFilter"
                  className="control"
                  value={filters.dealType}
                  onChange={(e) => editFilters({ dealType: e.target.value as Filters['dealType'] })}
                >
                  {DEAL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="action-block">
                <button className="btn compact" type="button" onClick={resetFilters}>
                  Reset
                </button>
              </div>
              <div className="toolbar-spacer"></div>
              <div className="action-block">
                <button
                  className={`btn compact primary${dropReady ? ' drop-ready' : ''}${dropHover ? ' drop-hover' : ''}`}
                  id="postSelectedBtn"
                  type="button"
                  disabled={!eligible}
                  title={eligible ? POST_ENABLED_TITLE : POST_DISABLED_TITLE}
                  onClick={postSelected}
                  onDragOver={(e) => {
                    if (!eligible) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropHover(true)
                  }}
                  onDragLeave={() => setDropHover(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropHover(false)
                    if (eligible) postSelected()
                  }}
                >
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v12"></path>
                    <path d="M7 10l5 5 5-5"></path>
                    <rect x="4" y="18" width="16" height="3" rx="1"></rect>
                  </svg>
                  Posting Document
                </button>
                <button className="btn compact icon-only" type="button" title="Download current results" onClick={exportCsv}>
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v12"></path>
                    <path d="M7 10l5 5 5-5"></path>
                    <path d="M5 21h14"></path>
                  </svg>
                </button>
              </div>
            </div>

            <DataTable
              rows={slice.rows}
              hasRows={filtered.length > 0}
              sort={sort}
              selectedId={selectedId}
              draggingId={draggingId}
              onSort={onSort}
              onSelect={(rfha) => setSelectedId((cur) => (cur === rfha ? null : rfha))}
              onOpenTransaction={(rfha) => setModal({ kind: 'txn', rfha })}
              onOpenDocument={openDocument}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
            <div className="footer">
              <span id="showingText">{showingText(filtered.length, slice.start, slice.end)}</span>
              <div className="pager" id="pager">
                <button className="page-btn" type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  ‹
                </button>
                {pagerWindow(current, pages).map((n) => (
                  <button
                    key={n}
                    className={`page-btn${n === current ? ' active' : ''}`}
                    type="button"
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button className="page-btn" type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>
                  ›
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <CalendarPopup
        open={cal.open}
        left={cal.left}
        top={cal.top}
        year={cal.year}
        month={cal.month}
        selected={parseDisplayDate(keyText)}
        onShift={shiftCalendar}
        onMonth={(month) => setCal((c) => ({ ...c, month }))}
        onYear={(year) => setCal((c) => ({ ...c, year }))}
        onPick={(date) => {
          const text = toDisplay(date)
          setKeyText(text)
          closeCalendar()
          applyKeyDate(text)
        }}
      />

      <ModalHost modal={modal} rows={view} onClose={() => setModal(null)} />

      <div className={`toast ${toast.kind}`} id="toast" style={{ display: toast.show ? 'flex' : 'none' }}>
        <span className="toast-mark">{toast.kind === 'success' ? '✓' : 'i'}</span>
        <span className="toast-text">{toast.text}</span>
      </div>
    </div>
  )
}

/** Only the posting fields change when a transaction is posted. */
function docFields(r: Row): Pick<Row, 'mtmDoc' | 'revDoc' | 'mtmDoc2' | 'revDoc2' | 'msg'> {
  return { mtmDoc: r.mtmDoc, revDoc: r.revDoc, mtmDoc2: r.mtmDoc2, revDoc2: r.revDoc2, msg: r.msg }
}
