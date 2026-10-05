/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. Every rule returns a new deal; none mutates its input.
 * Document numbers come from an injected `nextDoc` so tests can make them deterministic.
 */
import { fmtAmt, fmtMoney } from './format.ts'
import type {
  Deal,
  DetailCell,
  DragKind,
  DropDecision,
  FxLeg,
  InvLeg,
  Outcome,
  StatusInfo,
  ToastMessage,
  ToolbarState,
} from './types.ts'

/** Hands out the next accounting document number. */
export type NextDoc = () => string

/** A `NextDoc` that counts up from `start`, as the legacy demo did. */
export function docCounter(start: number): NextDoc {
  let n = start
  return () => String(n++)
}

const info = (message: string): ToastMessage => ({ message, kind: '' })
const err = (message: string): ToastMessage => ({ message, kind: 'error' })
const ok = (message: string): ToastMessage => ({ message, kind: 'success' })

// ---------------------------------------------------------------- status

export function statusInfo(code: number): StatusInfo {
  if (code >= 22) return { cls: 'st-complete', label: '22 · Accounting Complete' }
  if (code >= 20) return { cls: 'st-initiated', label: '20 · Settlement Initiated' }
  return { cls: 'st-confirmed', label: '10 · Confirmed by MO' }
}

export const isInitiated = (deal: Deal) => deal.status >= 20
export const isComplete = (deal: Deal) => deal.status >= 22

// ---------------------------------------------------------------- loading

export const normalizeDealId = (raw: string) => raw.trim().toUpperCase()

export type LoadResult = { ok: true; deal: Deal } | { ok: false; message: string }

/** Looks a Deal ID up and returns a private copy, so working on it never touches the library. */
export function loadDeal(library: Readonly<Record<string, Deal>>, raw: string): LoadResult {
  const key = normalizeDealId(raw)
  if (!key) return { ok: false, message: 'Enter a Deal ID to continue.' }
  const src = Object.hasOwn(library, key) ? library[key] : undefined
  if (!src) return { ok: false, message: `No Deal ID found for '${key}'. Try TSF-9081.` }
  return { ok: true, deal: structuredClone(src) }
}

// ---------------------------------------------------------------- posted-ness

export const isFxPosted = (r: FxLeg) => !!(r.doc1 && r.doc2)
export const isInvPosted = (r: InvLeg) => !!r.fiDoc
export const allFxPosted = (deal: Deal) => deal.top.every(isFxPosted)
export const allInvPosted = (deal: Deal) => deal.inv.every(isInvPosted)
export const anyFxUnposted = (deal: Deal) => deal.top.some((r) => !isFxPosted(r))
export const anyInvUnposted = (deal: Deal) => deal.inv.some((r) => !isInvPosted(r))

/** Which of the toolbar's buttons are off, and whether Initiate Settlement is offered. */
export function toolbarState(deal: Deal): ToolbarState {
  const canPost = isInitiated(deal)
  const complete = isComplete(deal)
  return {
    postFxDisabled: !canPost || !anyFxUnposted(deal) || complete,
    postInvDisabled: !canPost || !anyInvUnposted(deal) || complete,
    accountingDisabled: !canPost || complete,
    showInitiate: !canPost,
  }
}

/** A row can be picked up only while it is unposted and settlement is open (20, not yet 22). */
export function isRowDraggable(deal: Deal, posted: boolean): boolean {
  return !posted && deal.status >= 20 && deal.status < 22
}

// ---------------------------------------------------------------- header

export function detailCells(deal: Deal): DetailCell[] {
  return [
    { label: 'Deal ID', value: deal.dealId, cls: 'accent mono' },
    { label: 'Deal Reference', value: deal.dealRef, cls: '' },
    { label: 'Deal Start Date', value: deal.dealStartDate, cls: '' },
    { label: 'Deal End Date', value: deal.dealEndDate, cls: '' },
    { label: 'MC Ref No', value: deal.mcRefNo, cls: 'accent mono' },
    { label: 'MC Description', value: deal.mcDesc, cls: '' },
    { label: 'MC Date', value: deal.mcDate, cls: '' },
    { label: 'Ship End Date', value: deal.shipEndDate, cls: '' },
    { label: 'FX Model ID', value: deal.fxModelId, cls: 'accent' },
    { label: 'Model Description', value: deal.modelDesc, cls: '' },
    { label: 'Entity String', value: deal.entityString, cls: 'mono' },
    { label: 'Currency String', value: deal.currencyString, cls: 'mono' },
    { label: 'FX Inv Model', value: deal.fxInvModel, cls: '' },
    { label: 'Trader', value: `${deal.traderCode} · ${deal.traderDesc}`, cls: '' },
  ]
}

// ---------------------------------------------------------------- toolbar actions

const replaceTop = (deal: Deal, top: FxLeg[]): Deal => ({ ...deal, top })
const replaceInv = (deal: Deal, inv: InvLeg[]): Deal => ({ ...deal, inv })
const postFxLegDocs = (r: FxLeg, nextDoc: NextDoc): FxLeg => ({
  ...r,
  doc1: nextDoc(),
  doc2: nextDoc(),
  status: 'Posted',
})

export function initiateSettlement(deal: Deal): Outcome {
  if (deal.status >= 20) {
    return { deal, toast: err('Settlement has already been initiated for this Deal ID.') }
  }
  return {
    deal: { ...deal, status: 20 },
    toast: ok(
      `Settlement initiated for Deal ID ${deal.dealId}. FX deal and trade invoice legs are now ready for posting.`,
    ),
  }
}

/** Posts every unposted FX leg (two documents each). */
export function postFxDeal(deal: Deal, nextDoc: NextDoc): Outcome {
  if (deal.status < 20) return { deal, toast: err('Please initiate settlement before posting the FX deal.') }
  let posted = 0
  const top = deal.top.map((r) => {
    if (isFxPosted(r)) return r
    posted++
    return postFxLegDocs(r, nextDoc)
  })
  if (!posted) return { deal, toast: info('All FX deal legs are already posted.') }
  return { deal: replaceTop(deal, top), toast: ok(`${posted} FX deal leg(s) posted to accounting.`) }
}

export type GuardResult = { allowed: true } | { allowed: false; toast: ToastMessage }

/** Post Trade Invoice opens the Posting All popup only once initiated and every FX leg is posted. */
export function canPostTradeInvoice(deal: Deal): GuardResult {
  if (deal.status < 20) {
    return { allowed: false, toast: err('Please initiate settlement before posting trade invoices.') }
  }
  if (!allFxPosted(deal)) {
    return {
      allowed: false,
      toast: err('Post the FX deal accounting entries first — trade invoices settle against them.'),
    }
  }
  return { allowed: true }
}

export function accountingCompleted(deal: Deal): Outcome {
  if (deal.status < 20) return { deal, toast: err('Settlement has not been initiated yet.') }
  if (!allFxPosted(deal) || !allInvPosted(deal)) {
    return {
      deal,
      toast: err('All FX deal and trade invoice documents must be posted before accounting can be marked complete.'),
    }
  }
  return {
    deal: { ...deal, status: 22 },
    toast: ok(`Deal ID ${deal.dealId} marked Accounting Complete.`),
  }
}

// ---------------------------------------------------------------- FX leg popup

export type TxnAction = 'TEST' | 'UPD' | 'TBB1'
export type ActionOutcome = Outcome & { close: boolean }

export function txnAction(deal: Deal, idx: number, action: TxnAction, nextDoc: NextDoc): ActionOutcome {
  const r = deal.top[idx]
  if (!r) return { deal, toast: err('Transaction not found.'), close: false }
  if (action === 'TEST') {
    return { deal, toast: info(`Test run completed for transaction ${r.rfha}. No documents were posted.`), close: false }
  }
  if (action === 'UPD') {
    return { deal, toast: ok(`Bank and transfer details updated for transaction ${r.rfha}.`), close: false }
  }
  if (isFxPosted(r)) return { deal, toast: err('This transaction is already posted.'), close: false }
  const top = deal.top.map((x, i) => (i === idx ? postFxLegDocs(x, nextDoc) : x))
  return { deal: replaceTop(deal, top), toast: ok(`Accounting entry posted for transaction ${r.rfha}.`), close: true }
}

// ---------------------------------------------------------------- invoice leg popup

export type PostingAction = 'UPD_DATA' | 'SET_EXE' | 'SET_POST'

/** `close` is true only for a successful post; "Settlement Complete" keeps the popup open on the refreshed leg. */
export function postingAction(deal: Deal, idx: number, action: PostingAction, nextDoc: NextDoc): ActionOutcome {
  const r = deal.inv[idx]
  if (!r) return { deal, toast: err('Invoice leg not found.'), close: false }
  if (action === 'UPD_DATA') {
    return { deal, toast: ok(`Bank settlement data updated for ${r.tradeType}.`), close: false }
  }
  if (action === 'SET_EXE') {
    const inv = deal.inv.map((x, i) => (i === idx ? { ...x, setCheck: true } : x))
    return { deal: replaceInv(deal, inv), toast: ok(`Settlement marked complete for ${r.tradeType}.`), close: false }
  }
  if (isInvPosted(r)) return { deal, toast: err('This invoice leg is already posted.'), close: false }
  const inv = deal.inv.map((x, i) => (i === idx ? { ...x, fiDoc: nextDoc() } : x))
  return {
    deal: replaceInv(deal, inv),
    toast: ok(`Trade invoice posted successfully for ${r.tradeType}.`),
    close: true,
  }
}

// ---------------------------------------------------------------- Posting All popup

/** Legs the Posting All popup will raise a document for: checked for FI posting and not yet posted. */
export const pendingPostAll = (deal: Deal): InvLeg[] => deal.inv.filter((r) => r.postCheck && !r.fiDoc)

export function postAllConfirm(deal: Deal, nextDoc: NextDoc): Outcome {
  let posted = 0
  const inv = deal.inv.map((r) => {
    if (r.postCheck && !r.fiDoc) {
      posted++
      return { ...r, fiDoc: nextDoc() }
    }
    return r
  })
  return { deal: replaceInv(deal, inv), toast: ok(`${posted} trade invoice document(s) posted successfully.`) }
}

export const noPendingPostAllToast = (): ToastMessage => info('All trade invoice legs are already posted.')

// ---------------------------------------------------------------- drag and drop

/** A row dropped on an action button runs that action only if the row belongs to it. */
export function resolveDrop(target: DragKind, dragged: DragKind | null): DropDecision {
  if (dragged === null) return { run: 'none' }
  if (target === 'fx' && dragged !== 'fx') return { run: 'error', message: 'This action requires an FX deal row.' }
  if (target === 'inv' && dragged !== 'inv') {
    return { run: 'error', message: 'This action requires a trade invoice row.' }
  }
  return { run: target }
}

// ---------------------------------------------------------------- posting popup content

export type AccountingLine = { dc: 'Debit' | 'Credit'; account: string; amount: string }

/** The two-line FX clearing entry for the sell currency of a transaction. */
export function sellEntry(r: FxLeg): AccountingLine[] {
  return [
    { dc: 'Debit', account: `FX Clearing · ${r.sellCurr}`, amount: fmtAmt(r.sellAmt) },
    { dc: 'Credit', account: `Bank · ${r.sellCurr}`, amount: fmtAmt(r.sellAmt) },
  ]
}

export function buyEntry(r: FxLeg): AccountingLine[] {
  return [
    { dc: 'Debit', account: `Bank · ${r.buyCurr}`, amount: fmtAmt(r.buyAmt) },
    { dc: 'Credit', account: `FX Clearing · ${r.buyCurr}`, amount: fmtAmt(r.buyAmt) },
  ]
}

/** Receivable / revenue entry for one invoice leg, amounts prefixed with the invoice currency. */
export function invoiceEntry(r: InvLeg): AccountingLine[] {
  const amount = fmtMoney(r.invCurr, r.invAmt)
  return [
    { dc: 'Debit', account: `${r.buy} · Trade Receivable`, amount },
    { dc: 'Credit', account: `${r.sell} · Trade Revenue`, amount },
  ]
}
