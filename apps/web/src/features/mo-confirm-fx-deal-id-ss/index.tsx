import { useCallback, useRef, useState, type DragEvent } from 'react'
import { flushSync } from 'react-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { makeDealDb, seedDocs } from './data.ts'
import { DealCombo } from './DealCombo.tsx'
import { HeaderCard, InvoiceAndPlCards, LegTable } from './DealTables.tsx'
import { todayStr } from './format.ts'
import {
  cancelDealId,
  collectRates,
  confirmInvoicePlan,
  firstUnreadyLeg,
  removeDoc,
  reverseMoConfirmation,
  saveInvoiceRates,
  ssDeallocate,
  toggleLeg,
  toolbarButtons,
  updateDealPair,
  uploadDoc,
} from './logic.ts'
import { useModal } from './modal.tsx'
import {
  ConfirmModal,
  DealSummaryModal,
  DmsModal,
  EditPairModal,
  InvoicePlanModal,
  PremiumModal,
  TxnViewModal,
} from './Modals.tsx'
import { ICON_BACK, ICON_REFRESH, TOOLBAR } from './parts.tsx'
import './mo-confirm-fx-deal-id-ss.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id-ss.dark.css'
import type { Deal, DealDb, DmsDoc, Leg, Toast, ToastKind, ToolbarCode } from './types.ts'

const TOAST_MS = 3200
const TOAST_FADE_MS = 250
let toastSeq = 0

type PendingConfirm = { title: string; message: string; onYes: () => void }

/**
 * ZSGTSFP017: MO — Confirm FX Deal ID for SS (Single Deal ID), converted from
 * legacy/confirm-fx-deal-id for ss.html. A no-invoice-model deal shows the ZSGTSFP018 tcode.
 *
 * The original never called an API, so this is the same UI-only screen on the page's dummy
 * deals, which live in component state for the session: pick a Deal ID, review its legs,
 * invoice plan and planned P&L (with the Short Straddle premium rows), and run the toolbar
 * functions (Change / Confirm, Premium Adjustment, Edit Deal Pair, Cancel, SS Deallocation,
 * Save P&L Value, Reverse MO Confirmation, DMS).
 */
export default function MoConfirmFxDealIdSs() {
  const [db, setDb] = useState<DealDb>(makeDealDb)
  const [dealId, setDealId] = useState<string | null>(null)
  const [comboText, setComboText] = useState('')
  const [selectedRfha, setSelectedRfha] = useState<string | null>(null)
  const [docsByDeal, setDocsByDeal] = useState<Record<string, DmsDoc[]>>({})
  const [toasts, setToasts] = useState<Toast[]>([])

  const ipModal = useModal()
  const [rateTexts, setRateTexts] = useState<string[]>([])
  const [unreadyRfha, setUnreadyRfha] = useState<string | null>(null)

  const preModal = useModal()

  const edModal = useModal()
  const [edRfha, setEdRfha] = useState<string | null>(null)
  const [edNewTxn, setEdNewTxn] = useState('')
  const [edInputEnabled, setEdInputEnabled] = useState(false)
  const [edError, setEdError] = useState(false)

  const cancelModal = useModal()
  const ssModal = useModal()
  const confirmModal = useModal()
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const dmsModal = useModal()
  const txModal = useModal()
  const [txRfha, setTxRfha] = useState<string | null>(null)

  const draggedLeg = useRef<Leg | null>(null)
  const [draggingRfha, setDraggingRfha] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [ghostText, setGhostText] = useState<string | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const deal: Deal | null = dealId ? (db[dealId] ?? null) : null

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, kind, message, fading: false }])
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, fading: true } : x)))
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_FADE_MS)
    }, TOAST_MS)
  }, [])

  const patchDeal = (id: string, fn: (d: Deal) => Deal) =>
    setDb((cur) => {
      const d = cur[id]
      return d ? { ...cur, [id]: fn(d) } : cur
    })

  const askConfirm = (title: string, message: string, onYes: () => void) => {
    setPending({ title, message, onYes })
    confirmModal.open()
  }

  /* ---------- Selection ---------- */
  const loadDeal = (id: string) => {
    if (!db[id]) {
      showToast(`Deal ID ${id} was not found.`, 'error')
      return
    }
    setDealId(id)
    setSelectedRfha(null)
  }

  const back = () => {
    setDealId(null)
    setSelectedRfha(null)
    setComboText('')
  }

  const refresh = () => {
    if (!deal) {
      showToast('Nothing to refresh.')
      return
    }
    // The original re-read the deal from its in-page DEAL_DB, i.e. the same (edited) record.
    showToast('Deal ID refreshed.')
  }

  const viewTxn = (rfha: string) => {
    if (!deal?.legs.some((l) => l.rfha === rfha)) return
    setTxRfha(rfha)
    txModal.open()
  }

  /* ---------- Change / Confirm (Invoice Plan) ---------- */
  const openInvoicePlan = () => {
    if (!deal) return
    setRateTexts(deal.invoices.map((i) => String(i.exRate)))
    setUnreadyRfha(null)
    ipModal.open()
  }

  const invoicePlanConfirm = () => {
    if (!deal) return
    const notReady = firstUnreadyLeg(deal)
    if (notReady) {
      setUnreadyRfha(notReady.rfha)
      return
    }
    const rates = collectRates(deal, rateTexts)
    patchDeal(deal.dealId, (d) => confirmInvoicePlan(saveInvoiceRates(d, rates)))
    ipModal.close()
    showToast('Invoice plan confirmed.', 'success')
  }

  /* ---------- Edit Deal Pair ---------- */
  const openEditPair = (rfha: string | null) => {
    const l = deal?.legs.find((x) => x.rfha === rfha)
    if (!l) {
      showToast('Select a transaction row first.', 'error')
      return
    }
    setEdRfha(l.rfha)
    setEdNewTxn('')
    setEdInputEnabled(false)
    setEdError(false)
    edModal.open()
  }

  const dealPairUpdate = () => {
    if (!deal) return
    if (!edNewTxn) {
      setEdError(true)
      return
    }
    const oldRfha = edRfha
    const newRfha = edNewTxn
    patchDeal(deal.dealId, (d) => updateDealPair(d, oldRfha, newRfha))
    setSelectedRfha(newRfha)
    edModal.close()
    showToast(`Deal pair updated: ${newRfha} replaces ${oldRfha ?? ''}.`, 'success')
  }

  /* ---------- Cancel / SS Deallocation / Reverse ---------- */
  const cancelDealConfirm = () => {
    if (!deal) return
    const id = deal.dealId
    cancelModal.close()
    askConfirm('Cancel Deal ID', 'FX Deal ID deassigned completely. Do you want to confirm?', () => {
      patchDeal(id, cancelDealId)
      showToast(`Deal ID ${id} deassigned.`, 'success')
    })
  }

  const ssDeallocConfirm = () => {
    if (!deal) return
    const id = deal.dealId
    ssModal.close()
    askConfirm('SS Deallocation', 'Do you want to confirm SS Deallocation?', () => {
      patchDeal(id, ssDeallocate)
      showToast(`Deal ID ${id} has been SS deallocated.`, 'success')
    })
  }

  const reverseMo = () => {
    if (!deal) return
    const id = deal.dealId
    askConfirm('Reverse MO Confirmation', 'Do you really want to Reverse MO Confirmation?', () => {
      patchDeal(id, reverseMoConfirmation)
      showToast('MO Confirmation has been reversed successfully.', 'success')
    })
  }

  /* ---------- DMS ---------- */
  const openDms = () => {
    if (!deal) return
    const id = deal.dealId
    setDocsByDeal((m) => (m[id] ? m : { ...m, [id]: seedDocs(todayStr()) }))
    dmsModal.open()
  }

  const dmsUpload = () => {
    if (!deal) return
    const id = deal.dealId
    setDocsByDeal((m) => ({ ...m, [id]: uploadDoc(m[id] ?? [], todayStr()) }))
    showToast('Document uploaded (mock).', 'success')
  }

  const dmsRemove = (index: number) => {
    if (!deal) return
    const id = deal.dealId
    setDocsByDeal((m) => ({ ...m, [id]: removeDoc(m[id] ?? [], index) }))
  }

  /* ---------- Drag and drop ----------
     A dragged leg row selects itself and, dropped on Edit Deal Pair, calls the same
     openEditPair the button's click uses — never a separate drag-only code path. */
  const onLegDragStart = (e: DragEvent<HTMLTableRowElement>, l: Leg) => {
    draggedLeg.current = l
    setSelectedRfha(l.rfha)
    setDraggingRfha(l.rfha)
    // The ghost has to be in the DOM before setDragImage reads it.
    flushSync(() => setGhostText(`${l.rfha} — ${l.instrument}`))
    e.dataTransfer.effectAllowed = 'copy'
    try {
      e.dataTransfer.setData('text/plain', l.rfha)
    } catch {
      /* some browsers refuse setData here; the ref carries the leg anyway */
    }
    if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 12, 14)
    setTimeout(() => setGhostText(null), 0)
  }

  const onLegDragEnd = () => {
    draggedLeg.current = null
    setDraggingRfha(null)
    setDragOver(false)
  }

  const dropTargetProps = {
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!draggedLeg.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(false)
      const l = draggedLeg.current
      if (l) {
        setSelectedRfha(l.rfha)
        openEditPair(l.rfha)
      }
    },
  }

  const toolbarActions: Record<ToolbarCode, () => void> = {
    UPD: openInvoicePlan,
    PRE: preModal.open,
    DEAL_EDIT: () => openEditPair(selectedRfha),
    CAN: cancelModal.open,
    SS_DEALLOC: ssModal.open,
    SS_DEAL: () => showToast('Deal Confirmed Successfully.', 'success'),
    REV: reverseMo,
    DMS: openDms,
    REF: refresh,
  }

  const edLeg = deal?.legs.find((l) => l.rfha === edRfha) ?? null
  const txLeg = deal?.legs.find((l) => l.rfha === txRfha) ?? null

  return (
    <div className="mo-confirm-fx-deal-id-ss">
      <div className="app">
        {/* ============ TOP BAR ============ */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="brand">
              <img className="logo-img" src={FS_SHORT_LOGO} alt="FS logo" />
              <div className="page-title-block">
                <h1>Confirm FX Deal ID</h1>
                <div className="subtitle">
                  <span>Middle Office single-deal confirmation workflow</span>
                  <span className="tcode-chip">{deal?.noInvoiceModel ? 'ZSGTSFP018' : 'ZSGTSFP017'}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            {deal ? (
              // The original's Back: leaves the loaded deal and returns to the Deal ID search.
              <button type="button" className="btn btn-secondary" onClick={back}>
                {ICON_BACK}
                Back
              </button>
            ) : (
              <BackButton className="btn btn-secondary" />
            )}
            <button type="button" className="btn btn-secondary" onClick={refresh}>
              {ICON_REFRESH}
              Refresh
            </button>
            <SignOutButton className="btn btn-secondary" />
          </div>
        </div>

        {/* ============ SELECTION ============ */}
        <div className="card selector-card">
          <div className="field-group">
            <div className="field-label">
              Deal ID<span className="req">*</span>
            </div>
            <DealCombo db={db} value={comboText} onChange={setComboText} onPick={loadDeal} />
          </div>
          <div className="selector-hint">Select a Deal ID to load its FX legs, invoice plan and settlement P&amp;L.</div>
        </div>

        {deal ? (
          <div>
            <HeaderCard deal={deal} />

            <div className="toolbar">
              {toolbarButtons(deal, selectedRfha).map((code) => {
                const def = TOOLBAR[code]
                const isDrop = code === 'DEAL_EDIT'
                return (
                  <button
                    key={code}
                    type="button"
                    className={`btn btn-sm btn-${def.variant}${isDrop && dragOver ? ' drag-over' : ''}`}
                    title={code}
                    onClick={toolbarActions[code]}
                    {...(isDrop ? dropTargetProps : {})}
                  >
                    {def.icon}
                    {def.label}
                  </button>
                )
              })}
            </div>

            <LegTable
              legs={deal.legs}
              selectedRfha={selectedRfha}
              draggingRfha={draggingRfha}
              onToggle={(rfha) => setSelectedRfha((cur) => toggleLeg(cur, rfha))}
              onView={viewTxn}
              onDragStart={onLegDragStart}
              onDragEnd={onLegDragEnd}
            />

            <InvoiceAndPlCards deal={deal} />
          </div>
        ) : (
          /* ============ EMPTY STATE ============ */
          <div className="card">
            <div className="empty-state">
              <div className="es-icon">🔍</div>
              <div style={{ fontWeight: 600, color: 'var(--text-soft)', marginBottom: 2 }}>No Deal ID selected</div>
              <div>Search for a Deal ID above to begin the confirmation workflow.</div>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODALS ================= */}
      <InvoicePlanModal
        modal={ipModal}
        deal={deal}
        rateTexts={rateTexts}
        onRateChange={(i, v) => setRateTexts((r) => r.map((x, j) => (j === i ? v : x)))}
        unreadyRfha={unreadyRfha}
        onRecalc={() => showToast('Exchange rates recalculated.')}
        onConfirm={invoicePlanConfirm}
      />
      <PremiumModal modal={preModal} deal={deal} />
      <EditPairModal
        modal={edModal}
        deal={deal}
        leg={edLeg}
        newTxn={edNewTxn}
        onNewTxnChange={setEdNewTxn}
        inputEnabled={edInputEnabled}
        onToggleInput={() => setEdInputEnabled((v) => !v)}
        showError={edError}
        onUpdate={dealPairUpdate}
      />
      <DealSummaryModal
        modal={cancelModal}
        title="Cancel Deal ID"
        deal={deal}
        actionLabel="Cancel Deal ID"
        onAction={cancelDealConfirm}
      />
      <DealSummaryModal
        modal={ssModal}
        title="SS Deallocation"
        deal={deal}
        actionLabel="SS Deallocation"
        onAction={ssDeallocConfirm}
      />
      <ConfirmModal
        modal={confirmModal}
        title={pending?.title ?? 'Confirm'}
        message={pending?.message ?? 'Are you sure?'}
        onYes={() => {
          confirmModal.close()
          pending?.onYes()
        }}
      />
      <DmsModal
        modal={dmsModal}
        docs={(dealId ? docsByDeal[dealId] : undefined) ?? []}
        onUpload={dmsUpload}
        onRemove={dmsRemove}
      />
      <TxnViewModal modal={txModal} deal={deal} leg={txLeg} />

      {ghostText !== null ? (
        <div className="drag-ghost" ref={ghostRef}>
          {ghostText}
        </div>
      ) : null}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={t.kind === 'info' ? 'toast' : `toast ${t.kind}`}
            style={t.fading ? { transition: 'opacity .25s ease', opacity: 0 } : undefined}
          >
            <span className="t-icon">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
