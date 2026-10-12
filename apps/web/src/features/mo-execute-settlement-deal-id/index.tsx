import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort } from '../../shared/fx/mw.ts'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import {
  ACTION_WAITING,
  DMS_LIST_WAITING,
  HEADSUP_WAITING,
  INVOICE_WAITING,
  VIEW_INVOICE_WAITING,
  WAITING_DEAL_ID_API,
  diffWaiting,
  legsWaitingReason,
  loadDealList,
  loadDealScreen,
  pnlWaiting,
  saveSpotData as bookSpots,
  tcurrSpotRates,
  type DealList,
  type DealScreen,
} from './api.ts'
import { FxGrid, InvGrid } from './Grids.tsx'
import {
  DEAL_ID_REQUIRED,
  amendDateInitial,
  dealNotFound,
  filterFxDeals,
  filterInvoices,
  fxPostDefaults,
  invPostDefaults,
  normalizeDealId,
  toggleRowSelection,
  toolbarVisibility,
  validateDate,
} from './logic.ts'
import {
  AmendModal,
  DiffModal,
  DmsModal,
  EditDmsModal,
  FxPostModal,
  HeadsupModal,
  InvPostModal,
  PlModal,
  ViewInvModal,
  type PostKind,
} from './Modals.tsx'
import { useModals } from './modal.tsx'
import {
  completeExecution,
  completeFxLeg,
  completeInvoiceLeg,
  initiateSettlement as writeInitiation,
  updateFxLeg,
  updateInvoiceLeg,
  type ActionResult,
} from './settlement.ts'
import './mo-execute-settlement-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-execute-settlement-deal-id.dark.css'
import './mo-execute-settlement-deal-id.overrides.css'
import { ActionToolbar, HeaderGrid, StatusPill } from './Overview.tsx'
import type {
  Deal,
  DmsDoc,
  FxDeal,
  FxPostForm,
  Headsup,
  InvPostForm,
  StatusMeta,
  Toast,
  ToastKind,
  TradeInvoice,
} from './types.ts'

const TOAST_MS = 3800

const BLANK_FX_FORM: FxPostForm = {
  bukrs: '',
  rfha: '',
  dealType: '',
  partner: '',
  bAmt: '',
  bDoc: '',
  bBankType: '',
  bTrfType: '',
  bRecCoCode: '',
  bBankId: '',
  bPaymentId: '',
  bHouseBank: '',
  bAccountId: '',
  letterCode: '',
  letterName: '',
  subNo: false,
  sAmt: '',
  sDoc: '',
  sBankType: '',
  sTrfType: '',
  sBankId: '',
  sPayCoCode: '',
  sPaymentId: '',
  sHouseBank: '',
  sAccountId: '',
  remit: false,
}

const BLANK_DEAL: Deal = {
  dealId: '',
  dealStartDate: '',
  dealEndDate: '',
  revisedEndDate: '',
  mcRefNo: '',
  mcDesc: '',
  mcDate: '',
  shipEndDate: '',
  fxModelId: '',
  fxModelDesc: '',
  entityString: '',
  fxInvModel: '',
  trader: '',
  traderDesc: '',
  currencyString: '',
  dealStatus: '',
  noInvoiceFlag: false,
}

/** Never loaded: the invoice legs, headsups and DMS documents have no API (the FX legs are read in api.ts). */
const NO_FX: FxDeal[] = []
const NO_INVOICES: TradeInvoice[] = []
const NO_HEADSUPS: Headsup[] = []
const NO_DOCS: DmsDoc[] = []

const BLANK_INV_FORM: InvPostForm = {
  date: '',
  sender: '',
  senderHouseBank: '',
  senderAccountId: '',
  receiver: '',
  receiverHouseBank: '',
  receiverAccountId: '',
  amt: '',
  fiDoc: '',
  docMsg: '',
}

/**
 * MO: Execute Settlement for Deal ID (Single Deal ID) — ZSGTSF_RDEAL_TRD_INV / ZSGTSFR060,
 * converted from legacy/mo-execute-settlement-deal-id.html.
 *
 * The selection screen takes P_DEAL; the header is read by that key from ZSGTSFTR_DEALID /
 * MAS_CON / RULE_BT / ZSGTRMTR_TRADER / DEAL_ST (api.ts). The ABAP source is not exported (only
 * its dependency note), so the FX legs come from TrmFxApp + FxTransaction by Deal ID (option legs, trade-invoice
 * legs, Headsup and DMS show WAITING FOR API), and every action validates as before and then says WAITING FOR
 * ACTION API without changing anything. No sample data at runtime (fixtures.ts is for tests).
 */
export default function MoExecuteSettlementDealId() {
  const [deal, setDeal] = useState<Deal>(BLANK_DEAL)
  const [statuses, setStatuses] = useState<StatusMeta[]>([])
  const [legsWaiting, setLegsWaiting] = useState(() => legsWaitingReason(0))
  const [fxDeals, setFxDeals] = useState<FxDeal[]>(NO_FX)
  const [invoices, setInvoices] = useState<TradeInvoice[]>(NO_INVOICES)
  const [invoicesWaiting, setInvoicesWaiting] = useState(INVOICE_WAITING)
  const [positions, setPositions] = useState<Record<string, unknown>[]>([])
  const dms = NO_DOCS

  // Selection screen
  const [dealIdInput, setDealIdInput] = useState('')
  const [selError, setSelError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<DealList | null>(null)
  const loadCtrl = useRef<AbortController | null>(null)
  const [mainShown, setMainShown] = useState(false)
  const dealInputRef = useRef<HTMLInputElement>(null)

  // Grids
  const [selFx, setSelFx] = useState<number | null>(null)
  const [selInv, setSelInv] = useState<number | null>(null)
  const [activeFx, setActiveFx] = useState<number | null>(null)
  const [activeInv, setActiveInv] = useState<number | null>(null)
  const [fxSearch, setFxSearch] = useState('')
  const [invSearch, setInvSearch] = useState('')

  // Popups and their forms
  const modals = useModals()
  const [amendDate, setAmendDate] = useState('')
  const [spots, setSpots] = useState<string[]>([])
  const [editDocType, setEditDocType] = useState('')
  const [editDate, setEditDate] = useState('')
  const [fxForm, setFxForm] = useState(BLANK_FX_FORM)
  const [invForm, setInvForm] = useState(BLANK_INV_FORM)

  // Outcomes (SAP results, validation, not-yet-wired actions) queue as the standard ResultDialog.
  const [results, setResults] = useState<ResultItem[]>([])
  const resultId = useRef(0)
  const showToast = useCallback((message: string, kind?: ToastKind) => {
    const tone = kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info'
    const title = tone === 'error' ? 'Error' : tone === 'success' ? 'Success' : 'Information'
    setResults((r) => [...r, { id: ++resultId.current, tone, title, message }])
  }, [])

  // Non-outcome chatter (screen refreshed, filter / download hints) stays the small auto-fading toast.
  const [toast, setToast] = useState<Toast>({ message: '', kind: null, visible: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showNote = useCallback((message: string, kind?: ToastKind) => {
    setToast({ message, kind: kind ?? null, visible: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Escape closes the popup opened last.
  const closeTopRef = useRef(modals.closeTop)
  closeTopRef.current = modals.closeTop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTopRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // P_DEAL picker: every ZSGTSFTR_DEALID row, unrestricted (the search help is not exported).
  useEffect(() => {
    const ctrl = new AbortController()
    loadDealList(ctrl.signal)
      .then(setList)
      .catch((error) => {
        if (!isAbort(error)) setList({ state: 'unavailable', reason: `${WAITING_DEAL_ID_API} — ${messageOf(error)}` })
      })
    return () => {
      ctrl.abort()
      loadCtrl.current?.abort()
    }
  }, [])

  // ------------------------------------------------------------------ selection screen

  const executeSelection = async (raw: string): Promise<DealScreen | null> => {
    const id = normalizeDealId(raw)
    if (id === null) {
      setSelError(DEAL_ID_REQUIRED)
      return null
    }
    loadCtrl.current?.abort()
    const ctrl = new AbortController()
    loadCtrl.current = ctrl
    setLoading(true)
    try {
      const screen = await loadDealScreen(id, ctrl.signal)
      if (!screen) {
        setSelError(dealNotFound(id))
        return null
      }
      setSelError(null)
      setDeal(screen.deal)
      setStatuses(screen.statuses)
      setFxDeals(screen.fxDeals)
      setLegsWaiting(screen.legsWaiting)
      setInvoices(screen.invoices)
      setInvoicesWaiting(screen.invoicesWaiting)
      setPositions(screen.positions)
      setMainShown(true)
      setSelFx(null)
      setSelInv(null)
      return screen
    } catch (error) {
      if (isAbort(error)) return null
      setSelError(`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read: ${messageOf(error)}`)
    } finally {
      if (loadCtrl.current === ctrl) setLoading(false)
    }
    return null
  }

  const backToSelection = () => {
    setMainShown(false)
    setSelFx(null)
    setSelInv(null)
    dealInputRef.current?.focus()
  }

  const refreshScreen = () => {
    if (!mainShown) return
    void executeSelection(deal.dealId).then(() => showNote('Screen refreshed.', 'info'))
  }

  // ------------------------------------------------------------------ toolbar-driven actions

  // Each action validates as before, then says it has no API; nothing local changes.
  const changeStatus = (code: string) => {
    if (code !== deal.dealStatus) showToast(ACTION_WAITING.status, 'error')
  }

  // Settlement writes (settlement.ts): one at a time, each followed by a re-read of the Deal ID so the
  // grids, badges and status show what was stored.
  const [writing, setWriting] = useState(false)
  const runWrite = async (write: () => Promise<ActionResult>): Promise<DealScreen | null> => {
    if (writing) return null
    setWriting(true)
    try {
      const result = await write()
      if (!result.ok) {
        showToast(result.error, 'error')
        return null
      }
      const screen = await executeSelection(deal.dealId)
      showToast(result.message, 'success')
      return screen
    } finally {
      setWriting(false)
    }
  }

  // fcode INIT (save_data): the trade legs' TRD_POS rows, then status 20.
  const initiateSettlement = () => void runWrite(() => writeInitiation(deal, invoices))

  // fcode EXE_C: six settled trade legs and every FX leg they map to, then status 21.
  const executionComplete = () => void runWrite(() => completeExecution(deal, fxDeals, invoices))

  const initiatePrinting = () => showToast(ACTION_WAITING.printing, 'error')

  // Amend Deal End Date (9005)
  const openAmend = () => {
    setAmendDate(amendDateInitial(deal))
    modals.open('amend')
  }
  const updateEndDate = () => {
    const result = validateDate(amendDate)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    showToast(ACTION_WAITING.amend, 'error')
  }

  // FX-Invoice Difference (9006)
  const openDiff = () => {
    const initial = fxDeals.map((r) => r.spot)
    setSpots(initial)
    modals.open('diff')
    // The default Spot Rate is TCURR's (type M, today); a rate the user already typed is left alone.
    void tcurrSpotRates(fxDeals).then((rates) =>
      setSpots((list) => list.map((v, i) => (v === initial[i] ? (rates[i] ?? v) : v))),
    )
  }
  const [savingSpot, setSavingSpot] = useState(false)
  const saveSpotData = async () => {
    if (savingSpot) return
    setSavingSpot(true)
    try {
      const results = await bookSpots(deal.dealId, fxDeals, fxDeals.map((r, i) => spots[i] ?? r.spot))
      const booked = results.filter((r) => r.ok)
      const lines = results.map((r) => `${r.dealType} ${r.rfha}: ${r.message}`)
      showToast(lines.join(' | '), booked.length === results.length ? 'success' : 'error')
      if (booked.length) {
        modals.close('diff')
        refreshScreen()
      }
    } catch (error) {
      showToast(`Save Spot Data failed: ${messageOf(error)}`, 'error')
    } finally {
      setSavingSpot(false)
    }
  }

  // DMS viewer + Edit DMS (9007)
  const openEditDms = () => {
    modals.close('dms')
    setEditDate('')
    modals.open('editDms')
  }
  const openDms = (goStraightToEdit: boolean) => {
    if (goStraightToEdit) openEditDms()
    else modals.open('dms')
  }
  const confirmEditDms = () => {
    const result = validateDate(editDate)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    showToast(ACTION_WAITING.dms, 'error')
  }

  const openViewInvoice = () => {
    if (deal.noInvoiceFlag) {
      showToast('This FX model has no trade invoice leg.', 'info')
      return
    }
    modals.open('viewInv')
  }

  // ------------------------------------------------------------------ FX transaction settlement (9003)

  const openFxPost = (idx: number) => {
    const r = fxDeals[idx]
    if (!r) return
    setActiveFx(idx)
    setFxForm((f) => ({ ...f, ...fxPostDefaults(r) }))
    modals.open('fxPost')
  }
  const setFxField = <K extends keyof FxPostForm>(key: K, value: FxPostForm[K]) =>
    setFxForm((f) => ({ ...f, [key]: value }))
  const postFxAction = (kind: PostKind) => {
    const r = activeFx === null ? undefined : fxDeals[activeFx]
    if (activeFx === null || !r) return
    if (kind === 'print') showToast(ACTION_WAITING.fxPrint, 'error')
    else if (kind === 'update') void runWrite(() => updateFxLeg(r, fxDeals, fxForm))
    else void runWrite(() => completeFxLeg(r, fxDeals, invoices, fxForm))
  }

  // ------------------------------------------------------------------ Trade invoice settlement pop-up (9002)

  const openInvPost = (idx: number) => {
    const r = invoices[idx]
    if (!r) return
    setActiveInv(idx)
    setInvForm(invPostDefaults(r, deal.dealId))
    modals.open('invPost')
  }
  const setInvField = <K extends keyof InvPostForm>(key: K, value: InvPostForm[K]) =>
    setInvForm((f) => ({ ...f, [key]: value }))
  const postInvAction = (kind: Exclude<PostKind, 'print'>) => {
    const r = activeInv === null ? undefined : invoices[activeInv]
    if (activeInv === null || !r) return
    if (kind === 'update') void runWrite(() => updateInvoiceLeg(deal, r, invoices, invForm))
    else void runWrite(() => completeInvoiceLeg(deal, r, invoices, fxDeals, invForm))
  }

  // ------------------------------------------------------------------ derived

  const visibility = toolbarVisibility(deal.dealStatus)
  const fxRows = useMemo(() => filterFxDeals(fxDeals, fxSearch), [fxDeals, fxSearch])
  const invRows = useMemo(() => filterInvoices(invoices, invSearch), [invoices, invSearch])
  const activeInvRow = activeInv === null ? undefined : invoices[activeInv]
  const activeFxRow = activeFx === null ? undefined : fxDeals[activeFx]

  return (
    <div className="mo-execute-settlement-deal-id">
      <div className="page-head">
        <BackButton className="btn-outline subtle" />
        <div className="head-badge"></div>
        <div className="title-wrap">
          <div className="page-title">Execute Settlement for Deal ID</div>
          <span className="page-code">ZSGTSF_RDEAL_TRD_INV &middot; R060</span>
        </div>
        <div className="head-actions">
          <span className="live-dot" title="Connected"></span>
          <button className="btn-outline" type="button" onClick={initiatePrinting}>
            <span>&#128424;</span>Initiate Printing
          </button>
          <button className="btn-outline" type="button" onClick={() => openDms(false)}>
            <span>&#128193;</span>DMS
          </button>
          <button className="btn-outline" type="button" onClick={refreshScreen}>
            <span>&#8635;</span>Refresh
          </button>
          <button className="btn-outline subtle" type="button" onClick={backToSelection}>
            <span>&#10060;</span>Exit
          </button>
          <SignOutButton className="btn-outline subtle" />
        </div>
      </div>

      <main>
        {/* ============ SELECTION SCREEN (1000) ============ */}
        <div id="selectScreen" className="panel select-panel">
          <div className="panel-title">
            <div className="panel-title-left">
              <span className="dot-bullet"></span>
              <h2>Basic Selection</h2>
            </div>
          </div>
          <div className="panel-body">
            <div className="select-row">
              <div className="select-field">
                <span className="select-icon">&#128269;</span>
                <input
                  id="selDealId"
                  ref={dealInputRef}
                  type="text"
                  maxLength={10}
                  placeholder="ENTER DEAL ID..."
                  value={dealIdInput}
                  onChange={(e) => setDealIdInput(e.target.value)}
                  list="selDealIdList"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void executeSelection(dealIdInput)
                  }}
                />
                {/* P_DEAL picker: ZSGTSFTR_DEALID, unrestricted — the search help is not exported. */}
                <datalist id="selDealIdList">
                  {list?.state === 'sap'
                    ? list.picks.map((p) => (
                        <option key={p.dealId} value={p.dealId}>
                          {p.statusText}
                        </option>
                      ))
                    : null}
                </datalist>
              </div>
              <button
                className="btn-primary-inline"
                type="button"
                disabled={loading}
                onClick={() => void executeSelection(dealIdInput)}
              >
                Go
              </button>
            </div>
            <div className={selError || list?.state === 'unavailable' ? 'select-err show' : 'select-err'} id="selErr">
              {selError ?? (list?.state === 'unavailable' ? list.reason : '')}
            </div>
          </div>
        </div>

        {/* ============ MAIN SCREEN (9000) ============ */}
        <div id="mainScreen" className={mainShown ? undefined : 'hidden'}>
          <div className="panel">
            <div className="panel-title">
              <div className="panel-title-left">
                <span className="dot-bullet"></span>
                <h2>Deal ID Overview</h2>
              </div>
              <span className="panel-sub">
                <StatusPill code={deal.dealStatus} statuses={statuses} />
              </span>
            </div>
            <div className="panel-body">
              <HeaderGrid deal={deal} statuses={statuses} onStatus={changeStatus} />
            </div>
          </div>

          <div className="panel">
            <ActionToolbar
              noInvoiceFlag={deal.noInvoiceFlag}
              visibility={visibility}
              actions={{
                amend: openAmend,
                headsup: () => modals.open('headsup'),
                viewInvoice: openViewInvoice,
                diff: openDiff,
                pl: () => modals.open('pl'),
                editDms: () => openDms(true),
                initiate: initiateSettlement,
                executionComplete,
              }}
            />
            <div className="drag-hint">
              Tip: double-click a row in the FX Deal grid or the Trade Invoice grid below to open its settlement
              screen &mdash; just like a hotspot click in the SAP ALV.
            </div>
          </div>

          <FxGrid
            rows={fxRows}
            total={fxDeals.length}
            search={fxSearch}
            selectedIdx={selFx}
            onSearch={setFxSearch}
            onSelect={(idx) => setSelFx((cur) => toggleRowSelection(cur, idx))}
            onOpen={openFxPost}
            onViewTxn={(idx) =>
              showToast(
                `In SAP, this hotspot opens the Treasury transaction display (TM transaction ${fxDeals[idx]?.rfha ?? ''}).`,
                'info',
              )
            }
            onViewDoc={(doc) => showToast(`In SAP, this hotspot opens document ${doc} in transaction FB03.`, 'info')}
            onToast={showNote}
            emptyText={fxDeals.length ? undefined : legsWaiting}
            note={fxDeals.length ? legsWaiting : undefined}
          />

          <InvGrid
            rows={invRows}
            total={invoices.length}
            hidden={deal.noInvoiceFlag}
            search={invSearch}
            selectedIdx={selInv}
            onSearch={setInvSearch}
            onSelect={(idx) => setSelInv((cur) => toggleRowSelection(cur, idx))}
            onOpen={openInvPost}
            onViewDoc={(doc) => showToast(`In SAP, this hotspot opens document ${doc} in transaction FB03.`, 'info')}
            onToast={showNote}
            emptyText={invoices.length ? undefined : invoicesWaiting}
          />
        </div>
      </main>

      <ResultQueue items={results} onDismiss={(id) => setResults((r) => r.filter((x) => x.id !== id))} />
      <div className={`zfac-toast${toast.visible ? ' show' : ''}${toast.visible && toast.kind ? ` ${toast.kind}` : ''}`} id="toast">
        {toast.message}
      </div>

      <AmendModal
        open={modals.isOpen('amend')}
        onClose={() => modals.close('amend')}
        dealId={deal.dealId}
        value={amendDate}
        onChange={setAmendDate}
        onUpdate={updateEndDate}
      />
      <HeadsupModal
        open={modals.isOpen('headsup')}
        onClose={() => modals.close('headsup')}
        dealId={deal.dealId}
        items={NO_HEADSUPS}
        emptyText={HEADSUP_WAITING}
      />
      <DiffModal
        open={modals.isOpen('diff')}
        onClose={() => modals.close('diff')}
        rows={fxDeals}
        spots={spots}
        onSpot={(idx, v) => setSpots((list) => list.map((s, i) => (i === idx ? v : s)))}
        onSave={() => void saveSpotData()}
        saving={savingSpot}
        emptyText={diffWaiting(legsWaiting)}
      />
      <DmsModal
        open={modals.isOpen('dms')}
        onClose={() => modals.close('dms')}
        dealId={deal.dealId}
        docs={dms}
        onEdit={openEditDms}
        emptyText={DMS_LIST_WAITING}
      />
      <EditDmsModal
        open={modals.isOpen('editDms')}
        onClose={() => modals.close('editDms')}
        dealId={deal.dealId}
        docType={editDocType}
        date={editDate}
        onDocType={setEditDocType}
        onDate={setEditDate}
        onConfirm={confirmEditDms}
      />
      <PlModal
        open={modals.isOpen('pl')}
        onClose={() => modals.close('pl')}
        fxDeals={fxDeals}
        currencyString={deal.currencyString}
        emptyText={pnlWaiting(legsWaiting)}
      />
      <FxPostModal
        open={modals.isOpen('fxPost')}
        onClose={() => modals.close('fxPost')}
        row={activeFxRow}
        form={fxForm}
        onField={setFxField}
        onAction={postFxAction}
      />
      <InvPostModal
        open={modals.isOpen('invPost')}
        onClose={() => modals.close('invPost')}
        row={activeInvRow}
        legLabel={activeInvRow ? `${activeInvRow.leg} - ${activeInvRow.trfDesc}` : ''}
        form={invForm}
        onField={setInvField}
        onAction={postInvAction}
      />
      <ViewInvModal
        open={modals.isOpen('viewInv')}
        onClose={() => modals.close('viewInv')}
        dealId={deal.dealId}
        rows={invoices}
        emptyText={VIEW_INVOICE_WAITING}
      />
    </div>
  )
}
