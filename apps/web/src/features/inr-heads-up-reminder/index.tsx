import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import {
  CO_AREAS,
  CSV_FILE_NAME,
  DEFAULT_PAGE_SIZE,
  EMPTY_TEXT,
  ENTITIES,
  LAYOUTS,
  MAIL_SUCCESS_TEXT,
  PAGE_SIZES,
  REGIONS,
  STATUSES,
  TOAST_MS,
} from './data.ts'
import { DateField } from './DateField.tsx'
import { DealDropdown } from './DealDropdown.tsx'
import { DealTable } from './DealTable.tsx'
import { isoToDMY } from './format.ts'
import {
  DEFAULT_SORT,
  buildCsv,
  buildMailPlan,
  buildMockTables,
  fetchDeals,
  filterSortRows,
  getMasterContract,
  initialFilters,
  nextSort,
  pageCountOf,
  pruneSelection,
  resultCountLabel,
  sendHeadsUpMails,
  sendMailState,
  sortForLayout,
  visibleColumns,
} from './logic.ts'
import { InvoiceModal, MailModal, McModal } from './Modals.tsx'
import { useModal } from './modal.tsx'
import './inr-heads-up-reminder.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './inr-heads-up-reminder.dark.css'
import type { ColumnKey, Filters, Sort } from './types.ts'

/**
 * MO: INR Head-Ups Reminder (SAP program ZSGTSF_RDEAL_ID_SETT, tcode ZSGTSFR061), converted
 * from legacy/inr-heads-up-reminder.html.
 *
 * UI only: the screen runs on the dummy Master Contracts, Deal IDs and legs in data.ts and
 * calls no SAP, middleware or API. Send Mail only plans the mails and shows the "Email Sent"
 * toast; nothing is sent.
 */
export default function InrHeadsUpReminder() {
  const [tables, setTables] = useState(buildMockTables)

  // The SAP "selection" and the table view state
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const filtersRef = useRef(filters)
  const [search, setSearch] = useState('')
  const [keyDateText, setKeyDateText] = useState('')
  const [keyDateError, setKeyDateError] = useState(false)
  const [layout, setLayout] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Bumped by Reset so the Deal ID dropdown drops any text typed without a pick. */
  const [resetSeq, setResetSeq] = useState(0)

  // Popups and what the two detail popups show
  const mcModal = useModal()
  const invoiceModal = useModal()
  const mailModal = useModal()
  const [mcRef, setMcRef] = useState('')
  const [invoiceDealId, setInvoiceDealId] = useState('')

  // Toast
  const [toast, setToast] = useState({ message: '', error: false, show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // The SAP selection re-run on every filter change.
  const { rows, error } = useMemo(() => fetchDeals(tables, filters), [tables, filters])
  const cols = useMemo(() => visibleColumns(layout), [layout])
  const list = useMemo(() => filterSortRows(rows, layout, search, sort), [rows, layout, search, sort])
  const plan = useMemo(() => buildMailPlan(rows), [rows])

  const total = list.length
  const pageCount = pageCountOf(total, pageSize)
  const currentPage = Math.min(page, pageCount)
  const pageRows = list.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const mail = sendMailState(error, plan)

  // Escape closes every popup.
  const { close: closeMc } = mcModal
  const { close: closeInvoice } = invoiceModal
  const { close: closeMail } = mailModal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeMc()
      closeInvoice()
      closeMail()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeMc, closeInvoice, closeMail])

  /** reloadData(): a new selection goes back to page 1 and keeps the selected row only if still listed. */
  const commitFilters = (patch: Partial<Filters>) => {
    const next = { ...filtersRef.current, ...patch }
    filtersRef.current = next
    setFilters(next)
    setPage(1)
    setSelectedId((cur) => pruneSelection(cur, fetchDeals(tables, next).rows))
  }

  const resetScreen = () => {
    const fresh = initialFilters()
    filtersRef.current = fresh
    setSearch('')
    setFilters(fresh)
    setLayout('')
    setSort(DEFAULT_SORT)
    setPage(1)
    setSelectedId(null)
    setKeyDateText('')
    setKeyDateError(false)
    setResetSeq((n) => n + 1)
  }

  /** Refresh: reload the screen from its data source and return to the initial state. */
  const refresh = () => {
    mcModal.hide()
    invoiceModal.hide()
    mailModal.hide()
    setTables(buildMockTables())
    resetScreen()
  }

  const changeLayout = (value: string) => {
    setLayout(value)
    setSort((s) => sortForLayout(s, value))
    setPage(1)
  }

  const openMc = (ref: string) => {
    if (!getMasterContract(tables, ref)) return
    setMcRef(ref)
    mcModal.open()
  }
  const openInvoice = (dealId: string) => {
    if (!rows.some((r) => r.dealId === dealId)) return
    setInvoiceDealId(dealId)
    invoiceModal.open()
  }

  const openMailConfirm = () => {
    if (error || !plan.deals.length) return
    mailModal.open()
  }
  const confirmSendMail = () => {
    const res = sendHeadsUpMails(rows)
    mailModal.close()
    if (res.texts.includes(MAIL_SUCCESS_TEXT)) showToast('Email Sent')
  }

  const exportCsv = () => {
    const blob = new Blob([buildCsv(cols, list)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = CSV_FILE_NAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const onSort = (key: ColumnKey) => setSort((s) => nextSort(s, key))

  return (
    <div className="inr-heads-up-reminder">
      <div className="app">
        {/* ============ Page header ============ */}
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>MO: INR Head-Ups Reminder</h1>
            <p>View deals due for heads-up and send reminder mails</p>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" id="btnRefresh" title="Reload the screen to its initial state" onClick={refresh}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>Heads-Up Deals
              <span className="key-date-info">
                Key Date :<b id="keyDateInfo">{filters.keyDate ? isoToDMY(filters.keyDate) : '—'}</b>
              </span>
            </div>

            {/* ============ Toolbar: Search > Filters > Reset > Actions ============ */}
            <div className="table-toolbar" id="toolbar">
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

              <DateField
                text={keyDateText}
                error={keyDateError}
                onText={setKeyDateText}
                onError={setKeyDateError}
                onCommit={(iso) => commitFilters({ keyDate: iso })}
              />

              <select
                className="control filter-select"
                id="filterRegion"
                title="Region"
                aria-label="Region"
                value={filters.region}
                onChange={(e) => commitFilters({ region: e.target.value })}
              >
                <option value="">All regions</option>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} - {r.name}
                  </option>
                ))}
              </select>
              <select
                className="control filter-select"
                id="filterEntity"
                title="Origin Entity"
                aria-label="Origin Entity"
                value={filters.entity}
                onChange={(e) => commitFilters({ entity: e.target.value })}
              >
                <option value="">All entities</option>
                {ENTITIES.map((en) => (
                  <option key={en.code} value={en.code}>
                    {en.code} - {en.name}
                  </option>
                ))}
              </select>

              <DealDropdown key={resetSeq} deals={tables.deals} value={filters.dealId} onChange={(id) => commitFilters({ dealId: id })} />

              <select
                className="control filter-select"
                id="filterStatus"
                title="Status"
                aria-label="Status"
                value={filters.status}
                onChange={(e) => commitFilters({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.sdesc}
                  </option>
                ))}
              </select>
              <select
                className="control filter-select"
                id="filterCoArea"
                title="CO Area"
                aria-label="CO Area"
                value={filters.coArea}
                onChange={(e) => commitFilters({ coArea: e.target.value })}
              >
                <option value="">Select CO Area</option>
                {CO_AREAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="control filter-select"
                id="filterLayout"
                title="Layout"
                aria-label="Layout"
                value={layout}
                onChange={(e) => changeLayout(e.target.value)}
              >
                {LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>

              <button type="button" className="btn btn-secondary btn-sm" id="btnReset" title="Clear search, filters and sorting" onClick={resetScreen}>
                Reset
              </button>

              <span className="toolbar-divider"></span>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                id="btnSendMail"
                disabled={mail.disabled}
                title={mail.title}
                onClick={openMailConfirm}
              >
                Send Mail
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                id="btnExport"
                title="Export the listed deals to a CSV file"
                disabled={total === 0}
                onClick={exportCsv}
              >
                Export
              </button>
            </div>

            <div className={`alert-banner${error ? ' show' : ''}`} id="authBanner" role="alert">
              <span>&#9888;</span>
              <span id="authBannerText">{error ?? ''}</span>
            </div>

            <DealTable
              rows={pageRows}
              cols={cols}
              sort={sort}
              selectedId={selectedId}
              hidden={total === 0}
              onSort={onSort}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              onOpenMc={openMc}
              onOpenInvoice={openInvoice}
            />
            <div className="empty-state" id="emptyState" style={{ display: total === 0 && !error ? 'block' : 'none' }}>
              <div className="big">&#128196;</div>
              <span id="emptyText">{EMPTY_TEXT}</span>
            </div>

            <div className="table-footer">
              <div className="legend" id="legend">
                <span className="legend-title">Notes: Colour Coding</span>
                <span>
                  <span className="sw sw-blue"></span>Master Contract = Blue
                </span>
                <span>
                  <span className="sw sw-green"></span>Deal ID = Green
                </span>
                <span>
                  <span className="sw sw-orange"></span>Invoice = Orange
                </span>
              </div>
              <div className="footer-right">
                <span className="result-count" id="resultCount">
                  {resultCountLabel(total, currentPage, pageSize)}
                </span>
                <div className="page-size-select">
                  Rows per page
                  <select
                    id="pageSizeSelect"
                    aria-label="Rows per page"
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
                <div className="pagination" id="pagination">
                  <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    {'‹'}
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-label={`Page ${p}`}
                      className={p === currentPage ? 'active' : undefined}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                    {'›'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <McModal modal={mcModal} mc={getMasterContract(tables, mcRef)} />
      <InvoiceModal modal={invoiceModal} row={rows.find((r) => r.dealId === invoiceDealId) ?? null} />
      <MailModal modal={mailModal} dealCount={rows.length} plan={plan} onConfirm={confirmSendMail} />

      <div className={`toast${toast.show ? ' show' : ''}${toast.error ? ' error' : ''}`} id="toast">
        {toast.message}
      </div>
    </div>
  )
}
