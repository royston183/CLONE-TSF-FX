import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import './mo-generate-invoices-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-generate-invoices-deal-id.dark.css'
import { isAbort } from '../../shared/fx/mw.ts'
import {
  BANK_WAITING,
  actionWaiting,
  amendedStatus,
  confirmAmendment,
  loadDeal,
  loadDealList,
  messageOf,
  recalculateAndUpdate,
  saveInitialData,
  type DealContext,
} from './api.ts'
import { BankModal } from './BankModal.tsx'
import { BlModal } from './BlModal.tsx'
import { middlewarePorts, loadFinalisationSellers } from './ports.ts'
import { DEAL_INVOICE_STATUS, canReverseInvoice, isFinalInvoiceStatus, type InvoiceFinalStatus } from './invoice-status.ts'
import { amendDealStatus, confirmInvoiceGeneration, deassignBls, pcMismatches, reconcileInvoicePc, reverseInvoiceConfirmation, type WorkflowResult } from './workflow.ts'
import { ComplianceModal } from './ComplianceModal.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { setStatusTexts } from './data.ts'
import { DateCell } from './DateCell.tsx'
import { DealLookupModal } from './DealLookupModal.tsx'
import { DiffModal } from './DiffModal.tsx'
import { money, parseNum, statusText, validDMY } from './format.ts'
import {
  canCancelInvoice,
  canPrintLetters,
  computeInvoiceConfirmation,
  getDealUsdAmount,
  getInvoiceUsdAmount,
  hasRollover,
  invSearchText,
  paginate,
  profitCheckError,
  recalcInvoiceRow,
  searchRows,
  sortRows,
} from './logic.ts'
import { RemarkModal } from './RemarkModal.tsx'
import { TxnModal } from './TxnModal.tsx'
import type { ConfirmDialogState, Deal, DealListRow, FxRow, InvRow, Sort, Toast } from './types.ts'

const FX_COLS: Array<{ key: keyof FxRow; label: string; num?: number }> = [
  { key: 'dealType', label: 'Deal Type' },
  { key: 'roll', label: 'Roll Deal Type' },
  { key: 'bukrs', label: 'CoCode' },
  { key: 'bp', label: 'Business Partner' },
  { key: 'rfha', label: 'Transaction No' },
  { key: 'start', label: 'Start Date' },
  { key: 'end', label: 'End Date' },
  { key: 'entity', label: 'Entity' },
  { key: 'bs1', label: 'Side 1' },
  { key: 'curr1', label: 'Crcy 1' },
  { key: 'amt1', label: 'Amount 1', num: 2 },
  { key: 'bs2', label: 'Side 2' },
  { key: 'curr2', label: 'Crcy 2' },
  { key: 'amt2', label: 'Amount 2', num: 2 },
  { key: 'allIn', label: 'All in Rate', num: 9 },
  { key: 'strike', label: 'Strike', num: 9 },
  { key: 'mc', label: 'MC Ref No' },
  { key: 'txn', label: 'Txn Status' },
]

const INV_COLS: Array<{ key: string; label: string }> = [
  { key: 'ttype', label: 'Trade Type' },
  { key: 'invType', label: 'Inv Type' },
  { key: 'seller', label: 'Seller' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'bp', label: 'Business Partner' },
  { key: 'bank', label: 'Partner Bank' },
  { key: 'assign', label: 'Assign House Bank' },
  { key: 'invDate', label: 'Invoice Date' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'commodity', label: 'Invoice Commodity' },
  { key: 'gtComm', label: 'GT Commodity ID' },
  { key: 'qty', label: 'Quantity' },
  { key: 'usdPrice', label: 'Price (USD)' },
  { key: 'rate', label: 'Exchange Rate' },
  { key: 'price', label: 'Price' },
  { key: 'amt', label: 'Final Inv Amt' },
  { key: 'amtUsd', label: 'Inv Amt (USD)' },
  { key: 'planned', label: 'Planned Inv Amt' },
  { key: 'invNo', label: 'Invoice No' },
  { key: 'pc', label: 'P/C' },
]

const PAGE_SIZE = 8

/** Form-based outputs and postings with no API (the ABAP's own FMs / classes are listed). */
const LETTER_APIS =
  'Adobe Form via FP_FUNCTION_MODULE_NAME / FP_JOB_OPEN / FP_JOB_CLOSE, BAPI_BUPA_ADDRESS_GETDETAIL, READ_TEXT, SPELL_AMOUNT, ZSGPTSFFM_CHANGE_AMT_TO_WORDS, HR_RU_MONTH_NAME_IN_GENITIVE'

function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  const nums = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1)
  return (
    <div className="pager">
      <button className="page-btn" type="button" disabled={page <= 1} onClick={() => onGo(page - 1)}>
        ‹
      </button>
      {nums.map((p) => (
        <button key={p} className={`page-btn${p === page ? ' active' : ''}`} type="button" onClick={() => onGo(p)}>
          {p}
        </button>
      ))}
      <button className="page-btn" type="button" disabled={page >= pages} onClick={() => onGo(page + 1)}>
        ›
      </button>
    </div>
  )
}


export default function MoGenerateInvoicesDealId() {
  const [dealList, setDealList] = useState<DealListRow[]>([])
  const [dealListReason, setDealListReason] = useState('')
  const [deal, setDeal] = useState<Deal | null>(null)
  const [ctx, setCtx] = useState<DealContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [dealLookupInput, setDealLookupInput] = useState('')
  const loadSeq = useRef(0)

  const [fxSearch, setFxSearch] = useState('')
  const [invSearch, setInvSearch] = useState('')
  const [fxSort, setFxSort] = useState<Sort<string>>({ key: 'dealType', dir: 1 })
  const [invSort, setInvSort] = useState<Sort<string>>({ key: 'ttype', dir: 1 })
  const [fxPage, setFxPage] = useState(1)
  const [invPage, setInvPage] = useState(1)
  const [selectedFx, setSelectedFx] = useState(-1)
  const [selectedInv, setSelectedInv] = useState(-1)
  const [amendMode, setAmendMode] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [dealLookupOpen, setDealLookupOpen] = useState(false)
  const [txnRow, setTxnRow] = useState<FxRow | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null)
  const [pendingInvoiceStatus, setPendingInvoiceStatus] = useState<InvoiceFinalStatus>(DEAL_INVOICE_STATUS.INVOICE_CREATED)
  const [busy, setBusy] = useState(false)
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [blOpen, setBlOpen] = useState(false)
  const [blVersion, setBlVersion] = useState(0)
  const [remarkBlIndex, setRemarkBlIndex] = useState(-1)
  const [diffOpen, setDiffOpen] = useState(false)
  const [bankRow, setBankRow] = useState(-1)

  const toast = (message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'warn' || kind === 'error' ? 7000 : 3200)
  }

  // The Deal IDs P_DEAL offers (matchcode ZSGTSFSH_DEAL_ID -> ZSGTSFTR_DEALID).
  useEffect(() => {
    const ctrl = new AbortController()
    loadDealList(ctrl.signal)
      .then((r) => {
        if (r.ok) {
          setDealList(r.value)
          setDealListReason('')
        } else setDealListReason(r.reason)
      })
      .catch((e) => {
        if (!isAbort(e)) setDealListReason(messageOf(e))
      })
    return () => ctrl.abort()
  }, [])

  /** Local edits of the grids, as the ALV holds them until a save. */
  const updateDeal = (fn: (d: Deal) => Deal) => {
    setDeal((prev) => (prev ? fn(prev) : prev))
  }

  const resetView = () => {
    setFxSearch('')
    setInvSearch('')
    setFxPage(1)
    setInvPage(1)
    setSelectedFx(-1)
    setSelectedInv(-1)
    setAmendMode(false)
  }

  /** GET_DATA for a Deal ID (START-OF-SELECTION -> screen 9000, and every gv_flag toggle). */
  const fetchDeal = async (id: string, quiet = false) => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const loaded = await loadDeal(id)
      if (seq !== loadSeq.current) return
      setStatusTexts(loaded.statusOptions)
      setDeal(loaded.deal)
      setCtx(loaded.ctx)
      if (loaded.notice && !quiet) toast(loaded.notice, 'warn')
    } catch (e) {
      if (isAbort(e) || seq !== loadSeq.current) return
      setDeal(null)
      setCtx(null)
      toast(`Deal ID ${id} could not be read from SAP: ${messageOf(e)}`, 'error')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  const selectDeal = (id: string) => {
    setDealLookupInput(id)
    resetView()
    void fetchDeal(id)
  }

  const loadTypedDeal = (value: string) => {
    const id = value.trim()
    if (!id) {
      setDeal(null)
      setCtx(null)
      return
    }
    if (dealList.some((d) => d.dealId === id)) {
      selectDeal(id)
      return
    }
    toast(dealListReason ? `Deal IDs could not be read: ${dealListReason}` : `Deal ID ${id} was not found. Use View Deals to search.`, 'warn')
  }

  /** REF: gv_flag toggles and GET_DATA runs again for the same Deal ID. */
  const refreshAll = () => {
    setMoreOpen(false)
    resetView()
    if (!deal) {
      toast('Select a Deal ID to load invoice data.', 'info')
      return
    }
    void fetchDeal(deal.dealId, true).then(() => toast('Workbench refreshed from SAP.', 'info'))
  }

  const fxRows = useMemo(() => (deal ? sortRows(searchRows(deal.fx, fxSearch, FX_COLS.map((c) => c.key)), fxSort) : []), [deal, fxSearch, fxSort])
  const fxMeta = paginate(fxRows, fxPage, PAGE_SIZE)

  const invRows = useMemo(() => {
    if (!deal) return []
    const rows = fxSearchInv(deal.inv, invSearch)
    return sortRows(rows, invSort)
  }, [deal, invSearch, invSort])
  const invMeta = paginate(invRows, invPage, PAGE_SIZE)

  function fxSearchInv(rows: InvRow[], q: string): InvRow[] {
    if (!q) return rows
    const u = q.toUpperCase()
    return rows.filter((r) => INV_COLS.some((c) => String(invSearchText(r, c.key)).toUpperCase().indexOf(u) >= 0))
  }

  const amendable = deal ? isFinalInvoiceStatus(deal.status) : false
  // 04 starts a finalisation; at 05 / 07 a row still without its BL invoice type means a finalisation stopped part-way.
  const finalisationPending = !!deal && isFinalInvoiceStatus(deal.status) && deal.inv.some((r) => !r.locked)
  const canConfirmInvoice = !!deal && !deal.dm && !busy && (deal.status === DEAL_INVOICE_STATUS.INVOICE_REVERSED || finalisationPending)
  const pcStale = deal && ctx ? pcMismatches(deal.status, ctx.bilAdj).length : 0
  const rollover = hasRollover(deal)

  /** The invoice grid is built from gt_top: without it the grid-based actions cannot run. */
  const invoiceGridMissing = (): boolean => {
    if (!deal) return true
    if (deal.invReason) {
      toast(deal.invReason, 'warn')
      return true
    }
    return false
  }

  /** Runs a multi-step operation, shows exactly where it stopped, and reloads SAP's state either way. */
  const runWorkflow = async (run: () => Promise<WorkflowResult>, dealId: string, after?: () => void) => {
    setBusy(true)
    try {
      const result = await run()
      toast(result.message, result.ok ? (result.steps.some((x) => x.status === 'skipped') ? 'warn' : 'success') : 'error')
      if (result.ok) after?.()
      await fetchDeal(dealId, true)
    } catch (e) {
      toast(messageOf(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const calculateInvoices = (showMessage: boolean) => {
    if (!deal) return
    if (showMessage && invoiceGridMissing()) return
    updateDeal((d) => ({ ...d, inv: d.inv.map(recalcInvoiceRow) }))
    if (showMessage) toast('Adjusted Price / Qty recalculated.', 'info')
  }

  const initiateInvoiceConfirmation = () => {
    if (!deal || invoiceGridMissing()) return
    const profitError = profitCheckError(deal)
    if (profitError) {
      toast(profitError, 'error')
      return
    }
    if (finalisationPending) {
      // The Deal ID already moved to 05 / 07: finish what stopped, with the status it reached.
      const status = deal.status as InvoiceFinalStatus
      setPendingInvoiceStatus(status)
      setConfirmState({
        title: 'Complete Invoice Generation',
        text: `Invoice generation for Deal ID ${deal.dealId} stopped part-way at status ${statusText(status)}. Run the remaining steps?`,
        note: 'Steps already written are repeated safely.',
        yesLabel: 'Yes',
        onYes: () => {
          setConfirmState(null)
          void saveInvoice(status)
        },
      })
      return
    }
    if (deal.tolerance === null) {
      toast('Tolerance T02 (ZSGTSFTR_TOLR) could not be read, so the invoice cannot be compared with the deal.', 'error')
      return
    }
    const fresh = { ...deal, inv: deal.inv.map(recalcInvoiceRow) }
    setDeal(fresh)
    const { status, message } = computeInvoiceConfirmation(fresh)
    const dealAmt = getDealUsdAmount(fresh)
    const invAmt = getInvoiceUsdAmount(fresh)
    setPendingInvoiceStatus(status)
    setConfirmState({
      title: 'Generate Invoice',
      text: message,
      note: `FX Deal Amount: USD ${money(dealAmt, 2)} • Invoice Amount: USD ${money(invAmt, 2)}`,
      yesLabel: 'Yes',
      onYes: () => {
        setConfirmState(null)
        setComplianceOpen(true)
      },
    })
  }

  /** 9002 YES -> FORM save_data: number range, Z-table updates and the invoice e-mail. */
  const saveInvoice = async (status: InvoiceFinalStatus = pendingInvoiceStatus) => {
    if (!deal || !ctx) return
    setComplianceOpen(false)
    const sellers = await loadFinalisationSellers().catch(() => [])
    await runWorkflow(
      () => confirmInvoiceGeneration({ deal, dealRows: ctx.dealRows, diffRule: ctx.diffRule, status, sellers }, middlewarePorts),
      deal.dealId,
      resetView,
    )
  }

  const cancelInvoice = () => {
    if (!deal) return
    setMoreOpen(false)
    if (!canCancelInvoice(deal.status) || !canReverseInvoice(deal.status)) {
      toast('Selected Deal ID can not be canceled', 'warn')
      return
    }
    setConfirmState({
      title: 'Cancel TRM Invoice',
      text: 'Do you really want to cancel the invoice?',
      note: `Deal ID ${deal.dealId}`,
      yesLabel: 'Yes',
      onYes: () => {
        setConfirmState(null)
        if (!ctx) return
        void runWorkflow(() => reverseInvoiceConfirmation(deal, ctx.dealRows, middlewarePorts), deal.dealId, resetView)
      },
    })
  }

  const toggleAmendDeal = () => {
    if (!deal || !ctx) return
    setMoreOpen(false)
    const next = amendedStatus(deal.status)
    if (!next) {
      toast('Deal ID status can be amended only from 05 or 07.', 'warn')
      return
    }
    setConfirmState({
      title: 'Amend Deal Status',
      text: `Deal ID ${deal.dealId} status will change to ${statusText(next)}.`,
      note: 'ZSGTSFTR_DEALID-ZDEAL_STAT and ZSGTSFTR_BIL_ADJ-ZPC are updated as FORM ammend_deal does.',
      yesLabel: 'Yes',
      onYes: () => {
        setConfirmState(null)
        void runWorkflow(() => amendDealStatus(deal, ctx.dealRows, middlewarePorts), deal.dealId)
      },
    })
  }

  const enableAmendment = () => {
    setMoreOpen(false)
    if (invoiceGridMissing()) return
    setAmendMode(true)
    toast('Amendment mode enabled: Invoice Date and Price (USD) are editable.', 'info')
  }

  /** AMDC: FORM save_alv2_data — MODIFY ZSGTSFTR_BIL_ADJ, then GET_DATA again. */
  const confirmAmendmentAction = () => {
    if (!deal || !ctx) return
    setMoreOpen(false)
    if (invoiceGridMissing()) return
    confirmAmendment(deal, ctx)
      .then((r) => {
        if (r === 'needsNumber') {
          toast(actionWaiting(`Amendment Confirm for Deal ID ${deal.dealId} (an invoice row has no saved ZINV_NO)`, 'NUMBER_GET_NEXT ZSGTSFNR08'), 'warn')
          return
        }
        setAmendMode(false)
        toast(`Amendment confirmed for Deal ID ${deal.dealId}.`)
        return fetchDeal(deal.dealId, true)
      })
      .catch((e) => toast(`Amendment Confirm failed: ${messageOf(e)}`, 'error'))
  }

  /** SAVE: FORM save_initial_data — MODIFY ZSGTSFTR_BIL_ADJ for the unconfirmed rows. */
  const saveInitial = () => {
    if (!deal || !ctx) return
    setMoreOpen(false)
    if (invoiceGridMissing()) return
    saveInitialData(deal, ctx)
      .then((n) => toast(n ? `Initial invoice data saved for Deal ID ${deal.dealId}.` : `Deal ID ${deal.dealId} has no unconfirmed invoice rows to save.`, n ? 'success' : 'info'))
      .catch((e) => toast(`Save Initial Data failed: ${messageOf(e)}`, 'error'))
  }

  /** C_UPD: FORM calcuate_update_invoice — UPDATE ZSGTSFTR_BIL_ADJ / ZSGTSFTR_INV_REF from gt_top. */
  const recalcUpdate = () => {
    if (!deal || !ctx) return
    setMoreOpen(false)
    if (invoiceGridMissing()) return
    recalculateAndUpdate(deal, ctx)
      .then(() => {
        toast('Invoice values recalculated and updated.')
        return fetchDeal(deal.dealId, true)
      })
      .catch((e) => toast(`Re-calculate & Update failed: ${messageOf(e)}`, 'error'))
  }

  /** Repairs 05 <=> C / 07 <=> P after an amendment stopped between its two writes. */
  const reconcilePc = () => {
    if (!deal) return
    setMoreOpen(false)
    void runWorkflow(() => reconcileInvoicePc(deal, middlewarePorts), deal.dealId)
  }

  const letter = (kind: 'Import' | 'Export') => {
    if (!deal) return
    setMoreOpen(false)
    if (!canPrintLetters(deal.status)) {
      toast('Letters cannot be generated at this status id', 'warn')
      return
    }
    toast(actionWaiting(`${kind} Letter for Deal ID ${deal.dealId}`, LETTER_APIS), 'warn')
  }

  const setInvField = (index: number, edit: string, rawValue: string) => {
    if (!deal) return
    if (edit === 'invDate') {
      if (!validDMY(rawValue)) {
        toast('Use a valid date in dd-mm-yyyy format.', 'error')
        return
      }
      updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === index ? { ...r, invDate: rawValue } : r)) }))
      return
    }
    const n = parseNum(rawValue)
    if (Number.isNaN(n) || n < 0) {
      toast('Enter a valid non-negative number.', 'error')
      return
    }
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === index ? recalcInvoiceRow({ ...r, [edit]: n }) : r)) }))
  }

  const openBank = (index: number) => setBankRow(index)
  /** UPD_HB only changes the grid row (gt_inv); it reaches SAP with the next save, as in the ABAP. */
  const saveBank = (houseBank: string, accountId: string, partnerBank: string) => {
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === bankRow ? { ...r, houseBank, accountId, partnerBank } : r)) }))
    setBankRow(-1)
    toast('House Bank / Partner Bank updated in the grid.')
  }

  const openDeassign = (index: number) => setRemarkBlIndex(index)
  /** 9003 UPDATE: Z-table updates plus the BL e-mail — no API for the e-mail and the delete. */
  const saveRemark = (remark: string) => {
    const raw = ctx?.bls[remarkBlIndex]
    setRemarkBlIndex(-1)
    if (!deal || !ctx || !raw) return
    setBlOpen(false)
    void runWorkflow(
      () => deassignBls({ deal, dealRows: ctx.dealRows, allBls: ctx.bls, selected: [raw], remark }, middlewarePorts),
      deal.dealId,
      () => setBlVersion((v) => v + 1),
    )
  }

  const nextFxSort = (key: keyof FxRow) => setFxSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const nextInvSort = (key: string) => setInvSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const canEditInvRow = (r: InvRow) => (!r.locked && Number(deal?.status) <= 4) || amendMode

  return (
    <div className="invblotter">
      <div className="app">
        <header className="topbar">
          <div className="top-left">
            <BackButton className="back-btn" />
            <div className="brand-mark" aria-label="FourthSignal">
              <span className="b1" />
              <span className="b2" />
              <span className="b3" />
              <span className="b4" />
            </div>
            <div className="title-wrap">
              <div className="app-title">Invoice Finalisation Blotter</div>
            </div>
          </div>
          <div className="top-right">
            <button className="hdr-btn primary" type="button" disabled={!canConfirmInvoice} onClick={initiateInvoiceConfirmation}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Confirm Invoice</span>
            </button>
            <span className="live-dot" title="Workbench active" />
            <button className="hdr-btn" type="button" disabled={!deal || deal.dm} onClick={() => setBlOpen(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 5h16v14H4zM4 9h16M8 5v14" />
              </svg>
              <span>View BLs</span>
            </button>
            <button className="hdr-btn" type="button" disabled={!deal} onClick={() => setDiffOpen(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 19h16M6 16l4-5 3 2 5-7" />
              </svg>
              <span>Invoice Difference</span>
            </button>
            <button className="hdr-btn" type="button" onClick={refreshAll}>
              <svg viewBox="0 0 24 24">
                <path d="M20 6v5h-5M19 11a7 7 0 10.2 4" />
              </svg>
              <span>Refresh</span>
            </button>
            <div className="more-wrap">
              <button className="icon-btn" type="button" title="More actions" onClick={() => setMoreOpen((v) => !v)}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⋯</span>
              </button>
              <div className={`more-menu${moreOpen ? ' open' : ''}`}>
                <button className="more-item" type="button" disabled={!deal} onClick={saveInitial}>
                  Save Initial Data
                </button>
                <button className="more-item" type="button" disabled={!deal} onClick={recalcUpdate}>
                  Re-calculate &amp; Update
                </button>
                <button className="more-item" type="button" disabled={!deal || !amendable} onClick={enableAmendment}>
                  Amendment
                </button>
                <button className="more-item" type="button" disabled={!deal || !amendable || !amendMode} onClick={confirmAmendmentAction}>
                  Amendment Confirm
                </button>
                {pcStale ? (
                  <button className="more-item" type="button" onClick={reconcilePc}>
                    Reconcile invoice P/C ({pcStale})
                  </button>
                ) : null}
                <button className="more-item" type="button" disabled={!deal || !amendable || !rollover} onClick={toggleAmendDeal}>
                  Amend Deal Status
                </button>
                <button className="more-item" type="button" disabled={!deal || !canPrintLetters(deal.status)} onClick={() => letter('Import')}>
                  Import Letter
                </button>
                <button className="more-item" type="button" disabled={!deal || !canPrintLetters(deal.status)} onClick={() => letter('Export')}>
                  Export Letter
                </button>
                <button className="more-item danger" type="button" disabled={!deal} onClick={cancelInvoice}>
                  Cancel TRM Invoice
                </button>
              </div>
            </div>
            <SignOutButton className="hdr-btn" />
          </div>
        </header>

        <main className="workspace">
          <section className="card context-card selection-card">
            <div className="section-head">
              <div className="section-title">Selection Criteria</div>
              <div className="section-meta">{dealListReason ? `Deal IDs (ZSGTSFTR_DEALID) unavailable: ${dealListReason}` : loading ? 'Loading Deal ID from SAP…' : 'Select a Deal ID to load invoice data'}</div>
            </div>
            <div className="selection-grid">
              <div className="field">
                <label>
                  Deal ID <span className="req">*</span>
                </label>
                <div className="deal-picker">
                  <input
                    className="control"
                    list="dealOptions"
                    placeholder="Type / select Deal ID..."
                    autoComplete="off"
                    value={dealLookupInput}
                    onChange={(e) => setDealLookupInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadTypedDeal(dealLookupInput)}
                  />
                  <datalist id="dealOptions">
                    {dealList.map((d) => (
                      <option key={d.dealId} value={d.dealId}>
                        {`${d.entityString} — ${d.statusLabel}`}
                      </option>
                    ))}
                  </datalist>
                  <button className="view-deals-btn" type="button" onClick={() => setDealLookupOpen(true)}>
                    View Deals
                  </button>
                </div>
              </div>
              <div className="selection-note">Type a Deal ID and press Enter, or use View Deals to search and select.</div>
            </div>
          </section>

          <section className="card context-card" id="basicCard">
            <div className="section-head">
              <div className="section-title">Basic Details</div>
              <div className="section-meta">{deal ? `Deal ${deal.dealId} • ${statusText(deal.status)} • Tolerance ${deal.tolerance === null ? '—' : money(deal.tolerance, 2)}%` : 'Select a Deal ID to load invoice data'}</div>
            </div>
            <div className="basic-grid">
              <div className="basic-row row-deal">
                <div className="field">
                  <label>Deal ID Reference</label>
                  <input className="control readonly" disabled value={deal?.dealRef ?? ''} />
                </div>
                <div className="field">
                  <label>Deal Start Date</label>
                  <div className="date-value">{deal?.dealStart || '—'}</div>
                </div>
                <div className="field">
                  <label>Deal End Date</label>
                  <div className="date-value">{deal?.dealEnd || '—'}</div>
                </div>
                <div className="field">
                  <label>Deal ID Status</label>
                  <select className="control status-control" disabled value={deal?.status ?? ''}>
                    {deal ? <option value={deal.status}>{statusText(deal.status)}</option> : null}
                  </select>
                </div>
              </div>

              <div className="basic-row row-contract">
                <div className="field">
                  <label>MC Ref No</label>
                  <input className="control readonly" disabled value={deal?.mcRef ?? ''} />
                </div>
                <div className="field">
                  <label>MC Description</label>
                  <input className="control readonly" disabled value={deal?.mcDesc ?? ''} />
                </div>
                <div className="field">
                  <label>MC Date</label>
                  <div className="date-value">{deal?.mcDate || '—'}</div>
                </div>
                <div className="field">
                  <label>Ship Start Date</label>
                  <div className="date-value">{deal?.shipStart || '—'}</div>
                </div>
                <div className="field">
                  <label>Ship End Date</label>
                  <div className="date-value">{deal?.shipEnd || '—'}</div>
                </div>
              </div>

              <div className="basic-row row-structure">
                <div className="field">
                  <label>Entity String</label>
                  <input className="control readonly" disabled value={deal?.entityString ?? ''} />
                </div>
                <div className="field">
                  <label>Currency String</label>
                  <input className="control readonly" disabled value={deal?.currencyString ?? ''} />
                </div>
                <div className="field">
                  <label>Trader</label>
                  <input className="control readonly" disabled value={deal?.trader ?? ''} />
                </div>
                <div className="field">
                  <label>Trader Name</label>
                  <input className="control readonly" disabled value={deal?.traderDesc ?? ''} />
                </div>
                <div className="field">
                  <label>FX Model ID</label>
                  <input className="control readonly" disabled value={deal?.modelId ?? ''} />
                </div>
                <div className="field">
                  <label>FX Inv Model</label>
                  <input className="control readonly" disabled value={deal?.fxInvModel ?? ''} />
                </div>
              </div>

              <div className="basic-row row-model">
                <div className="field">
                  <label>Model Description</label>
                  <input className="control readonly" disabled value={deal?.modelDesc ?? ''} />
                </div>
              </div>
            </div>
          </section>

          <div className="tables">
            <section className="card table-card">
              <div className="table-toolbar">
                <div className="table-title">
                  FX Deals <span className="count">{fxMeta.total} records</span>
                </div>
                <div className="toolbar-tools">
                  <input
                    className="search"
                    placeholder="Search FX deals..."
                    disabled={!deal}
                    value={fxSearch}
                    onChange={(e) => {
                      setFxSearch(e.target.value)
                      setFxPage(1)
                    }}
                  />
                </div>
              </div>
              <div className="grid-wrap">
                {!deal ? (
                  <div className="empty">{loading ? 'Loading Deal ID from SAP…' : 'Select a Deal ID to view FX deals.'}</div>
                ) : deal.fxReason ? (
                  <div className="empty">{deal.fxReason}</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th className="select-cell" />
                        {FX_COLS.map((c) => (
                          <th key={c.key} className={`sortable${fxSort.key === c.key ? (fxSort.dir === 1 ? ' sorted-asc' : ' sorted-desc') : ''}`} onClick={() => nextFxSort(c.key)}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fxMeta.rows.map((r) => {
                        const idx = deal.fx.indexOf(r)
                        const selected = idx === selectedFx
                        return (
                          <tr
                            key={r.rfha}
                            draggable
                            className={selected ? 'selected' : ''}
                            onClick={() => setSelectedFx(idx)}
                            onDoubleClick={() => setTxnRow(r)}
                            onDragStart={(e) => {
                              setSelectedFx(idx)
                              e.dataTransfer.setData('text/plain', `fx:${idx}`)
                            }}
                          >
                            <td className="select-cell">
                              <input className="row-check" type="checkbox" checked={selected} onChange={() => setSelectedFx(idx)} onClick={(e) => e.stopPropagation()} />
                            </td>
                            {FX_COLS.map((c) => {
                              if (c.key === 'rfha')
                                return (
                                  <td key={c.key}>
                                    <span
                                      className="link"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTxnRow(r)
                                      }}
                                    >
                                      {r.rfha}
                                    </span>
                                  </td>
                                )
                              if (c.key === 'txn')
                                return (
                                  <td key={c.key}>
                                    <span className="status-text status-ok">{r.txn}</span>
                                  </td>
                                )
                              const val = r[c.key]
                              return (
                                <td key={c.key} className={c.num != null ? 'num' : undefined}>
                                  {c.num != null ? money(val as number, c.num) : String(val)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="table-footer">
                <span>{fxMeta.total ? `Showing ${fxMeta.start + 1}–${Math.min(fxMeta.start + PAGE_SIZE, fxMeta.total)} of ${fxMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={fxMeta.page} pages={fxMeta.pages} onGo={setFxPage} />
              </div>
            </section>

            <section className="card table-card">
              <div className="table-toolbar">
                <div className="table-title">
                  Adjusted Price / Qty <span className="count">{invMeta.total} records</span>
                </div>
                <div className="toolbar-tools">
                  <input
                    className="search"
                    placeholder="Search adjusted invoice..."
                    disabled={!deal}
                    value={invSearch}
                    onChange={(e) => {
                      setInvSearch(e.target.value)
                      setInvPage(1)
                    }}
                  />
                  <button className="small-btn primary" type="button" disabled={!deal} onClick={() => calculateInvoices(true)}>
                    <svg viewBox="0 0 24 24">
                      <path d="M5 4h14v16H5zM8 8h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2M16 16h1" />
                    </svg>
                    Calculate
                  </button>
                </div>
              </div>
              <div className="grid-wrap">
                {!deal ? (
                  <div className="empty">{loading ? 'Loading Deal ID from SAP…' : 'Select a Deal ID to view adjusted price / quantity.'}</div>
                ) : deal.invReason ? (
                  <div className="empty">{deal.invReason}</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th className="select-cell" />
                        {INV_COLS.map((c) =>
                          c.key === 'assign' ? (
                            <th key={c.key}>{c.label}</th>
                          ) : (
                            <th key={c.key} className={`sortable${invSort.key === c.key ? (invSort.dir === 1 ? ' sorted-asc' : ' sorted-desc') : ''}`} onClick={() => nextInvSort(c.key)}>
                              {c.label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {invMeta.rows.map((r) => {
                        const idx = deal.inv.indexOf(r)
                        const selected = idx === selectedInv
                        const canEdit = canEditInvRow(r)
                        return (
                          <tr
                            key={`${r.ttype}-${idx}`}
                            draggable
                            className={selected ? 'selected' : ''}
                            onClick={() => setSelectedInv(idx)}
                            onDragStart={(e) => {
                              setSelectedInv(idx)
                              e.dataTransfer.setData('text/plain', `inv:${idx}`)
                            }}
                          >
                            <td className="select-cell">
                              <input className="row-check" type="checkbox" checked={selected} onChange={() => setSelectedInv(idx)} onClick={(e) => e.stopPropagation()} />
                            </td>
                            <td>{r.ttype}</td>
                            <td>{r.invType}</td>
                            <td>{r.seller}</td>
                            <td>{r.buyer}</td>
                            <td>{r.bp}</td>
                            <td>{r.partnerBank || r.houseBank || '—'}</td>
                            <td>
                              <button
                                className="assign-btn"
                                type="button"
                                disabled={r.locked}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openBank(idx)
                                }}
                              >
                                Assign
                              </button>
                            </td>
                            <td className="editable-cell">
                              <DateCell value={r.invDate} disabled={!canEdit} onChange={(v) => setInvField(idx, 'invDate', v)} />
                            </td>
                            <td>{r.dueDate}</td>
                            <td>{r.commodity}</td>
                            <td>{r.gtComm}</td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit || amendMode} defaultValue={money(r.qty, 2)} onBlur={(e) => setInvField(idx, 'qty', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit} defaultValue={money(r.usdPrice, 9)} onBlur={(e) => setInvField(idx, 'usdPrice', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit || amendMode || r.curr === 'USD'} defaultValue={money(r.rate, 9)} onBlur={(e) => setInvField(idx, 'rate', e.target.value)} />
                            </td>
                            <td className="num">{money(r.price, 9)}</td>
                            <td className="num">{money(r.amt, 2)}</td>
                            <td className="num">{money(r.amtUsd, 2)}</td>
                            <td className="num">{money(r.planned, 2)}</td>
                            <td>{r.invNo || '—'}</td>
                            <td>
                              <span className={`status-text ${r.pc === 'C' ? 'status-ok' : r.pc === 'P' ? 'status-warn' : 'status-info'}`}>{r.pc || '—'}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="table-footer">
                <span>{invMeta.total ? `Showing ${invMeta.start + 1}–${Math.min(invMeta.start + PAGE_SIZE, invMeta.total)} of ${invMeta.total}` : 'Showing 0 of 0'}</span>
                <Pager page={invMeta.page} pages={invMeta.pages} onGo={setInvPage} />
              </div>
            </section>
          </div>
        </main>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'success' ? '' : t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>

      {dealLookupOpen ? (
        <DealLookupModal
          deals={dealList}
          reason={dealListReason}
          onClose={() => setDealLookupOpen(false)}
          onPick={(id) => {
            setDealLookupOpen(false)
            selectDeal(id)
          }}
        />
      ) : null}
      {txnRow ? <TxnModal row={txnRow} onClose={() => setTxnRow(null)} /> : null}
      {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
      {complianceOpen && deal ? <ComplianceModal resultingStatus={pendingInvoiceStatus} onClose={() => setComplianceOpen(false)} onProceed={() => void saveInvoice()} /> : null}
      {blOpen && deal ? <BlModal key={blVersion} rows={deal.bl} reason={deal.blReason} onClose={() => setBlOpen(false)} onDeassign={openDeassign} /> : null}
      {remarkBlIndex >= 0 ? <RemarkModal onClose={() => setRemarkBlIndex(-1)} onUpdate={saveRemark} /> : null}
      {diffOpen && deal ? <DiffModal rows={deal.diff} fxReason={deal.fxReason} onClose={() => setDiffOpen(false)} /> : null}
      {bankRow >= 0 && deal ? <BankModal row={deal.inv[bankRow]!} reason={BANK_WAITING} onClose={() => setBankRow(-1)} onUpdate={saveBank} /> : null}
    </div>
  )
}
