import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { FwdSsSpotPopup, NdfPopup, RatePopup, SettlementSpotPopup, SpotPopup, SsSpotPopup } from './ActionPopups.tsx'
import { DateField, Dropdown } from './controls.tsx'
import { loadWorkbench } from './api.ts'
import { DEFAULT_FILTERS, LOOKUPS, emptyData, setLookups } from './data.ts'
import { DealModal } from './DealModal.tsx'
import { dropCls, useDnd } from './dnd.ts'
import { WRITE_ACTIONS, openDeal, type Wb } from './flows.ts'
import { todayIso } from './format.ts'
import { KpiDetailModal, TxnDetailsModal } from './InfoModals.tsx'
import {
  DEAL_COLS,
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
import { ConfirmModal, type FrameProps, type Popup, type PopupSpec } from './modal.tsx'
import { isAbort } from '../../shared/fx/mw.ts'
import { useStatusPopup } from '../../shared/popup/Popup.tsx'
import './fo-trader-workbench.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-trader-workbench.dark.css'
import type { AppData, Filters, Sort, Toast, ToastKind } from './types.ts'

const PAGE_SIZES = [8, 12, 20, 50] as const
const DEFAULT_SORT: Sort = { field: 'id', dir: 'asc' }
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

  /* ---------- popup stack ---------- */
  const [popups, setPopups] = useState<Popup[]>([])
  /** The stack as last rendered, for handlers that act on it (Escape, replacing a deal popup). */
  const popupsRef = useRef(popups)
  useEffect(() => {
    popupsRef.current = popups
  }, [popups])
  const popupKey = useRef(0)
  const closeTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const closePopup = useCallback((key: number) => {
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
      setPopups((all) => [...all, { key, closing: false, spec }])
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
        setAppData(emptyData())
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
    post: (action) => {
      showToast(`WAITING FOR API — ${WRITE_ACTIONS[action]}. Nothing was posted to SAP.`, 'error')
      return false
    },
    get: () => dataRef.current,
    set: setAppData,
    toast: showToast,
    outcome: status.show,
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
  const dnd = useDnd(rootRef)

  const list = useMemo(() => filterSortDeals(data.deals, filters, search, sort), [data, filters, search, sort])
  const kpis = useMemo(() => computeKpis(data, list), [data, list])
  const errs = dateErrors(filters)
  const datesOk = !errs.from && !errs.to
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
  }
  /* Refresh = reload the whole workbench: reset data mutations + filters + open popups */
  const refreshWorkbench = () => {
    setPopups([])
    resetFilters()
    void reload(() => showToast('Workbench refreshed'))
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
    const frame: FrameProps = { depth, closing: p.closing, onClose: () => closePopup(p.key) }
    const s = p.spec
    switch (s.kind) {
      case 'deal':
        return <DealModal key={p.key} frame={frame} spec={s} wb={wb} dnd={dnd} txnNote={txnNote} onSelectTxn={(rfha) => updateSpec(p.key, { ...s, selectedRfha: rfha })} />
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
      <div className="app">
        <div className="page-header">
          <BackButton className="fx-back-btn" />
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Trader Workbench</h1>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" type="button" title="Reload the workbench and reset all demo changes" onClick={refreshWorkbench}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <div className="kpi-row" aria-label="Key indicators">
          {KPI_DEFS.map((def) => {
            const cls = def.valueCls?.(kpis)
            return (
              <div
                key={def.id}
                className={`kpi-card${def.tone ? ` tone-${def.tone}` : ''}`}
                tabIndex={0}
                role="button"
                title="Click for the breakdown"
                onClick={() => openPopup({ kind: 'kpi', id: def.id as KpiId })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openPopup({ kind: 'kpi', id: def.id })
                  }
                }}
              >
                <div className="kpi-label">{def.label}</div>
                <div className={`kpi-value${cls ? ` ${cls}` : ''}`}>{def.value(kpis)}</div>
                <div className="kpi-description">{def.desc(kpis)}</div>
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
                <DateField value={filters.from} onCommit={(v) => setFilter({ from: v })} />
                <div className="error-msg">{errs.from}</div>
              </div>
              <div className={`field f-date${errs.to ? ' has-error' : ''}`}>
                <label>
                  To<span className="req">*</span>
                </label>
                <DateField value={filters.to} onCommit={(v) => setFilter({ to: v })} />
                <div className="error-msg">{errs.to}</div>
              </div>
              <div className="field f-dd">
                <label>Model</label>
                <Dropdown
                  items={LOOKUPS.models}
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
              <span className="result-count">{total + (total === 1 ? ' deal' : ' deals')}</span>
            </div>

            <div className="table-scroll">
              <table className="mc-table" style={{ minWidth: 2200, display: total === 0 ? 'none' : 'table' }}>
                <thead>
                  <tr>
                    <th className="no-sort action-col pin pin-1"></th>
                    {DEAL_COLS.map((c) => {
                      const sorted = sort.field === c.key
                      const cls = `${c.num ? 'num ' : ''}${c.pin ? 'pin pin-2 ' : ''}${sorted ? 'sorted' : ''}`.trim()
                      return (
                        <th key={c.key} className={cls || undefined} onClick={() => setSort((s) => nextSort(s, c.key))}>
                          {c.label}
                          <span className="sort-ind">{sorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
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
            <div className="empty-state" style={{ display: total === 0 ? 'block' : 'none' }}>
              <div className="big">&#128196;</div>
              <span>
                {loading
                  ? 'Loading Deal IDs from SAP…'
                  : loadError || (datesOk ? 'No deals match the selected settlement dates, filters or search.' : 'Enter a valid settlement date range to list deals.')}
              </span>
            </div>

            <div className="table-footer">
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
      {status.element}

      <div className={toastCls} role="status" aria-live="polite">
        {toast.msg}
      </div>
    </div>
  )
}
