import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import {
  ACTION_WAITING,
  DMS_LIST_WAITING,
  PREMIUM_WAITING,
  WAITING_DEAL_ID_API,
  cancelDealId,
  loadDealList,
  loadDealScreen,
  type DealList,
} from './api.ts'
import { DealDetails, InvoiceTable, PlTable } from './DetailTables.tsx'
import { FxLegTable } from './FxLegTable.tsx'
import {
  actionVisibility,
  legNote,
  newEditDraft,
  nextSort,
  quickPickLabel,
  resolveDealId,
  sortedFilteredLegs,
  toggleEditing,
  toggleLeg,
} from './logic.ts'
import { ChangeConfirmModal, DmsModal, EditDealPairModal, PremiumModal, PromptModal } from './Modals.tsx'
import './mo-confirm-fx-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id.dark.css'
import type { DealScreen, EditDraft, Leg, ModalId, Sort, SortKey, Toast, ToastType } from './types.ts'

const TOAST_MS = 3200

/**
 * MO: Confirm FX Deal ID — Single Deal ID (ZSGTSFP002 / ZSGTSF_PDEAL_ID_ANALYS), converted from
 * legacy/confirm-fx-deal.html and wired to SAP through the SLC middleware (api.ts).
 *
 * The Deal IDs come from ZSGTSFTR_DEALID; a loaded one shows screen 9000's header (Deal ID, MC,
 * model, trader, status from ZSGTSFTR_DEAL_ST), the FX legs (WAITING FOR API: ZSGTSFCDS_FX /
 * _OPTION are not served), the planned trade invoices (ZSGTSFTR_INV_REF + the model's links) and
 * the planned P&L (WAITING FOR API). The toolbar follows PF-STATUS 111's EXCLUDING rules
 * (logic.ts). Cancel Deal ID is the ABAP's own UPDATE of ZSGTSFTR_DEALID; every other action
 * posts through BAPIs / FMs in SAP and says WAITING FOR ACTION API without changing anything.
 * Nothing falls back to sample data.
 */
export default function MoConfirmFxDealId() {
  const [list, setList] = useState<DealList | { state: 'loading' }>({ state: 'loading' })
  const [screen, setScreen] = useState<DealScreen | null>(null)
  const [loadingDeal, setLoadingDeal] = useState(false)
  const [busy, setBusy] = useState(false)
  const dealAbort = useRef<AbortController | null>(null)

  const [searchText, setSearchText] = useState('')
  const [searchErr, setSearchErr] = useState<string | null>(null)
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

  /** P_DEAL's candidates: the ZSGTSFTR_DEALID rows. */
  const reloadList = (signal?: AbortSignal) =>
    loadDealList(signal)
      .then(setList)
      .catch((error: unknown) => {
        if (!isAbort(error)) setList({ state: 'unavailable', reason: `${WAITING_DEAL_ID_API} — ${messageOf(error)}` })
      })

  useEffect(() => {
    const ctrl = new AbortController()
    void reloadList(ctrl.signal)
    return () => {
      ctrl.abort()
      dealAbort.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const picks = list.state === 'sap' ? list.picks : []
  const deal = screen?.deal ?? null
  const legs = useMemo(() => (deal ? sortedFilteredLegs(deal.legs, fxSearch, sort) : []), [deal, fxSearch, sort])
  const selectedLeg = deal && selected ? (deal.legs.find((l) => l.rfha === selected) ?? null) : null
  const vis = deal ? actionVisibility(deal) : null

  const closeModals = () => setModal(null)

  /* ---------- Deal search ---------- */

  /** Reads screen 9000 for one Deal ID; resolves to whether it loaded. */
  const fetchDeal = async (id: string): Promise<boolean> => {
    dealAbort.current?.abort()
    const ctrl = new AbortController()
    dealAbort.current = ctrl
    setLoadingDeal(true)
    try {
      const next = await loadDealScreen(id, ctrl.signal)
      if (!next) {
        setSearchErr('Deal ID not found. Try one of the quick picks below.')
        return false
      }
      setScreen(next)
      return true
    } catch (error) {
      if (isAbort(error)) return false
      setSearchErr(`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID could not be read: ${messageOf(error)}`)
      return false
    } finally {
      if (dealAbort.current === ctrl) setLoadingDeal(false)
    }
  }

  const loadDeal = (text: string) => {
    if (list.state !== 'sap') {
      setSearchErr(list.state === 'loading' ? 'Loading Deal IDs…' : list.reason)
      return
    }
    const r = resolveDealId(text, picks)
    if (!r.ok) {
      setSearchErr(r.error)
      return
    }
    setSearchErr(null)
    setSelected(null)
    void fetchDeal(r.id)
  }

  const clearDeal = () => {
    dealAbort.current?.abort()
    setScreen(null)
    setSelected(null)
    setSearchText('')
    setSearchErr(null)
  }

  /** REF: clears the tables and reads them again (PBO rebuilds them). */
  const refresh = () => {
    if (!deal) return
    void reloadList()
    void fetchDeal(deal.dealId).then((ok) => {
      if (ok) showToast('Data refreshed', 'success')
    })
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
    // USER_COMMAND_9000 UPD: gv_mc = gv_omc.
    setCcMcRef(deal.mcRef)
    setCcAlert(null)
    setModal('changeConfirm')
  }

  /**
   * CONF validates, then FORM update_inv_ref writes ZSGTSFTR_INV_REF / ZSGTSFTR_DEALID from the
   * legs and changes every FTR transaction through BAPIs — none of which has an API.
   */
  const confirmChange = () => {
    if (!deal) return
    const mcRef = ccMcRef.trim()
    if (!mcRef) {
      setCcAlert('MC Ref No is required.')
      return
    }
    setCcAlert(ACTION_WAITING.confirm)
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
    closeModals()
    showToast(ACTION_WAITING.editPair, 'error')
  }

  /* ---------- Cancel Deal ID (CAN) / Reverse MO Confirmation (REV) / SS Deal ---------- */

  /** FORM deassign_data: the ABAP's own UPDATE of ZSGTSFTR_DEALID to status 30, then leave. */
  const confirmCancelDeal = async () => {
    if (!screen || busy) return
    setBusy(true)
    try {
      await cancelDealId(screen.rows)
      closeModals()
      clearDeal()
      showToast('FX Deal ID deassigned successfully.', 'success')
      void reloadList()
    } catch (error) {
      closeModals()
      showToast(messageOf(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirmReverse = () => {
    closeModals()
    showToast(ACTION_WAITING.reverse, 'error')
  }

  const confirmSsDeal = () => {
    closeModals()
    showToast(ACTION_WAITING.ssDeal, 'error')
  }

  /* ---------- DMS ---------- */

  const uploadDocument = () => {
    if (!deal) return
    showToast(ACTION_WAITING.dms, 'error')
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
                    placeholder={picks[0] ? `e.g. ${picks[0].dealId}` : 'Deal ID'}
                    autoComplete="off"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadDeal(searchText)
                    }}
                  />
                  <datalist id={listId}>
                    {picks.map((d) => (
                      <option key={d.dealId} value={d.dealId} />
                    ))}
                  </datalist>
                  {searchErr !== null && <div className="err-msg">{searchErr}</div>}
                </div>
                <button type="button" className="btn btn-primary" disabled={loadingDeal} onClick={() => loadDeal(searchText)}>
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
              {picks.map((d) => (
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
                  emptyText={deal.legs.length === 0 && screen?.legsWaiting ? screen.legsWaiting : 'No matching deal legs.'}
                />
              </div>

              {!deal.noInv && screen && <InvoiceTable rows={screen.invoices} waiting={screen.invoiceWaiting} />}
              {!deal.noInv && screen && <PlTable waiting={screen.plWaiting} />}
            </section>
          )}

          {/* Empty state */}
          {!deal && (
            <div className="empty-state">
              <div className="icon">&#128269;</div>
              <h3>{loadingDeal ? 'Loading deal…' : 'No deal loaded'}</h3>
              <p>
                {list.state === 'loading'
                  ? 'Loading Deal IDs…'
                  : list.state === 'unavailable'
                    ? list.reason
                    : 'Search for a Deal ID above, or pick one of the quick-access deals to see its FX legs, invoice plan and P&L.'}
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
            mcHelp={screen?.mcHelp ?? []}
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
            replacements={[]}
            waiting={screen?.replacementWaiting ?? ''}
            onToggleEdit={() => setEditDraft((d) => (d ? toggleEditing(d) : d))}
            onChoose={(rfha) => setEditDraft((d) => (d ? { ...d, newRfha: rfha } : d))}
            onUpdate={updatePair}
            onClose={closeModals}
          />
        )}
        {deal && modal === 'premium' && <PremiumModal waiting={PREMIUM_WAITING} onClose={closeModals} />}
        {deal && modal === 'cancelDeal' && (
          <PromptModal
            title="Cancel Deal ID"
            icon="warn"
            message="FX Deal ID will be deassigned completely. Do you want to confirm?"
            noLabel="No"
            yesLabel="Yes, Cancel Deal ID"
            yesClass="btn-danger"
            onYes={() => void confirmCancelDeal()}
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
          <DmsModal waiting={DMS_LIST_WAITING} onUpload={uploadDocument} onClose={closeModals} />
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
