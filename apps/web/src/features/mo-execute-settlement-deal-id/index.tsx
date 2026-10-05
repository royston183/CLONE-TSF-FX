import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import {
  BANK_TYPES,
  DMS_DOC_TYPES,
  SAMPLE_DEAL_ID,
  HEADSUP_DATA,
  seedDeal,
  seedDms,
  seedFxDeals,
  seedTradeInvoices,
  TRANSFER_TYPES,
} from './data.ts'
import { FxGrid, InvGrid } from './Grids.tsx'
import {
  DEAL_ID_REQUIRED,
  END_DATE_UPDATED,
  REMAINING_LEGS_MESSAGE,
  SPOT_SAVED,
  addDmsDocument,
  amendDateInitial,
  applyEndDate,
  applySpotData,
  buildFxLetter,
  buildInvoiceLetter,
  completeFx,
  completeInv,
  filterFxDeals,
  filterInvoices,
  fxPostDefaults,
  invPostDefaults,
  normalizeDealId,
  postFxEntry,
  postInvDocument,
  settlementComplete,
  statusChangedToast,
  toggleRowSelection,
  toolbarVisibility,
  updateFxPartner,
  updateInvPostDate,
} from './logic.ts'
import {
  AmendModal,
  DiffModal,
  DmsModal,
  EditDmsModal,
  FxPostModal,
  HeadsupModal,
  InvPostModal,
  LetterModal,
  PlModal,
  ViewInvModal,
  type PostKind,
} from './Modals.tsx'
import { useModals } from './modal.tsx'
import './mo-execute-settlement-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-execute-settlement-deal-id.dark.css'
import { ActionToolbar, HeaderGrid, StatusPill } from './Overview.tsx'
import type { FxPostForm, InvPostForm, Toast, ToastKind } from './types.ts'

const TOAST_MS = 3800

const BLANK_FX_FORM: FxPostForm = {
  bukrs: '',
  rfha: '',
  dealType: '',
  partner: '',
  bAmt: '',
  bDoc: '',
  bBankType: BANK_TYPES[0] ?? '',
  bTrfType: TRANSFER_TYPES[0] ?? '',
  bBankId: '',
  bAcc: '',
  subNo: false,
  sAmt: '',
  sDoc: '',
  sBankType: BANK_TYPES[0] ?? '',
  sTrfType: TRANSFER_TYPES[0] ?? '',
  sBankId: '',
  sAcc: '',
  remit: false,
}

const BLANK_INV_FORM: InvPostForm = { date: '', bank: '', sender: '', receiver: '', amt: '', fiDoc: '', docMsg: '' }

/**
 * MO: Execute Settlement for Deal ID (Single Deal ID) — ZSGTSF_RDEAL_TRD_INV / ZSGTSFR060,
 * converted from legacy/mo-execute-settlement-deal-id.html.
 *
 * UI only: the page runs on the dummy deal in data.ts and calls no API, exactly as the
 * original did. A selection screen takes the Deal ID; the main screen shows the deal header,
 * the status-driven toolbar and the FX / trade-invoice settlement grids.
 */
export default function MoExecuteSettlementDealId() {
  const [deal, setDeal] = useState(seedDeal)
  const [fxDeals, setFxDeals] = useState(seedFxDeals)
  const [invoices, setInvoices] = useState(seedTradeInvoices)
  const [dms, setDms] = useState(seedDms)

  // Selection screen
  const [dealIdInput, setDealIdInput] = useState('')
  const [selError, setSelError] = useState(false)
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
  const [editDocType, setEditDocType] = useState(DMS_DOC_TYPES[0] ?? '')
  const [editDate, setEditDate] = useState('')
  const [fxForm, setFxForm] = useState(BLANK_FX_FORM)
  const [invForm, setInvForm] = useState(BLANK_INV_FORM)
  const [letterText, setLetterText] = useState('')

  // Toast (one at a time, like the original)
  const [toast, setToast] = useState<Toast>({ message: '', kind: null, visible: false })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const showToast = useCallback((message: string, kind?: ToastKind) => {
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

  // ------------------------------------------------------------------ selection screen

  const executeSelection = (raw: string) => {
    const id = normalizeDealId(raw)
    if (id === null) {
      setSelError(true)
      return
    }
    setSelError(false)
    setDeal((d) => ({ ...d, dealId: id }))
    setMainShown(true)
    setSelFx(null)
    setSelInv(null)
  }

  const backToSelection = () => {
    setMainShown(false)
    setSelFx(null)
    setSelInv(null)
    dealInputRef.current?.focus()
  }

  const refreshScreen = () => {
    if (!mainShown) return
    setSelFx(null)
    setSelInv(null)
    showToast('Screen refreshed.', 'info')
  }

  // ------------------------------------------------------------------ toolbar-driven actions

  const changeStatus = (code: string) => {
    setDeal((d) => ({ ...d, dealStatus: code }))
    showToast(statusChangedToast(code), 'info')
  }

  const initiateSettlement = () => {
    setDeal((d) => ({ ...d, dealStatus: '20' }))
    showToast(`Settlement initiated for Deal ID ${deal.dealId}.`, 'success')
  }

  const executionComplete = () => {
    // fcode EXE_C: every FX leg / invoice leg has to be marked settled first (SET_CO = 'X').
    if (!settlementComplete(fxDeals, invoices, deal.noInvoiceFlag)) {
      showToast(REMAINING_LEGS_MESSAGE, 'error')
      return
    }
    setDeal((d) => ({ ...d, dealStatus: '21' }))
    showToast('Deal ID marked as Settlement Complete.', 'success')
  }

  const initiatePrinting = () => showToast(`Settlement letters queued for printing for Deal ID ${deal.dealId}.`, 'info')

  // Amend Deal End Date (9005)
  const openAmend = () => {
    setAmendDate(amendDateInitial(deal))
    modals.open('amend')
  }
  const updateEndDate = () => {
    const result = applyEndDate(deal, amendDate)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setDeal(result.value)
    modals.close('amend')
    showToast(END_DATE_UPDATED, 'success')
  }

  // FX-Invoice Difference (9006)
  const openDiff = () => {
    setSpots(fxDeals.map((r) => r.spot))
    modals.open('diff')
  }
  const saveSpotData = () => {
    setFxDeals((list) => applySpotData(list, spots))
    modals.close('diff')
    showToast(SPOT_SAVED, 'success')
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
    const result = addDmsDocument(dms, editDocType, editDate, deal.dealId)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setDms(result.value)
    modals.close('editDms')
    showToast(`Document uploaded against Deal ID ${deal.dealId}.`, 'success')
  }

  const openViewInvoice = () => {
    if (deal.noInvoiceFlag) {
      showToast('This FX model has no trade invoice leg.', 'info')
      return
    }
    modals.open('viewInv')
  }

  // ------------------------------------------------------------------ FX transaction posting (9003)

  const openFxPost = (idx: number) => {
    const r = fxDeals[idx]
    if (!r) return
    setActiveFx(idx)
    setFxForm((f) => ({ ...f, ...fxPostDefaults(r) }))
    modals.open('fxPost')
  }
  const setFxField = <K extends keyof FxPostForm>(key: K, value: FxPostForm[K]) =>
    setFxForm((f) => ({ ...f, [key]: value }))
  const replaceFx = (idx: number, next: (typeof fxDeals)[number]) =>
    setFxDeals((list) => list.map((r, i) => (i === idx ? next : r)))

  const postFxAction = (kind: PostKind) => {
    const r = activeFx === null ? undefined : fxDeals[activeFx]
    if (activeFx === null || !r) return
    if (kind === 'test') {
      showToast('Test run posted - no FI documents created.', 'info')
    } else if (kind === 'print') {
      setLetterText(buildFxLetter(r, deal.dealId))
      modals.open('letter')
    } else if (kind === 'update') {
      replaceFx(activeFx, updateFxPartner(r, fxForm.partner))
      showToast('Transaction details updated.', 'success')
    } else if (kind === 'post') {
      const posted = postFxEntry(r, activeFx)
      replaceFx(activeFx, posted)
      setFxForm((f) => ({ ...f, bDoc: posted.doc2, sDoc: posted.doc1 }))
      showToast(`Accounting entries posted. FI documents ${posted.doc1} / ${posted.doc2} created.`, 'success')
    } else {
      const result = completeFx(r)
      if (!result.ok) {
        showToast(result.error, 'error')
        return
      }
      replaceFx(activeFx, result.value)
      modals.close('fxPost')
      showToast(`FX leg ${r.rfha} marked Settlement Complete.`, 'success')
    }
  }

  // ------------------------------------------------------------------ Posting pop-up (9002)

  const openInvPost = (idx: number) => {
    const r = invoices[idx]
    if (!r) return
    setActiveInv(idx)
    setInvForm(invPostDefaults(r, deal.dealId))
    modals.open('invPost')
  }
  const setInvField = <K extends keyof InvPostForm>(key: K, value: InvPostForm[K]) =>
    setInvForm((f) => ({ ...f, [key]: value }))
  const replaceInv = (idx: number, next: (typeof invoices)[number]) =>
    setInvoices((list) => list.map((r, i) => (i === idx ? next : r)))

  const postInvAction = (kind: Exclude<PostKind, 'test'>) => {
    const r = activeInv === null ? undefined : invoices[activeInv]
    if (activeInv === null || !r) return
    if (kind === 'print') {
      setLetterText(buildInvoiceLetter(r, deal.dealId))
      modals.open('letter')
    } else if (kind === 'update') {
      replaceInv(activeInv, updateInvPostDate(r, invForm.date))
      showToast('Invoice posting details updated.', 'success')
    } else if (kind === 'post') {
      const posted = postInvDocument(r, activeInv)
      replaceInv(activeInv, posted)
      setInvForm((f) => ({ ...f, fiDoc: posted.fiDoc }))
      showToast(`Document posted. FI document ${posted.fiDoc} created for leg ${r.leg}.`, 'success')
    } else {
      const result = completeInv(r)
      if (!result.ok) {
        showToast(result.error, 'error')
        return
      }
      replaceInv(activeInv, result.value)
      modals.close('invPost')
      showToast(`Invoice leg ${r.leg} marked Settlement Complete.`, 'success')
    }
  }

  const printLetterPdf = () => {
    showToast('Letter sent to print (PDF generated via FP_JOB_OPEN / FP_JOB_CLOSE in SAP).', 'success')
    modals.close('letter')
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') executeSelection(dealIdInput)
                  }}
                />
              </div>
              <button className="btn-primary-inline" type="button" onClick={() => executeSelection(dealIdInput)}>
                Go
              </button>
              <button
                type="button"
                className="sample-chip"
                onClick={() => {
                  setDealIdInput(SAMPLE_DEAL_ID)
                  executeSelection(SAMPLE_DEAL_ID)
                }}
              >
                Try sample &middot; <strong>{SAMPLE_DEAL_ID}</strong>
              </button>
            </div>
            <div className={selError ? 'select-err show' : 'select-err'} id="selErr">
              {DEAL_ID_REQUIRED}
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
                <StatusPill code={deal.dealStatus} />
              </span>
            </div>
            <div className="panel-body">
              <HeaderGrid deal={deal} onStatus={changeStatus} />
            </div>
          </div>

          <div className="panel">
            <ActionToolbar
              noInvoiceFlag={deal.noInvoiceFlag}
              fxSelected={selFx !== null}
              invSelected={selInv !== null}
              visibility={visibility}
              actions={{
                amend: openAmend,
                headsup: () => modals.open('headsup'),
                viewInvoice: openViewInvoice,
                diff: openDiff,
                pl: () => modals.open('pl'),
                editDms: () => openDms(true),
                postFx: () => (selFx === null ? showToast('Select a FX deal row first.', 'error') : openFxPost(selFx)),
                postInv: () =>
                  selInv === null ? showToast('Select a trade invoice row first.', 'error') : openInvPost(selInv),
                initiate: initiateSettlement,
                executionComplete,
              }}
            />
            <div className="drag-hint">
              Tip: double-click a row in the FX Deal grid or the Trade Invoice grid below to open its settlement / posting
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
            onToast={showToast}
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
            onToast={showToast}
          />
        </div>
      </main>

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
        items={HEADSUP_DATA}
      />
      <DiffModal
        open={modals.isOpen('diff')}
        onClose={() => modals.close('diff')}
        rows={fxDeals}
        spots={spots}
        onSpot={(idx, v) => setSpots((list) => list.map((s, i) => (i === idx ? v : s)))}
        onSave={saveSpotData}
      />
      <DmsModal
        open={modals.isOpen('dms')}
        onClose={() => modals.close('dms')}
        dealId={deal.dealId}
        docs={dms}
        onEdit={openEditDms}
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
      <LetterModal
        open={modals.isOpen('letter')}
        onClose={() => modals.close('letter')}
        text={letterText}
        onPrint={printLetterPdf}
      />
      <ViewInvModal
        open={modals.isOpen('viewInv')}
        onClose={() => modals.close('viewInv')}
        dealId={deal.dealId}
        rows={invoices}
      />
    </div>
  )
}
