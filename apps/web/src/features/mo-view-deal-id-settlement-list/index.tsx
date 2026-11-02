import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import { loadRegions, regionLabel, type RegionOption } from '../../shared/fx/regions.ts'
import { INVOICES_WAITING, LIST_WAITING, MASTER_WAITING, loadSettlementList } from './api.ts'
import { DEFAULT_PAGE_SIZE, LAYOUTS, PAGE_SIZES } from './data.ts'
import { DateBox } from './DateRangeField.tsx'
import { DealTable } from './DealTable.tsx'
import { DealModal, InvoiceModal, McModal } from './DetailModals.tsx'
import { fmtCompactUsd, parseDate } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  computeKpis,
  keyDateNote,
  layoutMessage,
  loadedMessage,
  mcFilterMessage,
  nextKpiFilter,
  pageRows,
  pageWindow,
  pagerRange,
  resultCountLabel,
  shiftMonth,
  toggleSort,
  totalPages,
  visibleDeals,
} from './logic.ts'
import { useModalTarget } from './modal.tsx'
import './mo-view-deal-id-settlement-list.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; imported after it.
import './mo-view-deal-id-settlement-list.dark.css'
import './mo-view-deal-id-settlement-list.overrides.css'
import type { Deal, Filters, KpiFilter, MasterContract, Sort, SortKey } from './types.ts'

const TOAST_MS = 3400
const KPI_CARDS: { key: KpiFilter; cls: string; lbl: string; help: string; value: 'total' | 'pending' | 'settled' }[] = [
  { key: 'ALL', cls: 'k-total', value: 'total', lbl: 'Total Deal IDs', help: 'Every Deal ID matching the current filters' },
  { key: 'OPEN', cls: 'k-pending', value: 'pending', lbl: 'Awaiting Settlement', help: 'Booked, confirmed, BL-attached or invoiced - not yet ready' },
  { key: 'DONE', cls: 'k-inuse', value: 'settled', lbl: 'Ready / Settled', help: 'Status 21 (Ready for Settlement) or 22 (Settled)' },
]

type DateField = 'from' | 'to'

/**
 * MO: View List of Deal IDs for Settlement (ZSGTSFR106), converted from
 * legacy/mo-view-deal-id-settlement-list.html.
 *
 * NO SOURCE: the list program behind ZSGTSFR106 is in no export and no dependency note (its
 * drill-down ZSGTSF_RDEAL_TRD_INV is known only from its note). The selection of Deal IDs for
 * settlement and the Status / Region / Origin Entity / CO Area value lists cannot be reproduced,
 * so they show WAITING FOR API (api.ts). No sample data at runtime (fixtures.ts is for tests).
 */
export default function MoViewDealIdSettlementList() {
  const list = useMemo(() => loadSettlementList(), [])
  const deals: readonly Deal[] = list.deals
  const masterContracts: readonly MasterContract[] = list.masterContracts

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)
  const [kpisHidden, setKpisHidden] = useState(false)

  // Date pickers: one popup open at a time, sharing the month on show.
  const [openDp, setOpenDp] = useState<DateField | null>(null)
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const dealModal = useModalTarget()
  const mcModal = useModalTarget()
  const invModal = useModalTarget()

  const filtered = useMemo(() => visibleDeals(deals, filters, sort), [deals, filters, sort])
  const kpis = useMemo(() => computeKpis(filtered), [filtered])
  const pages = totalPages(filtered.length, pageSize)
  const shown = pageRows(filtered, page, pageSize)
  const range = pagerRange(filtered.length, page, pageSize)
  const note = keyDateNote(filters.dateFrom, filters.dateTo)

  // Toast
  // The "list not available / waiting" reason is an outcome -> standard ResultDialog (stays until OK).
  // Filter / layout / refresh hints are cosmetic chatter and stay a small self-dismissing toast.
  const [outcomes, setOutcomes] = useState<ResultItem[]>(() =>
    list.reason ? [{ id: 1, tone: 'warning', title: 'Warning', message: list.reason }] : [],
  )
  const resultSeq = useRef(1)
  const showReason = useCallback((message: string) => {
    const id = ++resultSeq.current
    setOutcomes((r) => [...r, { id, tone: 'warning', title: 'Warning', message }])
  }, [])
  const [toast, setToast] = useState({ message: '', show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string) => {
    setToast({ message, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Region list: the SAP region codes (shared/fx/regions.ts), independent of the waiting worklist.
  const [regions, setRegions] = useState<RegionOption[] | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    loadRegions(ctl.signal).then(setRegions, (error: unknown) => {
      if (!isAbort(error)) setRegions([])
    })
    return () => ctl.abort()
  }, [])

  // Any filter change goes back to page 1, as the original's applyFilters did.
  const patchFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }, [])

  const closeAllModals = useCallback(() => {
    dealModal.close()
    mcModal.close()
    invModal.close()
    setOpenDp(null)
  }, [dealModal, mcModal, invModal])

  // Escape closes every popup; a click outside a date box closes its calendar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllModals()
    }
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('.dp')) setOpenDp(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [closeAllModals])

  const toggleDatePicker = (field: DateField) => {
    if (openDp === field) {
      setOpenDp(null)
      return
    }
    const cur = field === 'from' ? filters.dateFrom : filters.dateTo
    if (cur) {
      const d = parseDate(cur)
      setView({ year: d.getFullYear(), month: d.getMonth() })
    }
    setOpenDp(field)
  }
  const pickDate = (field: DateField, value: string) => {
    patchFilters(field === 'from' ? { dateFrom: value } : { dateTo: value })
    setOpenDp(null)
  }

  const onSort = (key: SortKey) => setSort((s) => toggleSort(s, key))

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
    showToast('Filters reset.')
  }
  const refresh = () => {
    setPage(1)
    if (deals.length) showToast(loadedMessage(filtered.length, 'Refreshed'))
    else showReason(list.reason)
  }
  const changeLayout = (value: string) => {
    setFilters((f) => ({ ...f, layout: value }))
    const label = LAYOUTS.find((l) => l.value === value)?.label ?? value
    showToast(layoutMessage(label))
  }
  const filterByMc = (mcRef: string) => {
    patchFilters({ contextMc: mcRef })
    showToast(mcFilterMessage(mcRef))
  }

  const openDeal = (id: string) => dealModal.open(id)
  const openMc = (ref: string) => mcModal.open(ref)
  const openInvoices = (id: string) => invModal.open(id)

  const modalDeal = deals.find((d) => d.dealId === dealModal.id)
  const modalMc = masterContracts.find((m) => m.mcRef === mcModal.id)
  const invDeal = deals.find((d) => d.dealId === invModal.id)

  return (
    <div className="mo-view-deal-id-settlement-list">
      <div className="page-head">
        <BackButton className="btn-outline" />
        <img className="head-icon" src={FX_LOGO} alt="" />
        <div className="title-wrap">
          <div className="page-title">MO: View List of Deal IDs for Settlement</div>
        </div>
        <div className="head-actions">
          <button className="btn-icon" title="Refresh" onClick={refresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <SignOutButton className="btn-outline" />
        </div>
      </div>

      <main>
        <div className="kpi-head">
          <button className={kpisHidden ? 'kpi-toggle collapsed' : 'kpi-toggle'} onClick={() => setKpisHidden((h) => !h)}>
            <span>{kpisHidden ? '▸' : '▾'}</span>
          </button>
          <div className="kpi-head-title">Overview</div>
        </div>
        <div className={kpisHidden ? 'metrics-grid kpi-hidden' : 'metrics-grid'}>
          {KPI_CARDS.map((c) => (
            <div
              key={c.key}
              className={`metric-card ${c.cls}${filters.kpi === c.key ? ' active' : ''}`}
              onClick={() => patchFilters({ kpi: nextKpiFilter(filters.kpi, c.key) })}
            >
              <div className="metric-inner">
                <div className="metric-val">{kpis[c.value]}</div>
                <div className="metric-lbl">{c.lbl}</div>
                <div className="metric-help">{c.help}</div>
              </div>
            </div>
          ))}
          <div className="metric-card k-total" style={{ cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
            <div className="metric-inner">
              <div className="metric-val">{fmtCompactUsd(kpis.utiTotal)}</div>
              <div className="metric-lbl">Total Utilized Amt (USD)</div>
              <div className="metric-help">Combined notional of deal IDs matching the current filters</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet"></span>
              <h2>Deal IDs</h2>
            </div>
            <span className="badge badge-blue" style={{ display: filters.contextMc ? 'inline-flex' : 'none' }}>
              Filtered by Master Contract: <strong style={{ marginLeft: 4 }}>{filters.contextMc}</strong>{' '}
              <span
                style={{ marginLeft: 8, cursor: 'pointer', fontWeight: 700 }}
                onClick={(e) => {
                  e.stopPropagation()
                  patchFilters({ contextMc: null })
                }}
              >
                &times;
              </span>
            </span>
          </div>

          <div className="master-toolbar">
            <div className="search-box">
              <span className="icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search Deal ID, MC ref, partner..."
                value={filters.search}
                onChange={(e) => patchFilters({ search: e.target.value })}
              />
            </div>
            <div className="filter-panel-body" id="filter-panel-body">
              <div className="filter-bar">
                <div className="filter-field">
                  <label htmlFor="f-deal">Deal ID</label>
                  <input
                    id="f-deal"
                    type="text"
                    placeholder="e.g. TSF-9081"
                    style={{ width: 120 }}
                    value={filters.deal}
                    onChange={(e) => patchFilters({ deal: e.target.value })}
                  />
                </div>
                <div className="filter-field status-filter">
                  <label htmlFor="f-status">Status</label>
                  <select id="f-status" value={filters.status} onChange={(e) => patchFilters({ status: e.target.value })}>
                    <option value="ALL">All statuses</option>
                    <option value="" disabled>
                      {MASTER_WAITING}
                    </option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-region">Region</label>
                  <select id="f-region" value={filters.region} onChange={(e) => patchFilters({ region: e.target.value })}>
                    <option value="ALL">All regions</option>
                    {regions === null ? (
                      <option value="" disabled>
                        Loading regions from SAP …
                      </option>
                    ) : regions.length ? (
                      regions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {regionLabel(r)}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        Regions could not be read from SAP
                      </option>
                    )}
                  </select>
                </div>
                <div className="filter-field entity-filter">
                  <label htmlFor="f-entity">Origin Entity</label>
                  <select id="f-entity" value={filters.entity} onChange={(e) => patchFilters({ entity: e.target.value })}>
                    <option value="ALL">All entities</option>
                    <option value="" disabled>
                      {MASTER_WAITING}
                    </option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-co">CO Area</label>
                  <select id="f-co" value={filters.co} onChange={(e) => patchFilters({ co: e.target.value })}>
                    <option value="">{MASTER_WAITING}</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label>Value Date</label>
                  <div className="date-range">
                    <DateBox
                      placeholder="From"
                      value={filters.dateFrom}
                      open={openDp === 'from'}
                      viewYear={view.year}
                      viewMonth={view.month}
                      onToggle={() => toggleDatePicker('from')}
                      onNav={(delta) => setView((v) => shiftMonth(v.year, v.month, delta))}
                      onPick={(value) => pickDate('from', value)}
                    />
                    <span>to</span>
                    <DateBox
                      placeholder="To"
                      value={filters.dateTo}
                      open={openDp === 'to'}
                      viewYear={view.year}
                      viewMonth={view.month}
                      onToggle={() => toggleDatePicker('to')}
                      onNav={(delta) => setView((v) => shiftMonth(v.year, v.month, delta))}
                      onPick={(value) => pickDate('to', value)}
                    />
                  </div>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-layout">Layout</label>
                  <select id="f-layout" style={{ width: 150 }} value={filters.layout} onChange={(e) => changeLayout(e.target.value)}>
                    {LAYOUTS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-reset-wrap">
                  <span className="filter-spacer-label">Action</span>
                  <button className="filter-reset" onClick={resetFilters}>
                    Reset
                  </button>
                </div>
              </div>
              <div className="common-actions">
                <span className="badge badge-blue">{resultCountLabel(filtered.length)}</span>
              </div>
            </div>
          </div>

          <DealTable
            rows={shown}
            sort={sort}
            onSort={onSort}
            onOpenDeal={openDeal}
            onOpenMc={openMc}
            emptyText={deals.length ? 'No Data Found' : LIST_WAITING}
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
              <button className="pager-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                &#8249;
              </button>
              {pageWindow(pages, page).map((item) =>
                item.kind === 'gap' ? (
                  <span key={item.key} style={{ padding: '0 4px', color: 'var(--text-faint)' }}>
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={item.page}
                    className={item.page === page ? 'pager-btn active' : 'pager-btn'}
                    onClick={() => setPage(item.page)}
                  >
                    {item.page}
                  </button>
                ),
              )}
              <button className="pager-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                &#8250;
              </button>
            </div>
            <div className="pager-info">
              Showing{' '}
              <strong>
                {range.start}-{range.end}
              </strong>{' '}
              of <strong>{filtered.length}</strong>
            </div>
          </div>
          <div className="note" style={{ display: note === null ? 'none' : 'block' }}>
            <strong>Key Date:</strong> {note}
          </div>
          <div className="note">
            <strong>Notes:</strong> Colour coding &mdash;{' '}
            <strong style={{ color: 'var(--primary)' }}>Master Contract = Blue</strong> &middot;{' '}
            <strong style={{ color: 'var(--success)' }}>Deal ID = Green</strong> &middot;{' '}
            <strong style={{ color: 'var(--warning)' }}>Invoice = Orange</strong>. A Deal ID only turns up here once it
            has been booked against a Master Contract &mdash; this list is the central place that ties a Master
            Contract, its FX Deal(s) and, once shipped, its invoices together. Click any <strong>Deal ID</strong> to
            open its Trade Invoice drill-down, or any <strong>Master Contract</strong> reference to see its full
            details, entity string and every other Deal ID booked under it. Click a row to see every field for that
            Deal ID. Click a column heading to sort.
          </div>
        </div>
      </main>

      <div className={toast.show ? 'zfac-toast show' : 'zfac-toast'}>{toast.message}</div>
      <ResultQueue items={outcomes} onDismiss={(id) => setOutcomes((r) => r.filter((x) => x.id !== id))} />

      <DealModal modal={dealModal} deal={modalDeal} mc={masterContracts.find((m) => m.mcRef === modalDeal?.mcRef)} onOpenMc={openMc} onOpenInvoices={openInvoices} />
      <McModal modal={mcModal} mc={modalMc} deals={deals} onOpenDeal={openDeal} onFilterByMc={filterByMc} />
      <InvoiceModal
        modal={invModal}
        deal={invDeal}
        mc={masterContracts.find((m) => m.mcRef === invDeal?.mcRef)}
        waiting={INVOICES_WAITING}
      />
    </div>
  )
}
