import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO } from '../../shared/fx/logo.ts'
import { PostDialog } from './ActionDialog.tsx'
import { ACTION_WAITING, AUTH_NOTE, loadCompanies, loadWorklistReason, type Option } from './api.ts'
import { BankModal } from './BankModal.tsx'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from './data.ts'
import { DatePicker } from './DatePicker.tsx'
import { DealTable } from './DealTable.tsx'
import { DocModal, TxnModal } from './DetailModals.tsx'
import {
  ALL,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  bankUpdateCheck,
  bankUpdateToast,
  ccyPairs,
  computeKpis,
  dealCountLabel,
  filterDeals,
  nextSort,
  pageOf,
  pagerWindow,
  postGuard,
  pruneSelection,
  selectedLabel,
  sortDeals,
  toggleBukrs,
  toggleSelected,
} from './logic.ts'
import { useModal } from './modal.tsx'
import './mo-bank-settlement-fx-non-flow.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-bank-settlement-fx-non-flow.dark.css'
// Hand-written deviation from the generated sheet (the drag hint's body class) — see inside.
import './mo-bank-settlement-fx-non-flow.overrides.css'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import type { ResultTone } from '../../shared/ui/ResultDialog.tsx'
import type {
  BankFilter,
  BankForm,
  Deal,
  DealAction,
  Filters,
  Sort,
  StatusFilter,
  Toast,
  ToastKind,
  UpdateLogEntry,
} from './types.ts'

const TOAST_MS = 3600

/**
 * MO: Bank Settlement: FX Non-Flow Deals (ZSGTSFR104 / ZSGTSF_RNFX_DEALFLOW). Company codes are
 * T001; the worklist, house banks and every action wait for an API — see api.ts. No sample data.
 */
export default function MoBankSettlementFxNonFlow() {
  // ZSGTSFV_FX worklist: WAITING FOR API (api.ts), so no deal is ever listed — never seed data.
  const [deals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<Option[]>([])
  const [worklistReason, setWorklistReason] = useState<string>('Loading from SAP…')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [sortArrow, setSortArrow] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [checkedId, setCheckedId] = useState<string | null>(null)
  const [openDp, setOpenDp] = useState<string | null>(null)

  // Modals and the deal each one is showing
  const txnModal = useModal()
  const docModal = useModal()
  const bankModal = useModal()
  const postModal = useModal()
  const [txnId, setTxnId] = useState<string | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const [bankId, setBankId] = useState<string | null>(null)
  const [bankSession, setBankSession] = useState(0)
  const [postId, setPostId] = useState<string | null>(null)

  // Drag and drop
  const draggedId = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DealAction | null>(null)

  const filtered = useMemo(() => sortDeals(filterDeals(deals, filters), sort), [deals, filters, sort])
  const pairs = useMemo(() => ccyPairs(deals), [deals])
  const kpis = useMemo(() => computeKpis(deals), [deals])
  const pg = pageOf(filtered, page, pageSize)
  const dealById = (id: string | null) => deals.find((d) => d.dealId === id) ?? null
  const companyNames = useMemo(() => Object.fromEntries(companies.map((c) => [c.value, c.title])), [companies])
  const emptyText = deals.length ? 'No deals match the current filters.' : worklistReason

  // Toast — the page opens with the load state.
  const [toast, setToast] = useState<Toast>(() => ({ message: 'Loading from SAP…', kind: '', show: true }))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Outcomes (SAP success / error / validation / waiting messages) show as the standard ResultDialog queue;
  // only the load-state hint and the plain "Refreshed" chatter stay on the small non-modal toast.
  const [results, setResults] = useState<ResultItem[]>([])
  const resultSeq = useRef(0)
  const dismissResult = useCallback((id: number) => setResults((r) => r.filter((x) => x.id !== id)), [])
  const showToast = useCallback((message: string, kind: ToastKind, quiet = false) => {
    if (quiet || kind === '') {
      clearTimeout(toastTimer.current)
      setToast({ message, kind, show: true })
      toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, kind: '', show: false })), TOAST_MS)
      return
    }
    const tone: ResultTone = kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info'
    const title = tone === 'success' ? 'Success' : tone === 'error' ? 'Error' : 'Information'
    setResults((r) => [...r, { id: ++resultSeq.current, tone, title, message }])
  }, [])
  useEffect(() => {
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, kind: '', show: false })), TOAST_MS)
    return () => clearTimeout(toastTimer.current)
  }, [])

  /** T001 for the Company Code chips, and the worklist reason (always WAITING FOR API today). */
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [comp, reason] = await Promise.all([loadCompanies(signal), loadWorklistReason(signal)])
      setCompanies(comp.state === 'ok' ? comp.value : [])
      setWorklistReason(comp.state === 'ok' ? reason : `${reason} ${comp.reason}`)
      if (comp.state === 'ok') console.info(`[nfx-dealflow] ${AUTH_NOTE}`)
      return reason
    },
    [],
  )
  useEffect(() => {
    const ctl = new AbortController()
    load(ctl.signal).catch((e: unknown) => {
      if ((e as { name?: string } | null)?.name !== 'AbortError') console.warn('[nfx-dealflow] load failed', e)
    })
    return () => ctl.abort()
  }, [load])

  // Escape closes every popup; a click outside a date picker closes it.
  const { close: closeTxn } = txnModal
  const { close: closeDoc } = docModal
  const { close: closeBank } = bankModal
  const { close: closePost } = postModal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeTxn()
      closeDoc()
      closeBank()
      closePost()
      setOpenDp(null)
    }
    const onClick = (e: MouseEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target]
      const insideDp = path.some((n) => n instanceof Element && n.classList.contains('dp'))
      if (!insideDp) setOpenDp(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [closeTxn, closeDoc, closeBank, closePost])

  // ------------------------------------------------------------------ filters
  /** The original's applyFilters(): new result set, back to page 1, selection kept only if still listed. */
  const commit = (next: Filters, nextDeals: Deal[] = deals) => {
    setFilters(next)
    setPage(1)
    setCheckedId((cur) => pruneSelection(cur, filterDeals(nextDeals, next)))
  }
  const patch = (p: Partial<Filters>) => commit({ ...filters, ...p })

  const onRefresh = () => {
    setCheckedId(null)
    setPage(1)
    load()
      .then((reason) => showToast(deals.length ? `Refreshed. ${filtered.length} deal(s) loaded.` : reason, 'info', deals.length > 0))
      .catch(() => showToast('Refresh failed — SAP could not be read.', 'error'))
  }

  const onSort = (key: 'valueDate') => {
    setSort(nextSort(sort, key))
    setSortArrow(true)
  }

  // ------------------------------------------------------------------ actions
  const askAssignBank = (id: string) => {
    setBankId(id)
    setBankSession((s) => s + 1)
    bankModal.open()
  }
  const askTestRun = (id: string) => {
    // RFTBBB00 / TBB1 test mode has no API: nothing runs.
    if (dealById(id)) showToast(ACTION_WAITING.test, 'info')
  }
  const askPost = (id: string) => {
    const d = dealById(id)
    if (!d) return
    const guard = postGuard(d)
    if (!guard.ok) {
      showToast(guard.message, guard.kind)
      return
    }
    setPostId(id)
    postModal.open()
  }
  const runAction = (action: DealAction, id: string) => {
    if (action === 'bank') askAssignBank(id)
    else if (action === 'test') askTestRun(id)
    else askPost(id)
  }

  const onBankUpdate = (form: BankForm): UpdateLogEntry[] => {
    const d = dealById(bankId)
    if (!d) return []
    // Validates as before; a complete leg would need BAPI_FTR_PAYDET_CREATE: nothing is changed.
    const logs = bankUpdateCheck(d, form, ACTION_WAITING.bank)
    if (!logs.length) return []
    const t = bankUpdateToast(logs, ACTION_WAITING.bank)
    showToast(t.message, t.kind)
    return logs
  }

  const onPostConfirm = () => {
    if (!dealById(postId)) return
    // RFTBBB00 / TBB1 has no API: no document is created and the deal is not changed.
    postModal.close()
    showToast(ACTION_WAITING.post, 'info')
  }

  // ------------------------------------------------------------------ drag a selected row onto an action
  const endDrag = () => {
    draggedId.current = null
    setDraggingId(null)
    setDragOver(null)
  }
  const onDragStart = (e: DragEvent<HTMLTableRowElement>, id: string) => {
    if (checkedId !== id) {
      e.preventDefault()
      return
    }
    draggedId.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }
  const dropProps = (action: DealAction) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedId.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDragEnter: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedId.current) return
      e.preventDefault()
      setDragOver(action)
    },
    onDragLeave: () => setDragOver((cur) => (cur === action ? null : cur)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      const id = draggedId.current
      endDrag()
      if (!id) return
      setCheckedId(id)
      runAction(action, id)
    },
  })
  const dragCls = (action: DealAction) => (dragOver === action ? ' drag-over' : '')

  const hasSel = !!checkedId
  const win = pagerWindow(pg.page, pg.totalPages)

  return (
    <div className={`mo-bank-settlement-fx-non-flow${draggingId !== null ? ' row-dragging' : ''}`}>
      <div className="page-head">
        <BackButton className="btn-icon" label="" />
        <img className="head-icon" src={FX_LOGO} alt="Company logo" />
        <div className="title-wrap">
          <div className="page-title">Bank Settlement: FX Non-Flow Deals</div>
        </div>
        <div className="head-actions">
          <button className="btn-icon" type="button" title="Refresh" onClick={onRefresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <SignOutButton className="btn-icon" label="" />
        </div>
      </div>

      <main>
        <div className="metrics-grid" id="kpi-grid">
          <div className="metric-card k-total">
            <div className="metric-inner">
              <div className="metric-val">{kpis.total}</div>
              <div className="metric-lbl">Total Deals</div>
            </div>
          </div>
          <div className="metric-card k-pending">
            <div className="metric-inner">
              <div className="metric-val">{kpis.awaiting}</div>
              <div className="metric-lbl">Awaiting Bank Details</div>
            </div>
          </div>
          <div className="metric-card k-confirmed">
            <div className="metric-inner">
              <div className="metric-val">{kpis.ready}</div>
              <div className="metric-lbl">Ready for TBB1 Post</div>
            </div>
          </div>
          <div className="metric-card k-inuse">
            <div className="metric-inner">
              <div className="metric-val">{kpis.settled}</div>
              <div className="metric-lbl">Settled</div>
            </div>
          </div>
        </div>

        <div className="panel" id="workbench-panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet"></span>
              <h2>FX Non-Flow Deals</h2>
            </div>
            <span className="badge-blue" id="result-count-badge">
              {dealCountLabel(filtered.length)}
            </span>
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            <div className="explain">
              <b>Notes:</b> This program is used for settling Deal IDs that are unwinding/cancelled, as well as Deal IDs marked as{' '}
              <span
                className="term-def"
                title="A Deal ID whose FX legs never produce a separate trade invoice chain — the cash settlement is handled directly from this program instead."
              >
                no-invoicing
              </span>
              .
            </div>
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
                id="f-search"
                type="text"
                placeholder="Search Deal ID, Txn No, counterparty, trader..."
                value={filters.search}
                onChange={(e) => patch({ search: e.target.value })}
              />
            </div>
            <div className="filter-panel-body" id="filter-panel-body">
              <div className="filter-bar">
                <div className="filter-field">
                  <label>Company Code</label>
                  <div className="chip-group" id="f-bukrs-group">
                    {[ALL, ...companies.map((c) => c.value)].map((code) => (
                      <button
                        key={code}
                        type="button"
                        className={`chip-toggle${filters.bukrs.includes(code) ? ' active' : ''}`}
                        data-code={code}
                        title={code === ALL ? undefined : companyNames[code]}
                        onClick={() => patch({ bukrs: toggleBukrs(filters.bukrs, code) })}
                      >
                        {code === ALL ? 'All' : code}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-field">
                  <label>Value Date Range</label>
                  <div className="date-range">
                    <DatePicker
                      id="s-date-from"
                      value={filters.dateFrom}
                      open={openDp === 's-date-from'}
                      onOpenChange={(o) => setOpenDp(o ? 's-date-from' : null)}
                      onPick={(v) => patch({ dateFrom: v })}
                    />
                    <span>to</span>
                    <DatePicker
                      id="s-date-to"
                      value={filters.dateTo}
                      open={openDp === 's-date-to'}
                      onOpenChange={(o) => setOpenDp(o ? 's-date-to' : null)}
                      onPick={(v) => patch({ dateTo: v })}
                    />
                  </div>
                </div>
                <div className="filter-field status-filter">
                  <label htmlFor="f-bank">Bank Details</label>
                  <select id="f-bank" value={filters.bank} onChange={(e) => patch({ bank: e.target.value as BankFilter })}>
                    <option value="ALL">All</option>
                    <option value="NOT_ASSIGNED">Not assigned</option>
                    <option value="ASSIGNED">Assigned</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-status">Status</label>
                  <select id="f-status" value={filters.status} onChange={(e) => patch({ status: e.target.value as StatusFilter })}>
                    <option value="ALL">All statuses</option>
                    <option value="Unmatured">Unmatured</option>
                    <option value="Matured">Matured</option>
                    <option value="Settled">Settled</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor="f-ccy">Ccy Pair</label>
                  <select id="f-ccy" value={filters.ccy} onChange={(e) => patch({ ccy: e.target.value })}>
                    <option value="ALL">All pairs</option>
                    {pairs.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-reset-wrap">
                  <span className="filter-spacer-label">Action</span>
                  <button className="filter-reset" type="button" onClick={() => commit(DEFAULT_FILTERS)}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="common-actions">
                <button
                  className={`common-btn approve drag-target${dragCls('bank')}`}
                  id="btn-bank-sel"
                  type="button"
                  disabled={!hasSel}
                  onClick={() => checkedId && askAssignBank(checkedId)}
                  title="Assign house bank & account for the selected deal, or drag a row here"
                  {...dropProps('bank')}
                >
                  Assign House Bank &amp; Acc ID
                </button>
                <button
                  className={`common-btn drag-target${dragCls('test')}`}
                  id="btn-test-sel"
                  type="button"
                  disabled={!hasSel}
                  style={{ background: '#fff', color: 'var(--primary-dark)', border: '1px solid var(--border-strong)' }}
                  onClick={() => checkedId && askTestRun(checkedId)}
                  title="TBB1 test run (simulation only), or drag a row here"
                  {...dropProps('test')}
                >
                  TBB1 Test Run
                </button>
                <button
                  className={`common-btn reject drag-target${dragCls('post')}`}
                  id="btn-post-sel"
                  type="button"
                  disabled={!hasSel}
                  style={{ background: '#fff', color: 'var(--success)', border: '1px solid #BFE6CE' }}
                  onClick={() => checkedId && askPost(checkedId)}
                  title="TBB1 post the settlement, or drag a row here"
                  {...dropProps('post')}
                >
                  TBB1 Post
                </button>
                <span className="selected-count" id="selected-count">
                  {selectedLabel(checkedId)}
                </span>
              </div>
            </div>
          </div>

          <DealTable
            rows={pg.rows}
            companies={companyNames}
            emptyText={emptyText}
            checkedId={checkedId}
            draggingId={draggingId}
            sort={sort}
            showArrow={sortArrow}
            onSort={onSort}
            onRowClick={(id) => setCheckedId((cur) => toggleSelected(cur, id))}
            onViewTxn={(id) => {
              setTxnId(id)
              txnModal.open()
            }}
            onViewDoc={(id) => {
              if (!dealById(id)?.fiDoc) return
              setDocId(id)
              docModal.open()
            }}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
          />

          <div className="pager">
            <div className="pager-size">
              Rows per page
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE)}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="pager-controls" id="pager-controls">
              <button className="pager-btn" type="button" onClick={() => setPage(1)} disabled={pg.page === 1}>
                «
              </button>
              <button className="pager-btn" type="button" onClick={() => setPage(pg.page - 1)} disabled={pg.page === 1}>
                ‹
              </button>
              {win.map((p) => (
                <button key={p} className={`pager-btn${p === pg.page ? ' active' : ''}`} type="button" onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pager-btn" type="button" onClick={() => setPage(pg.page + 1)} disabled={pg.page === pg.totalPages}>
                ›
              </button>
              <button className="pager-btn" type="button" onClick={() => setPage(pg.totalPages)} disabled={pg.page === pg.totalPages}>
                »
              </button>
            </div>
            <div className="pager-info" id="pager-info">
              Showing{' '}
              <strong>
                {pg.start}–{pg.end}
              </strong>{' '}
              of <strong>{filtered.length}</strong>
            </div>
          </div>

          <div className="note">
            <strong>Deal ID</strong> is the Treasury-wide key assigned once an FX deal is linked to a Master Contract.{' '}
            <strong>Txn No</strong> is the underlying SAP TRM transaction (RFHA) — click it to view the transaction. Once house bank &amp;
            account are assigned, <strong>TBB1 Post</strong> creates the settlement document for both legs on the same value date.
          </div>
        </div>
      </main>

      <TxnModal modal={txnModal} deal={dealById(txnId)} companies={companyNames} />
      <DocModal modal={docModal} deal={dealById(docId)} />
      <BankModal
        modal={bankModal}
        deal={dealById(bankId)}
        session={bankSession}
        onUpdate={onBankUpdate}
        onClosed={() => commit(filters)}
      />
      <PostDialog modal={postModal} deal={dealById(postId)} onConfirm={onPostConfirm} />

      <ResultQueue items={results} onDismiss={dismissResult} />

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.kind ? ` ${toast.kind}` : ''}`} id="toast">
        {toast.message}
      </div>
    </div>
  )
}
