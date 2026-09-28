import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { INVOICE_DB, PREMIUM_DB, makeDealsDb, makeDmsDb } from './data.ts'
import { DealDetails, InvoiceTable, PlTable } from './DetailTables.tsx'
import { FxLegTable } from './FxLegTable.tsx'
import {
  actionVisibility,
  attachMockDocument,
  cancelDealId,
  legNote,
  newEditDraft,
  nextSort,
  quickPickLabel,
  resolveDealId,
  reverseMoConfirmation,
  saveConfirmDeal,
  sortedFilteredLegs,
  toggleEditing,
  toggleLeg,
  updateDealPair,
} from './logic.ts'
import { ChangeConfirmModal, DmsModal, EditDealPairModal, PremiumModal, PromptModal } from './Modals.tsx'
import './mo-confirm-fx-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id.dark.css'
import type { Deal, DmsDb, EditDraft, Leg, ModalId, Sort, SortKey, Toast, ToastType } from './types.ts'

const TOAST_MS = 3200

/**
 * MO: Confirm FX Deal ID — Single Deal ID (ZSGTSFP002), converted from legacy/confirm-fx-deal.html.
 *
 * The original never called an API: its DEALS_DB / INVOICE_DB / PREMIUM_DB / DMS_DB were a mock
 * backend, so this is the same UI-only screen on that dummy data (see data.ts), held in component
 * state for the session. A Deal ID is loaded by typing it (with a datalist) or from the quick
 * picks; its legs, invoice plan and planned P&L show below, and the toolbar's actions follow the
 * ABAP PF-STATUS rules in logic.ts's actionVisibility. The selected leg can be dragged onto
 * "Edit Deal Pair", which opens the same popup as clicking it.
 */
export default function MoConfirmFxDealId() {
  const [deals, setDeals] = useState<readonly Deal[]>(makeDealsDb)
  const [dms, setDms] = useState<DmsDb>(makeDmsDb)

  const [searchText, setSearchText] = useState('')
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [noteTouched, setNoteTouched] = useState(false)
  const [fxSearch, setFxSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: null, dir: 1 })

  const [modal, setModal] = useState<ModalId | null>(null)
  const [ccInvoicePlan, setCcInvoicePlan] = useState('STD')
  const [ccMcRef, setCcMcRef] = useState('')
  const [ccAlert, setCcAlert] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const draggedLeg = useRef<Leg | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const [toast, setToast] = useState<Toast | null>(null)
  const toastSeq = useRef(0)
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const listId = useId()
  const inputId = useId()

  useEffect(() => {
    const timers = toastTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  /** One toast at a time: a new one replaces the old, and each clears itself after 3.2 s. */
  const showToast = (msg: string, type: ToastType) => {
    const id = ++toastSeq.current
    setToast({ id, msg, type })
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer)
      setToast((t) => (t?.id === id ? null : t))
    }, TOAST_MS)
    toastTimers.current.add(timer)
  }

  const deal = currentId ? (deals.find((d) => d.dealId === currentId) ?? null) : null
  const legs = useMemo(() => (deal ? sortedFilteredLegs(deal.legs, fxSearch, sort) : []), [deal, fxSearch, sort])
  const selectedLeg = deal && selected ? (deal.legs.find((l) => l.rfha === selected) ?? null) : null
  const vis = deal ? actionVisibility(deal) : null
  const premium = deal ? (PREMIUM_DB[deal.dealId] ?? null) : null

  const closeModals = () => setModal(null)

  /* ---------- Deal search ---------- */

  const loadDeal = (text: string) => {
    const r = resolveDealId(text, deals)
    if (!r.ok) {
      setSearchErr(r.error)
      return
    }
    setSearchErr(null)
    setCurrentId(r.id)
    setSelected(null)
  }

  const clearDeal = () => {
    setCurrentId(null)
    setSelected(null)
    setSearchText('')
    setSearchErr(null)
  }

  const refresh = () => {
    if (!deal) return
    showToast('Data refreshed', 'success')
  }

  const selectLeg = (rfha: string) => {
    setSelected((s) => toggleLeg(s, rfha))
    setNoteTouched(true)
  }

  /* ---------- Drag and drop: the selected leg onto "Edit Deal Pair" ---------- */

  const startLegDrag = (e: DragEvent<HTMLTableRowElement>, leg: Leg) => {
    draggedLeg.current = leg
    setDragging(leg.rfha)
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', leg.rfha)
    } catch {
      // Some browsers refuse setData here; the drop only needs draggedLeg.
    }
    if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 12, 14)
  }

  const endLegDrag = () => {
    draggedLeg.current = null
    setDragging(null)
    setDragOver(false)
  }

  /* ---------- Change / Confirm (UPD) ---------- */

  const openChangeConfirm = () => {
    if (!deal) return
    setCcMcRef(deal.mcRef)
    setCcAlert(null)
    setModal('changeConfirm')
  }

  const confirmChange = () => {
    if (!deal) return
    const mcRef = ccMcRef.trim()
    if (!mcRef) {
      setCcAlert('MC Ref No is required.')
      return
    }
    const result = saveConfirmDeal(deals, deal.dealId, { mcRef })
    if (!result.ok) {
      setCcAlert(result.msg)
      return
    }
    setDeals(result.deals)
    closeModals()
    showToast(result.msg, 'success')
  }

  /* ---------- Edit Deal Pair (DEAL_EDIT) — the click and the drop both land here ---------- */

  const openEditDealPair = () => {
    if (!selected) {
      showToast('Select a deal leg first.', 'error')
      return
    }
    if (!selectedLeg) return
    setEditDraft(newEditDraft(selectedLeg.rfha))
    setModal('editDeal')
  }

  const updatePair = () => {
    if (!deal || !editDraft) return
    if (!editDraft.newRfha) {
      showToast('Select a new transaction first.', 'error')
      return
    }
    const result = updateDealPair(deals, deal.dealId, editDraft.oldRfha, editDraft.newRfha)
    closeModals()
    if (result.ok) setDeals(result.deals)
    setSelected(editDraft.newRfha)
    showToast(result.msg, 'success')
  }

  /* ---------- Cancel Deal ID (CAN) / Reverse MO Confirmation (REV) / SS Deal ---------- */

  const confirmCancelDeal = () => {
    if (!deal) return
    const result = cancelDealId(deals, deal.dealId)
    closeModals()
    if (result.ok) setDeals(result.deals)
    setCurrentId(null)
    setSelected(null)
    setSearchText('')
    showToast(result.msg, 'success')
  }

  const confirmReverse = () => {
    if (!deal) return
    const result = reverseMoConfirmation(deals, deal.dealId)
    closeModals()
    if (result.ok) setDeals(result.deals)
    showToast(result.msg, result.ok ? 'success' : 'error')
  }

  const confirmSsDeal = () => {
    closeModals()
    showToast('SS Deal ID confirmed and saved successfully.', 'success')
  }

  /* ---------- DMS ---------- */

  const uploadDocument = () => {
    if (!deal) return
    setDms((d) => attachMockDocument(d, deal.dealId))
    showToast('Document attached (mock upload)', 'success')
  }

  const editLeg = deal && editDraft ? (deal.legs.find((l) => l.rfha === editDraft.oldRfha) ?? null) : null

  return (
    <div className="mo-confirm-fx-deal-id">
      <div className="app">
        {/* ============ PAGE HEADER ============ */}
        <div className="page-header">
          <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
          <div className="header-text">
            <h1>Confirm FX Deal ID</h1>
            <p>Treasury &amp; Trade Finance &middot; Middle Office &middot; Single Deal ID</p>
          </div>
          <div className="header-actions">
            <BackButton className="btn btn-secondary" />
            <button type="button" className="btn btn-secondary" onClick={refresh}>
              &#8635; Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        <main>
          {/* ============ DEAL SELECTION ============ */}
          <section className="card">
            <div className="card-head">
              <h2>Deal Selection</h2>
              <span className="hint">Enter a Deal ID to load its FX legs, invoice plan and P&amp;L</span>
            </div>
            <div className="card-body">
              <div className="selection-row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={inputId}>Deal ID</label>
                  <input
                    id={inputId}
                    list={listId}
                    placeholder="e.g. FXD2026001"
                    autoComplete="off"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadDeal(searchText)
                    }}
                  />
                  <datalist id={listId}>
                    {deals.map((d) => (
                      <option key={d.dealId} value={d.dealId} />
                    ))}
                  </datalist>
                  {searchErr !== null && <div className="err-msg">{searchErr}</div>}
                </div>
                <button type="button" className="btn btn-primary" onClick={() => loadDeal(searchText)}>
                  Load Deal
                </button>
                {deal && (
                  <button type="button" className="btn btn-secondary" onClick={clearDeal}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="quick-picks">
              {deals.map((d) => (
                <div
                  key={d.dealId}
                  className="quick-pick"
                  onClick={() => {
                    setSearchText(d.dealId)
                    loadDeal(d.dealId)
                  }}
                >
                  {quickPickLabel(d)}
                </div>
              ))}
            </div>

            {deal && <DealDetails deal={deal} />}
          </section>

          {/* ============ WORK AREA ============ */}
          {deal && vis && (
            <section id="workArea">
              {/* Toolbar / Actions */}
              <div className="card toolbar">
                <div>
                  <h3 style={{ margin: 0 }}>FX Deals</h3>
                  <span className="table-note">
                    {legs.length} leg{legs.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="toolbar-actions">
                  {vis.upd && (
                    <button type="button" className="btn btn-primary" onClick={openChangeConfirm}>
                      Change / Confirm
                    </button>
                  )}
                  {vis.ssDeal && (
                    <button type="button" className="btn btn-primary" onClick={() => setModal('ssDeal')}>
                      Confirm &amp; Save SS Deal ID
                    </button>
                  )}
                  {vis.dealEdit && (
                    <button
                      type="button"
                      className={dragOver ? 'btn btn-secondary drag-over' : 'btn btn-secondary'}
                      disabled={!selected}
                      title={selected ? undefined : 'Select a deal leg first'}
                      onClick={openEditDealPair}
                      onDragOver={(e) => {
                        if (!draggedLeg.current) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                        setDragOver(true)
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        if (draggedLeg.current) openEditDealPair()
                      }}
                    >
                      Edit Deal Pair
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => setModal('premium')}>
                    Premium Adjustment
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal('dms')}>
                    DMS
                  </button>
                  {vis.rev && (
                    <button type="button" className="btn btn-danger" onClick={() => setModal('reverse')}>
                      Reverse MO Confirmation
                    </button>
                  )}
                  {vis.can && (
                    <button type="button" className="btn btn-danger" onClick={() => setModal('cancelDeal')}>
                      Cancel Deal ID
                    </button>
                  )}
                </div>
              </div>

              {/* FX Deals table */}
              <div className="card">
                <div className="table-toolbar">
                  <input
                    className="search-mini"
                    placeholder="Search deal legs..."
                    value={fxSearch}
                    onChange={(e) => setFxSearch(e.target.value)}
                  />
                  <span className="table-note">{legNote(selected, noteTouched)}</span>
                </div>
                <FxLegTable
                  legs={legs}
                  mcRef={deal.mcRef}
                  sort={sort}
                  selected={selected}
                  dragging={dragging}
                  onSort={(key: SortKey) => setSort((s) => nextSort(s, key))}
                  onSelect={selectLeg}
                  onDragStart={startLegDrag}
                  onDragEnd={endLegDrag}
                />
              </div>

              {!deal.noInv && <InvoiceTable rows={INVOICE_DB[deal.dealId] ?? []} />}
              {!deal.noInv && <PlTable deal={deal} premium={premium} />}
            </section>
          )}

          {/* Empty state */}
          {!deal && (
            <div className="empty-state">
              <div className="icon">&#128269;</div>
              <h3>No deal loaded</h3>
              <p>
                Search for a Deal ID above, or pick one of the quick-access deals to see its FX legs, invoice plan and
                P&amp;L.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* The drag image for the selected leg; parked off-screen by .drag-ghost. */}
      {selectedLeg && (
        <div className="drag-ghost" ref={ghostRef}>
          {selectedLeg.rfha} — {selectedLeg.bpName}
        </div>
      )}

      {/* ============ MODAL OVERLAY ============ */}
      <div
        className={modal && deal ? 'modal-overlay' : 'modal-overlay hidden'}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModals()
        }}
      >
        {deal && modal === 'changeConfirm' && (
          <ChangeConfirmModal
            deal={deal}
            invoicePlan={ccInvoicePlan}
            mcRef={ccMcRef}
            alert={ccAlert}
            onInvoicePlan={setCcInvoicePlan}
            onMcRef={setCcMcRef}
            onConfirm={confirmChange}
            onClose={closeModals}
          />
        )}
        {deal && modal === 'editDeal' && editDraft && editLeg && (
          <EditDealPairModal
            deal={deal}
            leg={editLeg}
            draft={editDraft}
            onToggleEdit={() => setEditDraft((d) => (d ? toggleEditing(d) : d))}
            onChoose={(rfha) => setEditDraft((d) => (d ? { ...d, newRfha: rfha } : d))}
            onUpdate={updatePair}
            onClose={closeModals}
          />
        )}
        {deal && modal === 'premium' && <PremiumModal premium={premium} onClose={closeModals} />}
        {deal && modal === 'cancelDeal' && (
          <PromptModal
            title="Cancel Deal ID"
            icon="warn"
            message="FX Deal ID will be deassigned completely. Do you want to confirm?"
            noLabel="No"
            yesLabel="Yes, Cancel Deal ID"
            yesClass="btn-danger"
            onYes={confirmCancelDeal}
            onClose={closeModals}
          />
        )}
        {deal && modal === 'reverse' && (
          <PromptModal
            title="Reverse MO Confirmation"
            icon="warn"
            message="Do you really want to reverse MO Confirmation for this deal?"
            noLabel="No"
            yesLabel="Yes, Reverse"
            yesClass="btn-danger"
            onYes={confirmReverse}
            onClose={closeModals}
          />
        )}
        {deal && modal === 'dms' && (
          <DmsModal docs={dms[deal.dealId] ?? []} onUpload={uploadDocument} onClose={closeModals} />
        )}
        {deal && modal === 'ssDeal' && (
          <PromptModal
            title="Confirm & Save SS Deal ID"
            icon="info"
            message="This deal uses a short-straddle option model. Confirm to save both the call and put legs as a linked short-straddle deal."
            noLabel="Cancel"
            yesLabel="Confirm & Save"
            yesClass="btn-primary"
            onYes={confirmSsDeal}
            onClose={closeModals}
          />
        )}
      </div>

      {toast && (
        <div key={toast.id} id="toast" className={toast.type === 'error' ? 'toast toast-error' : 'toast'}>
          {/* One text node, as the page's innerHTML was, so the flex gap does not split it. */}
          {(toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '⚠ ' : '') + toast.msg}
        </div>
      )}
    </div>
  )
}
