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

/** The badge: its colour by the thresholds, its text from ZSGTSFTR_DEAL_ST ("<code> · <text>"). */
export function statusInfo(code: number, statusCode: string, text: string): StatusInfo {
  const label = text ? `${statusCode} · ${text}` : statusCode
  if (code >= 22) return { cls: 'st-complete', label }
  if (code >= 20) return { cls: 'st-initiated', label }
  return { cls: 'st-confirmed', label }
}

export const isInitiated = (deal: Deal) => deal.status >= 20
export const isComplete = (deal: Deal) => deal.status >= 22

// ---------------------------------------------------------------- posted-ness

/** Posted by TBB1 (TXN_STATUS 50, so status 'Posted'), or holding both of its documents. */
export const isFxPosted = (r: FxLeg) => r.status === 'Posted' || !!(r.doc1 && r.doc2)
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

/** POST_TI / POST_FX / ACC on a Deal ID below 20 (I034). */
export const NOT_INITIATED = 'Please initiate settlement before posting (status 20 - Settlement Initiated; I034).'

/** POST_TI and EXE_C count the execution-complete trade legs against a fixed 6 (post_trd_invoice, gv_lines = 6). */
export const TRADE_LEGS = 6

/**
 * Post Trade Invoice (POST_TI -> post_trd_invoice): status 20 or later, and exactly six trade legs with Settlement
 * Complete (Execution, ZEXE_CO) set on MO, else I054. There is no FX-posted precondition in the program.
 */
export function canPostTradeInvoice(deal: Deal): GuardResult {
  if (deal.status < 20) return { allowed: false, toast: err(NOT_INITIATED) }
  const done = deal.inv.filter((r) => r.exeCo).length
  if (done !== TRADE_LEGS) {
    const open = deal.inv.filter((r) => !r.exeCo).map((r) => `${r.seq} ${r.tradeType}`)
    return {
      allowed: false,
      toast: err(`${done} of ${TRADE_LEGS} trade legs are settled on MO: Execute Settlement for Deal ID (I054). Not settled yet: ${open.join(', ') || '-'}.`),
    }
  }
  return { allowed: true }
}

/**
 * Accounting Completed (ACC) as the program checks it, with no status condition: a no-invoice model needs Doc No 1
 * on every FX leg its model maps (I067); an invoice model needs an FI document on every FI-posting leg (I066), then
 * Doc No 1 on the FX legs of each leg's D-map and DSS deal (I067). Then ZDEAL_STAT 22.
 */
export function accountingRefusal(deal: Deal): string {
  const noDoc1 = (types: readonly string[]) =>
    deal.top.filter((f) => types.includes(f.dealType) && !f.doc1).map((f) => `${f.dealType} ${f.rfha}`)
  if (deal.noInvoice) {
    const open = deal.top.filter((f) => f.seq !== undefined && f.seq !== '' && !f.doc1).map((f) => `${f.dealType} ${f.rfha}`)
    return open.length ? `These FX deals have no FI document (Doc No 1) yet: ${open.join(', ')} (I067).` : ''
  }
  const unposted = deal.inv.filter((r) => r.postCheck && !r.fiDoc).map((r) => r.tradeType)
  if (unposted.length) return `These trade invoice legs are not posted yet: ${unposted.join(', ')} (I066).`
  const mapped = deal.inv.flatMap((r) => (r.dMap ? [r.dMap, r.dssDealType ?? ''] : [])).filter(Boolean)
  const open = [...new Set(noDoc1(mapped))]
  return open.length ? `These FX deals have no FI document (Doc No 1) yet: ${open.join(', ')} (I067).` : ''
}

export function accountingCompleted(deal: Deal): Outcome {
  const refusal = accountingRefusal(deal)
  if (refusal) return { deal, toast: err(refusal) }
  return { deal: { ...deal, status: 22 }, toast: ok(`Deal ID ${deal.dealId} marked Accounting Complete.`) }
}

// ---------------------------------------------------------------- FX leg popup (9003)

export type TxnAction = 'TEST' | 'UPD' | 'TBB1'
export type ActionOutcome = Outcome & { close: boolean }

/** The DSS deal posted together with a leg (ZSGTSFTR_SET_FX ZDSS_DEAL). */
const dssOf = (deal: Deal, r: FxLeg): FxLeg | undefined => (r.dssDeal ? deal.top.find((x) => x.dealType === r.dssDeal) : undefined)

/**
 * TEST / TBB1: status 21 or later (I071), and the transaction and its DSS deal at TXN_STATUS '07' or later (I072).
 * TBB1 then posts (RFTBBB00) and moves TXN_STATUS to 50; TEST is RFTBBB00's test run.
 */
export function txnAction(deal: Deal, idx: number, action: TxnAction, nextDoc: NextDoc): ActionOutcome {
  const r = deal.top[idx]
  if (!r) return { deal, toast: err('Transaction not found.'), close: false }
  if (action === 'UPD') {
    return { deal, toast: ok(`Bank and transfer details updated for transaction ${r.rfha}.`), close: false }
  }
  if (deal.status < 21) {
    return { deal, toast: err('Execution is not complete yet: status 21 - Settlement Completed - Execution is needed (I071).'), close: false }
  }
  const early = [r, dssOf(deal, r)].filter((x): x is FxLeg => !!x && (x.txnStatus ?? '') < '07')
  if (early.length) {
    return { deal, toast: err(`Transaction ${early.map((x) => x.rfha).join(', ')} is not at status 07 yet (I072).`), close: false }
  }
  if (action === 'TEST') {
    return { deal, toast: info(`Test run completed for transaction ${r.rfha}. No documents were posted.`), close: false }
  }
  if (isFxPosted(r)) return { deal, toast: err('This transaction is already posted.'), close: false }
  const top = deal.top.map((x, i) => (i === idx ? postFxLegDocs(x, nextDoc) : x))
  return { deal: replaceTop(deal, top), toast: ok(`Accounting entry posted for transaction ${r.rfha}.`), close: true }
}

// ---------------------------------------------------------------- invoice leg popup (9002)

export type PostingAction = 'UPD_DATA' | 'SET_EXE' | 'SET_POST'

/** SET_EXE is in this program's status 333 but has no handler: settling is MO's (ZSGTSFR060). */
export const NO_SETTLEMENT_HERE =
  'Settlement Complete is done on MO: Execute Settlement for Deal ID (ZSGTSFR060); in this program the button has no function.'

/**
 * UPD_DATA and SET_POST: status 21 or later (I070). SET_POST is offered only on an FI-posting leg (ZPOST_CHECK) and
 * posts a leg without a document. `close` is true only for a successful post.
 */
export function postingAction(deal: Deal, idx: number, action: PostingAction, nextDoc: NextDoc): ActionOutcome {
  const r = deal.inv[idx]
  if (!r) return { deal, toast: err('Invoice leg not found.'), close: false }
  if (action === 'SET_EXE') return { deal, toast: info(NO_SETTLEMENT_HERE), close: false }
  if (deal.status < 21) {
    return { deal, toast: err('Execution is not complete yet: status 21 - Settlement Completed - Execution is needed (I070).'), close: false }
  }
  if (action === 'UPD_DATA') {
    return { deal, toast: ok(`Bank settlement data updated for ${r.tradeType}.`), close: false }
  }
  if (!r.postCheck) return { deal, toast: err('FI Posting is not set for this leg, so it is not posted to accounting.'), close: false }
  if (isInvPosted(r)) return { deal, toast: err('This invoice leg is already posted.'), close: false }
  const inv = deal.inv.map((x, i) => (i === idx ? { ...x, fiDoc: nextDoc() } : x))
  return {
    deal: replaceInv(deal, inv),
    toast: ok(`Trade invoice posted successfully for ${r.tradeType}.`),
    close: true,
  }
}

// ---------------------------------------------------------------- Posting All popup (9004)

/** P_ALL's loop: the legs flagged for FI posting (ZPOST_CHECK) that have no FI document yet. */
export const pendingPostAll = (deal: Deal): InvLeg[] => deal.inv.filter((r) => r.postCheck && !r.fiDoc)

// ---------------------------------------------------------------- posting eligibility

/**
 * Which legs a Post button takes. `blocking` are the legs that stop the whole button (not settled on MO), as the
 * program refuses the run (I054) rather than skipping them.
 */
export type PostingPlan = { eligible: string[]; blocking: string[] }

/**
 * Post FX Deal (POST_FX -> post_all_tbb1): every FX leg in the model's sequence (with its DSS deal). Any of them
 * without Settlement Complete (Execution) stops the run (I054). The program does not skip posted ones: TBB1 does.
 */
export function fxPostingPlan(deal: Deal): PostingPlan {
  const name = (r: FxLeg) => `${r.dealType} ${r.rfha}`
  const sequenced = deal.top.filter((r) => r.seq)
  return { eligible: sequenced.map(name), blocking: sequenced.filter((r) => !r.settled).map(name) }
}

/** Post Trade Invoice: the P_ALL legs, once all six trade legs are settled (I054). */
export function invPostingPlan(deal: Deal): PostingPlan {
  const guard = canPostTradeInvoice(deal)
  return {
    eligible: pendingPostAll(deal).map((r) => r.tradeType),
    blocking: guard.allowed ? [] : deal.inv.filter((r) => !r.exeCo).map((r) => r.tradeType),
  }
}

/**
 * What a Post button says. Nothing is ever reported as posted here: with legs to post, the posting itself has no
 * API yet, so the message names them and says it is waiting.
 */
export function postingPlanToast(what: string, plan: PostingPlan, waiting: string): ToastMessage {
  if (plan.blocking.length) {
    return err(
      `No ${what} can be posted: these legs are not settled on MO: Execute Settlement for Deal ID yet (I054): ${plan.blocking.join(', ')}.`,
    )
  }
  if (!plan.eligible.length) return info(`All ${what} legs are already posted.`)
  return err(`${waiting} To be posted: ${plan.eligible.join(', ')}.`)
}

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
