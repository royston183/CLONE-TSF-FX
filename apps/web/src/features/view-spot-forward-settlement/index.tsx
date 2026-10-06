import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { ACTION_WAITING, loadCompanies, loadWorklistReason, type Option } from './api.ts'
import { DatePicker } from './DatePicker.tsx'
import { DealTable } from './DealTable.tsx'
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO, NAMES } from './data.ts'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  PAGE_SIZES,
  REFRESHED_MESSAGE,
  actionState,
  clampPage,
  computeKpis,
  dealCountLabel,
  defaultFilters,
  filterDeals,
  nextSort,
  pageRange,
  pageSlice,
  pageWindow,
  readyMessage,
  selectedDeals,
  setPageSelected,
  sortDeals,
  toggleKpi,
  toggleSelected,
  totalPages,
} from './logic.ts'
import { ActionModal, DealModal, FiDocModal, LetterModal } from './Modals.tsx'
import './view-spot-forward-settlement.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './view-spot-forward-settlement.dark.css'
import type { ActionKind, Deal, Filters, FiDocWhich, IsdKind, KpiKey, Sort, SortKey, Status } from './types.ts'

const TOAST_MS = 3600

const KPI_CARDS: { key: KpiKey; cls: string; label: string; help: string; pick: (k: ReturnType<typeof computeKpis>) => number }[] = [
  { key: null, cls: '', label: 'Total Deals Due', help: 'Every deal due in the selected value date range', pick: (k) => k.total },
  { key: 'PENDING', cls: 'k-pending', label: 'Pending Settlement', help: 'Due, not yet overdue or settled', pick: (k) => k.PENDING },
  { key: 'OVERDUE', cls: 'k-overdue', label: 'Overdue', help: 'Value date has passed without settlement', pick: (k) => k.OVERDUE },
  { key: 'SETTLED', cls: 'k-settled', label: 'Settled', help: 'FX deal and trade invoices posted', pick: (k) => k.SETTLED },
  { key: 'ERRCORR', cls: 'k-errcorr', label: 'Error Correction', help: 'Sent back for correction', pick: (k) => k.ERRCORR },
]

type DatePick = 'from' | 'to'

/**
 * View Spot-Forward Deals Settlement (ZSGTSFR062 / ZSGTSF_RBANKSETTLE_FX), converted from
 * legacy/view-spot-forward-settlement.html.
 *
 * Company codes are T001; the ZSGTSFV_FX worklist and every action wait for an API (api.ts).
 * No sample data: an empty list says why.
 */
export default function ViewSpotForwardSettlement() {
  // ZSGTSFV_FX worklist: WAITING FOR API (api.ts), so no deal is ever listed — never seed data.
  const [deals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<Option[]>([])
  const [worklistReason, setWorklistReason] = useState('Loading from SAP…')
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(DEFAULT_DATE_FROM, DEFAULT_DATE_TO))
  const [kpi, setKpi] = useState<KpiKey>(null)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [openDp, setOpenDp] = useState<DatePick | null>(null)
  const [isdOpen, setIsdOpen] = useState(false)

  // Modals keep their last content while the fade-out plays, so "open" is separate from "what".
  const [dealModal, setDealModal] = useState<{ rfha: string | null; open: boolean }>({ rfha: null, open: false })
  const [fiModal, setFiModal] = useState<{ rfha: string | null; which: FiDocWhich; open: boolean }>({
    rfha: null,
    which: 'doc1',
    open: false,
  })
  const [letterOpen, setLetterOpen] = useState(false)
  const [letterRfha, setLetterRfha] = useState<string | null>(null)
  const [action, setAction] = useState<{ kind: ActionKind; open: boolean }>({ kind: 'test', open: false })

  const [toast, setToast] = useState<{ message: string; kind: string; show: boolean }>({
    message: '',
    kind: '',
    show: false,
  })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = (message: string, kind = '') => {
    setToast({ message, kind, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }

  // ------------------------------------------------------------ derived
  const filtered = useMemo(() => sortDeals(filterDeals(deals, filters, kpi, NAMES), sort), [deals, filters, kpi, sort])
  const pages = totalPages(filtered.length, pageSize)
  const current = clampPage(page, filtered.length, pageSize)
  const rows = pageSlice(filtered, current, pageSize)
  const kpis = useMemo(() => computeKpis(deals), [deals])
  const chosen = selectedDeals(deals, selected)
  const buttons = actionState(chosen.length)
  const range = pageRange(current, pageSize, filtered.length)
  const emptyText = deals.length ? 'No deals match the current filters.' : worklistReason
  const dealByRfha = (rfha: string | null) => deals.find((d) => d.rfha === rfha) ?? null

  // ---------------------------------------------------- global listeners
  const closeEverything = () => {
    setDealModal((m) => ({ ...m, open: false }))
    setFiModal((m) => ({ ...m, open: false }))
    setLetterOpen(false)
    setAction((a) => ({ ...a, open: false }))
    setOpenDp(null)
    setIsdOpen(false)
  }
  const closeRef = useRef(closeEverything)
  closeRef.current = closeEverything

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t?.closest('.dp')) setOpenDp(null)
      if (!t?.closest('.menu-wrap')) setIsdOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  /** T001 (names filled in place into NAMES.company) and the worklist reason. */
  const load = useCallback(async (signal?: AbortSignal) => {
    const [comp, reason] = await Promise.all([loadCompanies(signal), loadWorklistReason(signal)])
    const list = comp.state === 'ok' ? comp.value : []
    for (const k of Object.keys(NAMES.company)) delete NAMES.company[k]
    for (const c of list) NAMES.company[c.value] = c.title
    setCompanies(list)
    const why = comp.state === 'ok' ? reason : `${reason} ${comp.reason}`
    setWorklistReason(why)
    return why
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    load(ctl.signal)
      .then((why) => showToast(deals.length ? readyMessage(filtered.length) : why))
      .catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name !== 'AbortError') console.warn('[bank-settle-fx] load failed', e)
      })
    return () => {
      ctl.abort()
      clearTimeout(toastTimer.current)
    }
    // Once, on first render, as the original's init() did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----------------------------------------------------------- handlers
  /** Any filter edit returns to page 1, as the original's applyFilters() did. */
  const edit = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(defaultFilters(DEFAULT_DATE_FROM, DEFAULT_DATE_TO))
    setKpi(null)
    setPage(1)
  }

  const onKpi = (key: KpiKey) => {
    const next = toggleKpi(kpi, key)
    setKpi(next.kpi)
    setFilters((f) => ({ ...f, status: next.select }))
    setPage(1)
  }

  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key))

  const refresh = () => {
    setSelected(new Set())
    resetFilters()
    load()
      .then((why) => showToast(deals.length ? REFRESHED_MESSAGE : why))
      .catch(() => showToast('Refresh failed — SAP could not be read.', 'error'))
  }

  const runIsd = (kind: IsdKind) => {
    setIsdOpen(false)
    const d = chosen[0]
    // Adobe Forms via FP_* have no API: nothing is printed or generated.
    if (d) showToast(kind === 'print' ? ACTION_WAITING.isdPrint : ACTION_WAITING.isdPdf, 'error')
  }

  const openLetter = () => {
    const d = chosen[0]
    if (!d) return
    setLetterRfha(d.rfha)
    setLetterOpen(true)
  }

  const openAction = (kind: ActionKind) => {
    if (!chosen.length) return
    setAction({ kind, open: true })
  }

  const confirmAction = () => {
    setAction((a) => ({ ...a, open: false }))
    // RFTBBB00 / TBB1 has no API: no document is created and no deal changes.
    showToast(action.kind === 'test' ? ACTION_WAITING.test : ACTION_WAITING.post, 'error')
  }

  const statusOptions: { value: Status | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'All statuses' },
    { value: 'PENDING', label: 'Pending Settlement' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'SETTLED', label: 'Settled' },
    { value: 'ERRCORR', label: 'Error Correction' },
  ]

  return (
    <div className="view-spot-forward-settlement">
      <div className="page-head">
        <BackButton className="common-btn" />
        <img className="head-badge" src={FX_LOGO} alt="Company logo" />
        <div className="title-wrap">
          <div className="page-title">View Spot-Forward Deals Settlement</div>
          <div className="page-subtitle">
            FX deals due for settlement on a value date (or date range) &middot; actual settlement happens when the FX
            Deal and its Trade Invoices settle together
          </div>
        </div>
        <div className="head-actions">
          <span className="tcode-pill">ZSGTSFR062</span>
          <button type="button" className="btn-icon" title="Refresh (REF)" onClick={refresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <SignOutButton className="common-btn" />
        </div>
      </div>

      <main>
        <div className="notes">
          <strong>Notes:</strong> 1. This report only provides the list of FX deals due for settlement on a date (or date
          range). &nbsp; 2. Actual settlement happens for the Deal ID &mdash; where the FX Deal and its Trade Invoices
          settle together on the same day.
        </div>

        <div className="metrics-grid">
          {KPI_CARDS.map((c) => (
            <div
              key={c.label}
              className={`metric-card${c.cls ? ` ${c.cls}` : ''}${kpi === c.key ? ' active' : ''}`}
              onClick={() => onKpi(c.key)}
            >
              <div className="metric-inner">
                <div className="metric-val">{c.pick(kpis)}</div>
                <div className="metric-lbl">{c.label}</div>
                <div className="metric-help">{c.help}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet"></span>
              <h2>Spot &amp; Forward Deals Due for Settlement</h2>
            </div>
            <span className="badge-count">{dealCountLabel(filtered.length)}</span>
          </div>

          <div className="toolbar">
            <div className="toolbar-row">
              <div className="search-box">
                <span className="icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search deal ID, MC, transaction, partner..."
                  value={filters.search}
                  onChange={(e) => edit({ search: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="f-bukrs">Company Code</label>
                <select id="f-bukrs" value={filters.bukrs} onChange={(e) => edit({ bukrs: e.target.value })}>
                  <option value="ALL">All companies</option>
                  {companies.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Value Date</label>
                <div className="date-range">
                  <DatePicker
                    label="Value date from"
                    value={filters.dateFrom}
                    initialView={{ y: 2026, m: 8 }}
                    open={openDp === 'from'}
                    onToggle={() => setOpenDp((o) => (o === 'from' ? null : 'from'))}
                    onPick={(dmy) => {
                      setOpenDp(null)
                      edit({ dateFrom: dmy })
                    }}
                  />
                  <span>to</span>
                  <DatePicker
                    label="Value date to"
                    value={filters.dateTo}
                    initialView={{ y: 2026, m: 9 }}
                    open={openDp === 'to'}
                    onToggle={() => setOpenDp((o) => (o === 'to' ? null : 'to'))}
                    onPick={(dmy) => {
                      setOpenDp(null)
                      edit({ dateTo: dmy })
                    }}
                  />
                </div>
              </div>
              <div className="filter-field">
                <label htmlFor="f-status">Status</label>
                <select
                  id="f-status"
                  value={filters.status}
                  onChange={(e) => edit({ status: e.target.value as Filters['status'] })}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label htmlFor="f-product">Product</label>
                <select
                  id="f-product"
                  value={filters.product}
                  onChange={(e) => edit({ product: e.target.value as Filters['product'] })}
                >
                  <option value="ALL">Spot &amp; Forward</option>
                  <option value="Spot">Spot</option>
                  <option value="Forward">Forward</option>
                </select>
              </div>
              <button type="button" className="filter-reset" onClick={resetFilters}>
                Reset
              </button>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="common-btn"
                  disabled={!buttons.preview}
                  title="Preview the bank settlement letter for the selected deal (PRINT)"
                  onClick={openLetter}
                >
                  Preview Document
                </button>
                <div className="menu-wrap">
                  <button
                    type="button"
                    className="common-btn"
                    disabled={!buttons.isd}
                    title="India Settlement Documents (&IND_ST_DC)"
                    onClick={() => setIsdOpen((o) => !o)}
                  >
                    India Settlement Documents &#9662;
                  </button>
                  <div className={isdOpen ? 'menu-list open' : 'menu-list'}>
                    <button type="button" className="menu-item" onClick={() => runIsd('print')}>
                      Print (&amp;PRT_ISD)
                    </button>
                    <button type="button" className="menu-item" onClick={() => runIsd('pdf')}>
                      PDF (PDF1)
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="common-btn"
                  disabled={!buttons.test}
                  title="Simulate posting without creating documents (TEST)"
                  onClick={() => openAction('test')}
                >
                  Test Run
                </button>
                <button
                  type="button"
                  className="common-btn warn"
                  disabled={!buttons.post}
                  title="Submit real settlement postings via RFTBBB00 (TBB1)"
                  onClick={() => openAction('post')}
                >
                  Post (TBB1)
                </button>
                <span className="selected-count">{buttons.label}</span>
              </div>
            </div>
          </div>

          <DealTable
            rows={rows}
            emptyText={emptyText}
            selected={selected}
            sort={sort}
            onSort={onSort}
            onToggleRow={(rfha) => setSelected((s) => toggleSelected(s, rfha))}
            onToggleAll={(on) => setSelected((s) => setPageSelected(s, rows, on))}
            onOpenDeal={(rfha) => setDealModal({ rfha, open: true })}
            onOpenFiDoc={(rfha, which) => setFiModal({ rfha, which, open: true })}
          />

          <div className="pager">
            <div className="pager-size">
              <span>Rows per page</span>
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
            <div className="pager-controls">
              <button type="button" className="pager-btn" disabled={current <= 1} onClick={() => setPage(1)}>
                &laquo;
              </button>
              <button type="button" className="pager-btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                &lsaquo;
              </button>
              {pageWindow(current, pages).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === current ? 'pager-btn active' : 'pager-btn'}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="pager-btn"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                &rsaquo;
              </button>
              <button type="button" className="pager-btn" disabled={current >= pages} onClick={() => setPage(pages)}>
                &raquo;
              </button>
            </div>
            <div className="pager-info">
              Showing{' '}
              <strong>
                {range.from}&ndash;{range.to}
              </strong>{' '}
              of <strong>{filtered.length}</strong>
            </div>
          </div>
        </div>
      </main>

      <DealModal
        open={dealModal.open}
        deal={dealByRfha(dealModal.rfha)}
        onClose={() => setDealModal((m) => ({ ...m, open: false }))}
      />
      <FiDocModal
        open={fiModal.open}
        deal={dealByRfha(fiModal.rfha)}
        which={fiModal.which}
        onClose={() => setFiModal((m) => ({ ...m, open: false }))}
      />
      <LetterModal
        open={letterOpen}
        deal={dealByRfha(letterRfha)}
        onClose={() => setLetterOpen(false)}
        onPrint={() => window.print()}
        onDownload={() => showToast(ACTION_WAITING.letterPdf, 'error')}
      />
      <ActionModal
        open={action.open}
        kind={action.kind}
        deals={chosen}
        onClose={() => setAction((a) => ({ ...a, open: false }))}
        onConfirm={confirmAction}
      />

      <div className={toast.show ? `zfac-toast show${toast.kind ? ` ${toast.kind}` : ''}` : 'zfac-toast'}>
        {toast.message}
      </div>
    </div>
  )
}
