import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { isAbort } from '../../shared/fx/mw.ts'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { CorrectionModal } from './CorrectionModal.tsx'
import { correctTxn, loadQueue, patchLabels, reverseTxns, sapMessage, toCorrectionPatch } from './api.ts'
import { DatePicker } from './DatePicker.tsx'
import { fmtNum, parseAmountShorthand } from './format.ts'
import { FX_LOGO as COMPANY_LOGO } from '../../shared/fx/logo.ts'
import {
  CSV_FILENAME,
  DEFAULT_FILTERS,
  buildCsv,
  checkedTxns,
  correctionTarget,
  deriveAmount2,
  deriveProfitCenter,
  dragPayload,
  dropOutcome,
  filterTxns,
  formFromTxn,
  isActionable,
  nextSort,
  normaliseRate,
  pageOf,
  pagerWindow,
  resolveReverseScope,
  reverseToast,
  setPageChecked,
  toggleChecked,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { ReverseModal } from './ReverseModal.tsx'
import { TxnTable } from './TxnTable.tsx'
import './fo-fx-error-correction.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-fx-error-correction.dark.css'
// Hand-written deviations from the generated sheet (the drag hint's body class) — see inside.
import './fo-fx-error-correction.overrides.css'
import type {
  CorrectionForm,
  DropAction,
  Filters,
  PickerId,
  ReverseScope,
  Sort,
  SortKey,
  StatusFilter,
  Toast,
  ToastKind,
  Txn,
} from './types.ts'

const DEFAULT_SORT: Sort = { key: 'rfha', dir: -1 } // descending, newest first
const DEFAULT_PAGE_SIZE = 15
const TOAST_MS = 3400
const EMPTY_FORM: CorrectionForm = {
  partner: '',
  allInRate: '',
  swapRate: '',
  spotRate: '',
  amount1: '',
  amount2: '',
  valueDate: '',
  busArea: '',
  profitCenter: '',
  acctCat: '',
  modeOfTrade: '',
  mc: '',
  dealId: '',
  tradeDate: '',
  blotterDate: '',
}
const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * EC2: TSF FO Error Correction - FX (ZSGTSFR052), converted from
 * legacy/fx-fo-error-correction.html.
 *
 * Front Office sees the FX transactions Mid-Office sent back (Correction Required), corrects
 * one through the SAP-style Old Details / New Details popup (released to MO) or reverses one
 * or more. The original never called an API, so this is the same UI-only screen: the rows
 * live in component state for the session and Refresh restores the seed data.
 */
export default function FoFxErrorCorrection() {
  const [txns, setTxns] = useState<Txn[]>([])
  /** The queue is read from SAP; nothing stands in for it while it loads or when it cannot be read. */
  const [load, setLoad] = useState<{ state: 'loading' } | { state: 'ok' } | { state: 'error'; message: string }>({ state: 'loading' })
  /** True while a change or reversal is running in SAP, so a second click cannot send it twice. */
  const busy = useRef(false)

  // Selection criteria and table
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>('ALL')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  /** Row order a header click sorted from, so ties keep it (see sortTxns). */
  const [prior, setPrior] = useState<string[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  /** Selected rfhas, in the order they were ticked. */
  const [checked, setChecked] = useState<string[]>([])
  const [filtersCollapsed, setFiltersCollapsed] = useState(false)
  const [openPicker, setOpenPicker] = useState<PickerId | null>(null)

  // FX Error Correction popup
  const correctionModal = useModal()
  const [correcting, setCorrecting] = useState<Txn | null>(null)
  const [form, setForm] = useState<CorrectionForm>(EMPTY_FORM)

  // Reverse popup
  const reverseModal = useModal()
  const [reverseScope, setReverseScope] = useState<ReverseScope>('bulk')
  const [reversing, setReversing] = useState<Txn[]>([])
  const [reason, setReason] = useState('')

  // Drag and drop
  const draggedRfhas = useRef<string[]>([])
  const [draggingRow, setDraggingRow] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DropAction | null>(null)

  const rows = useMemo(() => filterTxns(txns, filters, statusFilter, sort, prior), [txns, filters, statusFilter, sort, prior])
  const selected = checkedTxns(txns, checked)
  const paged = pageOf(rows, page, pageSize)

  // Toast — the page opened with a "Ready" message.
  const [toast, setToast] = useState<Toast>(() => ({
    message: 'Reading the FX transactions from SAP...',
    kind: '',
    show: true,
  }))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideToast = useCallback(() => setToast((t) => ({ ...t, kind: '', show: false })), [])
  const showToast = useCallback(
    (message: string, kind: ToastKind) => {
      clearTimeout(toastTimer.current)
      setToast({ message, kind, show: true })
      toastTimer.current = setTimeout(hideToast, TOAST_MS)
    },
    [hideToast],
  )
  useEffect(() => {
    toastTimer.current = setTimeout(hideToast, TOAST_MS)
    return () => clearTimeout(toastTimer.current)
  }, [hideToast])

  /** Reads the queue from SAP; returns whether it succeeded. */
  const loadRows = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const rows = await loadQueue(signal)
      setTxns(rows)
      setLoad({ state: 'ok' })
      return true
    } catch (e) {
      if (isAbort(e)) return false
      setLoad({ state: 'error', message: sapMessage(e) })
      return false
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void loadRows(ac.signal)
    return () => ac.abort()
  }, [loadRows])

  /**
   * What the page's applyFilters did besides filtering (which is derived here): back to page
   * one, and the list rebuilt from the queue order before sorting.
   */
  const refilter = () => {
    setPage(1)
    setPrior(null)
  }

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    refilter()
  }

  const setStatusFilter = (key: StatusFilter) => {
    setStatusFilterState(key)
    refilter()
  }

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setStatusFilter('ALL')
  }

  const onSort = (key: SortKey) => {
    setPrior(rows.map((t) => t.rfha))
    setSort((s) => nextSort(s, key))
  }

  /** Hard refresh: the queue read again from SAP, selection, sort, paging and filters reset. */
  const hardRefresh = async () => {
    if (busy.current) return
    busy.current = true
    try {
      setChecked([])
      setSort(DEFAULT_SORT)
      setPageSize(DEFAULT_PAGE_SIZE)
      resetFilters()
      const ok = await loadRows()
      showToast(ok ? 'Refreshed from SAP. Filters reset.' : 'Could not read the queue from SAP.', ok ? '' : 'error')
    } finally {
      busy.current = false
    }
  }

  /** The company codes in the queue, named from the company master. */
  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of txns) if (!seen.has(t.coCode)) seen.set(t.coCode, t.companyName)
    return [...seen].sort(([a], [b]) => a.localeCompare(b))
  }, [txns])

  const exportCsv = () => {
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = CSV_FILENAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} row(s) to CSV.`, 'success')
  }

  // ------------------------------------------------------------------ keyboard / outside clicks

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (e.key === 'Escape') {
      correctionModal.close()
      reverseModal.close()
      setOpenPicker(null)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    // A click anywhere outside a date picker closes whichever calendar is open.
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.dp'))) setOpenPicker(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  // ------------------------------------------------------------------ selection

  const onToggleRow = (t: Txn) => {
    if (!isActionable(t)) return
    setChecked((c) => toggleChecked(c, t, !c.includes(t.rfha)))
  }

  // ------------------------------------------------------------------ FX Error Correction

  const openCorrection = (rfha: string) => {
    const t = txns.find((m) => m.rfha === rfha)
    if (!t) return
    setCorrecting(t)
    setForm(formFromTxn(t))
    correctionModal.open()
  }

  const clickCorrectionAction = () => {
    const target = correctionTarget(selected)
    if ('error' in target) showToast(target.error, 'error')
    else openCorrection(target.rfha)
  }

  const changeForm = (patch: Partial<CorrectionForm>) => setForm((f) => ({ ...f, ...patch }))

  const onAmountBlur = () =>
    setForm((f) => {
      const amount1 = fmtNum(parseAmountShorthand(f.amount1))
      return { ...f, amount1, amount2: deriveAmount2(amount1, f.allInRate) }
    })

  const onRateBlur = (key: 'allInRate' | 'swapRate' | 'spotRate') =>
    setForm((f) => {
      const next = { ...f, [key]: normaliseRate(f[key]) }
      if (key === 'allInRate') next.amount2 = deriveAmount2(next.amount1, next.allInRate)
      return next
    })

  const onBusinessAreaChange = (busArea: string) => changeForm({ busArea, profitCenter: deriveProfitCenter(busArea) })

  const submitCorrection = async () => {
    const t = correcting ? txns.find((m) => m.rfha === correcting.rfha) : undefined
    if (!t || !isActionable(t)) {
      correctionModal.close()
      return
    }
    const patch = toCorrectionPatch(t, form)
    if (!Object.keys(patch).length) {
      showToast('Nothing was changed.', 'error')
      return
    }
    if (busy.current) return
    busy.current = true
    try {
      await correctTxn(t, patch)
    } catch (e) {
      // SAP refused: the popup stays open with what was typed.
      showToast(`SAP did not change transaction ${t.rfha}: ${sapMessage(e)}`, 'error')
      busy.current = false
      return
    }
    try {
      setChecked((c) => c.filter((r) => r !== t.rfha))
      correctionModal.close()
      const changed = Object.keys(patch).map((k) => patchLabels[k] ?? k).join(', ')
      const refreshed = await loadRows()
      showToast(
        `Transaction ${t.rfha} changed in SAP (${changed}).${refreshed ? '' : ' The list could not be re-read; use Refresh.'}`,
        refreshed ? 'success' : 'error',
      )
      refilter()
    } finally {
      busy.current = false
    }
  }

  // ------------------------------------------------------------------ reverse

  const askReverse = (scope: ReverseScope) => {
    const ts = resolveReverseScope(txns, scope, checked)
    if (!ts.length) return
    setReverseScope(scope)
    setReversing(ts)
    setReason('')
    reverseModal.open()
  }

  const clickReverseAction = () => {
    if (!selected.length) {
      showToast('Select at least one Correction Required transaction first.', 'error')
      return
    }
    askReverse('bulk')
  }

  const switchToReverseFromCorrection = () => {
    correctionModal.close()
    if (correcting) askReverse(correcting.rfha)
  }

  const confirmReverse = async () => {
    if (busy.current) return
    busy.current = true
    try {
      const ts = resolveReverseScope(txns, reverseScope, checked)
      const outcome = await reverseTxns(ts)
      const done = ts.filter((t) => outcome.reversed.includes(t.rfha))
      setChecked((c) => c.filter((r) => !outcome.reversed.includes(r)))
      if (outcome.failed) {
        const rest = ts.length - done.length
        showToast(
          `${done.length ? `${reverseToast(done)} ` : ''}SAP refused to reverse ${outcome.failed.rfha}: ${outcome.failed.reason}${rest > 1 ? ` (${rest - 1} more not attempted)` : ''}`,
          'error',
        )
      } else {
        showToast(reverseToast(done), 'error')
      }
      if (done.length) {
        reverseModal.close()
        correctionModal.close()
        await loadRows()
        refilter()
      }
    } finally {
      busy.current = false
    }
  }

  // ------------------------------------------------------------------ drag a row onto an action

  const endDrag = () => {
    draggedRfhas.current = []
    setDraggingRow(null)
    setDragOver(null)
  }

  const onDragStart = (e: DragEvent<HTMLTableRowElement>, t: Txn) => {
    const payload = dragPayload(t, checked, selected)
    if (!payload.length) {
      e.preventDefault()
      return
    }
    draggedRfhas.current = payload
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', payload.join(','))
    setDraggingRow(t.rfha)
  }

  const dropTarget = (action: DropAction) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => e.preventDefault(),
    onDragEnter: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(action)
    },
    onDragLeave: () => setDragOver((cur) => (cur === action ? null : cur)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      const outcome = dropOutcome(action, draggedRfhas.current)
      endDrag()
      if (outcome.kind === 'correct') openCorrection(outcome.rfha)
      else if (outcome.kind === 'reverse') askReverse(outcome.rfhas)
      else if (outcome.kind === 'error') showToast(outcome.message, 'error')
    },
  })

  // ------------------------------------------------------------------ render

  // Until SAP has answered there is nothing to show, and on a failure nothing is made up in its place.
  if (load.state !== 'ok') {
    return (
      <div className="fo-fx-error-correction">
        <div className="topbar">
          <BackButton className="btn-outline" />
          <span className="topbar-title">EC2: TSF FO Error Correction</span>
          <span className="topbar-code">FX</span>
          <div className="topbar-right">
            <SignOutButton className="btn-outline" />
          </div>
        </div>
        <main style={{ padding: 24 }}>
          {load.state === 'loading' ? (
            <div role="status">Reading the FX transactions from SAP…</div>
          ) : (
            <div role="alert">
              <p>{load.message}</p>
              <p>The queue is read from SAP and nothing has been substituted for it.</p>
              <button
                className="btn-outline"
                type="button"
                onClick={() => {
                  setLoad({ state: 'loading' })
                  void loadRows()
                }}
              >
                Retry
              </button>
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className={`fo-fx-error-correction${draggingRow !== null ? ' row-dragging' : ''}`}>
      <div className="topbar">
        <BackButton className="btn-outline" />
        <img className="topbar-logo" src={COMPANY_LOGO} alt="Company logo" />
        <span className="topbar-title">EC2: TSF FO Error Correction</span>
        <span className="topbar-code">FX</span>
        <div className="topbar-right">
          <span className="status-dot" title="Read from SAP" />
          <button className="btn-outline" onClick={() => void hardRefresh()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
          <SignOutButton className="btn-outline" />
        </div>
      </div>

      <main>
        <div className="panel">
          <div className="panel-head">
            <div className="panel-head-left">
              <h2>FX Transactions &mdash; Front Office Queue</h2>
              <span className="record-count badge-blue" id="result-count-badge">
                {rows.length} transaction{plural(rows.length)}
              </span>
            </div>
            <div className="panel-head-right">
              <button className="btn-icon" id="btn-toggle-filters" onClick={() => setFiltersCollapsed((c) => !c)} title="Show/hide filters">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 5h16M7 12h10M10 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <button className="btn-icon" onClick={exportCsv} title="Download CSV">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="master-toolbar">
            <div id="filter-panel-body" className={filtersCollapsed ? 'collapsed' : undefined}>
              <div className="filter-bar">
                <div className="filter-field search-field">
                  <label>&nbsp;</label>
                  <div className="search-box">
                    <span className="icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                        <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      id="f-search"
                      type="text"
                      placeholder="Search transaction, deal ID, partner, remark..."
                      value={filters.q}
                      onChange={(e) => setFilter({ q: e.target.value })}
                    />
                  </div>
                </div>

                <div className="filter-scroll">
                  <div className="filter-field status-filter">
                    <label htmlFor="f-status">Status</label>
                    <select id="f-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                      <option value="ALL">All statuses</option>
                      <option value="OPEN">Open (status not in SAP)</option>
                      <option value="REVERSED">Reversed</option>
                    </select>
                  </div>
                  <div className="filter-field entity-filter">
                    <label htmlFor="f-cocode">Company Code</label>
                    <select id="f-cocode" value={filters.coCode} onChange={(e) => setFilter({ coCode: e.target.value })}>
                      <option value="ALL">All company codes</option>
                      {companyOptions.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name ? `${code} - ${name}` : code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-field">
                    <label htmlFor="f-trader">Trader</label>
                    <select id="f-trader" value="ALL" disabled title="SAP does not record the trader on a transaction">
                      <option value="ALL">Not held in SAP</option>
                    </select>
                  </div>
                  <div className="filter-field">
                    <label>Display Type</label>
                    <div className="seg-group">
                      <button type="button" className="seg active" title="This build is scoped to FX">
                        FX
                      </button>
                      <button type="button" className="seg" disabled title="Options are handled on the separate EC2 Options queue">
                        Options
                      </button>
                    </div>
                  </div>
                  <div className="filter-field">
                    <label>Upto Blotter Date</label>
                    <div className="date-range">
                      <DatePicker
                        id="f-date-from"
                        value={filters.dateFrom}
                        open={openPicker === 'f-date-from'}
                        onOpenChange={(o) => setOpenPicker(o ? 'f-date-from' : null)}
                        onPick={(v) => setFilter({ dateFrom: v })}
                      />
                      <span>to</span>
                      <DatePicker
                        id="f-date-to"
                        value={filters.dateTo}
                        open={openPicker === 'f-date-to'}
                        onOpenChange={(o) => setOpenPicker(o ? 'f-date-to' : null)}
                        onPick={(v) => setFilter({ dateTo: v })}
                      />
                    </div>
                  </div>
                  <div className="filter-reset-wrap">
                    <span className="filter-spacer-label">Action</span>
                    <button className="filter-reset" onClick={resetFilters}>
                      Reset
                    </button>
                  </div>
                </div>

                <div className="filter-field actions-field">
                  <label>&nbsp;</label>
                  <div className="drag-actions-group">
                    <button
                      type="button"
                      className={`drag-target correction${dragOver === 'correction' ? ' drag-over' : ''}`}
                      id="drop-correction"
                      onClick={clickCorrectionAction}
                      title="Drag an open row here"
                      {...dropTarget('correction')}
                    >
                      FX Error Correction
                    </button>
                    <button
                      type="button"
                      className={`drag-target reverse${dragOver === 'reverse' ? ' drag-over' : ''}`}
                      id="drop-reverse"
                      onClick={clickReverseAction}
                      title="Drag one or more open rows here"
                      {...dropTarget('reverse')}
                    >
                      Reverse
                    </button>
                    <span
                      className="selected-count"
                      id="selected-count"
                      title={selected.length ? 'Drag a selected row onto FX Error Correction or Reverse' : ''}
                    >
                      {selected.length} selected
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <TxnTable
              rows={paged.rows}
              sort={sort}
              checked={checked}
              draggingRow={draggingRow}
              onSort={onSort}
              onToggleRow={onToggleRow}
              onCheck={(t, on) => setChecked((c) => toggleChecked(c, t, on))}
              onCheckAll={(on) => setChecked((c) => setPageChecked(c, paged.rows, on))}
              onOpen={(t) => openCorrection(t.rfha)}
              onReverse={(t) => askReverse(t.rfha)}
              onDragStart={onDragStart}
              onDragEnd={endDrag}
            />
          </div>
          <div className="pager" id="pager">
            <div className="pager-size">
              <span>Rows per page</span>
              <select
                id="pager-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE)
                  setPage(1)
                }}
              >
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="pager-controls" id="pager-controls">
              <button className="pager-btn" disabled={paged.page <= 1} onClick={() => setPage(1)}>
                «
              </button>
              <button className="pager-btn" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                ‹
              </button>
              {pagerWindow(paged.page, paged.totalPages).map((p) => (
                <button key={p} className={`pager-btn ${p === paged.page ? 'active' : ''}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pager-btn" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)}>
                ›
              </button>
              <button className="pager-btn" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.totalPages)}>
                »
              </button>
            </div>
            <div className="pager-info" id="pager-info">
              {rows.length ? (
                <>
                  Showing{' '}
                  <strong>
                    {paged.first}-{paged.last}
                  </strong>{' '}
                  of <strong>{rows.length}</strong>
                </>
              ) : (
                'No records'
              )}
            </div>
          </div>
          <div className="note">
            <strong>Note:</strong> This list is read from <strong>SAP</strong> (the FX transaction service). SAP does not record whether
            Mid-Office sent a transaction back, so there is no <em>Correction Required</em> status to show: every live transaction is
            <strong> Open</strong>, and only a transaction SAP reversed is <strong>Reversed</strong>. The MO remark, trader, mode of
            trade, account category, business area, profit center and blotter date are not held in SAP either, so they are blank
            and cannot be edited here. <strong>FX Error Correction</strong> changes the rates, Amount 1, Value Date and Trade Date
            in SAP; <strong>Reverse</strong> reverses the transaction in SAP.
            <br />
            <br />
            Each row here is one <strong>FX financial transaction</strong> (Transaction No), not a Master
            Contract or a Deal in the abstract &mdash; a Deal ID commonly has <strong>two</strong> transaction rows (e.g. one booked
            at the OGA/Singapore leg and one at the DMCC/Dubai leg) that together form the offsetting pair. Only open rows can be selected; this queue is scoped to <strong>Display Type: FX</strong> &mdash; Options-type transactions are
            handled on the separate Options queue and are not shown here.
            <div className="term-glossary">
              <span>
                <b>Deal ID</b> &ndash; the Front Office booking identifier that links two offsetting transactions.
              </span>
              <span>
                <b>Transaction No</b> &ndash; the individual SAP TRM financial transaction (rfha) this screen corrects.
              </span>
              <span>
                <b>Master Contract</b> &ndash; the underlying trade contract this transaction&apos;s FX exposure is booked against.
              </span>
            </div>
          </div>
        </div>
      </main>

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.kind ? ` ${toast.kind}` : ''}`} id="toast">
        {toast.message}
      </div>

      <CorrectionModal
        modal={correctionModal}
        txn={correcting}
        form={form}
        openPicker={openPicker}
        onPickerChange={setOpenPicker}
        onChange={changeForm}
        onAmountBlur={onAmountBlur}
        onRateBlur={onRateBlur}
        onBusinessAreaChange={onBusinessAreaChange}
        onUpdate={() => void submitCorrection()}
        onReverseInstead={switchToReverseFromCorrection}
      />

      <ReverseModal modal={reverseModal} txns={reversing} reason={reason} onReasonChange={setReason} onConfirm={() => void confirmReverse()} />
    </div>
  )
}
