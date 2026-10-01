import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { DateField } from './DateField.tsx'
import { DealTable } from './DealTable.tsx'
import { DealModal, McModal } from './DetailModals.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { WAITING_DEAL_ID_API, loadScreen, type DataSource } from './api.ts'
import { ENTITIES, MODELS, REGIONS, STATUSES } from './data.ts'
import { fmtDate, parseDMY } from './format.ts'
import {
  CSV_FILENAME,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  EMPTY_QUICK_FILTERS,
  anyQuickFilter,
  buildCsv,
  exportToast,
  getFilteredData,
  nextSort,
  recordCount,
  totalPagesOf,
  visibleColumns,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { MultiSelect } from './MultiSelect.tsx'
import './mo-view-deal-ids-for-confirmation.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-view-deal-ids-for-confirmation.dark.css'
import type { ColumnKey, Deal, Filters, Layout, MselOption, MultiFilterKey, QuickFilters, Sort, StatusCode } from './types.ts'

const TOAST_MS = 3200

/** The Key Date defaults to today; the seed data keeps its own 28-09-2026 anchor (data.ts). */
function today(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const QUICK_CHIPS: { key: keyof QuickFilters; label: string }[] = [
  { key: 'confirmedOnly', label: 'Confirmed only' },
  { key: 'straddleOnly', label: 'Short straddle only' },
  { key: 'revisedOnly', label: 'Revised end date only' },
]

type Msel = { key: MultiFilterKey; label: string; wide: boolean; options: MselOption[]; placeholder: string }

/** Built per load: REGIONS / ENTITIES / MODELS are swapped for MySQL's rows once they arrive. */
function buildMsels(): Msel[] {
  return [
    { key: 'region', label: 'Region', wide: false, options: REGIONS.map((r) => ({ id: r.id, label: r.desc || r.id })), placeholder: 'Select region...' },
    { key: 'entity', label: 'Origin Entity', wide: true, options: ENTITIES.map((e) => ({ id: e.id, label: e.name, sub: e.region })), placeholder: 'Select entity...' },
    { key: 'model', label: 'FX Model', wide: true, options: MODELS.map((m) => ({ id: m.id, label: m.desc })), placeholder: 'Select FX model...' },
  ]
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon({ size }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.5 15a8 8 0 0014.1 2.6M18.5 9A8 8 0 004.4 6.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * MO: View List of Deal IDs for Confirmation (ZSGTSFR044), converted from
 * legacy/view list of deal ids.html.
 *
 * A read-only workbench: the deals active as of the Key Date with status 01 Pending
 * Confirmation / 02 Confirmed, narrowed by the Basic Selection, quick filters and search.
 * The deals and every filter's values come from SAP's tables through the SLC middleware
 * (api.ts); when ZSGTSFTR_DEALID cannot be read the list stays empty — no sample rows. Deal ID and MC Reference No.
 * open read-only detail popups.
 */
export default function MoViewDealIdsForConfirmation() {
  const [deals, setDeals] = useState<Deal[]>([])
  /** Where the rows came from; 'unavailable' means ZSGTSFTR_DEALID could not be read. */
  const [source, setSource] = useState<DataSource | 'loading'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    loadScreen(controller.signal)
      .then((loaded) => {
        setDeals(loaded.deals)
        setSource(loaded.source)
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.error('[fx] Deal IDs for confirmation failed to load', error)
      })
    return () => controller.abort()
  }, [])
  // The masters are swapped in place once `source` settles, so the options are rebuilt then.
  const msels = useMemo(buildMsels, [source])

  const [keyDateText, setKeyDateText] = useState(() => fmtDate(today()))
  const [keyDate, setKeyDate] = useState<Date>(today)
  const [keyDateError, setKeyDateError] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [quickFilters, setQuickFilters] = useState<QuickFilters>(EMPTY_QUICK_FILTERS)
  const [quickFiltersVisible, setQuickFiltersVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [layout, setLayout] = useState<Layout>('essential')
  const [openMsel, setOpenMsel] = useState<MultiFilterKey | null>(null)

  const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const showToast = (message: string) => {
    setToast({ message, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }

  const dealModal = useModal()
  const mcModal = useModal()
  const [dealId, setDealId] = useState<string | null>(null)
  const [mcRef, setMcRef] = useState<string | null>(null)
  const { close: closeDeal } = dealModal
  const { close: closeMc } = mcModal
  const closeModals = useCallback(() => {
    closeDeal()
    closeMc()
  }, [closeDeal, closeMc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModals()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeModals])

  const columns = useMemo(() => visibleColumns(layout), [layout])
  const filtered = useMemo(
    () => getFilteredData(deals, { keyDate, filters, quickFilters, search, sort, layout }),
    [deals, keyDate, filters, quickFilters, search, sort, layout],
  )
  const totalPages = totalPagesOf(filtered.length, pageSize)
  // The original clamps the page when the list shrinks under it.
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(startIdx, startIdx + pageSize)

  const applyKeyDate = (text: string) => {
    const parsed = parseDMY(text)
    if (!parsed) {
      setKeyDateError(true)
      return
    }
    setKeyDateError(false)
    setKeyDate(parsed)
    setPage(1)
  }

  const resetAll = () => {
    const now = today()
    setKeyDateText(fmtDate(now))
    setKeyDate(now)
    setKeyDateError(false)
    setFilters(EMPTY_FILTERS)
    setQuickFilters(EMPTY_QUICK_FILTERS)
    setLayout('essential')
    setSearch('')
    setSort(DEFAULT_SORT)
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setOpenMsel(null)
  }

  const setMultiFilter = (key: MultiFilterKey, next: string[]) => {
    setFilters((f) => ({ ...f, [key]: next }))
    setPage(1)
  }

  const onMselOpenChange = useCallback((key: MultiFilterKey, open: boolean) => {
    setOpenMsel((cur) => (open ? key : cur === key ? null : cur))
  }, [])
  const mselOpenHandlers = useMemo(
    () => ({
      region: (o: boolean) => onMselOpenChange('region', o),
      entity: (o: boolean) => onMselOpenChange('entity', o),
      model: (o: boolean) => onMselOpenChange('model', o),
    }),
    [onMselOpenChange],
  )

  const onSort = (key: ColumnKey) => {
    setSort((s) => nextSort(s, key))
    setPage(1)
  }

  const downloadCsv = () => {
    const blob = new Blob([buildCsv(columns, filtered)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = CSV_FILENAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(exportToast(filtered.length))
  }

  const openDeal = (id: string) => {
    if (!deals.some((d) => d.zdeal_id === id)) return
    setDealId(id)
    dealModal.open()
  }
  const openMc = (ref: string) => {
    if (!deals.some((d) => d.zmc_ref === ref)) return
    setMcRef(ref)
    mcModal.open()
  }

  const dealForModal = dealId ? (deals.find((d) => d.zdeal_id === dealId) ?? null) : null
  const mcForModal = mcRef ? (deals.find((d) => d.zmc_ref === mcRef) ?? null) : null

  return (
    <div className="mo-view-deal-ids-for-confirmation">
      <header className="app-header">
        <div className="app-header-left">
          <img className="header-logo" src={FS_SHORT_LOGO} alt="FourthSignal logo" />
          <BackButton className="back-btn" />
          <div className="header-title-block">
            <div className="header-title-row">
              <span className="header-title">MO: View List of Deal IDs for Confirmation</span>
              <span className="header-tcode">ZSGTSFR044</span>
            </div>
            <span className="header-subtitle">
              Read-only workbench &mdash; monitor deal IDs pending middle-office confirmation
            </span>
          </div>
        </div>
        <div className="app-header-right">
          <button className="btn btn-secondary" type="button" onClick={resetAll}>
            <RefreshIcon />
            Refresh
          </button>
          <SignOutButton className="btn btn-secondary" />
        </div>
      </header>

      <div className="page">
        <div className="card filter-card">
          <div className="filter-card-head">
            <span className="filter-title">
              <span className="dot" />
              Basic Selection
            </span>
            <div className="legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--mc-blue)' }} />
                Master Contract
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--deal-green)' }} />
                Deal ID
              </span>
              <span className="legend-item muted" title="Not applicable to this view">
                <span className="legend-dot" style={{ background: 'var(--warning)' }} />
                Invoice
              </span>
            </div>
          </div>

          <div className="filter-grid">
            <div className={`field${keyDateError ? ' has-error' : ''}`}>
              <label>
                Key Date <span className="req-star">*</span>
              </label>
              <DateField value={keyDateText} onChange={setKeyDateText} onCommit={applyKeyDate} />
              <div className="validation-msg">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Key Date is required (format DD-MM-YYYY)
              </div>
            </div>

            {msels.map((m) => (
              <div key={m.key} className={m.wide ? 'field wide' : 'field'}>
                <label>{m.label}</label>
                <MultiSelect
                  options={m.options}
                  selected={filters[m.key]}
                  onChange={(next) => setMultiFilter(m.key, next)}
                  placeholder={m.placeholder}
                  open={openMsel === m.key}
                  onOpenChange={mselOpenHandlers[m.key]}
                />
              </div>
            ))}

            <div className="field">
              <label>Status</label>
              <select
                className="control"
                value={filters.status}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, status: e.target.value as StatusCode | '' }))
                  setPage(1)
                }}
              >
                <option value="">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.desc}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Layout</label>
              <select className="control" value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
                <option value="essential">Essential Columns</option>
                <option value="all">All Columns</option>
              </select>
            </div>

            <div className="filter-actions">
              <button className="btn btn-ghost" type="button" onClick={resetAll}>
                <RefreshIcon size={14} />
                Reset
              </button>
            </div>
          </div>

          <div className={`quick-filters${quickFiltersVisible ? ' show' : ''}`}>
            <span className="qf-label">Quick filters:</span>
            {QUICK_CHIPS.map((c) => (
              <label key={c.key} className={`chip${quickFilters[c.key] ? ' active' : ''}`}>
                <input
                  type="checkbox"
                  checked={quickFilters[c.key]}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setQuickFilters((q) => ({ ...q, [c.key]: checked }))
                    setPage(1)
                  }}
                />
                <span className="box" />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="card table-card">
          <div className="table-head">
            <div className="table-head-left">
              <span className="table-title">
                <span className="dot" />
                Deal IDs for Confirmation
              </span>
              <span className="table-count">{recordCount(filtered.length)}</span>
              <SourceNote source={source} />
              <span className="keydate-badge">
                <CalendarIcon /> Key Date: {fmtDate(keyDate)}
              </span>
            </div>
            <div className="table-head-right">
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Search deal IDs..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <button
                className={`icon-btn${quickFiltersVisible ? ' active' : ''}`}
                title="Show quick filters"
                type="button"
                onClick={() => setQuickFiltersVisible((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className={`dot${anyQuickFilter(quickFilters) ? ' show' : ''}`} />
              </button>
              <button className="icon-btn" title="Download list (CSV)" type="button" onClick={downloadCsv}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <DealTable
            columns={columns}
            rows={pageRows}
            total={filtered.length}
            sort={sort}
            onSort={onSort}
            page={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            onDeal={openDeal}
            onMc={openMc}
          />
        </div>

        <p style={{ fontSize: '11.5px', color: 'var(--text-faint)', margin: '14px 4px 0' }}>
          Note: Deal ID and MC Reference No. are shown as coloured hotspot links — click to view details. List is
          restricted to deals with status 01–Pending Confirmation / 02–Confirmed, active as of the selected Key Date.
        </p>
      </div>

      <DealModal modal={dealModal} deal={dealForModal} onClose={closeModals} />
      <McModal modal={mcModal} deal={mcForModal} onClose={closeModals} />

      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.message}</div>
    </div>
  )
}

/** Says where the rows came from, or that the Deal ID list could not be read. */
function SourceNote({ source }: { source: DataSource | 'loading' }) {
  const text =
    source === 'loading'
      ? 'Loading from MySQL…'
      : source === 'sap'
        ? 'ZSGTSFTR_DEALID · MySQL'
        : `${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID could not be read from the SLC middleware`
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{text}</span>
}
