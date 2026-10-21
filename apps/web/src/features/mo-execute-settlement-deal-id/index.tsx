import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { DealDmsModal } from '../../shared/fx/DealDmsModal.tsx'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { bankCompanies, changeFxBankField, type BankCompany } from './bankChoices.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort } from '../../shared/fx/mw.ts'
import { DealPickerModal, ViewDealsButton } from '../../shared/ui/DealPickerModal.tsx'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
import {
  ACTION_WAITING,
  INVOICE_WAITING,
  VIEW_INVOICE_WAITING,
  WAITING_DEAL_ID_API,
  diffWaiting,
  legsWaitingReason,
  loadDealList,
  loadDealScreen,
  pnlWaiting,
  type DealList,
  type DealScreen,
} from './api.ts'
import { loadDifference, saveDifference, type DifferenceView } from './differenceApi.ts'
import { loadHeadsup, type HeadsupView } from './headsup.ts'
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
  FxDeal,
  FxPostForm,
  InvPostForm,
  StatusMeta,
  Toast,
  ToastKind,
  TradeInvoice,
} from './types.ts'

const TOAST_MS = 3800

const BLANK_FX_FORM: FxPostForm = {
  seq: '',
  bSetDesc: '',
  sSetDesc: '',
  sLetterCode: '',
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

/** Empty grids until the selected Deal ID is loaded. */
const NO_FX: FxDeal[] = []
const NO_INVOICES: TradeInvoice[] = []

const BLANK_INV_FORM: InvPostForm = {
  bukrs: '',
  seq: '',
  recPay: '',
  tradeType: '',
  setDesc: '',
  payAmt: '',
  linkedFx: '',
  settled: false,
  trfType: '',
  postingType: '',
  fiPosting: false,
  partnerId: '',
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
 * MAS_CON / RULE_BT / ZSGTRMTR_TRADER / DEAL_ST (api.ts). Headsup uses DIFF.PROCESS_DATA;
 * invoice differences use DIFF_NEW.PROCESS_DATA_NEW. Settlement writes are in settlement.ts.
 * Option transactions and SAP printing still require APIs. No sample data at runtime.
 */
export default function MoExecuteSettlementDealId() {
  const [params] = useSearchParams()
  const routeDealId = params.get('dealId') ?? ''
  const [deal, setDeal] = useState<Deal>(BLANK_DEAL)
  const [statuses, setStatuses] = useState<StatusMeta[]>([])
  const [legsWaiting, setLegsWaiting] = useState(() => legsWaitingReason(0))
  const [fxDeals, setFxDeals] = useState<FxDeal[]>(NO_FX)
  const [invoices, setInvoices] = useState<TradeInvoice[]>(NO_INVOICES)
  const [invoicesWaiting, setInvoicesWaiting] = useState(INVOICE_WAITING)
  const [positions, setPositions] = useState<Record<string, unknown>[]>([])

  // Selection screen
  const [dealIdInput, setDealIdInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selError, setSelError] = useState<string | null>(null)
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
  const headsupOpen = modals.isOpen('headsup')
  const [headsupView, setHeadsupView] = useState<HeadsupView | null>(null)
  const [headsupLoading, setHeadsupLoading] = useState(false)
  const [headsupError, setHeadsupError] = useState('')
  useEffect(() => {
    if (!headsupOpen) return
    const controller = new AbortController()
    setHeadsupLoading(true)
    setHeadsupError('')
    setHeadsupView(null)
    void loadHeadsup(deal, fxDeals, controller.signal)
      .then((view) => { if (!controller.signal.aborted) setHeadsupView(view) })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error)) setHeadsupError(`Heads Up could not be loaded: ${messageOf(error)}`)
      })
      .finally(() => { if (!controller.signal.aborted) setHeadsupLoading(false) })
    return () => controller.abort()
  }, [headsupOpen, deal, fxDeals])
  const [amendDate, setAmendDate] = useState('')
  const [diffView, setDiffView] = useState<DifferenceView | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')
  const [fxForm, setFxForm] = useState(BLANK_FX_FORM)
  const [invForm, setInvForm] = useState(BLANK_INV_FORM)
  const [companies, setCompanies] = useState<BankCompany[]>([])
  const [entityCompany, setEntityCompany] = useState<Record<string, string>>({})
  useEffect(() => {
    const controller = new AbortController()
    void fxList('comp', {}, { signal: controller.signal })
      .then((comp) => {
        if (controller.signal.aborted) return
        setCompanies(bankCompanies(comp))
        setEntityCompany(Object.fromEntries(comp.map((r) => [txt(r, 'ZCOM_ID'), txt(r, 'ZBUKRS')])))
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.warn('[execute-settlement] Company master unavailable', error)
      })
    return () => {
      controller.abort()
    }
  }, [])

  // Outcomes (SAP results, validation, not-yet-wired actions) queue as the standard ResultDialog.
  const [results, setResults] = useState<ResultItem[]>([])
  const resultId = useRef(0)
  const showToast = useCallback((message: string, kind?: ToastKind, onDismiss?: () => void) => {
    const tone = kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info'
    const title = tone === 'error' ? 'Error' : tone === 'success' ? 'Success' : 'Information'
    setResults((r) => [...r, { id: ++resultId.current, tone, title, message, onDismiss }])
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

  const executeSelection = useCallback(async (raw: string): Promise<DealScreen | null> => {
    const id = normalizeDealId(raw)
    if (id === null) {
      setSelError(DEAL_ID_REQUIRED)
      return null
    }
    loadCtrl.current?.abort()
    const ctrl = new AbortController()
    loadCtrl.current = ctrl
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
    }
    return null
  }, [])

  // P_DEAL from Trader Workbench's View Settlement Data skips manual selection.
  useEffect(() => {
    if (!routeDealId) return
    setDealIdInput(routeDealId)
    setMainShown(false)
    void executeSelection(routeDealId)
    return () => loadCtrl.current?.abort()
  }, [routeDealId, executeSelection])

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
  const runWrite = async (write: () => Promise<ActionResult>, onSuccessDismiss?: () => void): Promise<DealScreen | null> => {
    if (writing) return null
    setWriting(true)
    try {
      const result = await write()
      if (!result.ok) {
        showToast(result.error, 'error')
        return null
      }
      const screen = await executeSelection(deal.dealId)
      showToast(result.message, 'success', onSuccessDismiss)
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

  // FX-Invoice Difference (9006): PROCESS_DATA_NEW on open, SAVE_SPOT_DATA_NEW on the SPOT button.
  const readDifference = () => {
    setDiffLoading(true)
    setDiffError('')
    return loadDifference(deal, fxDeals, invoices)
      .then(setDiffView)
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setDiffView(null)
        setDiffError(`The invoice difference could not be read: ${messageOf(error)}`)
      })
      .finally(() => setDiffLoading(false))
  }
  const openDiff = () => {
    modals.open('diff')
    void readDifference()
  }
  const [savingSpot, setSavingSpot] = useState(false)
  const saveSpotData = async () => {
    if (savingSpot || !diffView) return
    setSavingSpot(true)
    try {
      const result = await saveDifference(diffView)
      showToast(result.ok ? result.message : result.error, result.ok ? 'success' : 'error')
      if (result.ok) await readDifference()
    } finally {
      setSavingSpot(false)
    }
  }

  // DMS (function code DMS -> ZSGTSFFM_DMS, IM_CAT '10'): the shared Deal ID documents panel; Edit is inside it.
  const openDms = () => modals.open('dms')

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
    const defaults = fxPostDefaults(r)
    setFxForm({ ...BLANK_FX_FORM, ...defaults, bRecCoCode: defaults.bRecCoCode || r.bukrs, sPayCoCode: defaults.sPayCoCode || r.bukrs })
    modals.open('fxPost')
  }
  const setFxField = <K extends keyof FxPostForm>(key: K, value: FxPostForm[K]) =>
    setFxForm((f) => changeFxBankField(f, key, value))
  const postFxAction = (kind: PostKind) => {
    const r = activeFx === null ? undefined : fxDeals[activeFx]
    if (activeFx === null || !r) return
    if (kind === 'print') showToast(ACTION_WAITING.fxPrint, 'error')
    else if (kind === 'update') void runWrite(() => updateFxLeg(r, fxDeals, fxForm))
    else void runWrite(() => completeFxLeg(r, fxDeals, invoices, fxForm), () => modals.close('fxPost'))
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
    setInvForm((f) => ({ ...f, [key]: value, ...(key === 'senderHouseBank' && value !== f.senderHouseBank ? { senderAccountId: '' } : {}), ...(key === 'receiverHouseBank' && value !== f.receiverHouseBank ? { receiverAccountId: '' } : {}) }))
  const postInvAction = (kind: Exclude<PostKind, 'print'>) => {
    const r = activeInv === null ? undefined : invoices[activeInv]
    if (activeInv === null || !r) return
    if (kind === 'update') void runWrite(() => updateInvoiceLeg(deal, r, invoices, invForm))
    else void runWrite(() => completeInvoiceLeg(deal, r, invoices, fxDeals, invForm), () => modals.close('invPost'))
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
        </div>
        <div className="head-actions">
          <span className="live-dot" title="Connected"></span>
          <button className="btn-outline" type="button" onClick={initiatePrinting}>
            <span>&#128424;</span>Initiate Printing
          </button>
          <button className="btn-outline" type="button" onClick={openDms}>
            <span>&#128193;</span>DMS
          </button>
          <button className="btn-outline" type="button" onClick={refreshScreen}>
            <span>&#8635;</span>Refresh
          </button>
          <BackButton className="btn-outline subtle" label="Exit" onClick={routeDealId ? undefined : backToSelection} />
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
              <ViewDealsButton onClick={() => setPickerOpen(true)} />
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
                editDms: openDms,
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

      {pickerOpen ? (
        <DealPickerModal
          columns={['Deal ID', 'FX Model', 'Entity String', 'Status']}
          rows={(list?.state === 'sap' ? list.picks : []).map((p) => {
            const status = [p.statusCode, p.statusText].filter(Boolean).join(' - ')
            return { dealId: p.dealId, cells: [p.dealId, p.fxModel ?? '', p.entityString ?? '', status], text: `${p.dealId} ${p.fxModel ?? ''} ${p.entityString ?? ''} ${status}` }
          })}
          emptyText={list?.state === 'unavailable' ? list.reason : 'No matching Deal IDs found.'}
          hint="Click a deal row to load it."
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false)
            setDealIdInput(id)
            void executeSelection(id)
          }}
        />
      ) : null}
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
        items={headsupView?.rows ?? []}
        loading={headsupLoading}
        emptyText={headsupError || headsupView?.notice || 'No DSS-linked invoice trades are configured for Heads Up on this deal.'}
      />
      <DiffModal
        open={modals.isOpen('diff')}
        onClose={() => modals.close('diff')}
        rows={diffView?.rows ?? []}
        loading={diffLoading}
        note={diffView?.note ?? ''}
        onSave={() => void saveSpotData()}
        saving={savingSpot}
        emptyText={diffError || diffWaiting(legsWaiting)}
      />
      <DealDmsModal open={modals.isOpen('dms')} onClose={() => modals.close('dms')} dealId={deal.dealId} />
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
        companies={companies}
      />
      <InvPostModal
        open={modals.isOpen('invPost')}
        onClose={() => modals.close('invPost')}
        row={activeInvRow}
        legLabel={activeInvRow ? `${activeInvRow.leg} - ${activeInvRow.trfDesc}` : ''}
        form={invForm}
        onField={setInvField}
        onAction={postInvAction}
        companyOf={(entity) => entityCompany[entity] ?? ''}
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
