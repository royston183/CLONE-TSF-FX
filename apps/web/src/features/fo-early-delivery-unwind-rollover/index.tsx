import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { DealTable } from './DealTable.tsx'
import { WAITING, loadBankPartners, loadDealLegs, loadInrInvoiceAmount, loadTxnTypes } from './api.ts'
import { realDeps } from './deps.ts'
import {
  canResume,
  describeFailure,
  runPremature,
  sendRolloverNotification,
  shouldNotifyRollover,
  type PrematureInput,
  type PrematureResult,
  type Progress,
} from './premature.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_STATE_NO_DEAL,
  EMPTY_STATE_NO_MATCH,
  PAGE_SIZES,
  MSG,
  applyPairEdit,
  applyUnwindEdit,
  dragGhostText,
  emptyPairForm,
  emptyUnwindForm,
  filterSort,
  gateEarly,
  gateRollover,
  gateUnwind,
  kpis,
  loadToast,
  nextSort,
  normalizeDealId,
  paginate,
  pairFormFor,
  sapeventUrl,
  statusOptions,
  toggleSelection,
  txnCount,
  typeFilterOptions,
  unwindFormFor,
  validateEarly,
  validateRollover,
  validateUnwind,
  viewTxnEvent,
  withInvoiceAmount,
} from './logic.ts'
import { useModal } from './modal.tsx'
import { PairModal } from './PairModal.tsx'
import { UnwindModal } from './UnwindModal.tsx'
import './fo-early-delivery-unwind-rollover.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './fo-early-delivery-unwind-rollover.dark.css'
import type { Avail, DdOption, Filters, Leg, PairForm, Sort, SortField, Toast, ToastKind, UnwindForm } from './types.ts'

const TOAST_MS = 3200
/** A failure names the stage and what is already created; it needs longer on screen. */
const FAILURE_TOAST_MS = 12000
const FLASH_MS = 1800

type DropTarget = 'early' | 'unwind' | 'roll'
type Banner = { dealId: string; count: string; cpair: string } | { dealId: string; waiting: string }

/** Where the legacy fired `window.location.href = 'sapevent:…'`; inside the SPA that would navigate away. */
function fireSapevent(event: string) {
  console.info('[SAP Event]', sapeventUrl(event))
}

/**
 * ZSGTSFP015: FO Create Early Delivery / Unwinding / Rollover ("Premature Settlement"),
 * converted from legacy/unwindroll.html.
 *
 * Reads (see api.ts): the Deal ID's legs from TrmFxApp + FxTransaction, the Txn Type help from TVARVC and the
 * Bank BP help from ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT for the leg's trader group. Whatever the middleware cannot
 * serve shows as WAITING FOR API with the reason.
 *
 * The three actions — Early Delivery (screen 9001), Unwinding (9002) and Rollover (9003) — run through
 * premature.ts: standard FX create for the new transactions, APP_STR for their status / flags / remark, the Deal ID
 * slot for the replacement. They are separate flows with separate statuses, and a failure part-way keeps what was
 * created so a second Submit continues instead of creating the transactions again. Afterwards the Deal ID is read
 * back from SAP; nothing is rebuilt from local state.
 */
export default function FoEarlyDeliveryUnwindRollover() {
  const rootRef = useRef<HTMLDivElement>(null)

  const [dealInput, setDealInput] = useState('')
  const [legs, setLegs] = useState<Leg[]>([])
  const [selectedRfha, setSelectedRfha] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [banner, setBanner] = useState<Banner | null>(null)
  const loadedDeal = useRef('')
  /** An action that stopped part-way: its progress, so Submit again continues rather than starting over. */
  const resume = useRef<{ key: string; progress: Progress } | null>(null)
  const submitting = useRef(false)
  const [bannerShown, setBannerShown] = useState(false)

  const [toast, setToast] = useState<Toast>({ msg: '', kind: undefined })
  const [toastShown, setToastShown] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [flashRfha, setFlashRfha] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const draggedLeg = useRef<Leg | null>(null)
  const [draggingRfha, setDraggingRfha] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DropTarget | null>(null)

  const earlyModal = useModal()
  const unwindModal = useModal()
  const rollModal = useModal()
  const [modalLeg, setModalLeg] = useState<Leg | null>(null)
  const [modalSeq, setModalSeq] = useState(0)
  const [earlyForm, setEarlyForm] = useState<PairForm>(emptyPairForm)
  const [rollForm, setRollForm] = useState<PairForm>(emptyPairForm)
  const [unwindForm, setUnwindForm] = useState<UnwindForm>(emptyUnwindForm)

  const [loading, setLoading] = useState(false)
  const loadAbort = useRef<AbortController | null>(null)
  const [txnTypes, setTxnTypes] = useState<Avail<DdOption[]>>({ state: 'loading' })
  const [bankPartners, setBankPartners] = useState<Avail<DdOption[]>>({ state: 'loading' })
  const bpAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    loadTxnTypes(ctrl.signal).then(setTxnTypes, () => undefined)
    return () => {
      ctrl.abort()
      loadAbort.current?.abort()
      bpAbort.current?.abort()
      clearTimeout(toastTimer.current)
      clearTimeout(flashTimer.current)
    }
  }, [])

  const showToast = useCallback((msg: string, kind?: ToastKind, ms: number = TOAST_MS) => {
    setToast({ msg, kind })
    setToastShown(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastShown(false), ms)
  }, [])

  const flashRow = (rfha: string) => {
    setFlashRfha(rfha)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashRfha(null), FLASH_MS)
  }

  const selectedLeg = legs.find((l) => l.rfha === selectedRfha) ?? null
  const stats = kpis(legs)
  const list = filterSort(legs, search, filters, sort)
  const view = paginate(list, page, pageSize)
  const totalRows = list.length

  /* ---------- Basic Selection ---------- */

  const doLoad = async (raw: string): Promise<Leg[] | null> => {
    const res = normalizeDealId(raw)
    if (!res.ok) {
      showToast(res.message, 'warn')
      return null
    }
    loadAbort.current?.abort()
    const ctrl = new AbortController()
    loadAbort.current = ctrl
    setLoading(true)
    let read: Avail<Leg[]>
    try {
      read = await loadDealLegs(res.dealId, ctrl.signal)
    } catch {
      return null // aborted by a newer load or by leaving the screen
    } finally {
      if (loadAbort.current === ctrl) setLoading(false)
    }
    loadedDeal.current = res.dealId
    setLegs(read.state === 'ok' ? read.value : [])
    setSelectedRfha(null)
    setPage(1)
    if (read.state === 'ok') {
      setBanner({ dealId: res.dealId, count: txnCount(read.value.length), cpair: read.value[0] ? read.value[0].cpair : '-' })
      setBannerShown(true)
      showToast(loadToast(read.value.length, res.dealId))
    } else if (read.state === 'waiting') {
      setBanner({ dealId: res.dealId, waiting: read.reason })
      setBannerShown(true)
    } else if (read.state === 'error') {
      setBannerShown(false)
      showToast(read.reason, 'error')
    }
    return read.state === 'ok' ? read.value : null
  }

  /** FORM bp: the selected leg's trader group decides which banks are offered. */
  const loadPartnersFor = (l: Leg) => {
    bpAbort.current?.abort()
    const ctrl = new AbortController()
    bpAbort.current = ctrl
    setBankPartners({ state: 'loading' })
    loadBankPartners(l.zgrp, ctrl.signal).then(setBankPartners, () => undefined)
  }

  /** fetch_data1: the INR side of the New Booking starts on the invoice plan's amount (the user can still change it). */
  const prefillInvoice = (l: Leg, set: (update: (f: PairForm) => PairForm) => void) => {
    if (!loadedDeal.current) return
    loadInrInvoiceAmount(loadedDeal.current, l.dealType).then(
      (inr) => set((f) => withInvoiceAmount(f, l, inr)),
      () => undefined,
    )
  }

  const clearValues = () => {
    setLegs([])
    setSelectedRfha(null)
    setPage(1)
    setDealInput('')
    setBannerShown(false)
  }

  /* ---------- Actions (click and drop share these) ---------- */

  const tryOpenEarly = () => {
    const l = selectedLeg
    if (!l) return
    const warn = gateEarly(l)
    if (warn) {
      showToast(warn, 'warn')
      return
    }
    setModalLeg(l)
    setModalSeq((n) => n + 1)
    setEarlyForm(pairFormFor(l))
    prefillInvoice(l, setEarlyForm)
    loadPartnersFor(l)
    earlyModal.open()
  }
  const tryOpenUnwind = () => {
    const l = selectedLeg
    if (!l) return
    const warn = gateUnwind(l)
    if (warn) {
      showToast(warn, 'warn')
      return
    }
    setModalLeg(l)
    setModalSeq((n) => n + 1)
    setUnwindForm(unwindFormFor(l))
    loadPartnersFor(l)
    unwindModal.open()
  }
  const tryOpenRollover = () => {
    const l = selectedLeg
    if (!l) return
    const warn = gateRollover(l)
    if (warn) {
      showToast(warn, 'warn')
      return
    }
    setModalLeg(l)
    setModalSeq((n) => n + 1)
    setRollForm(pairFormFor(l))
    prefillInvoice(l, setRollForm)
    loadPartnersFor(l)
    rollModal.open()
  }

  /**
   * Runs one action and reads the deal back. A failure keeps the dialog open with the progress made, so a
   * second Submit continues from the failed stage (nothing already created is created again).
   */
  const execute = async (input: PrematureInput, modal: { close: () => void }) => {
    if (submitting.current) return
    const key = `${input.kind}:${input.original.companyCode}/${input.original.transaction}`
    const previous = resume.current?.key === key ? resume.current.progress : undefined
    submitting.current = true
    let result: PrematureResult
    try {
      result = await runPremature(input, realDeps, previous)
    } finally {
      submitting.current = false
    }
    const made = result.progress
    if (!result.ok) {
      resume.current = canResume(result, input.original) ? { key, progress: made } : null
      showToast(describeFailure(result) || result.error || 'The action failed.', 'error', FAILURE_TOAST_MS)
      // Whatever was already created is shown, so the grid never hides a transaction SAP now holds.
      if (made.cancellationTransaction || made.replacementTransaction) void doLoad(loadedDeal.current)
      return
    }
    resume.current = null
    modal.close()
    const done = input.kind === 'early' ? MSG.earlyDone : input.kind === 'unwind' ? MSG.unwindDone : MSG.rollDone
    const loaded = await doLoad(loadedDeal.current)
    const extra = result.notes.length ? ` ${result.notes.join(' ')}` : ''
    if (input.kind === 'rollover' && loaded && shouldNotifyRollover(loaded.length)) {
      showToast(`${done} ${sendRolloverNotification().reason}${extra}`, 'warn', FAILURE_TOAST_MS)
    } else {
      showToast(`${done}${extra}`, result.notes.length ? 'warn' : undefined, result.notes.length ? FAILURE_TOAST_MS : TOAST_MS)
    }
    const flash = made.replacementTransaction ?? made.cancellationTransaction
    if (flash) flashRow(flash.transaction)
  }

  const submitPair = (kind: 'early' | 'rollover', form: PairForm, validate: (f: PairForm) => string | null, modal: { close: () => void }) => {
    const l = modalLeg
    if (!l) return
    const err = validate(form)
    if (err) {
      showToast(err, 'error')
      return
    }
    void execute({ kind, original: { companyCode: l.bukrs, transaction: l.rfha }, dealId: loadedDeal.current, remark: form.remark, newTxn: form.newTxn, cancel: form.cancel }, modal)
  }
  const submitEarly = () => submitPair('early', earlyForm, validateEarly, earlyModal)
  const submitRollover = () => submitPair('rollover', rollForm, validateRollover, rollModal)
  const submitUnwind = () => {
    const l = modalLeg
    if (!l) return
    const err = validateUnwind(unwindForm)
    if (err) {
      showToast(err, 'error')
      return
    }
    void execute({ kind: 'unwind', original: { companyCode: l.bukrs, transaction: l.rfha }, dealId: loadedDeal.current, remark: unwindForm.remark, form: unwindForm }, unwindModal)
  }

  /* ---------- Drag and drop ---------- */

  const startLegDrag = (e: DragEvent<HTMLTableRowElement>, l: Leg) => {
    draggedLeg.current = l
    setDraggingRfha(l.rfha)
    // The ghost has to live inside the scope root for the scoped stylesheet to reach it.
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = dragGhostText(l)
    ;(rootRef.current ?? document.body).appendChild(ghost)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', String(l.rfha))
    } catch {
      // Some browsers refuse custom data; the drag still works through the ref.
    }
    e.dataTransfer.setDragImage(ghost, 12, 14)
    setTimeout(() => ghost.remove(), 0)
  }
  const endLegDrag = () => {
    draggedLeg.current = null
    setDraggingRfha(null)
    setDragOver(null)
  }
  const dropProps = (target: DropTarget, onDrop: () => void) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedLeg.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(target)
    },
    onDragLeave: () => setDragOver((cur) => (cur === target ? null : cur)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(null)
      if (draggedLeg.current) onDrop()
    },
  })
  const dropCls = (target: DropTarget) => (dragOver === target ? ' drag-over' : '')

  /* ---------- Table ---------- */

  const onSort = (field: SortField) => setSort((s) => nextSort(s, field))
  const onSelect = (rfha: string) => setSelectedRfha((cur) => toggleSelection(cur, rfha))
  const onView = (l: Leg) => fireSapevent(viewTxnEvent(l))

  const toastCls = `toast${toastShown ? ' show' : ''}${toast.kind === 'error' ? ' error' : ''}${toast.kind === 'warn' ? ' warn' : ''}`

  return (
    <div className="fo-early-delivery-unwind-rollover" ref={rootRef}>
      <div className="app">
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Premature Settlement</h1>
            <p>Original Deal — Early Delivery / Unwinding / Rollover</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <BackButton className="btn btn-secondary" />
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* ============ Basic Selection ============ */}
        <div className="card">
          <div className="section-title">
            <span className="dot"></span>Basic Selection
          </div>
          <div className="section-body">
            <div className="form-row no-wrap">
              <div className="field w-wide">
                <label>
                  Deal ID<span className="req">*</span>
                </label>
                <input
                  className="control"
                  placeholder="Deal ID"
                  autoComplete="off"
                  value={dealInput}
                  onChange={(e) => setDealInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doLoad(dealInput)
                  }}
                />
              </div>
              <div className="field" style={{ flex: '0 0 auto', alignSelf: 'flex-end', display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" type="button" onClick={clearValues}>
                  Clear Values
                </button>
                <button className="btn btn-primary" type="button" disabled={loading} onClick={() => void doLoad(dealInput)}>
                  {loading ? 'Loading…' : 'Load Deal'}
                </button>
              </div>
              <div className="field" style={{ flex: '1 1 auto', alignSelf: 'flex-end' }}>
                <span className="hint">TrmFxApp · FxTransaction</span>
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-row">
          <KpiCard cls="" value={stats.total} label="Total Legs Loaded" desc="All transactions on this deal" />
          <KpiCard cls="" value={stats.eligible} label="Eligible for Early / Rollover" desc="Active forward-type legs" />
          <KpiCard cls="c-teal" value={stats.pm} label="Pre-Matured" desc="Settled ahead of value date" />
          <KpiCard cls="c-warn" value={stats.unw} label="Unwound" desc="Position closed out" />
        </div>

        <div className={`success-banner${bannerShown ? ' show' : ''}`}>
          <span>ℹ</span>
          {banner && 'waiting' in banner ? (
            <span>
              <b>{WAITING}</b> — Deal <b>{banner.dealId}</b> cannot be read: {banner.waiting}
            </span>
          ) : (
            <span>
              Deal <b>{banner?.dealId}</b> loaded — <span>{banner?.count}</span> transaction(s), currency pair <b>{banner?.cpair}</b>.
            </span>
          )}
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setBannerShown(false)}>
            Dismiss
          </button>
        </div>

        {/* ============ Deal Transactions Table ============ */}
        <div className="card">
          <div className="section-title">
            <span className="dot"></span>Deal Transactions
          </div>

          <div className="table-toolbar">
            <div className="search-box">
              <span className="icon">🔍</span>
              <input
                placeholder="Search transaction, counterparty, currency pair..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <select
              className="control filter-select"
              title="Txn Type"
              value={filters.type}
              onChange={(e) => {
                setFilters((f) => ({ ...f, type: e.target.value }))
                setPage(1)
              }}
            >
              <option value="">All txn types</option>
              {typeFilterOptions(legs).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="control filter-select"
              title="Status"
              value={filters.status}
              onChange={(e) => {
                setFilters((f) => ({ ...f, status: e.target.value }))
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {statusOptions(legs).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS)
                setSearch('')
              }}
            >
              Reset
            </button>
            <button
              className={`btn btn-secondary btn-sm${dropCls('early')}`}
              type="button"
              disabled={!selectedLeg}
              onClick={tryOpenEarly}
              {...dropProps('early', tryOpenEarly)}
            >
              Create Early Delivery
            </button>
            <button
              className={`btn btn-secondary btn-sm${dropCls('roll')}`}
              type="button"
              disabled={!selectedLeg}
              onClick={tryOpenRollover}
              {...dropProps('roll', tryOpenRollover)}
            >
              Rollover
            </button>
            <button
              className={`btn btn-danger btn-sm${dropCls('unwind')}`}
              type="button"
              disabled={!selectedLeg}
              onClick={tryOpenUnwind}
              {...dropProps('unwind', tryOpenUnwind)}
            >
              Create Unwinding Txn
            </button>
            <div className="toolbar-spacer"></div>
            <span className="result-count">{txnCount(totalRows)}</span>
          </div>

          <div className="table-scroll">
            <DealTable
              rows={view.rows}
              hidden={totalRows === 0}
              sort={sort}
              selectedRfha={selectedRfha}
              flashRfha={flashRfha}
              draggingRfha={draggingRfha}
              onSort={onSort}
              onSelect={onSelect}
              onView={onView}
              onDragStart={startLegDrag}
              onDragEnd={endLegDrag}
            />
          </div>
          <div className="empty-state" style={{ display: totalRows === 0 ? 'block' : 'none' }}>
            <div className="big">📂</div>
            <span>{legs.length === 0 ? EMPTY_STATE_NO_DEAL : EMPTY_STATE_NO_MATCH}</span>
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
            </div>
            <div className="pagination">
              <button type="button" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
                ‹
              </button>
              {Array.from({ length: view.pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" className={p === view.page ? 'active' : undefined} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button type="button" disabled={view.page >= view.pageCount} onClick={() => setPage(view.page + 1)}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      <PairModal
        modal={earlyModal}
        title="Early Delivery"
        submitLabel="Create Early Delivery"
        requiredMsg
        leg={modalLeg}
        form={earlyForm}
        bodyKey={modalSeq}
        typeOptions={txnTypes}
        bpOptions={bankPartners}
        onChange={(f) => setEarlyForm((prev) => applyPairEdit(prev, f, modalLeg))}
        onSubmit={submitEarly}
      />
      <UnwindModal
        modal={unwindModal}
        leg={modalLeg}
        form={unwindForm}
        bodyKey={modalSeq}
        bpOptions={bankPartners}
        onChange={(f) => setUnwindForm((prev) => applyUnwindEdit(prev, f, modalLeg))}
        onSubmit={submitUnwind}
      />
      <PairModal
        modal={rollModal}
        title="Rollover"
        submitLabel="Rollover"
        requiredMsg={false}
        leg={modalLeg}
        form={rollForm}
        bodyKey={modalSeq}
        typeOptions={txnTypes}
        bpOptions={bankPartners}
        onChange={(f) => setRollForm((prev) => applyPairEdit(prev, f, modalLeg))}
        onSubmit={submitRollover}
      />

      <div className={toastCls}>{toast.msg}</div>
    </div>
  )
}

function KpiCard({ cls, value, label, desc }: { cls: string; value: number; label: string; desc: string }) {
  return (
    <div className={`kpi-card ${cls}`.trim()}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-description">{desc}</div>
    </div>
  )
}
