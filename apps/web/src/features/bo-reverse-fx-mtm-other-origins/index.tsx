import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CalendarPopup } from './DatePicker.tsx'
import {
  COMPANY_NAMES,
  CSV_FILE_NAME,
  INITIAL_COUNTERS,
  INITIAL_KEY_TEXT,
  INITIAL_ROWS,
  PAGE_SIZE,
} from './data.ts'
import { parseDisplayDate, toDisplay, toIso } from './format.ts'
import {
  DEFAULT_SORT,
  buildCsv,
  clampPage,
  defaultFilters,
  deriveRows,
  filterOptions,
  filterRows,
  isEligible,
  nextSort,
  pageCount,
  pageSlice,
  pagerWindow,
  postButtonTitle,
  showingText,
  simulatePosting,
  sortRows,
  validKeyDate,
  withKeyDate,
} from './logic.ts'
import { DocumentModal, MessageLogModal, TransactionModal } from './Modals.tsx'
import { MtmTable } from './MtmTable.tsx'
import './bo-reverse-fx-mtm-other-origins.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './bo-reverse-fx-mtm-other-origins.dark.css'
import './bo-reverse-fx-mtm-other-origins.overrides.css'
import type { CalendarView, Counters, DocField, Filters, LogEntry, RowField, Sort } from './types.ts'

const TOAST_MS = 2600

type ModalState =
  | { kind: 'tx'; id: string }
  | { kind: 'doc'; id: string; field: DocField }
  | { kind: 'log'; logs: LogEntry[] }
  | null

type Toast = { text: string; type: 'success' | 'info' } | null

function downloadCsv(text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = CSV_FILE_NAME
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Reverse FX MTM - Other Origins (ZSGTSF_RREV_MTM_OTHERS / ZSGTSFR020), converted from
 * legacy/bo-reverse-fx-mtm-other-origins.html.
 *
 * UI only: the transactions are the demo rows in data.ts, and posting just stamps local document
 * numbers. No SAP or middleware call is made from this page.
 */
export default function BoReverseFxMtmOtherOrigins() {
  const [rows, setRows] = useState(() => deriveRows(INITIAL_ROWS))
  const [counters, setCounters] = useState<Counters>(INITIAL_COUNTERS)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  // The Key Date as typed, and the text the table was last filtered with.
  const [keyText, setKeyText] = useState(INITIAL_KEY_TEXT)
  const [keyApplied, setKeyApplied] = useState(INITIAL_KEY_TEXT)
  const [keyError, setKeyError] = useState(false)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [calView, setCalView] = useState<CalendarView>({ y: 2026, m: 8 })
  const [calPos, setCalPos] = useState({ left: 0, top: 0 })

  const fieldRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = (text: string, type: 'success' | 'info') => {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  // ------------------------------------------------------------ derived
  const options = useMemo(() => filterOptions(deriveRows(INITIAL_ROWS), COMPANY_NAMES), [])
  const keyDate = validKeyDate(keyApplied)
  const filtered = useMemo(
    () => sortRows(filterRows(rows, filters, validKeyDate(keyApplied)), sort),
    [rows, filters, keyApplied, sort],
  )
  const pages = pageCount(filtered.length, PAGE_SIZE)
  const current = clampPage(page, filtered.length, PAGE_SIZE)
  const visible = pageSlice(filtered, current, PAGE_SIZE)
  const selectedRow = rows.find((r) => r.rfha === selectedId) ?? null
  const eligible = isEligible(selectedRow)
  const shownKey = parseDisplayDate(keyApplied)
  const modalRow = modal && modal.kind !== 'log' ? (rows.find((r) => r.rfha === modal.id) ?? null) : null

  // ---------------------------------------------------- global listeners
  const dismissRef = useRef(() => {})
  dismissRef.current = () => {
    setModal(null)
    setCalOpen(false)
  }
  const calOpenRef = useRef(false)
  calOpenRef.current = calOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current()
    }
    const onClick = (e: MouseEvent) => {
      if (!calOpenRef.current) return
      const t = e.target as Node | null
      if (t && (popRef.current?.contains(t) || fieldRef.current?.contains(t))) return
      setCalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
      clearTimeout(toastTimer.current)
    }
  }, [])

  // ----------------------------------------------------------- handlers
  /** Any filter edit clears the selection and returns to page 1, and re-reads the typed Key Date. */
  const edit = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setKeyApplied(keyText)
    setSelectedId(null)
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(defaultFilters())
    setKeyText(INITIAL_KEY_TEXT)
    setKeyApplied(INITIAL_KEY_TEXT)
    setKeyError(false)
    setSelectedId(null)
    setPage(1)
    setSort(DEFAULT_SORT)
  }

  const refresh = () => {
    setRows(deriveRows(INITIAL_ROWS))
    setCounters(INITIAL_COUNTERS)
    resetFilters()
    showToast('Initial workbench data restored.', 'success')
  }

  /** Validates the Key Date text; a month end re-buckets the expiry months, anything else flags the field. */
  const commitKeyDate = (text: string): boolean => {
    setKeyApplied(text)
    const d = validKeyDate(text)
    if (!d) {
      setKeyError(true)
      return false
    }
    setKeyError(false)
    setRows((rs) => withKeyDate(rs, toIso(d)))
    setPage(1)
    return true
  }

  const toggleCalendar = () => {
    if (calOpen) {
      setCalOpen(false)
      return
    }
    const d = parseDisplayDate(keyText) ?? new Date()
    setCalView({ y: d.getFullYear(), m: d.getMonth() })
    const rect = fieldRef.current?.getBoundingClientRect()
    if (rect) setCalPos({ left: Math.max(8, Math.min(window.innerWidth - 286, rect.left)), top: rect.bottom + 4 })
    setCalOpen(true)
  }

  const onSort = (field: RowField) => {
    setSort((s) => nextSort(s, field))
    setPage(1)
  }

  const selectRow = (id: string) => setSelectedId((s) => (s === id ? null : id))

  const postSelected = () => {
    if (!isEligible(selectedRow)) return
    const result = simulatePosting(selectedRow, counters)
    setRows((rs) => rs.map((r) => (r.rfha === result.row.rfha ? result.row : r)))
    setCounters(result.counters)
    setModal({ kind: 'log', logs: result.logs })
  }

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, id: string) => {
    setSelectedId(id)
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      /* some browsers refuse custom data on drag start */
    }
  }

  const onDragEnd = () => {
    setDraggingId(null)
    setDropHover(false)
  }

  const exportCsv = () => downloadCsv(buildCsv(filtered))

  const sel = (id: string, label: string, value: string, opts: { value: string; label: string }[], key: keyof Filters) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="control" value={value} onChange={(e) => edit({ [key]: e.target.value })}>
        <option value="ALL">All</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="bo-reverse-fx-mtm-other-origins">
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
                <span className="subtitle">Other Origins</span>
              </div>
            </div>
          </div>
          <div className="top-right">
            <span className="status-dot" title="Demo ready"></span>
            <button type="button" className="btn" title="Restore initial data and filters" onClick={refresh}>
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
                <span className="card-title">Reverse FX MTM - Other Origins</span>
                <span className="record-count">{filtered.length} records</span>
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
                <span className="key-date-text">{shownKey ? `Key Date: ${toDisplay(shownKey)}` : ''}</span>
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
                  {options.companies.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" ref={fieldRef}>
                <label htmlFor="keyDateInput">
                  Key Date<span className="required">*</span>{' '}
                  <span title="Key Date is the Month End Date" style={{ cursor: 'help', color: '#0874D1' }}>
                    &#9432;
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
                        setCalOpen(false)
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
                  Key Date should be Month End Date only.
                </div>
              </div>
              {sel('transactionFilter', 'Transaction', filters.transaction, options.transactions, 'transaction')}
              {sel('partnerFilter', 'Business Partner', filters.partner, options.partners, 'partner')}
              {sel('currencyFilter', 'Currency Pair', filters.currency, options.currencies, 'currency')}
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
                  className={`btn compact primary${draggingId && eligible ? ' drop-ready' : ''}${dropHover ? ' drop-hover' : ''}`}
                  disabled={!eligible}
                  title={postButtonTitle(selectedRow)}
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

            <MtmTable
              rows={visible}
              total={filtered.length}
              selectedId={selectedId}
              draggingId={draggingId}
              sort={sort}
              onSort={onSort}
              onSelect={selectRow}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onOpenTransaction={(r) => setModal({ kind: 'tx', id: r.rfha })}
              onOpenDocument={(r, field) => setModal({ kind: 'doc', id: r.rfha, field })}
            />

            <div className="footer">
              <span>{showingText(current, PAGE_SIZE, filtered.length)}</span>
              <div className="pager">
                <button type="button" className="page-btn" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  &lsaquo;
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
                  &rsaquo;
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <CalendarPopup
        popRef={popRef}
        open={calOpen}
        left={calPos.left}
        top={calPos.top}
        view={calView}
        selected={parseDisplayDate(keyText)}
        today={new Date()}
        onView={setCalView}
        onPick={(d) => {
          const text = toDisplay(d)
          setKeyText(text)
          setCalOpen(false)
          commitKeyDate(text)
        }}
      />

      {modal?.kind === 'tx' && modalRow && <TransactionModal row={modalRow} onClose={() => setModal(null)} />}
      {modal?.kind === 'doc' && modalRow && (
        <DocumentModal row={modalRow} field={modal.field} onClose={() => setModal(null)} />
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
