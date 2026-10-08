import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { flushSync } from 'react-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FS_SHORT_LOGO } from '../../shared/fx/logo.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import {
  CONFIRM_WAITING,
  DEAL_PAIR_WAITING,
  DMS_WAITING,
  PREMIUM_WAITING,
  SAVE_PL_WAITING,
  cancelDealId,
  loadScreen,
  reverseMoConfirmation,
  ssDeallocate,
  type DataSource,
} from './api.ts'
import { DealCombo } from './DealCombo.tsx'
import { HeaderCard, InvoiceAndPlCards, LegTable } from './DealTables.tsx'
import { firstUnreadyLeg, toggleLeg, toolbarButtons } from './logic.ts'
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
import { ICON_REFRESH, TOOLBAR } from './parts.tsx'
import './mo-confirm-fx-deal-id-ss.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-confirm-fx-deal-id-ss.dark.css'
import './mo-confirm-fx-deal-id-ss.overrides.css'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import type { ResultTone } from '../../shared/ui/ResultDialog.tsx'
import type { Deal, DealDb, Leg, Toast, ToastKind, ToolbarCode } from './types.ts'

const TOAST_MS = 3200
const TOAST_FADE_MS = 250
let toastSeq = 0

type PendingConfirm = { title: string; message: string; onYes: () => void }

/**
 * ZSGTSFP017: MO — Confirm FX Deal ID for SS (Single Deal ID), converted from
 * legacy/confirm-fx-deal-id for ss.html. A no-invoice-model deal shows the ZSGTSFP018 tcode.
 *
 * The Deal IDs, their header, status texts and invoice plan are read from SAP through the
 * middleware (api.ts, which maps every field to its table); the FX legs, Planned P&L and
 * Premium Adjustments say WAITING FOR API. Cancel, SS Deallocation and Reverse MO Confirmation
 * write ZSGTSFTR_DEALID exactly as the ABAP does; every function that needs a BAPI / FM says
 * WAITING FOR ACTION API and changes nothing.
 */
export default function MoConfirmFxDealIdSs() {
  const [db, setDb] = useState<DealDb>({})
  const [source, setSource] = useState<DataSource | 'loading'>('loading')
  const [reason, setReason] = useState('')
  const [replacementsWaiting, setReplacementsWaiting] = useState('')
  const [dealId, setDealId] = useState<string | null>(null)
  const [comboText, setComboText] = useState('')
  const [selectedRfha, setSelectedRfha] = useState<string | null>(null)
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

  const [results, setResults] = useState<ResultItem[]>([])
  const dismissResult = useCallback((id: number) => setResults((r) => r.filter((x) => x.id !== id)), [])
  /**
   * Outcomes open the standard ResultDialog queue. Only the cosmetic confirmations ("Deal ID refreshed.",
   * "Exchange rates recalculated.", "Nothing to refresh.") stay on the small non-modal toast.
   */
  const showToast = useCallback((message: string, kind: ToastKind = 'info', quiet = false) => {
    const id = ++toastSeq
    if (!quiet) {
      const tone: ResultTone = kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info'
      const title = tone === 'success' ? 'Success' : tone === 'error' ? 'Error' : 'Information'
      setResults((r) => [...r, { id, tone, title, message }])
      return
    }
    setToasts((t) => [...t, { id, kind, message, fading: false }])
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, fading: true } : x)))
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_FADE_MS)
    }, TOAST_MS)
  }, [])

  /** Reads every Deal ID again; there is no local copy to patch, as the ABAP re-selects too. */
  const reload = useCallback(async (signal?: AbortSignal) => {
    const loaded = await loadScreen(signal)
    setDb(loaded.deals)
    setSource(loaded.source)
    setReason(loaded.reason)
    setReplacementsWaiting(loaded.replacementsWaiting)
    return loaded
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    reload(ctrl.signal).catch((error: unknown) => {
      if (!isAbort(error)) console.warn('[fx] Confirm FX Deal ID for SS: load failed', error)
    })
    return () => ctrl.abort()
  }, [reload])

  /** Runs a ZSGTSFTR_DEALID write, then re-reads the deals; a failure is reported, never hidden. */
  const write = async (run: () => Promise<{ posted: boolean; message: string }>) => {
    try {
      const { posted, message } = await run()
      if (!posted) {
        showToast(message, 'error')
        return
      }
      await reload()
      showToast(message, 'success')
    } catch (error) {
      showToast(messageOf(error), 'error')
    }
  }

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
      showToast('Nothing to refresh.', 'info', true)
      return
    }
    // 'REF' clears the grids, so STATUS_9000 selects the deal again.
    reload()
      .then((loaded) =>
        loaded.source === 'sap' ? showToast('Deal ID refreshed.', 'info', true) : showToast(loaded.reason, 'error'),
      )
      .catch((error: unknown) => showToast(messageOf(error), 'error'))
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
    // FORM update_inv_ref needs BAPIs (exchange rate, FTR change): nothing is written.
    showToast(CONFIRM_WAITING, 'error')
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
    // FORM update_deal_id changes both FTR transactions by BAPI before ZSGTSFTR_DEALID: nothing is written.
    showToast(DEAL_PAIR_WAITING, 'error')
  }

  /* ---------- Cancel / SS Deallocation / Reverse ---------- */
  const cancelDealConfirm = () => {
    if (!deal) return
    const target = deal
    cancelModal.close()
    askConfirm('Cancel Deal ID', 'FX Deal ID deassigned completely. Do you want to confirm?', () => {
      void write(async () => {
        await cancelDealId(target)
        return { posted: true, message: `Deal ID ${target.dealId} deassigned.` }
      })
    })
  }

  const ssDeallocConfirm = () => {
    if (!deal) return
    const target = deal
    ssModal.close()
    askConfirm('SS Deallocation', 'Do you want to confirm SS Deallocation?', () => {
      void write(async () => {
        await ssDeallocate(target)
        return { posted: true, message: `Deal ID ${target.dealId} has been SS deallocated.` }
      })
    })
  }

  const reverseMo = () => {
    if (!deal) return
    const target = deal
    if (target.status !== '02' && target.status !== '03') {
      showToast('Selected Deal ID can not be reversed', 'error')
      return
    }
    askConfirm('Reverse MO Confirmation', 'Do you really want to Reverse MO Confirmation?', () => {
      void write(() => reverseMoConfirmation(target))
    })
  }

  /* ---------- DMS ---------- */
  // 'DMS' calls ZSGTSFFM_DMS, which has no API: the list stays empty and uploads are refused.
  const openDms = () => {
    if (!deal) return
    dmsModal.open()
  }

  const dmsUpload = () => {
    if (!deal) return
    showToast(DMS_WAITING, 'error')
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
    SS_DEAL: () => showToast(SAVE_PL_WAITING, 'error'),
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
            {/* Inside a loaded deal, the original's Back: leaves the deal and returns to the Deal ID search. */}
            <BackButton className="fx-back-btn" onClick={deal ? back : undefined} />
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
            <DealCombo
              db={db}
              value={comboText}
              onChange={setComboText}
              onPick={loadDeal}
              emptyText={
                source === 'unavailable' ? reason : source === 'loading' ? 'Loading Deal IDs…' : 'No matching Deal ID'
              }
            />
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
              waiting={deal.legsWaiting}
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
              <div>
                {source === 'unavailable'
                  ? reason
                  : source === 'loading'
                    ? 'Loading Deal IDs from SAP…'
                    : 'Search for a Deal ID above to begin the confirmation workflow.'}
              </div>
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
        onRecalc={() => showToast('Exchange rates recalculated.', 'info', true)}
        onConfirm={invoicePlanConfirm}
      />
      <PremiumModal modal={preModal} deal={deal} waiting={PREMIUM_WAITING} />
      <EditPairModal
        modal={edModal}
        leg={edLeg}
        replacements={[]}
        replacementsWaiting={replacementsWaiting}
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
        docs={[]}
        onUpload={dmsUpload}
        onRemove={() => undefined}
      />
      <TxnViewModal modal={txModal} deal={deal} leg={txLeg} />

      {ghostText !== null ? (
        <div className="drag-ghost" ref={ghostRef}>
          {ghostText}
        </div>
      ) : null}

      <ResultQueue items={results} onDismiss={dismissResult} />

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
