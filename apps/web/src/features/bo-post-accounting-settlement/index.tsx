import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { DealDmsModal } from '../../shared/fx/DealDmsModal.tsx'
import { DealPickerModal, ViewDealsButton } from '../../shared/ui/DealPickerModal.tsx'
import { FX_LOGO as COMPANY_LOGO } from '../../shared/fx/logo.ts'
import { demoKey, finishDemo, nextDemoDoc, postDemo, restoreDemo } from './demo.ts'
import { markAccountingComplete } from './accounting.ts'
import {
  ACTION_WAITING,
  filterSuggestions,
  gateOutcome,
  loadDeal,
  loadDealSuggestions,
  type DealSuggestion,
} from './api.ts'
import { LIVE_POSTING, postAllInvoiceLegs, postFxLeg, postInvoiceLeg } from './posting.ts'
import { prepareInvoiceLeg } from './prepare.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { DetailGrid, FxTable, InvTable, StatusBadge, Toolbar, type DropHandlers } from './DealPanels.tsx'
import { DocPreviewModal } from './DocModals.tsx'
import {
  fxPostingPlan,
  invPostingPlan,
  initiateSettlement,
  pendingPostAll,
  postingPlanToast,
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

  // Deal ID dropdown: every ZSGTSFTR_DEALID row, filtered by what is typed; a click loads the deal.
  const [suggestions, setSuggestions] = useState<DealSuggestion[]>([])
  const [suggestError, setSuggestError] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestIdx, setSuggestIdx] = useState(-1)
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    loadDealSuggestions(ctrl.signal)
      .then(setSuggestions)
      .catch((error: unknown) => {
        if (!isAbort(error)) setSuggestError(`Deal IDs could not be read: ${messageOf(error)}`)
      })
    return () => ctrl.abort()
  }, [])
  const shownSuggestions = filterSuggestions(suggestions, dealInput)

  // Popups
  const [modal, setModal] = useState<ActiveModal>(null)
  const [txnIdx, setTxnIdx] = useState(0)
  const [postingIdx, setPostingIdx] = useState(0)
  const [preview, setPreview] = useState<DocPreview | null>(null)
  // Deal ID documents (DMS): shared with MO Execute Settlement; independent of posting and of the Deal ID status.
  const [dmsOpen, setDmsOpen] = useState(false)

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
    setDeal(LIVE_POSTING ? r.deal : restoreDemo(r.deal, localStorage.getItem(demoKey(r.deal.dealId))))
    setDealInput(r.deal.dealId)
    setStatus(`Deal ID ${r.deal.dealId} loaded.`, 'success')
  }

  const pickSuggestion = (dealId: string) => {
    setDealInput(dealId)
    setSuggestOpen(false)
    setSuggestIdx(-1)
    void load(dealId)
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

  const applyDemo = (result: Outcome) => {
    if (result.deal !== deal) {
      try {
        localStorage.setItem(demoKey(result.deal.dealId), JSON.stringify(result.deal))
      } catch {
        setStatus('Demo results could not be saved in this browser. Please enable browser storage and retry.', 'error')
        return
      }
      setDeal(result.deal)
    }
    setStatus(result.toast.message, result.toast.kind)
  }

  // ---------------------------------------------------------------- live posting (VITE_BO_LIVE_POSTING)

  /** Re-reads the Deal ID from SAP, then says what the posting did (the load's own toast is replaced). */
  const afterLive = async (d: Deal, message: string, kind: ToastKind) => {
    await load(d.dealId)
    setStatus(message, kind)
  }

  const liveFx = async (d: Deal, idx: number, testRun: boolean) => {
    const leg = d.top[idx]
    if (!leg) return
    const o = txnAction(d, idx, testRun ? 'TEST' : 'TBB1', NO_DOC)
    if (o.deal === d && o.toast.kind === 'error') return setStatus(o.toast.message, 'error')
    if (!testRun && (leg.txnStatus ?? '') >= '50') return setStatus('This transaction is already posted.', 'error')
    const r = await postFxLeg(leg, { testRun })
    if (testRun) return setStatus(r.message, r.ok ? '' : 'error')
    await afterLive(d, r.message, r.ok ? 'success' : 'error')
  }

  const liveFxAll = async (d: Deal) => {
    const plan = fxPostingPlan(d)
    if (plan.blocking.length || !plan.eligible.length) {
      const t = postingPlanToast('FX deal', plan, '')
      return setStatus(t.message, t.kind)
    }
    const lines: string[] = []
    let failed = false
    for (const leg of d.top.filter((x) => x.seq && (x.txnStatus ?? '') < '50')) {
      const o = txnAction(d, d.top.indexOf(leg), 'TBB1', NO_DOC)
      if (o.deal === d && o.toast.kind === 'error') {
        lines.push(o.toast.message)
        failed = true
        continue
      }
      const r = await postFxLeg(leg, { testRun: false })
      lines.push(r.message)
      failed ||= !r.ok
    }
    await afterLive(d, lines.join(' ') || 'All FX deal legs are already posted.', failed ? 'error' : 'success')
  }

  const liveInvoice = async (d: Deal, idx: number) => {
    const leg = d.inv[idx]
    if (!leg) return
    const o = postingAction(d, idx, 'SET_POST', NO_DOC)
    if (o.deal === d) return setStatus(o.toast.message, 'error')
    // As the pop-up does on opening: the payment amount and debit / credit accounts, stored before anything is posted.
    const prep = await prepareInvoiceLeg(d.dealId, leg.seq ?? '', d.top)
    if (!prep.ok) return setStatus(prep.message, 'error')
    const r = await postInvoiceLeg(d.dealId, leg.seq ?? '', { testRun: false })
    if (r.ok) setModal(null)
    await afterLive(d, r.message, r.ok ? 'success' : 'error')
  }

  // Update: the leg's payment amount and debit / credit accounts, worked out and stored (SAVE_POSTING_DATA).
  const liveUpdate = async (d: Deal, idx: number) => {
    const leg = d.inv[idx]
    if (!leg) return
    const prep = await prepareInvoiceLeg(d.dealId, leg.seq ?? '', d.top)
    if (!prep.ok) return setStatus(prep.message, 'error')
    await afterLive(d, `Posting details saved. ${prep.message}`, 'success')
  }

  const liveInvoiceAll = async (d: Deal) => {
    // Each leg is prepared first; one that cannot be is reported and left out, the others still post.
    const prepared: string[] = []
    const notes: string[] = []
    for (const seq of pendingPostAll(d).map((x) => x.seq ?? '')) {
      const prep = await prepareInvoiceLeg(d.dealId, seq, d.top)
      if (prep.ok) prepared.push(seq)
      else notes.push(prep.message)
    }
    const results = await postAllInvoiceLegs(d.dealId, prepared, {})
    const failed = results.filter((x) => !x.outcome.ok)
    setModal(null)
    await afterLive(
      d,
      [...notes, ...results.map((x) => x.outcome.message)].join(' ') || 'All trade invoice legs are already posted.',
      failed.length || notes.length ? 'error' : 'success',
    )
  }

  // Post FX Deal: every settled, unposted FX leg; the unsettled ones are named and left out.
  const onPostFx = () => {
    if (!deal) return
    if (LIVE_POSTING) return void liveFxAll(deal)
    applyDemo(postDemo(deal, 'fx', nextDemoDoc))
  }

  const onPostInvoice = () => {
    if (!deal) return
    if (deal.status < 21) return setStatus(`Complete execution first (status 21) before ${LIVE_POSTING ? '' : 'demo '}posting.`, 'error')
    if (!deal.inv.length && deal.invWaiting) {
      setStatus(deal.invWaiting, 'error')
      return
    }
    if (!pendingPostAll(deal).length) {
      // Live: say why nothing is pending; never the demo's dummy documents.
      if (LIVE_POSTING) {
        const t = postingPlanToast('trade invoice', invPostingPlan(deal), '')
        return setStatus(t.message, t.kind)
      }
      // Nothing settled is left to post: say which legs still need settling, or that all are posted.
      applyDemo(postDemo(deal, 'invoice', nextDemoDoc))
      return
    }
    setModal('pall')
  }

  // Demo completion never writes a production Deal ID status.
  const onAccounting = () => {
    if (!deal) return
    if (LIVE_POSTING) {
      void markAccountingComplete(deal.dealId).then((r) => afterLive(deal, r.ok ? r.message : r.error, r.ok ? 'success' : 'error'))
      return
    }
    const completed = finishDemo(deal)
    applyDemo({ deal: completed, toast: { message: completed.status === 22
      ? 'Demo accounting complete (22). No SAP posting was performed.'
      : 'Post the trade invoice and FX legs first. Execution must be complete (21).',
      kind: completed.status === 22 ? 'success' : 'error' } })
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
    if (LIVE_POSTING && (action === 'TBB1' || action === 'TEST')) {
      void liveFx(deal, txnIdx, action === 'TEST')
      if (action === 'TBB1') setModal(null)
      return
    }
    // Bank / transfer details: BAPI_FTR_FXT_CHANGE has no API; the banks are set on MO: Execute Settlement.
    if (LIVE_POSTING && action === 'UPD') return setStatus(ACTION_WAITING.txnUpdate, 'error')
    if (action === 'TBB1') {
      applyDemo(postDemo(deal, 'fx', nextDemoDoc))
      setModal(null)
      return
    }
    const o = txnAction(deal, txnIdx, action, NO_DOC)
    if (!deal.top[txnIdx]) return setStatus(o.toast.message, o.toast.kind)
    if (action === 'TEST') return setStatus('Demo test run complete. No documents generated.', '')
    if (action === 'UPD') return setStatus('Demo bank details are available. No SAP update performed.', 'success')
    gate(deal, o, ACTION_WAITING.txnPost)
  }

  const onPostingAction = (action: PostingAction) => {
    if (!deal) return
    if (LIVE_POSTING && action === 'SET_POST') return void liveInvoice(deal, postingIdx)
    if (LIVE_POSTING && action === 'UPD_DATA') return void liveUpdate(deal, postingIdx)
    if (action === 'SET_POST') {
      if (!deal.inv[postingIdx]?.postCheck) return setStatus('FI Posting is not set for this leg.', 'error')
      applyDemo(postDemo(deal, 'invoice', nextDemoDoc, postingIdx))
      return
    }
    const o = postingAction(deal, postingIdx, action, NO_DOC)
    if (!deal.inv[postingIdx]) return setStatus(o.toast.message, o.toast.kind)
    if (action === 'UPD_DATA') return setStatus('Demo house bank details are filled. No SAP update performed.', 'success')
    gate(deal, o, action === 'SET_EXE' ? ACTION_WAITING.invSettle : ACTION_WAITING.invPost)
  }

  const onPostAllConfirm = () => {
    if (!deal) return
    if (LIVE_POSTING) return void liveInvoiceAll(deal)
    applyDemo(postDemo(deal, 'invoice', nextDemoDoc))
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
        </div>
        <div className="head-actions">
          <button type="button" className="btn-outline" title="Deal ID documents (DMS)" disabled={!deal} onClick={() => setDmsOpen(true)}>
            {'📁'} DMS
          </button>
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
                <input
                  type="text"
                  placeholder="Enter Deal ID..."
                  value={dealInput}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestOpen}
                  aria-controls="boDealSuggestions"
                  onChange={(e) => {
                    setDealInput(e.target.value)
                    setSuggestOpen(true)
                    setSuggestIdx(-1)
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  onClick={() => setSuggestOpen(true)}
                  onBlur={() => setSuggestOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSuggestOpen(true)
                      const n = shownSuggestions.length
                      if (n) setSuggestIdx((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n))
                    } else if (e.key === 'Enter') {
                      const active = suggestOpen ? shownSuggestions[suggestIdx] : undefined
                      if (active) pickSuggestion(active.dealId)
                      else {
                        setSuggestOpen(false)
                        void load(dealInput)
                      }
                    } else if (e.key === 'Escape') {
                      setSuggestOpen(false)
                    }
                  }}
                />
                {suggestOpen && (shownSuggestions.length > 0 || suggestError) && (
                  <ul className="deal-suggest" id="boDealSuggestions" role="listbox">
                    {suggestError && !suggestions.length ? (
                      <li className="deal-suggest-note">{suggestError}</li>
                    ) : (
                      shownSuggestions.map((s, i) => (
                        <li
                          key={s.dealId}
                          role="option"
                          aria-selected={i === suggestIdx}
                          className={i === suggestIdx ? 'active' : undefined}
                          // mousedown, not click: the input's blur would close the list first.
                          onMouseDown={(e) => {
                            e.preventDefault()
                            pickSuggestion(s.dealId)
                          }}
                          onMouseEnter={() => setSuggestIdx(i)}
                        >
                          <span className="deal-suggest-id">{s.dealId}</span>
                          {s.statusText && <span className="deal-suggest-status">{s.statusText}</span>}
                          {s.dealRef && <span className="deal-suggest-ref">{s.dealRef}</span>}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              <ViewDealsButton onClick={() => setPickerOpen(true)} />
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

      <TxnModal open={modal === 'txn'} leg={txnLeg} live={LIVE_POSTING} onClose={closeAll} onAction={onTxnAction} />
      <PostingModal
        open={modal === 'posting'}
        leg={postingLeg}
        seq={postingIdx + 1}
        live={LIVE_POSTING}
        onClose={closeAll}
        onAction={onPostingAction}
      />
      <PostAllModal
        open={modal === 'pall'}
        pending={deal ? pendingPostAll(deal) : []}
        onClose={closeAll}
        onConfirm={onPostAllConfirm}
      />
      {deal ? <DealDmsModal open={dmsOpen} onClose={() => setDmsOpen(false)} dealId={deal.dealId} /> : null}
      <DocPreviewModal open={modal === 'doc'} preview={preview} deal={deal} onClose={closeAll} />
      {pickerOpen ? (
        <DealPickerModal
          columns={['Deal ID', 'FX Model', 'Status']}
          rows={suggestions.map((s) => ({ dealId: s.dealId, cells: [s.dealId, s.model, s.statusText], text: `${s.dealId} ${s.model} ${s.statusText}` }))}
          emptyText={suggestError || 'No matching Deal IDs found.'}
          hint="Click a deal row to load it."
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false)
            pickSuggestion(id)
          }}
        />
      ) : null}

      <div className={`zfac-toast${toast.show ? ' show' : ''}${toast.show && toast.kind ? ` ${toast.kind}` : ''}`}>
        {toast.message}
      </div>
    </div>
  )
}
