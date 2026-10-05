import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { DatePopup } from './DatePopup.tsx'
import { DealTable } from './DealTable.tsx'
import {
  AUTHORIZED_COMPANY_CODES,
  COMPANY_CODES,
  DEFAULT_PAGE_SIZE,
  DEMO_TODAY,
  PAGE_SIZES,
  TXN_STATUS_META,
  loadAllDeals,
} from './data.ts'
import { formatDMY, parseDMY } from './format.ts'
import {
  DATE_ERROR,
  DEFAULT_SORT,
  MARK_AT_LEAST_ONE,
  REFRESHED_MESSAGE,
  REJECT_HINT_OFF,
  REJECT_HINT_ON,
  clampPage,
  dealKey,
  dragGhostText,
  emptyText,
  markedItems,
  nextSort,
  pageCount,
  pageSlice,
  pruneMarks,
  rejectDeals,
  rejectNote,
  rejectedToast,
  resultCountText,
  setMarks,
  showingText,
  toggleMark,
  typedDate,
  visibleDeals,
} from './logic.ts'
import { DealModal, RejectModal } from './Modals.tsx'
import { useOverlay } from './modal.tsx'
import logoUrl from './logo.png'
import './bo-deal-rejection.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './bo-deal-rejection.dark.css'
// Hand-written deviation from the generated sheet (the header's action alignment) — see inside.
import './bo-deal-rejection.overrides.css'
import type { CalendarView, Deals, Flags, MarkedItem, SortState, Toast, TxnType } from './types.ts'

const TOAST_MS = 3200

const EMPTY_TOAST: Toast = { text: '', error: false, show: false }

/**
 * BO Deal Rejection and return to FO (ZSGTSFR092), converted from legacy/bo-deal-rejection.html.
 *
 * UI only: the FX / Options deals are demo data in data.ts and "Reject" just moves them to their
 * target status (07 to 08, 13 to 11) locally. No SAP or middleware call is made from this page.
 */
export default function BoDealRejection() {
  const [deals, setDeals] = useState<Deals>(() => loadAllDeals())
  /** Deals rejected in this session; they leave the list until Refresh. */
  const [rejected, setRejected] = useState<Flags>({})
  /** The Remarks typed per deal (BO_REM), by deal key. */
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [type, setType] = useState<TxnType>('FX')
  const [search, setSearch] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  /** What is in the Upto Blotter Date box; the applied date and its validity follow typing. */
  const [dateText, setDateText] = useState(DEMO_TODAY)
  const [uptoDate, setUptoDate] = useState(DEMO_TODAY)
  const [uptoDateValid, setUptoDateValid] = useState(true)
  const [dateError, setDateError] = useState(false)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [rawMarks, setRawMarks] = useState<Flags>({})
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [rejectDragOver, setRejectDragOver] = useState(false)
  const [calendar, setCalendar] = useState<CalendarView | null>(null)
  const [toast, setToast] = useState<Toast>(EMPTY_TOAST)
  /** Snapshots taken when the modals open, so their content survives the closing fade. */
  const [rejectItems, setRejectItems] = useState<MarkedItem[]>([])
  const [rejectNoteText, setRejectNoteText] = useState('')
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const rejectOv = useOverlay()
  const dealOv = useOverlay()
  const rootRef = useRef<HTMLDivElement>(null)
  const dateFieldRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const list = useMemo(
    () => visibleDeals(deals, rejected, remarks, { type, companyCode, uptoDate, uptoDateValid, statusFilter, search, sort }),
    [deals, rejected, remarks, type, companyCode, uptoDate, uptoDateValid, statusFilter, search, sort],
  )
  // A mark on a row that left the result (filter / date / type change) is dropped for good.
  const marks = useMemo(() => pruneMarks(rawMarks, list, type), [rawMarks, list, type])
  useEffect(() => {
    if (marks !== rawMarks) setRawMarks(marks)
  }, [marks, rawMarks])

  const total = list.length
  const pages = pageCount(total, pageSize)
  const current = clampPage(page, total, pageSize)
  const rows = pageSlice(list, current, pageSize)
  const markedCount = markedItems(list, marks, remarks, type).length
  const detailDeal = detailKey ? (deals[type].find((d) => dealKey(type, d) === detailKey) ?? null) : null

  const showToast = (text: string, error: boolean) => {
    setToast({ text, error, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Escape closes whichever modal is open.
  const { hide: hideReject } = rejectOv
  const { hide: hideDeal } = dealOv
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideReject()
        hideDeal()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hideReject, hideDeal])

  // The calendar closes on an outside click or when the page scrolls under it.
  useEffect(() => {
    if (!calendar) return
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !dateFieldRef.current?.contains(e.target)) setCalendar(null)
    }
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.date-popup')) setCalendar(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [calendar])

  // ------------------------------------------------------------------ toolbar
  const changeType = (next: TxnType) => {
    if (next === type) return
    setType(next)
    setRawMarks({})
    setPage(1)
    setSort(DEFAULT_SORT)
  }

  const restoreFilters = () => {
    setSearch('')
    setCompanyCode('')
    setStatusFilter('')
    setUptoDate(DEMO_TODAY)
    setUptoDateValid(true)
    setDateText(DEMO_TODAY)
    setDateError(false)
    setType('FX')
    setSort(DEFAULT_SORT)
    setPage(1)
    setRawMarks({})
  }

  /** Reset: search, filters, date, type, sort, pagination and marks; the data is not reloaded. */
  const resetFilters = () => restoreFilters()

  /** Refresh: reload the demo data and restore the initial screen state (incl. edits and rejections). */
  const refresh = () => {
    rejectOv.hideNow()
    dealOv.hideNow()
    setRejected({})
    setRemarks({})
    setDeals(loadAllDeals())
    restoreFilters()
    setPageSize(DEFAULT_PAGE_SIZE)
    showToast(REFRESHED_MESSAGE, false)
  }

  // --------------------------------------------------------- Upto Blotter Date
  const applyTypedDate = (raw: string, final: boolean) => {
    const t = typedDate(raw, final)
    if (t.kind === 'pending') return
    if (t.kind === 'valid') {
      setUptoDate(t.text)
      setUptoDateValid(true)
      setDateError(false)
    } else {
      setUptoDateValid(false)
      setDateError(true)
    }
    setPage(1)
  }

  const openCalendar = () => {
    const sel = parseDMY(dateText) ?? new Date()
    setCalendar({ year: sel.getFullYear(), month: sel.getMonth() })
  }

  const pickDate = (dt: Date) => {
    const text = formatDMY(dt)
    setDateText(text)
    setCalendar(null)
    applyTypedDate(text, true)
  }

  // ------------------------------------------------------------------- marks
  const onMarkAll = (on: boolean) => {
    setRawMarks(
      setMarks(
        marks,
        rows.map((d) => dealKey(type, d)),
        on,
      ),
    )
  }

  const onDragStart = (key: string, e: DragEvent<HTMLTableRowElement>) => {
    if (!marks[key]) {
      e.preventDefault()
      return
    }
    setDraggingKey(key)
    // The drag image: a small chip naming the deal (or the number of marked deals).
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = dragGhostText(markedCount, key)
    rootRef.current?.appendChild(ghost)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', key)
    } catch {
      /* some browsers refuse; the drop target reads the marks instead */
    }
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }
  const onDragEnd = () => {
    setDraggingKey(null)
    setRejectDragOver(false)
  }

  // ------------------------------------------------------------------ reject
  const onRejectClick = () => {
    const items = markedItems(list, marks, remarks, type)
    if (items.length === 0) {
      showToast(MARK_AT_LEAST_ONE, true)
      return
    }
    setRejectItems(items)
    setRejectNoteText(rejectNote(items.length, type))
    rejectOv.show()
  }

  const confirmReject = () => {
    const items = markedItems(list, marks, remarks, type)
    rejectOv.hide()
    if (items.length === 0) return
    const result = rejectDeals(deals, rejected, type, items)
    setDeals(result.deals)
    setRejected(result.rejected)
    const done = new Set(items.map((it) => it.key))
    setRawMarks(Object.fromEntries(Object.keys(marks).filter((k) => !done.has(k)).map((k) => [k, true as const])))
    setRemarks((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !done.has(k))))
    showToast(rejectedToast(result.results.length), false)
  }

  const openDeal = (key: string) => {
    setDetailKey(key)
    dealOv.show()
  }

  return (
    <div className="bo-deal-rejection" ref={rootRef}>
      <div className="app">
        <div className="page-header">
          <BackButton className="btn btn-secondary" />
          <img className="logo-img" alt="Logo" src={logoUrl} />
          <div className="header-text">
            <h1>BO Deal Rejection</h1>
            <p>Reject FX / Options deals and return them to Front Office for correction</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              id="btnRefresh"
              title="Reload the demo data and restore the initial state"
              onClick={refresh}
            >
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>Deals for Rejection
            </div>

            <div className="info-strip" id="infoStrip">
              <span>
                <b>BO Deal Rejection &amp; return to FO for Correction: FX/OP</b>
              </span>
              <span>
                Upto Blotter Date : <b id="infoDate">{uptoDateValid ? uptoDate : '—'}</b>
              </span>
            </div>

            <div className="table-toolbar">
              <div className="search-box">
                <span className="icon">&#128269;</span>
                <input
                  id="tableSearch"
                  placeholder="Search deals..."
                  autoComplete="off"
                  aria-label="Search deals"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>

              <div className="toolbar-field f-company">
                <label htmlFor="filterCompany">
                  Company Code<span className="req">*</span>
                </label>
                <select
                  className="control filter-select"
                  id="filterCompany"
                  value={companyCode}
                  onChange={(e) => {
                    setCompanyCode(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All authorised</option>
                  {COMPANY_CODES.filter((c) => AUTHORIZED_COMPANY_CODES.includes(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`toolbar-field f-date${dateError ? ' has-error' : ''}`} id="field-uptoDate">
                <label htmlFor="input-uptoDate">
                  Upto Blotter Date<span className="req">*</span>
                </label>
                <div className="date-field" ref={dateFieldRef}>
                  <input
                    className="control"
                    id="input-uptoDate"
                    placeholder="DD-MM-YYYY"
                    autoComplete="off"
                    maxLength={10}
                    value={dateText}
                    onChange={(e) => {
                      setDateText(e.target.value)
                      applyTypedDate(e.target.value, false)
                    }}
                    onBlur={() => {
                      const dt = parseDMY(dateText.trim())
                      if (dt) setDateText(formatDMY(dt))
                      applyTypedDate(dateText, true)
                    }}
                    onClick={() => {
                      if (!calendar) openCalendar()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setCalendar(null)
                    }}
                  />
                  <button
                    type="button"
                    className="date-icon"
                    id="btnUptoDateIcon"
                    aria-label="Pick date"
                    onClick={() => (calendar ? setCalendar(null) : openCalendar())}
                  >
                    &#128197;
                  </button>
                  {calendar && (
                    <DatePopup
                      view={calendar}
                      selected={parseDMY(dateText)}
                      anchorRef={dateFieldRef}
                      onView={setCalendar}
                      onPick={pickDate}
                      onClose={() => setCalendar(null)}
                    />
                  )}
                </div>
                <div className="error-msg" id="err-uptoDate">
                  {DATE_ERROR}
                </div>
              </div>

              <div className="toolbar-field">
                <label id="lblType">Transaction Type</label>
                <div className="seg" role="radiogroup" aria-labelledby="lblType" id="typeSeg">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === 'FX'}
                    className={type === 'FX' ? 'active' : undefined}
                    onClick={() => changeType('FX')}
                  >
                    FX
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === 'OP'}
                    className={type === 'OP' ? 'active' : undefined}
                    onClick={() => changeType('OP')}
                  >
                    Options
                  </button>
                </div>
              </div>

              <div className="toolbar-field f-status">
                <label htmlFor="filterStatus">Txn Status</label>
                <select
                  className="control filter-select"
                  id="filterStatus"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All statuses</option>
                  {Object.entries(TXN_STATUS_META).map(([code, meta]) => (
                    <option key={code} value={code}>
                      {code} - {meta.ext}
                    </option>
                  ))}
                </select>
              </div>

              <button className="btn btn-secondary btn-sm" id="btnResetFilters" style={{ height: 32 }} onClick={resetFilters}>
                Reset
              </button>
              <span className="toolbar-divider"></span>
              <button
                className={`btn btn-danger btn-sm${rejectDragOver ? ' drag-over' : ''}`}
                id="btnReject"
                style={{ height: 32 }}
                disabled={markedCount === 0}
                title={markedCount === 0 ? REJECT_HINT_OFF : REJECT_HINT_ON}
                onClick={onRejectClick}
                onDragOver={(e) => {
                  if (draggingKey === null) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  setRejectDragOver(true)
                }}
                onDragLeave={() => setRejectDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setRejectDragOver(false)
                  if (draggingKey !== null) onRejectClick()
                }}
              >
                Reject
                {markedCount > 0 && (
                  <>
                    {' '}
                    <span className="reject-badge">{markedCount}</span>
                  </>
                )}
              </button>

              <div className="toolbar-spacer"></div>
              <span className="result-count" id="resultCount">
                {resultCountText(total)}
              </span>
            </div>

            <div className="table-scroll">
              <DealTable
                type={type}
                rows={rows}
                hidden={total === 0}
                sort={sort}
                marks={marks}
                remarks={remarks}
                draggingKey={draggingKey}
                onSort={(field) => setSort((s) => nextSort(s, field))}
                onToggleMark={(key) => setRawMarks(toggleMark(marks, key))}
                onMarkAll={onMarkAll}
                onRemark={(key, text) => setRemarks((r) => ({ ...r, [key]: text }))}
                onOpenDeal={openDeal}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </div>
            <div className="empty-state" id="emptyState" style={{ display: total === 0 ? 'block' : 'none' }}>
              <div className="big">&#128196;</div>
              <span id="emptyText">{emptyText(uptoDateValid)}</span>
            </div>

            <div className="table-footer">
              <div className="footer-left">
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
                  {showingText(current, pageSize, total)}
                </span>
              </div>
              <div className="pagination" id="pagination">
                <button disabled={current <= 1} aria-label="Previous page" onClick={() => setPage(current - 1)}>
                  ‹
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={p === current ? 'active' : undefined}
                    aria-label={`Page ${p}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button disabled={current >= pages} aria-label="Next page" onClick={() => setPage(current + 1)}>
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RejectModal overlay={rejectOv} note={rejectNoteText} items={rejectItems} onConfirm={confirmReject} />
      <DealModal overlay={dealOv} type={type} deal={detailDeal} />

      <div className={`toast${toast.show ? ' show' : ''}${toast.error ? ' error' : ''}`} id="toast">
        {toast.text}
      </div>
    </div>
  )
}
