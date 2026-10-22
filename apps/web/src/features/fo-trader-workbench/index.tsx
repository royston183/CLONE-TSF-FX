import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { FwdSsSpotPopup, NdfPopup, RatePopup, SettlementSpotPopup, SpotPopup, SsSpotPopup } from './ActionPopups.tsx'
import { DateField, Dropdown } from './controls.tsx'
import { loadWorkbench, TXN_FAILED } from './api.ts'
import { DEFAULT_FILTERS, LOOKUPS, emptyData, setLookups } from './data.ts'
import { DealModal } from './DealModal.tsx'
import { dropCls, useDnd } from './dnd.ts'
import { openDeal, type Wb } from './flows.ts'
import { NDF_FIXING_API_MISSING, fixNdfAvailable } from '../../shared/fx/ndf.ts'
import { todayIso } from './format.ts'
import { KpiDetailModal, TxnDetailsModal } from './InfoModals.tsx'
import {
  DEAL_COLS,
  actionEntryReason,
  blockedWriteReason,
  DEFAULT_SORT,
  PAGE_SIZES,
  parsePrefs,
  validatePrefs,
  readState,
  kpiPresentation,
  KPI_DEFS,
  colText,
  computeKpis,
  dateErrors,
  dealOptions,
  dealStatusInfo,
  filterSortDeals,
  nextSort,
  type KpiId,
} from './logic.ts'
import { ConfirmModal, OutcomeFocus, type FrameProps, type Popup, type PopupSpec } from './modal.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { useStatusPopup } from '../../shared/popup/Popup.tsx'
import './fo-trader-workbench.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-trader-workbench.dark.css'
import type { AppData, Filters, Sort, Toast, ToastKind } from './types.ts'

const PREFS_KEY = 'fo-trader-workbench.prefs.v1'
const CLOSE_MS = 150

/**
 * FO: Trader Workbench (ZSGTSFR100 / ZSGTSFR_SET_WSPACE), converted from
 * legacy/trader-workbench.html.
 *
 * Settles FX deals, options and NDFs: the Deal ID list with its KPI strip, and per deal the
 * transactions and action items, from which options are exercised or expired, NDFs fixed and
 * settlement spots created.
 *
 * Reads SAP only (api.ts): the deals, their masters, the filters' and popups' value helps,
 * the settlement data and the rates. The deal's transactions (ZSGTSFCDS_FX / _OPTION) and every
 * posting (exercise, expiry, NDF fixing, spot creation) have no API yet: the grids say so and
 * the actions report WAITING FOR API instead of posting.
 */
export default function FoTraderWorkbench() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  /* ---------- data (in memory, from the seed) ---------- */
  const [data, setData] = useState<AppData>(emptyData)
  const dataRef = useRef(data)
  const setAppData = useCallback((next: AppData) => {
    dataRef.current = next
    setData(next)
  }, [])

  /* ---------- toast ---------- */
  const [toast, setToast] = useState<Toast>({ msg: '', kind: '', id: 0 })
  const [toastShown, setToastShown] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((msg: string, kind: ToastKind = '') => {
    setToast((t) => ({ msg, kind, id: t.id + 1 }))
    setToastShown(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastShown(false), kind === 'success' ? 4600 : 3600)
  }, [])

  /* ---------- outcome popup (standard StatusPopup, reports a finished SAP write) ---------- */
  const status = useStatusPopup()
  const statusOpener = useRef<HTMLElement | null>(null)
  const [canFix, setCanFix] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    fixNdfAvailable().then((ok) => live && setCanFix(ok)).catch(() => live && setCanFix(false))
    return () => { live = false }
  }, [])

  /* ---------- popup stack ---------- */
  const [popups, setPopups] = useState<Popup[]>([])
  const postingRef = useRef(new Set<number>())
  const [posting, setPosting] = useState(false)
  /** The stack as last rendered, for handlers that act on it (Escape, replacing a deal popup). */
  const popupsRef = useRef(popups)
  useEffect(() => {
    popupsRef.current = popups
  }, [popups])
  const popupKey = useRef(0)
  const closeTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const closePopup = useCallback((key: number) => {
    if (postingRef.current.has(key)) return
    setPopups((all) => all.map((p) => (p.key === key ? { ...p, closing: true } : p)))
    const timer = setTimeout(() => {
      closeTimers.current.delete(timer)
      setPopups((all) => all.filter((p) => p.key !== key))
    }, CLOSE_MS)
    closeTimers.current.add(timer)
  }, [])
  const openPopup = useCallback(
    (spec: PopupSpec) => {
      popupKey.current += 1
      const key = popupKey.current
      // A deal popup replaces the one already open (dealModalApi.close() in the original).
      if (spec.kind === 'deal') for (const p of popupsRef.current) if (p.spec.kind === 'deal' && !p.closing) closePopup(p.key)
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const opener = focused?.closest('.std-pop') ? statusOpener.current ?? popupsRef.current.at(-1)?.opener ?? null : focused
      setPopups((all) => [...all, { key, closing: false, spec, opener }])
    },
    [closePopup],
  )
  const updateSpec = (key: number, spec: PopupSpec) => setPopups((all) => all.map((p) => (p.key === key ? { ...p, spec } : p)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const top = [...popupsRef.current].reverse().find((p) => !p.closing)
      if (top) closePopup(top.key)
    }
    document.addEventListener('keydown', onKey)
    const timers = closeTimers.current
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(toastTimer.current)
      for (const t of timers) clearTimeout(t)
    }
  }, [closePopup])

  /* ---------- SAP load (FETCH_DEAL_DETAILS and the masters); Refresh reloads ---------- */
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [txnNote, setTxnNote] = useState('')
  const loadAbort = useRef<AbortController | null>(null)
  const reload = useCallback(
    async (onDone?: () => void) => {
      loadAbort.current?.abort()
      const ctrl = new AbortController()
      loadAbort.current = ctrl
      setLoading(true)
      setLoadError('')
      try {
        const res = await loadWorkbench(todayIso(), ctrl.signal)
        setLookups(res.lookups)
        setAppData(res.data)
        setTxnNote(res.txnWaiting)
        onDone?.()
      } catch (error) {
        if (isAbort(error)) return
        console.error('[trader-workbench] load failed', error)
        setLoadError('The Deal IDs could not be read from the SLC middleware.')
        showToast('The Deal IDs could not be read from the SLC middleware.', 'error')
      } finally {
        if (loadAbort.current === ctrl) setLoading(false)
      }
    },
    [setAppData, showToast],
  )
  useEffect(() => {
    void reload()
    return () => loadAbort.current?.abort()
  }, [reload])

  const wb: Wb = {
    entryReason: (action, txn) => loading ? 'Loading workbench data…' : loadError || actionEntryReason(action, txn, canFix, NDF_FIXING_API_MISSING),
    post: (action) => {
      showToast(blockedWriteReason(action), 'error')
      return false
    },
    get: () => dataRef.current,
    set: setAppData,
    toast: showToast,
    outcome: (opts) => {
      statusOpener.current = popupsRef.current.at(-1)?.opener ?? null
      status.show(opts)
    },
    open: openPopup,
    confirm: (opts, onYes) => openPopup({ kind: 'confirm', ...opts, onYes }),
    today: todayIso,
    reload: () => void reload(),
  }

  /* ---------- main grid ---------- */
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS })
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [prefsReady, setPrefsReady] = useState(false)
  const dnd = useDnd(rootRef)

  useEffect(() => {
    if (loading || loadError) return
    const options = { models: LOOKUPS.models.map((m) => m.id), statuses: LOOKUPS.dealStatus.map((s) => s.code), deals: dealOptions(data.deals).map((d) => d.id) }
    if (!prefsReady) {
      let stored: string | null = null
      try { stored = window.localStorage.getItem(PREFS_KEY) } catch { /* Storage may be unavailable. */ }
      const prefs = parsePrefs(stored, options)
      setFilters(prefs.filters)
      setSearch(prefs.search)
      setSort(prefs.sort)
      setPageSize(prefs.pageSize)
      setPrefsReady(true)
    } else {
      setFilters((filters) => validatePrefs({ filters }, options).filters)
    }
  }, [loading, loadError, data.deals, prefsReady])

  useEffect(() => {
    if (!prefsReady || loading || loadError || dateErrors(filters).from || dateErrors(filters).to) return
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ filters, search, sort, pageSize })) } catch { /* Preferences remain usable in memory. */ }
  }, [prefsReady, loading, loadError, filters, search, sort, pageSize])

  const list = useMemo(() => filterSortDeals(data.deals, filters, search, sort), [data, filters, search, sort])
  const kpis = useMemo(() => computeKpis(data, list), [data, list])
  const errs = dateErrors(filters)
  const datesOk = !errs.from && !errs.to
  const txnError = loadError || (txnNote === TXN_FAILED ? txnNote : '')
  const gridState = readState(loading, loadError, list.length)
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const curPage = Math.min(page, pages)
  const rows = list.slice((curPage - 1) * pageSize, curPage * pageSize)
  /* the selection is kept only while the row is still listed */
  const selected = selectedDealId && list.some((d) => d.id === selectedDealId) ? selectedDealId : null
  useEffect(() => {
    if (selectedDealId && !selected) setSelectedDealId(null)
  }, [selected, selectedDealId])

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  /* Reset = filters/search/sort/page/selection back to the initial screen state */
  const resetFilters = () => {
    setSearch('')
    setFilters({ ...DEFAULT_FILTERS })
    setSort(DEFAULT_SORT)
    setPage(1)
    setSelectedDealId(null)
    setPageSize(20)
  }
  /* Reload data while keeping the trader's view and open work. */
  const refreshWorkbench = () => {
    void reload(() => showToast('Workbench reloaded'))
  }

  const viewSettlement = () => {
    if (!selected) {
      showToast('Select a deal first.', 'error')
      return
    }
    // V_EX submits ZSGTSF_RDEAL_TRD_INV with P_DEAL, including its category 10 DMS action.
    navigate(`/apps/mo-execute-settlement-deal-id?dealId=${encodeURIComponent(selected)}`)
  }
  const openDealRow = (id: string) => {
    setSelectedDealId(id)
    openDeal(wb, id)
  }
  const wrongKind = (kind: string) => showToast(kind === 'txn' ? 'This action requires a transaction row.' : 'Select a deal first.', 'error')

  const from = total === 0 ? 0 : (curPage - 1) * pageSize + 1
  const to = Math.min(total, curPage * pageSize)

  /* ---------- popups ---------- */
  const renderPopup = (p: Popup, depth: number) => {
    const frame: FrameProps = {
      depth, closing: p.closing, busy: postingRef.current.has(p.key), onClose: () => closePopup(p.key),
      active: !status.element && p.key === [...popups].reverse().find((p) => !p.closing)?.key,
      opener: p.opener ?? null,
      setBusy: (busy) => {
        if (busy) postingRef.current.add(p.key)
        else postingRef.current.delete(p.key)
        setPosting(postingRef.current.size > 0)
      },
    }
    const s = p.spec
    switch (s.kind) {
      case 'deal':
        return <DealModal key={p.key} frame={frame} spec={s} wb={wb} dnd={dnd} txnNote={txnNote} txnLoading={loading} txnError={txnError} onSelectTxn={(rfha) => updateSpec(p.key, { ...s, selectedRfha: rfha })} />
      case 'txn':
        return <TxnDetailsModal key={p.key} frame={frame} rfha={s.rfha} dealId={s.dealId} wb={wb} />
      case 'rate':
        return <RatePopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'spot':
        return <SpotPopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'ssSpot':
        return <SsSpotPopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'fwdSsSpot':
        return <FwdSsSpotPopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'ndf':
        return <NdfPopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'settlementSpot':
        return <SettlementSpotPopup key={p.key} frame={frame} spec={s} wb={wb} />
      case 'kpi':
        return (
          <KpiDetailModal
            key={p.key}
            frame={frame}
            id={s.id}
            k={kpis}
            onOpenDeal={(id) => {
              closePopup(p.key)
              openDealRow(id)
            }}
          />
        )
      case 'confirm':
        return <ConfirmModal key={p.key} frame={frame} spec={s} />
    }
  }

  const toastCls = `toast${toastShown ? ' show' : ''}${toast.kind === 'error' ? ' error' : toast.kind === 'success' ? ' success' : ''}`

  return (
    <div className="fo-trader-workbench" ref={rootRef}>
      <div className="app" inert={popups.some((p) => !p.closing) || !!status.element}>
        <div className="page-header">
          <BackButton className="fx-back-btn" />
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Trader Workbench</h1>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" type="button" title="Reload data and keep the current view" disabled={loading || posting} onClick={refreshWorkbench}>
              &#8635; Reload
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="kpi-row" aria-label="Key indicators">
          {KPI_DEFS.map((def) => {
            const cls = def.valueCls?.(kpis)
            const view = kpiPresentation(def.id, kpis, loading, loadError, txnError)
            const open = () => view.blocked ? showToast(view.description, 'error') : openPopup({ kind: 'kpi', id: def.id as KpiId })
            return (
              <div
                key={def.id}
                className={`kpi-card${def.tone ? ` tone-${def.tone}` : ''}`}
                aria-disabled={view.blocked}
                aria-busy={loading}
              >
                <button type="button" className="kpi-open" aria-disabled={view.blocked}
                title={view.blocked ? view.description : 'Click for the breakdown'}
                onClick={open}
                >
                  <span className="kpi-label">{def.label}</span>
                  <span className={`kpi-value${!view.blocked && cls ? ` ${cls}` : ''}`}>{view.value}</span>
                  <span className="kpi-description">{view.description}</span>
                </button>
                {view.retry ? <button type="button" className="btn btn-secondary" disabled={loading} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); void reload() }}>Retry</button> : null}
              </div>
            )
          })}
        </div>

        <div className="table-col">
          <div className="card">
            <div className="section-title">
              <span className="dot"></span>Deal ID Details
              <span className="section-hint">Click a Deal ID to open its transactions and action items</span>
            </div>

            <div className="wb-toolbar">
              <div className="search-box">
                <span className="icon">&#128269;</span>
                <input
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
              <div className={`field f-date${errs.from ? ' has-error' : ''}`}>
                <label>
                  Settlement Date From<span className="req">*</span>
                </label>
                <DateField ariaLabel="Settlement Date From" value={filters.from} onCommit={(v) => setFilter({ from: v })} />
                <div className="error-msg">{errs.from}</div>
              </div>
              <div className={`field f-date${errs.to ? ' has-error' : ''}`}>
                <label>
                  To<span className="req">*</span>
                </label>
                <DateField ariaLabel="Settlement Date To" value={filters.to} onCommit={(v) => setFilter({ to: v })} />
                <div className="error-msg">{errs.to}</div>
              </div>
              <div className="field f-dd">
                <label>Model</label>
                <Dropdown
                  items={LOOKUPS.models}
                  ariaLabel="Model"
                  value={filters.model}
                  placeholder="All models"
                  emptyLabel="All models"
                  valueOf={(m) => m.id}
                  primary={(m) => `${m.id} · ${m.desc}`}
                  display={(m) => m.id}
                  search={(m) => `${m.id} ${m.desc}`}
                  onChange={(v) => setFilter({ model: v })}
                />
              </div>
              <div className="field f-dd">
                <label>Deal ID</label>
                <Dropdown
                  items={dealOptions(data.deals)}
                  ariaLabel="Deal ID"
                  value={filters.deal}
                  placeholder="All deals"
                  emptyLabel="All deals"
                  valueOf={(d) => d.id}
                  primary={(d) => d.id}
                  secondary={(d) => d.desc}
                  display={(d) => d.id}
                  search={(d) => `${d.id} ${d.desc}`}
                  onChange={(v) => setFilter({ deal: v })}
                />
              </div>
              <div className="field f-dd">
                <label>Deal Status</label>
                <Dropdown
                  items={LOOKUPS.dealStatus}
                  ariaLabel="Deal Status"
                  value={filters.status}
                  placeholder="All statuses"
                  emptyLabel="All statuses"
                  valueOf={(s) => s.code}
                  primary={(s) => `${s.code} · ${s.desc}`}
                  display={(s) => s.desc}
                  search={(s) => `${s.code} ${s.desc}`}
                  onChange={(v) => setFilter({ status: v })}
                />
              </div>
              <button className="btn btn-secondary" type="button" title="Restore search, filters, sort and selection" onClick={resetFilters}>
                Reset
              </button>
              <span className="btn-divider"></span>
              <button
                className={`btn btn-secondary${dropCls(dnd, 'btnViewSettlement', 'deal', !selected)}`}
                type="button"
                disabled={!selected}
                title="View settlement data of the selected deal"
                onClick={viewSettlement}
                {...dnd.drop('btnViewSettlement', 'deal', !selected, viewSettlement, wrongKind)}
              >
                View Settlement Data
              </button>
              <div className="toolbar-gap"></div>
              <span className="result-count">{loading ? 'Loading…' : loadError ? 'Unavailable' : total + (total === 1 ? ' deal' : ' deals')}</span>
            </div>

            <div className="table-scroll">
              <table className="mc-table" style={{ minWidth: 2200, display: gridState === 'ready' ? 'table' : 'none' }}>
                <thead>
                  <tr>
                    <th className="no-sort action-col pin pin-1"></th>
                    {DEAL_COLS.map((c) => {
                      const sorted = sort.field === c.key
                      const cls = `${c.num ? 'num ' : ''}${c.pin ? 'pin pin-2 ' : ''}${sorted ? 'sorted' : ''}`.trim()
                      return (
                        <th key={c.key} className={cls || undefined} aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button className="sort-button" type="button" onClick={() => setSort((s) => nextSort(s, c.key))}>{c.label}
                          <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const isSel = selected === d.id
                    const st = dealStatusInfo(d.status)
                    return (
                      <tr
                        key={d.id}
                        className={`${isSel ? 'selected' : ''}${dnd.dragging?.id === d.id ? ' dragging' : ''}`.trim() || undefined}
                        title="Click to select"
                        draggable={isSel}
                        onClick={() => setSelectedDealId(isSel ? null : d.id)}
                        onDragStart={(e) => {
                          if (!isSel) {
                            e.preventDefault()
                            return
                          }
                          dnd.start(e, 'deal', d.id, `${d.id} — ${d.model}`)
                        }}
                        onDragEnd={dnd.end}
                      >
                        <td className="action-col pin pin-1">
                          <input
                            type="checkbox"
                            className="row-select-checkbox"
                            aria-label={`Select deal ${d.id}`}
                            checked={isSel}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setSelectedDealId(e.target.checked ? d.id : null)}
                          />
                        </td>
                        {DEAL_COLS.map((c) => (
                          <td key={c.key} className={`${c.num ? 'num ' : ''}${c.cls ?? ''}${c.pin ? ' pin pin-2' : ''}`.trim() || undefined}>
                            {c.key === 'id' ? (
                              <a
                                className="deal-id-link"
                                href={`#deal-${encodeURIComponent(d.id)}`}
                                aria-haspopup="dialog"
                                title={`Open transactions and action items for deal ${d.id}`}
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  openDealRow(d.id)
                                }}
                              >
                                {d.id}
                              </a>
                            ) : c.status ? <span className={`status-text ${st.cls}`}>{st.desc}</span> : colText(c, d)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="empty-state" role="status" aria-busy={loading} style={{ display: gridState !== 'ready' ? 'block' : 'none' }}>
              <div className="big">&#128196;</div>
              <span>
                {loading
                  ? 'Loading Deal IDs from SAP…'
                  : loadError || (datesOk ? 'No deals match the selected settlement dates, filters or search.' : 'Enter a valid settlement date range to list deals.')}
              </span>
              {gridState === 'failed' ? <button type="button" className="btn btn-secondary" onClick={() => void reload()}>Retry loading deals</button> : null}
            </div>

            <div className="table-footer" style={{ display: loading || loadError ? 'none' : undefined }}>
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
                <span style={{ marginLeft: 10 }}>{`Showing ${from}–${to} of ${total}`}</span>
              </div>
              <div className="pagination">
                <button type="button" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                  {'‹'}
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button key={p} type="button" className={p === curPage ? 'active' : undefined} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button type="button" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                  {'›'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {popups.map((p, i) => renderPopup(p, i))}
      {status.element ? <OutcomeFocus opener={statusOpener.current}>{status.element}</OutcomeFocus> : null}

      <div className={toastCls} role="status" aria-live="polite">
        {toast.msg}
      </div>
    </div>
  )
}
