import { DataTable as UniversalTable } from '@tsfx/components/table/DataTable';
import { requestTask } from '@tsfx/ref/shared/request-task'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import './mo-generate-invoices-deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './mo-generate-invoices-deal-id.dark.css'
import './mo-generate-invoices-deal-id.overrides.css'
import { loadHouseBankAccounts, type HouseBankAccount } from '../../shared/fx/house-bank.ts'
import { loadPartnerBanks, type PartnerBank } from '../../shared/fx/partner-bank.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort } from '../../shared/fx/mw.ts'
import { ResultQueue, type ResultItem } from '../../shared/ui/ResultQueue.tsx'
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
import { middlewarePorts, loadFinalisationSellers } from './ports.ts'
import { DEAL_INVOICE_STATUS, canReverseInvoice, isFinalInvoiceStatus, type InvoiceFinalStatus } from './invoice-status.ts'
import { amendDealStatus, confirmInvoiceGeneration, pcMismatches, reconcileInvoicePc, reverseInvoiceConfirmation, type WorkflowResult } from './workflow.ts'
import { ComplianceModal } from './ComplianceModal.tsx'
import { ConfirmModal } from './ConfirmModal.tsx'
import { downloadPdfs, pdfFiles } from './invoice-pdf.ts'
import { loadLogo } from './branding.ts'
import { loadCompanies } from './companies.ts'
import { InvoiceGeneratedModal } from './InvoiceGeneratedModal.tsx'
import { WorkflowStatus } from './WorkflowStatus.tsx'
import type { StatusOption } from './invoice.ts'
import { confirmBlocker } from './confirm-guard.ts'
import { liveProposeData } from '@tsfx/pages/propose-tradeflows/live'
import { setStatusTexts } from './data.ts'
import { DateCell } from './DateCell.tsx'
import { DealLookupModal } from './DealLookupModal.tsx'
import { DealPicker } from './DealPicker.tsx'
import { AssignedBlsModal, InvoiceReviewModal, useDealBls } from './DealBls.tsx'
import { TrafficLightTag } from '@tsfx/components/ui/Badge'
import { formatAmount4, formatCompact } from '@tsfx/lib/fields/parse'
import { assignState, progressPct, STATE_TONE } from '@tsfx/pages/propose-tradeflows/view'
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
  { key: 'amt1', label: 'Amount 1', num: 4 },
  { key: 'bs2', label: 'Side 2' },
  { key: 'curr2', label: 'Crcy 2' },
  { key: 'amt2', label: 'Amount 2', num: 4 },
  { key: 'allIn', label: 'All in Rate', num: 4 },
  { key: 'strike', label: 'Strike', num: 4 },
  { key: 'ndfDate', label: 'NDF Fixing Date' },
  { key: 'ndfRef', label: 'NDF Ref' },
  { key: 'ndfRate', label: 'NDF Settlement Rate', num: 4 },
  { key: 'cashAmt', label: 'Cash Settlement Amount', num: 4 },
  { key: 'cashCurr', label: 'Cash Currency' },
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
  { key: 'invTrmRef', label: 'Inv TRM Ref No' },
  { key: 'pc', label: 'P/C' },
  { key: 'viewInv', label: 'View Invoices' },
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
  // The Deal ID whose invoices were just confirmed: the "Download PDF" offer at the top right is shown for it.
  const [pdfOffer, setPdfOffer] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  // The invoice review (BLs, amounts, confirm) that comes before the compliance check.
  const [review, setReview] = useState<{ message: string; status: InvoiceFinalStatus } | null>(null)
  const [blOpen, setBlOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  // The trade leg whose invoice documents are open in the preview.
  const [previewLeg, setPreviewLeg] = useState<string | null>(null)
  // The status master for this Deal ID's model, for the read-only workflow progress.
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([])
  const [bankRow, setBankRow] = useState(-1)
  // House bank accounts (HouseBankAccount) and each entity's company code (ZSGTSFTR_COMP) for the bank popup.
  const [houseBanks, setHouseBanks] = useState<HouseBankAccount[]>([])
  const [entityCompany, setEntityCompany] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    void Promise.all([loadHouseBankAccounts(), fxList('comp')])
      .then(([accounts, comp]) => {
        if (!live) return
        setHouseBanks(accounts)
        setEntityCompany(Object.fromEntries(comp.map((r) => [txt(r, 'ZCOM_ID'), txt(r, 'ZBUKRS')])))
      })
      .catch((error: unknown) => {
        console.warn('[invoice-finalisation] house bank accounts unavailable: the bank lists stay empty', error)
      })
    return () => {
      live = false
    }
  }, [])

  // Partner banks (SlcTsfBpBank, BUT0BK) of the business partner of the row whose bank popup is open.
  const [partnerBanks, setPartnerBanks] = useState<PartnerBank[]>([])
  const [partnerBankError, setPartnerBankError] = useState(false)
  const bankBp = bankRow >= 0 ? (deal?.inv[bankRow]?.bp ?? '') : ''
  useEffect(() => {
    return requestTask(() => {
    setPartnerBanks([])
    setPartnerBankError(false)
    if (!bankBp) return
    const ctl = new AbortController()
    loadPartnerBanks(bankBp, ctl.signal)
      .then(setPartnerBanks)
      .catch((error: unknown) => {
        if (ctl.signal.aborted) return
        console.warn('[invoice-finalisation] partner banks unavailable', error)
        setPartnerBankError(true)
      })
    return () => ctl.abort()
  
    })
  }, [bankBp])

  // Outcomes show as the standard ResultDialog queue (stay until OK).
  const [outcomes, setOutcomes] = useState<ResultItem[]>([])
  const resultSeq = useRef(0)
  const toast = (message: string, kind: Toast['kind'] = 'success') => {
    const tone = kind === 'error' ? 'error' : kind === 'warn' ? 'warning' : kind === 'success' ? 'success' : 'info'
    const title = tone === 'error' ? 'Error' : tone === 'warning' ? 'Warning' : tone === 'success' ? 'Success' : 'Information'
    const id = ++resultSeq.current
    setOutcomes((r) => [...r, { id, tone, title, message }])
  }
  // Pure chatter (refresh / recalculation hints) stays a small self-dismissing note, not a modal.
  const note = (message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind: 'info' }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
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
      setStatusOptions(loaded.statusOptions)
      setDeal(loaded.deal)
      setCtx(loaded.ctx)
      if (loaded.notice && !quiet) toast(loaded.notice, 'warn')
      return loaded.deal
    } catch (e) {
      if (isAbort(e) || seq !== loadSeq.current) return undefined
      setDeal(null)
      setCtx(null)
      toast(`Deal ID ${id} could not be read from SAP: ${messageOf(e)}`, 'error')
      return undefined
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
    setBlVersion((v) => v + 1)
    void fetchDeal(deal.dealId, true).then(() => note('Workbench refreshed from SAP.'))
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
  // The BLs and the deal figures, read as Propose Tradeflow reads them; again on Refresh and after a write.
  const [blVersion, setBlVersion] = useState(0)
  const dealBls = useDealBls(deal?.dealId ?? '', blVersion)
  const figures = dealBls.figures
  const assignedPct = figures ? progressPct(figures) : 0
  // A deal filled within its 1% can end a little over: shown as "Over by", never as a negative amount left.
  const over = Number(figures?.remainingUsd || 0) < 0
  // What is missing before a confirmation can start (no BLs, BLs without invoice rows, …): said in words, and the button waits.
  const blocker = deal ? confirmBlocker(deal, { loading: dealBls.loading, error: dealBls.error, count: dealBls.rows.length }) : { code: '' as const, message: '' }
  const statusOpens = !!deal && !deal.dm && (deal.status === DEAL_INVOICE_STATUS.INVOICE_REVERSED || finalisationPending)
  const canConfirmInvoice = statusOpens && !busy && !blocker.message
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
  const runWorkflow = async (run: () => Promise<WorkflowResult>, dealId: string, after?: () => void, quietOk = false) => {
    setBusy(true)
    try {
      const result = await run()
      // A confirmed invoice is announced by the "Invoice generated" dialog (with Download PDF); only a failure is a warning here.
      if (!(result.ok && quietOk)) toast(result.message, result.ok ? (result.steps.some((x) => x.status === 'skipped') ? 'warn' : 'success') : 'error')
      if (result.ok) after?.()
      setBlVersion((v) => v + 1)
      const fresh = await fetchDeal(dealId, true)
      // The status shown must be the one SAP now holds: say it, and refresh the Deal ID list that carries it too.
      if (result.ok && fresh && !quietOk) note(`Deal ID ${dealId} status: ${fresh.status} – ${statusText(fresh.status)}`)
      void loadDealList().then((r) => { if (r.ok) setDealList(r.value) }, () => undefined)
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
    if (showMessage) note('Trade Invoices recalculated.')
  }

  const initiateInvoiceConfirmation = () => {
    if (!deal || invoiceGridMissing()) return
    if (blocker.message) {
      toast(blocker.message, 'warn')
      return
    }
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
    setPendingInvoiceStatus(status)
    // The BLs first, then the amounts, then the confirmation (then the compliance check, as before).
    setReview({ message, status })
  }

  /** 9002 YES -> FORM save_data: number range, Z-table updates and the invoice e-mail. */
  const saveInvoice = async (status: InvoiceFinalStatus = pendingInvoiceStatus) => {
    if (!deal || !ctx) return
    setComplianceOpen(false)
    const sellers = await loadFinalisationSellers().catch(() => [])
    await runWorkflow(
      () => confirmInvoiceGeneration({ deal, dealRows: ctx.dealRows, diffRule: ctx.diffRule, status, sellers }, middlewarePorts),
      deal.dealId,
      () => {
        resetView()
        setPdfOffer(deal.dealId)
      },
      true,
    )
  }

  /** Creates the Commercial Invoice and the sales document of every confirmed leg and downloads them. */
  const downloadPdf = async () => {
    if (!deal) return
    let files: ReturnType<typeof pdfFiles>
    try {
      const [logo, companies] = await Promise.all([loadLogo(), loadCompanies()])
      files = pdfFiles(deal, logo, companies)
    } catch (e) {
      toast(`The PDFs could not be created: ${messageOf(e)}`, 'error')
      return
    }
    if (!files.length) {
      toast('No confirmed invoice with an invoice number was found for this Deal ID, so there is nothing to print.', 'warn')
      return
    }
    setPdfBusy(true)
    try {
      await downloadPdfs(files)
      note(`${files.length} PDF files were created for Deal ID ${deal.dealId}.`)
      setPdfOffer(null)
    } catch (e) {
      toast(`The PDFs could not be created: ${messageOf(e)}`, 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  const [syncing, setSyncing] = useState(false)
  /**
   * Builds the missing invoice rows (the middleware BL rows the invoice grid is made from) out of the BLs that really are
   * assigned to this Deal ID in SAP. Only on the user's click; rows that exist are never written again.
   */
  const createInvoiceRows = () => {
    if (!deal) return
    const id = deal.dealId
    setConfirmState({
      title: 'Create invoice rows',
      text: `Create the invoice rows of Deal ID ${id} from the ${dealBls.rows.length} BL(s) assigned to it in SAP?`,
      note: 'One invoice row is written per assigned BL; rows that already exist are skipped. Nothing is invoiced yet.',
      yesLabel: 'Create',
      onYes: () => {
        setConfirmState(null)
        const data = liveProposeData()
        if (!data.repairMiddleware) {
          toast('This version cannot create invoice rows.', 'error')
          return
        }
        setSyncing(true)
        data.repairMiddleware(id)
          .then(async (written) => {
            toast(written.length ? `${written.length} invoice row(s) created for Deal ID ${id}.` : `Deal ID ${id} already had all its invoice rows.`, 'success')
            setBlVersion((v) => v + 1)
            await fetchDeal(id, true)
          })
          .catch((e) => toast(`The invoice rows could not be created: ${messageOf(e)}`, 'error'))
          .finally(() => setSyncing(false))
      },
    })
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
    // Rates are kept to four decimals.
    const value = edit === 'rate' ? Number(n.toFixed(4)) : n
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === index ? recalcInvoiceRow({ ...r, [edit]: value }) : r)) }))
  }

  const openBank = (index: number) => setBankRow(index)
  /** UPD_HB only changes the grid row (gt_inv); it reaches SAP with the next save, as in the ABAP. */
  const saveBank = (houseBank: string, accountId: string, partnerBank: string) => {
    updateDeal((d) => ({ ...d, inv: d.inv.map((r, i) => (i === bankRow ? { ...r, houseBank, accountId, partnerBank } : r)) }))
    setBankRow(-1)
    toast('House Bank / Partner Bank updated in the grid.')
  }


  const nextFxSort = (key: keyof FxRow) => setFxSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const nextInvSort = (key: string) => setInvSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const canEditInvRow = (r: InvRow) => (!r.locked && Number(deal?.status) <= 4) || amendMode

  return (
    <div className="invblotter">
      <div className="app">
        <header className="topbar">
          <div className="top-left">
            <BackButton className="fx-back-btn" />
            
            <div className="title-wrap">
              <div className="app-title">Invoice Finalisation Blotter</div>
            </div>
          </div>
          <div className="top-right">
            <button className="hdr-btn primary" type="button" disabled={!canConfirmInvoice} title={canConfirmInvoice ? undefined : blocker.message || 'Available once the Deal ID is at status 04 with its BLs and invoice rows'} onClick={initiateInvoiceConfirmation}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Confirm Invoice</span>
            </button>
            <button className="hdr-btn" type="button" disabled={!deal || pdfBusy || !isFinalInvoiceStatus(deal.status) || !deal.inv.some((r) => r.invNo)} title="Available once the invoice is confirmed (status 05 / 07)" onClick={() => void downloadPdf()}>
              <svg viewBox="0 0 24 24">
                <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
              </svg>
              <span>Download PDF</span>
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
          <section className="card inv-hero" aria-label="Deal ID">
            <div className="inv-hero__pick">
              <label htmlFor="invDealId">Deal ID</label>
              <DealPicker deals={dealList} value={dealLookupInput} onChange={setDealLookupInput} onPick={selectDeal} onEnter={loadTypedDeal} />
              <button className="button secondary small" type="button" onClick={() => setDealLookupOpen(true)}>
                View Deals
              </button>
              <span className="inv-hero__meta" title={dealListReason || undefined}>{dealListReason ? 'Deal IDs unavailable' : loading ? 'Loading from SAP…' : ''}</span>
            </div>
            {deal ? (
              <div className="inv-hero__body">
                <div className="inv-hero__id">
                  <h2>
                    <span className="mono">{deal.dealId}</span>
                    {figures ? <TrafficLightTag tone={STATE_TONE[assignState(figures)]}>{assignState(figures)}</TrafficLightTag> : null}
                    <WorkflowStatus status={deal.status} label={statusText(deal.status)} options={statusOptions} />
                  </h2>
                  <p title={`${deal.mcDesc} · ${deal.entityString}`}>{[figures?.tsfCommodityText, deal.mcDesc, deal.entityString].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <dl className="inv-hero__figs">
                  <div>
                    <dt>Deal amount</dt>
                    <dd>{figures?.usd ? formatCompact(figures.usd) : '—'} <small>USD</small></dd>
                    <span>{figures?.usd ? formatAmount4(figures.usd) : ''}</span>
                  </div>
                  <div>
                    <dt>Assigned · {dealBls.rows.length} BLs</dt>
                    <dd>{figures ? formatCompact(figures.assignedUsd) : formatCompact(dealBls.usd)} <small>USD</small></dd>
                    <span>{formatAmount4(figures ? figures.assignedUsd : dealBls.usd.toFixed(2))}</span>
                  </div>
                  <div className="key">
                    <dt>{over ? 'Over by' : 'Unassigned'}</dt>
                    <dd>{figures?.remainingUsd ? formatCompact(Math.abs(Number(figures.remainingUsd))) : '—'} <small>USD</small></dd>
                    <span>{figures?.remainingUsd ? formatAmount4(Math.abs(Number(figures.remainingUsd)).toFixed(2)) : dealBls.loading ? 'Reading…' : ''}</span>
                  </div>
                </dl>
                <div className="inv-hero__bar">
                  <div className="inv-hero__progress" role="progressbar" aria-valuenow={assignedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Assigned share of the deal"><span style={{ width: `${assignedPct}%` }} /></div>
                  <span>{assignedPct}% assigned · tolerance {deal.tolerance === null ? '—' : `${money(deal.tolerance, 2)}%`}</span>
                </div>
              </div>
            ) : (
              <p className="inv-hero__empty">Choose a Deal ID to see its BLs and generate its invoice.</p>
            )}
          </section>

          {deal ? (
            <section className="card inv-details" aria-label="Deal details">
              <dl>
                {([
                  ['Reference', deal.dealRef],
                  ['Deal dates', deal.dealStart || deal.dealEnd ? `${deal.dealStart || '—'} → ${deal.dealEnd || '—'}` : ''],
                  ['Shipment', deal.shipStart || deal.shipEnd ? `${deal.shipStart || '—'} → ${deal.shipEnd || '—'}` : ''],
                  ['Master contract', [deal.mcRef, deal.mcDate].filter(Boolean).join(' · ')],
                  ['Entity', deal.entityString],
                  ['Currency', deal.currencyString],
                  ['Trader', deal.traderDesc || deal.trader],
                  ['FX model', [deal.modelId, deal.modelDesc].filter(Boolean).join(' · ')],
                  ['Inv model', deal.fxInvModel],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd title={v || undefined}>{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {deal && statusOpens && blocker.message ? (
            <div className="inv-prereq" role="status">
              <span>{blocker.message}</span>
              {blocker.code === 'no-rows' && !blocker.blocked ? <button className="button small" type="button" disabled={syncing || busy} onClick={createInvoiceRows}>{syncing ? 'Creating…' : 'Create invoice rows'}</button> : null}
            </div>
          ) : null}

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
                  <UniversalTable>
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
                                  {val === undefined || val === '' ? '' : c.num != null ? money(val as number, c.num) : String(val)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </UniversalTable>
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
                  Trade Invoices <span className="count">{invMeta.total} records</span>
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
                  <div className="empty">{loading ? 'Loading Deal ID from SAP…' : 'Select a Deal ID to view its trade invoices.'}</div>
                ) : deal.invReason ? (
                  <div className="empty">{deal.invReason}</div>
                ) : (
                  <UniversalTable>
                    <thead>
                      <tr>
                        <th className="select-cell" />
                        {INV_COLS.map((c) =>
                          c.key === 'assign' || c.key === 'viewInv' ? (
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
                              <input className="cell-input" disabled={!canEdit || amendMode} defaultValue={money(r.qty, 4)} onBlur={(e) => setInvField(idx, 'qty', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit} defaultValue={money(r.usdPrice, 4)} onBlur={(e) => setInvField(idx, 'usdPrice', e.target.value)} />
                            </td>
                            <td className="editable-cell">
                              <input className="cell-input" disabled={!canEdit || amendMode || r.curr === 'USD'} defaultValue={money(r.rate, 4)} onBlur={(e) => {
                                const v = parseNum(e.target.value)
                                setInvField(idx, 'rate', e.target.value)
                                if (!Number.isNaN(v) && v >= 0) e.target.value = money(v, 4)
                              }} />
                            </td>
                            <td className="num">{money(r.price, 4)}</td>
                            <td className="num">{money(r.amt, 4)}</td>
                            <td className="num">{money(r.amtUsd, 4)}</td>
                            <td className="num">{money(r.planned, 4)}</td>
                            <td>{r.invNo || '—'}</td>
                            <td>{r.invTrmRef || '—'}</td>
                            <td>
                              <span className={`status-text ${r.pc === 'C' ? 'status-ok' : r.pc === 'P' ? 'status-warn' : 'status-info'}`}>{r.pc || '—'}</span>
                            </td>
                            <td>
                              {r.invNo && isFinalInvoiceStatus(deal.status) ? (
                                <button className="assign-btn" type="button" onClick={(e) => { e.stopPropagation(); setPreviewLeg(r.ttype) }}>View Invoices</button>
                              ) : (
                                <span className="status-text status-info" title="The invoice of this leg is generated when the invoice is confirmed">Not Generated</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </UniversalTable>
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

      {busy ? <div className="inv-busy" role="status" aria-live="polite"><span className="inv-busy__dot" aria-hidden="true" />Working in SAP… please wait, do not click again.</div> : null}

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'success' ? '' : t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>

      {pdfOffer && deal && deal.dealId === pdfOffer && isFinalInvoiceStatus(deal.status) && deal.inv.some((r) => r.invNo) ? (
        <InvoiceGeneratedModal deal={deal} onClose={() => setPdfOffer(null)} />
      ) : null}

      <ResultQueue items={outcomes} onDismiss={(id) => setOutcomes((r) => r.filter((x) => x.id !== id))} />

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
      {review && deal ? (
        <InvoiceReviewModal dealId={deal.dealId} bls={dealBls} legs={deal.inv.filter((r) => !r.locked)} dealUsd={getDealUsdAmount(deal)} invoiceUsd={getInvoiceUsdAmount(deal)} tolerancePct={deal.tolerance ?? 0}
          message={review.message} partial={review.status === DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED} busy={busy}
          onClose={() => setReview(null)} onConfirm={() => { setReview(null); setComplianceOpen(true) }} />
      ) : null}
      {complianceOpen && deal ? <ComplianceModal resultingStatus={pendingInvoiceStatus} onClose={() => setComplianceOpen(false)} onProceed={() => void saveInvoice()} /> : null}
      {/* View BLs: the BLs assigned to the Deal ID in Propose Tradeflow (no de-assign: an assignment is final). */}
      {blOpen && deal ? <AssignedBlsModal dealId={deal.dealId} bls={dealBls} dealUsd={getDealUsdAmount(deal)} tolerancePct={deal.tolerance ?? 0} onClose={() => setBlOpen(false)} /> : null}
      {previewLeg && deal ? <InvoiceGeneratedModal deal={deal} leg={previewLeg} onClose={() => setPreviewLeg(null)} /> : null}
      {diffOpen && deal ? <DiffModal rows={deal.diff} fxReason={deal.fxReason} onClose={() => setDiffOpen(false)} /> : null}
      {bankRow >= 0 && deal ? (
        <BankModal
          row={deal.inv[bankRow]!}
          reason={partnerBankError ? BANK_WAITING : ''}
          partnerBanks={partnerBanks}
          houseBanks={houseBanks}
          company={entityCompany[deal.inv[bankRow]!.seller] ?? ''}
          onClose={() => setBankRow(-1)}
          onUpdate={saveBank}
        />
      ) : null}
    </div>
  )
}
