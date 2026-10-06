import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { FX_LOGO as COMPANY_LOGO } from '../../shared/fx/logo.ts'
import { ACTION_WAITING, gateOutcome, loadDeal } from './api.ts'
import { DetailGrid, FxTable, InvTable, StatusBadge, Toolbar, type DropHandlers } from './DealPanels.tsx'
import { DocPreviewModal } from './DocModals.tsx'
import {
  accountingCompleted,
  canPostTradeInvoice,
  initiateSettlement,
  noPendingPostAllToast,
  pendingPostAll,
  postAllConfirm,
  postFxDeal,
  postingAction,
  resolveDrop,
  txnAction,
  type NextDoc,
  type PostingAction,
  type TxnAction,
} from './logic.ts'
import { useEscape } from './modal.tsx'
import './bo-post-accounting-settlement.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './bo-post-accounting-settlement.dark.css'
import './bo-post-accounting-settlement.overrides.css'
import { PostAllModal } from './PostAllModal.tsx'
import { PostingModal } from './PostingModal.tsx'
import { TxnModal } from './TxnModal.tsx'
import type { ActiveModal, Deal, DocPreview, DragKind, DragState, Outcome, ToastKind, ToastMessage } from './types.ts'

/** The pure rules only validate here: their outcome is never applied, so no document number is drawn. */
const NO_DOC: NextDoc = () => ''

const TOAST_MS = 3600

/**
 * BO: Post Accounting Entries for Settlement (ZSGTSFR081 / ZSGTSF_RDEAL_TRD_POST), converted
 * from legacy/bo-post-accounting-settlement.html. The Deal ID header is read from SAP by key; the
 * FX / trade invoice legs and every posting wait for an API (see api.ts). No sample data.
 */
export default function BoPostAccountingSettlement() {
  const [dealInput, setDealInput] = useState('')
  const [deal, setDeal] = useState<Deal | null>(null)
  const [explainHidden, setExplainHidden] = useState(false)

  // Popups
  const [modal, setModal] = useState<ActiveModal>(null)
  const [txnIdx, setTxnIdx] = useState(0)
  const [postingIdx, setPostingIdx] = useState(0)
  const [preview, setPreview] = useState<DocPreview | null>(null)

  // Drag and drop: the ref is read between renders, the state paints the row / button hints.
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [over, setOver] = useState<DragKind | null>(null)

  // Toast
  const [toast, setToast] = useState<ToastMessage & { show: boolean }>({
    message: 'Ready. Enter a Deal ID.',
    kind: '',
    show: true,
  })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setStatus = useCallback((message: string, kind: ToastKind) => {
    setToast({ message, kind, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
  }, [])
  useEffect(() => {
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), TOAST_MS)
    return () => clearTimeout(toastTimer.current)
  }, [])

  const closeAll = useCallback(() => setModal(null), [])
  useEscape(closeAll)

  /** Runs the screen's rule for its validation only; a change it would make has to come from SAP. */
  const gate = (d: Deal, o: Outcome, waiting: string) => {
    const t = gateOutcome(d, o, waiting)
    setStatus(t.message, t.kind)
  }

  // ---------------------------------------------------------------- load / refresh

  const load = async (raw: string) => {
    let r: Awaited<ReturnType<typeof loadDeal>>
    try {
      r = await loadDeal(raw)
    } catch {
      return
    }
    if (!r.ok) {
      setStatus(r.message, 'error')
      if (raw.trim()) setDeal(null)
      return
    }
    setDeal(r.deal)
    setDealInput(r.deal.dealId)
    setStatus(`Deal ID ${r.deal.dealId} loaded.`, 'success')
  }

  const refresh = () => {
    if (!deal) {
      setStatus('Load a Deal ID first.', 'error')
      return
    }
    // Re-reads the Deal ID from SAP.
    void load(deal.dealId).then(() => setStatus('Screen refreshed.', ''))
  }

  // ---------------------------------------------------------------- toolbar

  const onPostFx = () => {
    if (deal) gate(deal, postFxDeal(deal, NO_DOC), ACTION_WAITING.postFx)
  }

  const onPostInvoice = () => {
    if (!deal) return
    const guard = canPostTradeInvoice(deal)
    if (!guard.allowed) {
      setStatus(guard.toast.message, guard.toast.kind)
      return
    }
    if (!deal.inv.length && deal.invWaiting) {
      setStatus(deal.invWaiting, 'error')
      return
    }
    if (!pendingPostAll(deal).length) {
      const t = noPendingPostAllToast()
      setStatus(t.message, t.kind)
      return
    }
    setModal('pall')
  }

  const onAccounting = () => {
    if (deal) gate(deal, accountingCompleted(deal), ACTION_WAITING.accounting)
  }

  const onInitiate = () => {
    if (deal) gate(deal, initiateSettlement(deal), ACTION_WAITING.initiate)
  }

  // ---------------------------------------------------------------- popups

  const openTxn = (idx: number) => {
    setTxnIdx(idx)
    setModal('txn')
  }
  const openPosting = (idx: number) => {
    setPostingIdx(idx)
    setModal('posting')
  }
  const showPreview = (p: DocPreview) => {
    setPreview(p)
    setModal('doc')
  }

  const onTxnAction = (action: TxnAction) => {
    if (!deal) return
    const o = txnAction(deal, txnIdx, action, NO_DOC)
    if (!deal.top[txnIdx]) return setStatus(o.toast.message, o.toast.kind)
    if (action === 'TEST') return setStatus(ACTION_WAITING.txnTest, 'error')
    if (action === 'UPD') return setStatus(ACTION_WAITING.txnUpdate, 'error')
    gate(deal, o, ACTION_WAITING.txnPost)
  }

  const onPostingAction = (action: PostingAction) => {
    if (!deal) return
    const o = postingAction(deal, postingIdx, action, NO_DOC)
    if (!deal.inv[postingIdx]) return setStatus(o.toast.message, o.toast.kind)
    if (action === 'UPD_DATA') return setStatus(ACTION_WAITING.invUpdate, 'error')
    gate(deal, o, action === 'SET_EXE' ? ACTION_WAITING.invSettle : ACTION_WAITING.invPost)
  }

  const onPostAllConfirm = () => {
    if (!deal) return
    gate(deal, postAllConfirm(deal, NO_DOC), ACTION_WAITING.postAll)
    setModal(null)
  }

  // ---------------------------------------------------------------- drag and drop: row -> action button

  const endDrag = () => {
    dragRef.current = null
    setDragging(null)
    setOver(null)
  }

  const drag = {
    dragging,
    onDragStart: (e: DragEvent<HTMLTableRowElement>, kind: DragKind, idx: number) => {
      dragRef.current = { kind, idx }
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', `${kind}:${idx}`)
      } catch {
        // Some browsers refuse setData outside a real drag; the ref carries the payload anyway.
      }
      setDragging({ kind, idx })
    },
    onDragEnd: endDrag,
  }

  const drop: DropHandlers = {
    over,
    onDragOver: (e) => {
      if (dragRef.current) e.preventDefault()
    },
    onDragEnter: (e, kind) => {
      if (!dragRef.current) return
      e.preventDefault()
      setOver(kind)
    },
    onDragLeave: (kind) => setOver((cur) => (cur === kind ? null : cur)),
    onDrop: (e, target) => {
      e.preventDefault()
      const decision = resolveDrop(target, dragRef.current?.kind ?? null)
      endDrag()
      if (decision.run === 'none') return
      if (decision.run === 'error') {
        setStatus(decision.message, 'error')
        return
      }
      if (decision.run === 'fx') onPostFx()
      else onPostInvoice()
    },
  }

  const txnLeg = deal?.top[txnIdx] ?? null
  const postingLeg = deal?.inv[postingIdx] ?? null

  return (
    <div className={dragging ? 'bo-post-accounting-settlement row-dragging' : 'bo-post-accounting-settlement'}>
      <div className="page-head">
        <BackButton className="btn-outline" />
        <img className="head-icon" src={COMPANY_LOGO} alt="Company logo" />
        <div className="title-wrap">
          <div className="page-title">BO: Post Accounting Entries for Settlement</div>
          <div className="page-subtitle">
            Transaction ZSGTSFR081 · Settle the FX deal and trade invoice legs for a single Deal ID
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn-icon" title="Refresh" disabled={!deal} onClick={refresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path
                d="M20 5v6h-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <SignOutButton className="btn-outline" />
        </div>
      </div>

      <main>
        <div className={explainHidden ? 'explain hidden' : 'explain'}>
          <button type="button" className="explain-close" title="Dismiss" onClick={() => setExplainHidden(true)}>
            {'✕'}
          </button>
          <b>What this screen does:</b> once a{' '}
          <span
            className="term-def"
            title="The key that links the Master Contract, FX Deal, Bill of Lading and Trade Invoices together once a shipment is matched to an FX deal."
          >
            Deal ID
          </span>{' '}
          has been confirmed, this is where Back Office settles it — posting the{' '}
          <span
            className="term-def"
            title="The pair of offsetting currency deals (D1/D2) booked between group entities to pass FX exposure down the Entity String."
          >
            FX Deal
          </span>{' '}
          accounting entries, posting each{' '}
          <span
            className="term-def"
            title="One accounting document per leg of the Entity String (e.g. T1, T2, T3) raised once a Bill of Lading is attached to the Deal ID."
          >
            Trade Invoice
          </span>{' '}
          leg, and marking the{' '}
          <span
            className="term-def"
            title="The day the FX Deal and its linked invoices are paid & received — by design, on the same date."
          >
            Settlement
          </span>{' '}
          complete. Load a Deal ID below to begin.
        </div>

        {/* ============== PANEL: Deal ID lookup ============== */}
        <div className="panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet"></span>
              <h2>Basic Selection</h2>
            </div>
            <span className="panel-sub"></span>
          </div>
          <div className="panel-body">
            <div className="search-row">
              <div className="search-box">
                <span className="icon">{'🔍'}</span>
                <input
                  type="text"
                  placeholder="Enter Deal ID..."
                  value={dealInput}
                  onChange={(e) => setDealInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void load(dealInput)
                  }}
                />
              </div>
              <button type="button" className="btn-go" onClick={() => void load(dealInput)}>
                Go
              </button>
            </div>
          </div>
        </div>

        {deal && (
          <>
            {/* ============== PANEL: Header details ============== */}
            <div className="panel">
              <div className="panel-title">
                <div className="panel-title-left">
                  <span className="dot-bullet"></span>
                  <h2>Deal ID {deal.dealId}</h2>
                </div>
                <span>
                  <StatusBadge deal={deal} />
                </span>
              </div>
              <div className="panel-body">
                <DetailGrid deal={deal} />
              </div>
              <Toolbar
                deal={deal}
                drop={drop}
                onRefresh={refresh}
                onViewInvoice={() => showPreview({ kind: 'REPORT' })}
                onPostFx={onPostFx}
                onPostInvoice={onPostInvoice}
                onAccounting={onAccounting}
                onInitiate={onInitiate}
              />
            </div>

            {/* ============== PANEL: FX Deal Settlement ============== */}
            <div className="panel">
              <div className="panel-title">
                <div className="panel-title-left">
                  <span className="dot-bullet"></span>
                  <h2>FX Deal Settlement</h2>
                </div>
                <span className="hint">Double-click a row to post its accounting entries · drag a row onto Post FX Deal</span>
              </div>
              <FxTable deal={deal} drag={drag} onOpen={openTxn} onPreview={showPreview} />
            </div>

            {/* ============== PANEL: Trade Invoice Settlement ============== */}
            <div className="panel">
              <div className="panel-title">
                <div className="panel-title-left">
                  <span className="dot-bullet"></span>
                  <h2>Trade Invoice Settlement</h2>
                </div>
                <span className="hint">Double-click a row to post · drag a row onto Post Trade Invoice</span>
              </div>
              <InvTable deal={deal} drag={drag} onOpen={openPosting} onPreview={showPreview} />
            </div>
          </>
        )}
      </main>

      <TxnModal open={modal === 'txn'} leg={txnLeg} onClose={closeAll} onAction={onTxnAction} />
      <PostingModal
        open={modal === 'posting'}
        leg={postingLeg}
        seq={postingIdx + 1}
        onClose={closeAll}
        onAction={onPostingAction}
      />
      <PostAllModal
        open={modal === 'pall'}
        pending={deal ? pendingPostAll(deal) : []}
        onClose={closeAll}
        onConfirm={onPostAllConfirm}
      />
      <DocPreviewModal open={modal === 'doc'} preview={preview} deal={deal} onClose={closeAll} />

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.show && toast.kind ? ` ${toast.kind}` : ''}`}>
        {toast.message}
      </div>
    </div>
  )
}
