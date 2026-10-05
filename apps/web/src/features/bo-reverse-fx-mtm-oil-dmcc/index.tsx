import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { Calendar } from './Calendar.tsx'
import { DataTable } from './DataTable.tsx'
import {
  CSV_FILE_NAME,
  INITIAL_DOC_COUNTER,
  INITIAL_KEY_DATE,
  INITIAL_KEY_DATE_TEXT,
  INITIAL_REV_COUNTER,
  PAGE_SIZE,
  seedRows,
} from './data.ts'
import { parseDisplayDate, toDisplay, toIso } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  KEY_DATE_ERROR,
  NO_ROWS_MESSAGE,
  POST_HINT_OFF,
  POST_HINT_ON,
  REFRESHED_MESSAGE,
  applyKeyDate,
  buildCsv,
  buildRows,
  clampPage,
  companyLabel,
  filterRows,
  isEligible,
  nextSort,
  pageSlice,
  pagerWindow,
  partnerLabel,
  recordCountText,
  showingText,
  simulatePosting,
  sortRows,
  totalPages,
  uniqueSorted,
  validKeyDate,
  type CalendarView,
} from './logic.ts'
import { DocumentModal, MessageLogModal, TransactionModal } from './Modals.tsx'
import './bo-reverse-fx-mtm-oil-dmcc.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './bo-reverse-fx-mtm-oil-dmcc.dark.css'
// Hand-written deviation from the generated sheet (the full-height app shell) — see inside.
import './bo-reverse-fx-mtm-oil-dmcc.overrides.css'
import type { DocCounters, DocField, Filters, LogEntry, Row, Sort, SortField } from './types.ts'

const TOAST_MS = 2600

type ModalState =
  | { kind: 'txn'; id: string }
  | { kind: 'doc'; id: string; field: DocField }
  | { kind: 'log'; logs: LogEntry[] }
  | null

type Toast = { text: string; type: 'success' | 'info' } | null

const INITIAL_COUNTERS: DocCounters = { doc: INITIAL_DOC_COUNTER, rev: INITIAL_REV_COUNTER }

/**
 * Reverse FX MTM - OIL & OGA & DMCC (USD) (ZSGTSF_RREV_MTM_OIL / ZSGTSFR019), converted from
 * legacy/bo-reverse-fx-mtm-oil-dmcc.html.
 *
 * UI only: the transactions are demo data in data.ts and "Posting Document" just simulates the
 * MTM and reversal documents locally. No SAP or middleware call is made from this page.
 */
export default function BoReverseFxMtmOilDmcc() {
  const [baseRows, setBaseRows] = useState<Row[]>(() => buildRows(seedRows()))
  const [counters, setCounters] = useState<DocCounters>(INITIAL_COUNTERS)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  /** What is in the Key Date box right now, and the text that was last committed (blur/Enter/pick). */
  const [keyText, setKeyText] = useState(INITIAL_KEY_DATE_TEXT)
  const [committedKey, setCommittedKey] = useState(INITIAL_KEY_DATE_TEXT)
  /** The last valid key date (ISO) that the expiry-month buckets were measured against. */
  const [appliedKey, setAppliedKey] = useState(INITIAL_KEY_DATE)
  const [keyError, setKeyError] = useState(false)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [calendar, setCalendar] = useState<{ view: CalendarView; left: number; top: number } | null>(null)

  const dateFieldRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const rows = useMemo(() => applyKeyDate(baseRows, appliedKey), [baseRows, appliedKey])
  const filtered = useMemo(
    () => sortRows(filterRows(rows, filters, committedKey), sort),
    [rows, filters, committedKey, sort],
  )
  const pages = totalPages(filtered.length, PAGE_SIZE)
  const current = clampPage(page, filtered.length, PAGE_SIZE)
  const visible = pageSlice(filtered, current, PAGE_SIZE)
  const selectedRow = rows.find((r) => r.rfha === selectedId) ?? null
  const canPost = isEligible(selectedRow)
  const keyDateHeader = parseDisplayDate(committedKey)

  const options = useMemo(
    () => ({
      companies: uniqueSorted(baseRows, 'bukrs'),
      transactions: uniqueSorted(baseRows, 'rfha'),
      partners: uniqueSorted(baseRows, 'kontrh'),
      currencies: uniqueSorted(baseRows, 'cpair'),
    }),
    [baseRows],
  )

  const showToast = (text: string, type: 'success' | 'info') => {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ---------------------------------------------------------- global listeners
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal(null)
        setCalendar(null)
      }
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (calendarRef.current?.contains(t) || dateFieldRef.current?.contains(t)) return
      setCalendar(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  // ------------------------------------------------------------------ handlers
  /** Any dropdown/search edit clears the selection and returns to page 1. */
  const edit = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setSelectedId(null)
    setPage(1)
  }

  const commitKeyDate = (text: string) => {
    setCommittedKey(text)
    const d = validKeyDate(text)
    if (!d) {
      setKeyError(true)
      return
    }
    setKeyError(false)
    setAppliedKey(toIso(d))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setKeyText(INITIAL_KEY_DATE_TEXT)
    setCommittedKey(INITIAL_KEY_DATE_TEXT)
    setAppliedKey(INITIAL_KEY_DATE)
    setKeyError(false)
    setSelectedId(null)
    setPage(1)
    setSort(DEFAULT_SORT)
  }

  const refreshAll = () => {
    setBaseRows(buildRows(seedRows()))
    setCounters(INITIAL_COUNTERS)
    resetFilters()
    showToast(REFRESHED_MESSAGE, 'success')
  }

  const toggleCalendar = () => {
    if (calendar) {
      setCalendar(null)
      return
    }
    const d = parseDisplayDate(keyText) ?? new Date()
    const rect = dateFieldRef.current?.getBoundingClientRect()
    const left = rect ? Math.max(8, Math.min(window.innerWidth - 286, rect.left)) : 8
    setCalendar({ view: { year: d.getFullYear(), month: d.getMonth() }, left, top: (rect?.bottom ?? 0) + 4 })
  }

  const pickDate = (d: Date) => {
    const text = toDisplay(d)
    setKeyText(text)
    setCalendar(null)
    commitKeyDate(text)
  }

  const post = (id: string) => {
    const result = simulatePosting(baseRows, id, counters)
    if (!result.logs.length) return
    setBaseRows(result.rows)
    setCounters(result.counters)
    setModal({ kind: 'log', logs: result.logs })
  }
  const postSelected = () => {
    if (selectedId && canPost) post(selectedId)
  }

  const exportCsv = () => {
    const blob = new Blob([buildCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = CSV_FILE_NAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const onSort = (field: SortField) => {
    setSort((s) => nextSort(s, field))
    setPage(1)
  }

  // --------------------------------------------------------------------- drag
  const onDragStart = (id: string, e: DragEvent<HTMLTableRowElement>) => {
    setSelectedId(id)
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      /* some browsers refuse; the drop target reads the selection instead */
    }
  }
  const onDragEnd = () => {
    setDraggingId(null)
    setDropHover(false)
  }

  const modalRow = (id: string) => rows.find((r) => r.rfha === id) ?? null

  return (
    <div className="bo-reverse-fx-mtm-oil-dmcc">
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
                <span className="subtitle">OIL / OGA / DMCC (USD)</span>
              </div>
            </div>
          </div>
          <div className="top-right">
            <span className="status-dot" title="Demo ready"></span>
            <button type="button" className="btn" title="Restore initial data and filters" onClick={refreshAll}>
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
                <span className="card-title">Reverse FX MTM - OIL &amp; OGA &amp; DMCC (USD)</span>
                <span className="record-count">{recordCountText(filtered.length)}</span>
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
                <span className="key-date-text">{keyDateHeader ? `Key Date: ${toDisplay(keyDateHeader)}` : ''}</span>
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
                  onChange={(e) => edit({ search: e.target.value })}
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
                  onChange={(e) => edit({ company: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {options.companies.map((c) => (
                    <option key={c} value={c}>
                      {companyLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" ref={dateFieldRef}>
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
                    style={keyError ? { borderColor: '#D64545' } : undefined}
                    onChange={(e) => setKeyText(e.target.value)}
                    onBlur={() => commitKeyDate(keyText)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitKeyDate(keyText)
                        setCalendar(null)
                      }
                    }}
                  />
                  <button type="button" className="calendar-btn" title="Open calendar" onClick={toggleCalendar}>
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2"></rect>
                      <path d="M8 3v4M16 3v4M3 10h18"></path>
                    </svg>
                  </button>
                </div>
                <div className="inline-error" style={keyError ? { display: 'block' } : undefined}>
                  {KEY_DATE_ERROR}
                </div>
              </div>
              <div className="field">
                <label htmlFor="transactionFilter">Transaction</label>
                <select
                  id="transactionFilter"
                  className="control"
                  value={filters.transaction}
                  onChange={(e) => edit({ transaction: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {options.transactions.map((t) => (
                    <option key={t} value={t}>
                      {t}
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
                  onChange={(e) => edit({ partner: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {options.partners.map((p) => (
                    <option key={p} value={p}>
                      {partnerLabel(baseRows, p)}
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
                  onChange={(e) => edit({ currency: e.target.value })}
                >
                  <option value="ALL">All</option>
                  {options.currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dealFilter">Deal Type</label>
                <select
                  id="dealFilter"
                  className="control"
                  value={filters.deal}
                  onChange={(e) => edit({ deal: e.target.value as Filters['deal'] })}
                >
                  <option value="ALL">All</option>
                  <option value="WITH">With Deal ID</option>
                  <option value="WITHOUT">Without Deal ID</option>
                </select>
              </div>
              <div className="action-block">
                <button type="button" className="btn compact" onClick={resetFilters}>
                  Reset
                </button>
              </div>
              <div className="toolbar-spacer"></div>
              <div className="action-block">
                <button
                  type="button"
                  className={`btn compact primary${draggingId && canPost ? ' drop-ready' : ''}${dropHover ? ' drop-hover' : ''}`}
                  disabled={!canPost}
                  title={canPost ? POST_HINT_ON : POST_HINT_OFF}
                  onClick={postSelected}
                  onDragOver={(e) => {
                    if (!canPost) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropHover(true)
                  }}
                  onDragLeave={() => setDropHover(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropHover(false)
                    if (canPost) postSelected()
                  }}
                >
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v12"></path>
                    <path d="M7 10l5 5 5-5"></path>
                    <rect x="4" y="18" width="16" height="3" rx="1"></rect>
                  </svg>
                  Posting Document
                </button>
                <button
                  type="button"
                  className="btn compact icon-only"
                  title="Download current results"
                  onClick={exportCsv}
                >
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v12"></path>
                    <path d="M7 10l5 5 5-5"></path>
                    <path d="M5 21h14"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div className="table-shell">
              <DataTable
                rows={visible}
                sort={sort}
                selectedId={selectedId}
                draggingId={draggingId}
                onSort={onSort}
                onSelect={(id) => setSelectedId((s) => (s === id ? null : id))}
                onOpenTransaction={(row) => setModal({ kind: 'txn', id: row.rfha })}
                onOpenDocument={(row, field) => setModal({ kind: 'doc', id: row.rfha, field })}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
              <div className="empty" style={{ display: filtered.length ? 'none' : 'block' }}>
                {NO_ROWS_MESSAGE}
              </div>
            </div>
            <div className="footer">
              <span>{showingText(current, PAGE_SIZE, filtered.length)}</span>
              <div className="pager">
                <button type="button" className="page-btn" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  ‹
                </button>
                {pagerWindow(current, pages).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`page-btn${n === current ? ' active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="page-btn"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {calendar && (
        <Calendar
          ref={calendarRef}
          view={calendar.view}
          selected={parseDisplayDate(keyText)}
          today={new Date()}
          left={calendar.left}
          top={calendar.top}
          onView={(view) => setCalendar((c) => (c ? { ...c, view } : c))}
          onPick={pickDate}
        />
      )}

      {modal?.kind === 'txn' && modalRow(modal.id) && (
        <TransactionModal row={modalRow(modal.id) as Row} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'doc' && modalRow(modal.id) && (
        <DocumentModal row={modalRow(modal.id) as Row} field={modal.field} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'log' && <MessageLogModal logs={modal.logs} onClose={() => setModal(null)} />}

      {toast && (
        <div className={`toast ${toast.type}`} style={{ display: 'flex' }}>
          <span className="toast-mark">{toast.type === 'success' ? '✓' : 'i'}</span>
          <span className="toast-text">{toast.text}</span>
        </div>
      )}
    </div>
  )
}
