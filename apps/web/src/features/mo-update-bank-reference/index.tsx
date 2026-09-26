import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { DealTable, PagerControls } from './DealTable.tsx'
import { FxDealsPanel, InvoicesPanel, PlPanel } from './DetailTables.tsx'
import { EditPairModal } from './EditPairModal.tsx'
import { fmtDate } from './format.ts'
import { FX_LOGO as HEAD_LOGO } from '../../shared/fx/logo.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  applyEditPair,
  applyPremium,
  buildDeals,
  canReverse,
  cancelDeal,
  companyName,
  confirmDeal,
  editPairCandidates,
  filterDeals,
  gapNote,
  isCancelled,
  modelOptions,
  originOptions,
  pageOf,
  recalcInvoices,
  reverseConfirm,
  setInvRate,
  statusText,
  statusValClass,
} from './logic.ts'
import { CancelModal, DmsModal, ReverseModal } from './NarrowModals.tsx'
import { PremiumModal } from './PremiumModal.tsx'
import './mo-update-bank-reference.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-update-bank-reference.dark.css'
import type { Deal, DealStatus, Filters, Toast, ToastKind } from './types.ts'

type ModalId = 'confirm' | 'premium' | 'editpair' | 'cancel' | 'reverse' | 'dms'

const TOAST_MS = 3600
const MODEL_OPTIONS = modelOptions()

/**
 * Deal ID: MO Confirmation, converted from legacy/deal-id-mo-confirmation.html and served as
 * "Update Bank Reference for FX Deals" (ZSGTSFR002).
 *
 * The original never called an API, so this is the same UI-only screen: the sample Deal IDs
 * are dated relative to the day the screen opened and every change lives in component state
 * for the session.
 */
export default function MoUpdateBankReference() {
  const [today] = useState(() => new Date())
  const [deals, setDeals] = useState<Deal[]>(() => buildDeals(today))
  const originOpts = useMemo(() => originOptions(deals), [deals])

  // List screen
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [glossaryHidden, setGlossaryHidden] = useState(false)

  // Detail screen. `rev` redraws the invoice rate inputs from state, as re-rendering the grid did.
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const deal = currentId ? deals.find((d) => d.dealId === currentId) : undefined

  // Popups. Confirm / Premium show the record as it was when they opened.
  const [openModal, setOpenModal] = useState<ModalId | null>(null)
  const [confirmSnap, setConfirmSnap] = useState<Deal | null>(null)
  const [premiumSnap, setPremiumSnap] = useState<Deal | null>(null)
  const [premiumRate, setPremiumRate] = useState('')
  const [epLeg, setEpLeg] = useState(0)
  const [epCandidate, setEpCandidate] = useState('')
  const closeModal = useCallback(() => setOpenModal(null), [])

  // Toast — the page opened with a "Ready" message.
  const [toast, setToast] = useState<Toast>(() => ({ message: `Ready. ${deals.length} Deal ID(s) loaded.`, kind: '', show: true }))
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

  // Escape closes every popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeModal])

  const filtered = useMemo(() => filterDeals(deals, filters), [deals, filters])
  const paged = pageOf(filtered, page, pageSize)

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const updateDeal = (updated: Deal) => setDeals((all) => all.map((d) => (d.dealId === updated.dealId ? updated : d)))
  /** A change the page followed with renderDetail(), which also rebuilt the rate inputs. */
  const redraw = (updated: Deal) => {
    updateDeal(updated)
    setRev((r) => r + 1)
  }

  // ------------------------------------------------------------------ navigation

  const openDeal = (id: string) => {
    setCurrentId(id)
    window.scrollTo(0, 0)
  }

  /** Back to the list with the filters cleared; the header's Refresh also says so. */
  const goHome = (refreshToast: boolean) => {
    setCurrentId(null)
    setFilters(DEFAULT_FILTERS)
    setPage(1)
    if (refreshToast) showToast(`Refreshed. ${deals.length} Deal ID(s) loaded.`, '')
  }

  // ------------------------------------------------------------------ invoices

  const onRateChange = (idx: number, text: string) => {
    if (!deal) return
    const updated = setInvRate(deal, idx, text)
    if (updated) redraw(updated)
    else {
      showToast('Exchange rate must be a positive number.', 'error')
      setRev((r) => r + 1)
    }
  }

  const onCalculate = () => {
    if (!deal) return
    redraw(recalcInvoices(deal))
    showToast('Invoice amounts and P&L recalculated.', 'success')
  }

  // ------------------------------------------------------------------ popups

  const openConfirm = () => {
    if (!deal) return
    setConfirmSnap(deal)
    setOpenModal('confirm')
  }

  const doConfirm = () => {
    const updated = deal ? confirmDeal(deal) : null
    closeModal()
    if (!updated) return
    redraw(updated)
    showToast(`Deal ID ${updated.dealId} confirmed by MO.`, 'success')
  }

  const openPremium = () => {
    if (!deal) return
    setPremiumSnap(deal)
    setPremiumRate(deal.premiumRate ? deal.premiumRate.toFixed(7) : '')
    setOpenModal('premium')
  }

  const doPremium = () => {
    if (!deal) return
    const updated = applyPremium(deal, premiumRate)
    if (!updated) {
      showToast('Enter a valid adjusted rate first.', 'error')
      return
    }
    redraw(updated)
    closeModal()
    showToast('Premium adjustment applied to the D2 (T2) invoice leg.', 'success')
  }

  const selectEpLeg = (d: Deal, idx: number) => {
    setEpLeg(idx)
    setEpCandidate(editPairCandidates(d.fxLegs[idx])[0]?.rfha ?? '')
  }

  const openEditPair = () => {
    if (!deal) return
    selectEpLeg(deal, 0)
    setOpenModal('editpair')
  }

  const doEditPair = () => {
    if (!deal) return
    const updated = applyEditPair(deal, epLeg, epCandidate, new Date())
    if (!updated) {
      showToast('No alternate transaction selected.', 'error')
      return
    }
    updateDeal(updated)
    closeModal()
    showToast(`${deal.fxLegs[epLeg]?.leg ?? ''} leg re-pointed to transaction ${epCandidate}.`, 'success')
  }

  const doCancel = () => {
    if (!deal) return
    redraw(cancelDeal(deal))
    closeModal()
    showToast(`Deal ID ${deal.dealId} has been cancelled.`, 'success')
  }

  const doReverse = () => {
    if (!deal) return
    redraw(reverseConfirm(deal))
    closeModal()
    showToast(`Confirmation for Deal ID ${deal.dealId} reversed to 01 - Not Confirmed.`, 'success')
  }

  // ------------------------------------------------------------------ render

  return (
    <div className="mo-update-bank-reference">
      <div className="page-head">
        <BackButton className="back-btn" />
        <img className="head-logo" src={HEAD_LOGO} alt="Logo" />
        <div className="title-wrap">
          <div className="page-title">Deal ID: MO Confirmation </div>
          <div className="page-subtitle">Trade &amp; Structured Finance — assign a booked FX Deal to a Master Contract and confirm it</div>
        </div>
        <div className="head-actions">
          <button className="btn-icon" type="button" title="Help" onClick={() => setGlossaryHidden((h) => !h)}>
            ?
          </button>
          <button className="btn-icon" type="button" title="Refresh" onClick={() => goHome(true)}>
            ↻
          </button>
          <SignOutButton className="back-btn" />
        </div>
      </div>

      <main>
        {/* ============================= DEAL ID SELECTION SCREEN ============================= */}
        <div id="list-view" style={deal ? { display: 'none' } : undefined}>
          <div id="glossary-box" className="glossary" style={glossaryHidden ? { display: 'none' } : undefined}>
            <span>
              <b>MC</b> = Master Contract (commodity, quantity &amp; shipping window agreed with a counterparty)
            </span>
            <span>
              <b>Deal ID</b> = the link key created once an FX Deal is assigned to an MC
            </span>
            <span>
              <b>D1 / D2</b> = the two offsetting FX Deal legs booked for a Deal ID
            </span>
            <span>
              <b>T1 / T2 / T3</b> = the trade-invoice legs generated along the Entity String
            </span>
            <span>
              <b>Entity String</b> = the chain of Olam entities the trade physically flows through, e.g. OGA→DMCC→OSIPL
            </span>
            <span>
              <b>All-in Rate</b> = the blended spot+swap FX rate applied to a deal leg
            </span>
          </div>

          <div className="panel">
            <div className="panel-title">
              <div className="panel-title-left">
                <span className="dot-bullet" />
                <h2>Open Deal IDs</h2>
              </div>
              <span className="panel-count" id="deal-count">
                {filtered.length} record{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="list-toolbar">
              <div className="search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  id="deal-search"
                  type="text"
                  placeholder="Search Deal ID, MC Ref, Model, Trader…"
                  value={filters.search}
                  onChange={(e) => setFilter({ search: e.target.value })}
                />
              </div>
              <div className="filter-field">
                <label>Status</label>
                <select id="f-status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value as DealStatus | '' })}>
                  <option value="">All statuses</option>
                  <option value="01">01 - Not Confirmed</option>
                  <option value="02">02 - Confirmed by MO</option>
                  <option value="03">03 - In Use</option>
                  <option value="30">30 - Cancelled</option>
                </select>
              </div>
              <div className="filter-field">
                <label>FX Model</label>
                <select id="f-model" value={filters.model} onChange={(e) => setFilter({ model: e.target.value })}>
                  <option value="">All models</option>
                  {MODEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Origin Entity</label>
                <select id="f-origin" value={filters.origin} onChange={(e) => setFilter({ origin: e.target.value })}>
                  <option value="">All entities</option>
                  {originOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button className="filter-reset" type="button" onClick={() => setFilter(DEFAULT_FILTERS)}>
                Reset
              </button>
            </div>
            <DealTable rows={paged.rows} onOpen={openDeal} />
            <div className="pager">
              <div className="pager-size">
                Rows per page
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value, 10))
                    setPage(1)
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <PagerControls page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
              <div className="pager-info" id="pager-info">
                {filtered.length ? (
                  <>
                    Showing{' '}
                    <strong>
                      {paged.start + 1}–{paged.end}
                    </strong>{' '}
                    of <strong>{filtered.length}</strong>
                  </>
                ) : (
                  'Showing 0 of 0'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================= DEAL ID DETAIL SCREEN ============================= */}
        <div id="detail-view" style={deal ? { display: 'block' } : undefined}>
          <div className="back-row">
            <button className="back-btn" type="button" onClick={() => goHome(false)}>
              ← Back to Deal ID list
            </button>
          </div>
          {deal && (
            <>
              <DealHeaderPanel
                deal={deal}
                today={today}
                onConfirm={openConfirm}
                onPremium={openPremium}
                onEditPair={openEditPair}
                onCancel={() => setOpenModal('cancel')}
                onReverse={() => setOpenModal('reverse')}
                onDms={() => setOpenModal('dms')}
                onRefresh={() => setRev((r) => r + 1)}
              />
              <FxDealsPanel deal={deal} />
              <InvoicesPanel deal={deal} rev={rev} onRateChange={onRateChange} onCalculate={onCalculate} />
              <PlPanel deal={deal} />
            </>
          )}
        </div>
      </main>

      <ConfirmModal open={openModal === 'confirm'} deal={confirmSnap} onClose={closeModal} onConfirm={doConfirm} />
      <PremiumModal
        open={openModal === 'premium'}
        deal={premiumSnap}
        rate={premiumRate}
        onRateChange={setPremiumRate}
        onClose={closeModal}
        onApply={doPremium}
      />
      <EditPairModal
        open={openModal === 'editpair'}
        deal={deal ?? null}
        legIdx={epLeg}
        candidate={epCandidate}
        onLegChange={(idx) => deal && selectEpLeg(deal, idx)}
        onCandidateChange={setEpCandidate}
        onClose={closeModal}
        onApply={doEditPair}
      />
      <CancelModal open={openModal === 'cancel'} dealId={deal?.dealId ?? ''} onClose={closeModal} onConfirm={doCancel} />
      <ReverseModal open={openModal === 'reverse'} dealId={deal?.dealId ?? ''} onClose={closeModal} onConfirm={doReverse} />
      <DmsModal open={openModal === 'dms'} onClose={closeModal} />

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.kind ? ` ${toast.kind}` : ''}`} id="toast">
        {toast.message}
      </div>
    </div>
  )
}

/** Heading, action toolbar, info grid and the waiting-on-shipment note. */
function DealHeaderPanel({
  deal,
  today,
  onConfirm,
  onPremium,
  onEditPair,
  onCancel,
  onReverse,
  onDms,
  onRefresh,
}: {
  deal: Deal
  today: Date
  onConfirm: () => void
  onPremium: () => void
  onEditPair: () => void
  onCancel: () => void
  onReverse: () => void
  onDms: () => void
  onRefresh: () => void
}) {
  const cancelled = isCancelled(deal)
  const note = gapNote(deal, today)
  return (
    <div className="panel">
      <div className="panel-title">
        <div className="detail-heading">
          <h1>Deal ID: MO Confirmation</h1>
          <span className="deal-badge" id="dt-dealid">
            {deal.dealId}
          </span>
        </div>
      </div>

      <div className="action-bar" id="dt-actionbar">
        <button className="tb-btn primary" type="button" disabled={cancelled} onClick={onConfirm}>
          <span className="ico">✓</span> {deal.status === '01' ? 'Change / Confirm' : 'View Confirmation'}
        </button>
        <button className="tb-btn" type="button" disabled={cancelled} onClick={onPremium}>
          <span className="ico">%</span> Premium Adjustment
        </button>
        <button className="tb-btn" type="button" disabled={cancelled} onClick={onEditPair}>
          <span className="ico">⇆</span> Edit Deal Pair
        </button>
        <button className="tb-btn danger" type="button" disabled={cancelled} onClick={onCancel}>
          <span className="ico">✕</span> Cancel Deal ID
        </button>
        {canReverse(deal) && (
          <button className="tb-btn danger" type="button" onClick={onReverse}>
            <span className="ico">↶</span> Reverse Confirmation
          </button>
        )}
        <button className="tb-btn" type="button" onClick={onDms}>
          <span className="ico">📎</span> DMS
        </button>
        <button className="tb-btn" type="button" onClick={onRefresh}>
          <span className="ico">↻</span> Refresh
        </button>
      </div>

      <div className="info-grid" id="dt-infogrid">
        <InfoCell label="Deal ID" cls="green">
          {deal.dealId}
        </InfoCell>
        <InfoCell label="MC Reference No" cls="accent">
          {deal.mcRef}
        </InfoCell>
        <InfoCell label="FX Model">{`${deal.model} – ${deal.modelDesc}`}</InfoCell>
        <InfoCell label="Trader">{deal.trader}</InfoCell>
        <InfoCell label="Deal Start Date">{fmtDate(deal.dealStart)}</InfoCell>
        <InfoCell label="Deal End Date">{fmtDate(deal.dealEnd)}</InfoCell>
        <InfoCell label="Ship Start Date">{fmtDate(deal.shipStart)}</InfoCell>
        <InfoCell label="Ship End Date">{fmtDate(deal.shipEnd)}</InfoCell>
        <InfoCell label="Entity String">
          {deal.entChain.map((e, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="flow-arrow">→</span>}
              {e}
            </Fragment>
          ))}
        </InfoCell>
        <InfoCell label="Currency String">{deal.currChain.join(' → ')}</InfoCell>
        <InfoCell label="Deal ID Status" cls={statusValClass(deal.status)}>
          {statusText(deal.status)}
        </InfoCell>
        <InfoCell label="Origin Entity">{`${deal.origin} – ${companyName(deal.origin)}`}</InfoCell>
      </div>

      <div className="section-note gap-note" id="dt-gapnote" style={{ display: note ? 'block' : 'none' }}>
        {note?.kind === 'waiting' && (
          <>
            <strong>Waiting on shipment.</strong> This Deal ID is booked and assigned, but shipment isn't due to start for {note.days} more day(s).
            Nothing changes in the system for this Deal ID during that gap except a monthly mark-to-market (MTM) valuation of the open FX position —
            no invoices exist yet.
          </>
        )}
        {note?.kind === 'ready' && (
          <>
            <strong>Ready to confirm.</strong> The shipping window has opened. Once the Bill of Lading is attached by the Trade Flow team, Trade
            Invoices T1/T2/T3 will be generated for this Deal ID.
          </>
        )}
      </div>
    </div>
  )
}

function InfoCell({ label, cls = '', children }: { label: string; cls?: string; children: ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-lbl">{label}</div>
      <div className={`info-val${cls ? ` ${cls}` : ''}`}>{children}</div>
    </div>
  )
}
