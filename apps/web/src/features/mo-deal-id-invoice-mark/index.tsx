import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf, type DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { describeOutcome, ELIGIBLE_STATUS, loadScreen, markDealsForInvoicing, WAITING_DEAL_ID_API, type DataSource, type Mode } from './api.ts'
import { MODEL_OPTIONS, ORIGIN_OPTIONS, REGION_OPTIONS } from './data.ts'
import { DateField } from './DateField.tsx'
import { DealTable } from './DealTable.tsx'
import { parseDate } from './format.ts'
import { buildCsv, filterRows, sortRows } from './logic.ts'
import { McModal } from './McModal.tsx'
import { SubModal } from './SubModal.tsx'
import { ViewDealModal } from './ViewDealModal.tsx'
import { WorkflowModal } from './WorkflowModal.tsx'
import './mo-deal-id-invoice-mark.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-deal-id-invoice-mark.dark.css'
import type { DealRow, DetailModalState, FxRow, Sort, SortKey, SubModalState, Toast, WorkflowKind } from './types.ts'

const PAGE_SIZE = 20
const DEFAULT_DATE_FROM = '01-09-2026'
const DEFAULT_DATE_TO = '31-12-2026'

/**
 * MO: Deal ID Invoice Marking (ZSGTSFR015), converted from
 * legacy/ZSGTSF_RDEAL_ID_INV_MARK_MANUAL_DEFAULT_LAYOUT.html.
 *
 * The eligible Deal IDs come from ZSGTSFTR_DEALID through the SLC middleware (api.ts), and
 * Mark for Invoicing writes 02 -> 03 there exactly as the report's UPDATE does. Nothing falls
 * back to sample data: when the middleware cannot be read the list is empty, says WAITING FOR
 * DEAL ID API, and nothing can be marked. The View Deal popups (ZSGTSF_RVIEW_DEAL, not in this
 * export) show the Deal ID / MC fields and say WAITING FOR API / ACTION API for the rest.
 *
 * Two modes, as the legacy selection screen: "Manual Mark" (P_MARK, tick rows then Mark for
 * Invoicing) and "Auto Mark" (P_VIEW): the candidates are ship start <= today, the Mark button is
 * off, and "Run Automatic Marking" (after a confirmation) writes 02 -> 03 for all of them. Both
 * report per Deal ID, reload, and leave failed deals at 02 to be retried.
 */
export default function MoDealIdInvoiceMark() {
  const [rows, setRows] = useState<DealRow[]>([])
  /** The DEALID rows behind the screen rows: Mark writes against their keys. */
  const keys = useRef<ReadonlyMap<string, DealIdRow>>(new Map())
  /** Where the rows came from; 'unavailable' means ZSGTSFTR_DEALID could not be read. */
  const [source, setSource] = useState<DataSource | 'loading'>('loading')
  /** Why the list is empty, or which columns / checks wait for an API. */
  const [notes, setNotes] = useState<string[]>([])
  const [generation, setGeneration] = useState(0)
  const busy = useRef(false)
  const [mode, setMode] = useState<Mode>('manual')
  useEffect(() => {
    const controller = new AbortController()
    setSource('loading')
    loadScreen(mode, controller.signal)
      .then((loaded) => {
        keys.current = loaded.keys
        setRows(loaded.rows)
        setSource(loaded.source)
        setNotes(loaded.notes)
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.error('[fx] Deal IDs for invoice marking failed to load', error)
      })
    return () => controller.abort()
  }, [generation, mode])

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM)
  const [dateTo, setDateTo] = useState(DEFAULT_DATE_TO)
  const [origin, setOrigin] = useState('')
  const [region, setRegion] = useState('')
  const [model, setModel] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'dealId', dir: 1 })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [detail, setDetail] = useState<DetailModalState>(null)
  const [workflow, setWorkflow] = useState<{ kind: WorkflowKind; row: DealRow } | null>(null)
  const [sub, setSub] = useState<SubModalState>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropReady, setDropReady] = useState(false)
  const [dropOver, setDropOver] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const pushToast = (message: string, kind: Toast['kind'] = 'success') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
  }

  // The helps are swapped in place once `source` settles, so they are re-read then.
  const originOptions = useMemo(() => [...ORIGIN_OPTIONS], [source])
  const regionOptions = useMemo(() => [...REGION_OPTIONS], [source])
  const modelOptions = useMemo(() => [...MODEL_OPTIONS], [source])

  const fromDate = parseDate(dateFrom.trim())
  const toDate = parseDate(dateTo.trim())
  const datesValid = !!fromDate && !!toDate && fromDate.getTime() <= toDate.getTime()

  const filtered = useMemo(
    () => (datesValid || mode === 'auto' ? filterRows(rows, search, fromDate, toDate, origin, region, model, mode === 'manual') : []),
    [rows, search, fromDate, toDate, origin, region, model, datesValid, mode],
  )
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = sorted.slice(start, start + PAGE_SIZE)

  const findRow = (id: string): DealRow | undefined => rows.find((r) => r.dealId === id)

  const resetFilters = () => {
    setSearch('')
    setDateFrom(DEFAULT_DATE_FROM)
    setDateTo(DEFAULT_DATE_TO)
    setOrigin('')
    setRegion('')
    setModel('')
    setSelected(new Set())
    setSort({ key: 'dealId', dir: 1 })
    setPage(1)
  }

  const refreshWorkbench = () => {
    setGeneration((g) => g + 1)
    resetFilters()
    pushToast('Workbench reloaded from MySQL.', 'info')
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((s) => {
      const next = new Set(s)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelected((s) => {
      const next = new Set(s)
      for (const r of pageRows) {
        if (checked) next.add(r.dealId)
        else next.delete(r.dealId)
      }
      return next
    })
  }

  /** Writes 02 -> 03 for the given rows, reports each Deal ID's result and reloads the backend state. */
  const markRows = async (targetRows: readonly DealRow[]) => {
    if (busy.current) return
    if (source !== 'sap') {
      pushToast(`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID could not be read, so nothing was marked.`, 'warn')
      return
    }
    const targets = targetRows.map((r) => keys.current.get(r.dealId)).filter((d): d is DealIdRow => !!d)
    busy.current = true
    try {
      const outcome = await markDealsForInvoicing(targets)
      // PERFORM get_data: the marked deals (now 03) drop out on re-read; failed ones stay 02, still ticked to retry.
      setSelected(new Set(outcome.failed.map((f) => f.dealId)))
      setPage(1)
      setGeneration((g) => g + 1)
      pushToast(describeOutcome(outcome), outcome.failed.length ? 'warn' : 'success')
    } catch (error) {
      pushToast(messageOf(error), 'warn')
      setGeneration((g) => g + 1)
    } finally {
      busy.current = false
    }
  }

  const markSelected = async (ids: ReadonlySet<string>) => {
    if (mode !== 'manual') return
    const eligible = rows.filter((r) => ids.has(r.dealId) && r.status === ELIGIBLE_STATUS)
    if (eligible.length === 0) {
      pushToast('Select at least one eligible deal first.', 'warn')
      return
    }
    await markRows(eligible)
  }

  /** P_VIEW: every candidate the filters leave; nothing is taken from the manual ticks. */
  const runAutoMark = async () => {
    if (mode !== 'auto') return
    const candidates = sorted.filter((r) => r.status === ELIGIBLE_STATUS)
    if (candidates.length === 0) {
      pushToast('No deals are eligible for automatic marking.', 'info')
      return
    }
    if (!window.confirm(`Mark ${candidates.length} deal(s) for invoicing (status 02 → 03)?`)) return
    await markRows(candidates)
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setSelected(new Set())
    setPage(1)
    setMode(next)
  }

  const downloadCsv = () => {
    const blob = new Blob([buildCsv(sorted)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'deal_id_invoice_marking.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const onOpenTxn = (row: DealRow, fx: FxRow) => setSub({ kind: 'txn', row, fx })

  const pagerButtons: Array<number | 'gap'> = []
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages <= 5 || p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) pagerButtons.push(p)
  }

  return (
    <div className="modinvmark">
      <div className="app-shell">
        <header className="topbar">
          <div className="top-left">
            <BackButton className="back-btn" />
            <div className="brand-wrap">
              <div className="fs-mark" aria-hidden="true">
                <span className="m1" />
                <span className="m2" />
                <span className="m3" />
                <span className="m4" />
              </div>
              <div className="brand-copy">
                <div className="brand-title">Deal ID Invoice Marking</div>
                <div className="brand-code">TSF</div>
              </div>
            </div>
          </div>
          <div className="top-actions">
            <span className="live-dot" title="Workbench active" />
            <button className="header-btn" type="button" onClick={refreshWorkbench}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 6v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 11a7 7 0 1 0 1 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>Refresh</span>
            </button>
            <SignOutButton className="header-btn" />
          </div>
        </header>

        <main className="main">
          <section className="workbench">
            <div className="table-title-row">
              <div className="table-heading">
                Deal ID List Report: Mark for Invoicing
                <span className="record-count">{sorted.length} records</span>
                <SourceNote source={source} notes={notes} />
              </div>
              <div className="table-tools">
                <button className="icon-btn" type="button" title="Download CSV" aria-label="Download CSV" onClick={downloadCsv}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M8 10l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="filter-toolbar">
              <div className="search-wrap toolbar-search">
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search all columns..."
                  autoComplete="off"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setSelected(new Set())
                    setPage(1)
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">
                  Shipment Date From<span className="req">*</span>
                </label>
                <DateField
                  id="dateFrom"
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v)
                    setSelected(new Set())
                    setPage(1)
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">
                  Shipment Date To<span className="req">*</span>
                </label>
                <DateField
                  id="dateTo"
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v)
                    setSelected(new Set())
                    setPage(1)
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Origin Entity</label>
                <select
                  className="filter-select w-origin"
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value)
                    setSelected(new Set())
                    setPage(1)
                  }}
                >
                  <option value="">All origins</option>
                  {originOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Region</label>
                <select
                  className="filter-select w-region"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value)
                    setSelected(new Set())
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  {regionOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">FX Model</label>
                <select
                  className="filter-select w-model"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value)
                    setSelected(new Set())
                    setPage(1)
                  }}
                >
                  <option value="">All models</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <span className="field-label">Invoicing Selection</span>
                <div className="mode-switch" role="group" aria-label="Invoicing selection">
                  <button className={`mode-btn${mode === 'manual' ? ' active' : ''}`} type="button" onClick={() => switchMode('manual')}>
                    Manual Mark
                  </button>
                  <button className={`mode-btn${mode === 'auto' ? ' active' : ''}`} type="button" onClick={() => switchMode('auto')}>
                    Auto Mark
                  </button>
                </div>
              </div>
              <button className="reset-btn" type="button" onClick={resetFilters}>
                Reset
              </button>
              <div className="toolbar-spacer" />
              <button
                className={`primary-btn${dropReady ? ' drop-ready' : ''}${dropOver ? ' drop-over' : ''}`}
                type="button"
                disabled={mode !== 'manual' || selected.size === 0}
                title={mode !== 'manual' ? 'Not available in Auto Mark' : selected.size === 0 ? 'Select one or more deals first' : `Mark ${selected.size} selected deal(s) for invoicing`}
                onClick={() => void markSelected(selected)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropOver(true)
                }}
                onDragLeave={() => setDropOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropOver(false)
                  setDropReady(false)
                  const ids = dragId ? new Set([...selected, dragId]) : selected
                  void markSelected(ids)
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Mark for Invoicing
              </button>
              {mode === 'auto' ? (
                <button className="primary-btn" type="button" disabled={sorted.length === 0} title={`Mark all ${sorted.length} candidate deal(s) for invoicing`} onClick={() => void runAutoMark()}>
                  Run Automatic Marking ({sorted.length})
                </button>
              ) : null}
            </div>

            <div className="legend" aria-label="Color coding">
              <span className="legend-title">Colour Coding</span>
              <span className="legend-item">
                <span className="legend-dot legend-blue" />
                Master Contract
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-green" />
                Deal ID
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-orange" />
                Invoice / Ready
              </span>
            </div>

            <DealTable
              rows={pageRows}
              selected={selected}
              sort={sort}
              onSort={(key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))}
              onToggleAll={toggleAll}
              onToggleRow={toggleRow}
              onOpenDeal={(row) => setDetail({ kind: 'deal', row })}
              onOpenMc={(row) => setDetail({ kind: 'mc', row })}
              onDragStart={(id) => {
                setDragId(id)
                setDropReady(true)
              }}
              selectable={mode === 'manual'}
              emptyReason={source === 'unavailable' ? notes.join(' · ') : ''}
              onDragEnd={() => {
                setDragId(null)
                setDropReady(false)
                setDropOver(false)
              }}
            />

            <div className="table-footer">
              <div className="footer-copy">{sorted.length ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}` : 'Showing 0 of 0'}</div>
              <div className="pagination">
                <button className="page-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  &lsaquo;
                </button>
                {pagerButtons.map((p, i) => (
                  <button key={i} className={`page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => typeof p === 'number' && setPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  &rsaquo;
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind && t.kind !== 'success' ? ` ${t.kind}` : ''}`}>
            <span className="toast-icon">{t.kind === 'warn' ? '!' : t.kind === 'info' ? 'i' : '✓'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {detail?.kind === 'mc' ? <McModal row={detail.row} onClose={() => setDetail(null)} /> : null}
      {detail?.kind === 'deal'
        ? (() => {
            const liveRow = findRow(detail.row.dealId) ?? detail.row
            return (
              <ViewDealModal
                row={liveRow}
                onClose={() => setDetail(null)}
                onOpenBl={() => setSub({ kind: 'bl', row: liveRow })}
                onViewInvoiceInfo={() => pushToast('View List of Invoice routes to ZSGTSF_RDEAL_ID_INV in SAP.', 'info')}
                onOpenPlannedPnl={() => setWorkflow({ kind: 'plannedPnl', row: liveRow })}
                onOpenInvoicing={() => setWorkflow({ kind: 'invoicing', row: liveRow })}
                onOpenSettlement={() => setWorkflow({ kind: 'settlement', row: liveRow })}
                onOpenTxn={(fx) => onOpenTxn(liveRow, fx)}
                onRefresh={() => pushToast('Deal details refreshed.', 'info')}
              />
            )
          })()
        : null}

      {workflow ? <WorkflowModal kind={workflow.kind} row={findRow(workflow.row.dealId) ?? workflow.row} onClose={() => setWorkflow(null)} onOpenTxn={(fx) => onOpenTxn(workflow.row, fx)} toast={pushToast} /> : null}

      {sub ? <SubModal state={sub} onClose={() => setSub(null)} /> : null}
    </div>
  )
}

/** Says where the rows came from, and which columns / checks are waiting for an API. */
function SourceNote({ source, notes }: { source: DataSource | 'loading'; notes: readonly string[] }) {
  const text = source === 'loading' ? 'Loading from MySQL…' : source === 'sap' ? ['ZSGTSFTR_DEALID · MySQL', ...notes].join(' · ') : notes.join(' · ')
  return <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{text}</span>
}
