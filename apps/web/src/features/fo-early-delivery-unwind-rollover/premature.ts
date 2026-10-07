/*
 * Early Delivery, Unwinding and Rollover of ZSGTSFP_PRE_MATURE (FORM create_txn, create_unwind, create_roll_txn),
 * orchestrated over services instead of BAPI_FTR_FXT_CREATE / BAPI_FTR_FXT_CHANGE + ZSGTRMFM_VTBFHA_EXPORT.
 *
 *   Treasury transactions     the standard FX service (FxTransaction POST)        createFx
 *   TXN_STATUS, Deal Type, Premature / Unwind flag, remark, blotter date, linkage
 *                             ZSGTSFTR_APP_STR (TrmFxApp)                          saveNewAppStr / updateOriginalAppStr
 *   Deal ID leg slot          ZSGTSFTR_DEALID ZBUKRS1/ZRFHA1 or ZBUKRS2/ZRFHA2     readDealRows / writeDealSlot
 *
 * Every dependency is injected (see deps.ts for the real ones), so the sequence, the status rules and the
 * partial-failure handling are tested without a backend.
 *
 * The three flows are NOT one generic "premature" update. Sequence:
 *
 *   Early Delivery / Rollover   cancellation txn -> its APP_STR -> replacement txn -> its APP_STR
 *                               -> Deal ID slot -> original APP_STR (49 / 61)
 *   Unwinding                   unwind txn -> its APP_STR -> original Unwind flag -> original APP_STR (61)
 *
 * These calls are not one SAP LUW. Each step that succeeded is recorded in `Progress`; handing that Progress
 * back to `runPremature` resumes at the failed stage and never creates a Treasury transaction twice.
 */
import { VALUATION_CLASS } from '../fx-blotter/api.ts'
import type { AppStrFields } from '../fx-blotter/appStr.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { MSG } from './logic.ts'
import { amountOf, fillMissingAmounts, followOfPair } from './calc.ts'
import {
  FORWARD_TXN_TYPE,
  cancellationAppFields,
  cancellationInitialStatus,
  dealSlotOf,
  foRemarkFields,
  originalUpdateFields,
  replacementAppFields,
  slotHolds,
  REPLACEMENT_INITIAL_STATUS,
  type DealSlot,
  type PrematureKind,
} from './rules.ts'
import type { BookingForm, UnwindForm } from './types.ts'

/** BUKRS + RFHA: a transaction is never identified by the number alone. */
export type TxnRef = { companyCode: string; transaction: string }

/** The original as SAP serves it: the FxTransaction and its application data. */
export type OriginalTxn = { fx: FxTransaction & Record<string, unknown>; app: TrmFxApp }

export type Stage =
  | 'preflight'
  | 'createCancellation'
  | 'cancellationAppStr'
  | 'createReplacement'
  | 'replacementAppStr'
  | 'dealSlot'
  | 'originalUnwindFlag'
  | 'originalUpdate'

export const STAGE_LABEL: Record<Stage, string> = {
  preflight: 'Checks before creating',
  createCancellation: 'Create the cancellation transaction',
  cancellationAppStr: 'Save the cancellation’s application data',
  createReplacement: 'Create the new booking transaction',
  replacementAppStr: 'Save the new booking’s application data',
  dealSlot: 'Replace the Deal ID transaction slot',
  originalUnwindFlag: 'Mark the original as unwound',
  originalUpdate: 'Update the original transaction',
}

/** What has already happened. Pass it back to `runPremature` to continue after a failure. */
export type Progress = {
  cancellationTransaction?: TxnRef
  cancellationAppSaved: boolean
  replacementTransaction?: TxnRef
  replacementAppSaved: boolean
  dealSlotUpdated: boolean
  unwindFlagSet: boolean
  originalUpdated: boolean
}

export const freshProgress = (): Progress => ({
  cancellationAppSaved: false,
  replacementAppSaved: false,
  dealSlotUpdated: false,
  unwindFlagSet: false,
  originalUpdated: false,
})

export type PrematureResult = {
  ok: boolean
  kind: PrematureKind
  original: TxnRef
  progress: Progress
  failedStage?: Stage
  error?: string
  /** Things the user should know that are not failures (a fallback status, a remark with nowhere to go). */
  notes: string[]
}

export type PairInput = { kind: 'early' | 'rollover'; original: TxnRef; dealId: string; remark: string; newTxn: BookingForm; cancel: BookingForm }
export type UnwindInput = { kind: 'unwind'; original: TxnRef; dealId: string; remark: string; form: UnwindForm }
export type PrematureInput = PairInput | UnwindInput

/** The standard FX create body; also what the service documents as a POST of FxTransaction. */
export type FxCreateBody = Record<string, unknown>

export type PrematureDeps = {
  readOriginal(key: TxnRef): Promise<OriginalTxn>
  /** The SAP product type of a transaction type (ZSGTRMTR_TXNLIST ZSGSART_EXT); throws when there is none. */
  productTypeOf(txnType: string, original: OriginalTxn): Promise<string>
  /** ZGTCATR_PARAM ZSGTSF_RMC_CHILD_DET: the status a cancellation starts on. */
  cancellationStatusConfig(): Promise<{ status: string; fromConfig: boolean }>
  createFx(body: FxCreateBody): Promise<TxnRef>
  /** Creates or updates the transaction's APP_STR row — safe to repeat; an existing status is kept. */
  saveNewAppStr(ref: TxnRef, fields: AppStrFields, status: string): Promise<void>
  /** PATCHes the original's APP_STR row (status included) — safe to repeat. */
  updateOriginalAppStr(ref: TxnRef, fields: AppStrFields): Promise<void>
  readDealRows(dealId: string): Promise<FxRow[]>
  writeDealSlot(rows: readonly FxRow[], slot: DealSlot, ref: TxnRef): Promise<void>
  /** yyyy-mm-dd: sy-datum, the Blotter Date of the new transactions. */
  today(): string
}

/* ---------------- Payloads ---------------- */

const money = (v: number): number => Math.round(v * 10000) / 10000

/** One side of a booking, parsed: amt is in the transaction's BUY currency, amt2 in its SELL currency. */
export type BookingSpec = { txnType: string; tradeDate: string; valueDate: string; bp: string; rate: number; amt: number; amt2: number }

function parseBooking(f: BookingForm): BookingSpec {
  return {
    txnType: f.type,
    tradeDate: f.tdate ?? '',
    valueDate: f.vdate ?? '',
    bp: f.bp,
    rate: amountOf(f.rate),
    amt: amountOf(f.buyAmt),
    amt2: amountOf(f.sellAmt),
  }
}

/** process_data on a parsed booking: whichever amount the user left empty is derived from the rate. */
export function completeBooking(spec: BookingSpec, buyCurrency: string, sellCurrency: string, cpair: string): BookingSpec {
  const done = fillMissingAmounts({ tCurr: buyCurrency, tCurr2: sellCurrency, amt: spec.amt, amt2: spec.amt2, rate: spec.rate }, followOfPair(cpair))
  return { ...spec, amt: Math.abs(done.amt), amt2: Math.abs(done.amt2) }
}

/** The original's pair as "USD/INR" for the follow-currency test. */
const pairOfFx = (fx: FxTransaction): string => `${fx.LeadCurrency ?? fx.BuyCurrency ?? ''}/${fx.FollowCurrency ?? fx.SellCurrency ?? ''}`

export type FxRole = 'cancellation' | 'replacement' | 'unwind'

/**
 * The create body of a cancellation / replacement / unwind transaction, from the original and the entered booking.
 *   cancellation, unwind  buy and sell currencies swapped against the original (get_forward_data, get_unwind_data)
 *   replacement           the original's directions (get_spot_data)
 * Cancellation and replacement carry the entered FORWARD RATE and the amount of the traded currency only — the
 * non-USD side, as get_forward_data / get_spot_data set it — and leave the other amount to SAP. The unwind carries
 * both amounts and no rate, as get_unwind_data does.
 */
export function buildFxBody(role: FxRole, original: OriginalTxn, spec: BookingSpec, productType: string): FxCreateBody {
  const o = original.fx
  const buyCcy = role === 'replacement' ? (o.BuyCurrency ?? '') : (o.SellCurrency ?? '')
  const sellCcy = role === 'replacement' ? (o.SellCurrency ?? '') : (o.BuyCurrency ?? '')
  const lead = o.LeadCurrency || o.BuyCurrency || ''
  const follow = o.FollowCurrency || o.SellCurrency || ''
  const body: FxCreateBody = {
    CompanyCode: o.CompanyCode,
    ProductType: productType,
    TransactionType: spec.txnType,
    Partner: spec.bp || o.Partner,
    ValuationClass: String(o['ValuationClass'] ?? '') || VALUATION_CLASS,
    ContractDate: spec.tradeDate,
    ValueDate: spec.valueDate,
    BuyCurrency: buyCcy,
    SellCurrency: sellCcy,
    LeadCurrency: lead,
    FollowCurrency: follow,
  }
  if (role === 'unwind') {
    body['BuyAmount'] = money(spec.amt)
    body['SellAmount'] = money(spec.amt2)
    body['TradedCurrency'] = lead
    return body
  }
  // gv_curr: the original's non-USD currency is the one traded.
  const traded = o.BuyCurrency === 'USD' ? (o.SellCurrency ?? '') : (o.BuyCurrency ?? '')
  if (buyCcy === traded) body['BuyAmount'] = money(Math.abs(spec.amt))
  else body['SellAmount'] = money(Math.abs(spec.amt2))
  body['TradedCurrency'] = traded
  body['ForwardRate'] = spec.rate
  return body
}

/* ---------------- Checks ---------------- */

/** The earlier of the legacy's two "already done" gates, re-checked on the freshly read original. */
export function eligibility(kind: PrematureKind, original: OriginalTxn): string | null {
  const type = original.fx.TransactionType
  if (kind !== 'unwind' && type !== FORWARD_TXN_TYPE) return MSG.notForward
  if (kind !== 'unwind' && original.app.ZtsfPreMature) return MSG.alreadyPm
  if (kind === 'unwind' && original.app.ZtsfUnwind) return MSG.alreadyUnwound
  return null
}

class StageError extends Error {
  stage: Stage
  constructor(stage: Stage, message: string) {
    super(message)
    this.stage = stage
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const sameRef = (a: TxnRef, b: TxnRef): boolean => a.companyCode === b.companyCode && a.transaction === b.transaction

/* ---------------- The run ---------------- */

/**
 * Runs (or resumes) one Early Delivery, Rollover or Unwind. Never throws: a failure comes back as
 * `ok: false` with `failedStage` and the `progress` made so far; pass that progress to the next call to
 * continue from the failed stage.
 */
export async function runPremature(input: PrematureInput, deps: PrematureDeps, resume?: Progress): Promise<PrematureResult> {
  const progress: Progress = { ...freshProgress(), ...resume }
  const notes: string[] = []
  const result = (error?: StageError): PrematureResult => ({
    ok: !error,
    kind: input.kind,
    original: input.original,
    progress,
    ...(error ? { failedStage: error.stage, error: error.message } : {}),
    notes,
  })

  try {
    const original = await deps.readOriginal(input.original).catch((e) => {
      throw new StageError('preflight', `The original transaction could not be read: ${messageOf(e)}`)
    })
    const fresh = !progress.cancellationTransaction && !progress.unwindFlagSet
    if (fresh) {
      const blocked = eligibility(input.kind, original)
      if (blocked) throw new StageError('preflight', blocked)
    }
    if (input.kind === 'unwind') await runUnwind(input, original, deps, progress, notes)
    else await runPair(input, original, deps, progress, notes)
    return result()
  } catch (e) {
    return result(e instanceof StageError ? e : new StageError('preflight', messageOf(e)))
  }
}

async function guarded<T>(stage: Stage, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    throw e instanceof StageError ? e : new StageError(stage, messageOf(e))
  }
}

async function runPair(input: PairInput, original: OriginalTxn, deps: PrematureDeps, progress: Progress, notes: string[]): Promise<void> {
  const o = original.fx
  const cpair = pairOfFx(o)
  const newSpec = completeBooking(parseBooking(input.newTxn), o.BuyCurrency ?? '', o.SellCurrency ?? '', cpair)
  const cancelSpec = completeBooking(parseBooking(input.cancel), o.SellCurrency ?? '', o.BuyCurrency ?? '', cpair)

  // Everything that can be checked without writing is checked first, so a bad input never leaves half a deal
  // behind. A stage that is already done is not checked again: on a retry the original may have moved on.
  const pre = await guarded('preflight', async () => {
    const tradedAmount = (s: BookingSpec, buyCcy: string) => (buyCcy === (o.BuyCurrency === 'USD' ? o.SellCurrency : o.BuyCurrency) ? s.amt : s.amt2)
    if (!(tradedAmount(newSpec, o.BuyCurrency ?? '') > 0) || !(tradedAmount(cancelSpec, o.SellCurrency ?? '') > 0)) throw new Error(MSG.amountRequired)
    let slot: DealSlot | null = null
    if (!progress.dealSlotUpdated) {
      slot = dealSlotOf(original.app.ZtsfDealType ?? '')
      if (slot === null) throw new Error('The original is not a D1 / D2 leg of its Deal ID, so there is no slot for a replacement.')
      if (!(await deps.readDealRows(input.dealId)).length) throw new Error(`Deal ID ${input.dealId} was not found, so its transaction slot cannot be replaced.`)
    }
    const [cancelProduct, newProduct, config] = await Promise.all([
      progress.cancellationTransaction ? '' : deps.productTypeOf(cancelSpec.txnType, original),
      progress.replacementTransaction ? '' : deps.productTypeOf(newSpec.txnType, original),
      progress.cancellationAppSaved && progress.cancellationTransaction ? { status: '', fromConfig: true } : deps.cancellationStatusConfig(),
    ])
    return { slot, cancelProduct, newProduct, config }
  })
  if (input.kind === 'early' && !pre.config.fromConfig) {
    notes.push('ZGTCATR_PARAM has no usable ZSGTSF_RMC_CHILD_DET status; the cancellation started on 03 (FO -> MO Unmatched).')
  }

  const today = deps.today()
  const cancelStatus = cancellationInitialStatus(input.kind, cancelSpec.txnType, pre.config.status)

  // 1. cancellation Treasury transaction, then its APP_STR
  if (!progress.cancellationTransaction) {
    progress.cancellationTransaction = await guarded('createCancellation', () =>
      deps.createFx(buildFxBody('cancellation', original, cancelSpec, pre.cancelProduct)),
    )
  }
  if (!progress.cancellationAppSaved) {
    const ref = progress.cancellationTransaction
    await guarded('cancellationAppStr', () =>
      deps.saveNewAppStr(ref, cancellationAppFields(input.kind, original.app, cancelSpec.txnType, input.remark, today), cancelStatus),
    )
    progress.cancellationAppSaved = true
  }

  // 2. replacement Treasury transaction, then its APP_STR
  if (!progress.replacementTransaction) {
    progress.replacementTransaction = await guarded('createReplacement', () =>
      deps.createFx(buildFxBody('replacement', original, newSpec, pre.newProduct)),
    )
  }
  if (!progress.replacementAppSaved) {
    const ref = progress.replacementTransaction
    await guarded('replacementAppStr', () =>
      deps.saveNewAppStr(ref, replacementAppFields(input.kind, original.app, newSpec.txnType, input.remark, today), REPLACEMENT_INITIAL_STATUS),
    )
    progress.replacementAppSaved = true
  }

  // 3. the replacement takes over the original's Deal ID slot. Read again first: a slot that already holds the
  //    new transaction means an earlier attempt got this far.
  if (!progress.dealSlotUpdated) {
    const ref = progress.replacementTransaction
    await guarded('dealSlot', async () => {
      const rows = await deps.readDealRows(input.dealId)
      if (!rows.length) throw new Error(`Deal ID ${input.dealId} was not found.`)
      const slot = pre.slot as DealSlot
      if (!rows.every((r) => slotHolds(r, slot, ref.companyCode, ref.transaction))) await deps.writeDealSlot(rows, slot, ref)
    })
    progress.dealSlotUpdated = true
  }

  // 4. only now is the original marked: 49 for Early Delivery, 61 for Rollover (07 for NDF). ABAP tests the
  //    transaction type of the New Booking here (see originalFinalStatus).
  if (!progress.originalUpdated) {
    const remark = foRemarkFields(original.fx.TransactionType, input.remark)
    await guarded('originalUpdate', () =>
      deps.updateOriginalAppStr(input.original, originalUpdateFields(input.kind, newSpec.txnType, input.remark, original.fx.TransactionType)),
    )
    progress.originalUpdated = true
    noteRemark(notes, input.remark, [cancelSpec.txnType, newSpec.txnType, original.fx.TransactionType], remark.saved)
  }
}

async function runUnwind(input: UnwindInput, original: OriginalTxn, deps: PrematureDeps, progress: Progress, notes: string[]): Promise<void> {
  const o = original.fx
  const f = input.form
  const spec = completeBooking(
    { txnType: o.TransactionType, tradeDate: f.tdate ?? '', valueDate: f.vdate ?? '', bp: f.bp, rate: amountOf(f.rate), amt: amountOf(f.buyAmt), amt2: amountOf(f.sellAmt) },
    o.SellCurrency ?? '',
    o.BuyCurrency ?? '',
    pairOfFx(o),
  )
  const pre = await guarded('preflight', async () => {
    if (!(spec.amt > 0) || !(spec.amt2 > 0)) throw new Error(MSG.amountRequired)
    const config = progress.cancellationAppSaved ? { status: '', fromConfig: true } : await deps.cancellationStatusConfig()
    return { config, product: String(o.ProductType ?? '') }
  })
  if (!pre.config.fromConfig) notes.push('ZGTCATR_PARAM has no usable ZSGTSF_RMC_CHILD_DET status; the unwind transaction started on 03 (FO -> MO Unmatched).')
  const today = deps.today()
  const unwindStatus = cancellationInitialStatus('unwind', o.TransactionType, pre.config.status)

  // 1. the unwind Treasury transaction (Deal Type 00, so it takes no Deal ID slot), then its APP_STR
  if (!progress.cancellationTransaction) {
    progress.cancellationTransaction = await guarded('createCancellation', () =>
      deps.createFx(buildFxBody('unwind', original, spec, pre.product)),
    )
  }
  if (!progress.cancellationAppSaved) {
    const ref = progress.cancellationTransaction
    await guarded('cancellationAppStr', () =>
      deps.saveNewAppStr(ref, cancellationAppFields('unwind', original.app, o.TransactionType, input.remark, today), unwindStatus),
    )
    progress.cancellationAppSaved = true
  }

  // 2. the original is flagged as unwound
  if (!progress.unwindFlagSet) {
    await guarded('originalUnwindFlag', () => deps.updateOriginalAppStr(input.original, { ZtsfUnwind: true }))
    progress.unwindFlagSet = true
  }

  // 3. and then updated as the Rollover path does: Deal Type 00, premature, 61 (07 for NDF), remark
  if (!progress.originalUpdated) {
    await guarded('originalUpdate', () => deps.updateOriginalAppStr(input.original, originalUpdateFields('unwind', o.TransactionType, input.remark, o.TransactionType)))
    progress.originalUpdated = true
    noteRemark(notes, input.remark, [o.TransactionType], foRemarkFields(o.TransactionType, input.remark).saved)
  }
}

/** A remark typed for a Forward has no APP_STR field to land in; say so instead of dropping it silently. */
function noteRemark(notes: string[], remark: string, types: readonly string[], originalSaved: boolean): void {
  if (!remark.trim()) return
  const unsaved = types.some((t) => !foRemarkFields(t, remark).saved) || !originalSaved
  if (unsaved) {
    notes.push('The FO remark was not saved on transactions that are not NDF: TrmFxApp has NdfFoRem and OptFoRem but no Forward FO remark field.')
  }
}

/* ---------------- Deal ID slot write (shared by the real deps) ---------------- */

/** The Deal ID columns a slot change writes. */
export const slotChange = (slot: DealSlot, ref: TxnRef): Record<string, string> => ({
  [`ZBUKRS${slot}`]: ref.companyCode,
  [`ZRFHA${slot}`]: ref.transaction,
})

/* ---------------- Rollover notification ---------------- */

/**
 * FORM send_email runs only when, after the deal is read again, its transaction count is a multiple of four —
 * a complete rollover set (original, cancellation, new booking, and the earlier link). That test is kept.
 */
export const shouldNotifyRollover = (legCountAfter: number): boolean => legCountAfter > 0 && legCountAfter % 4 === 0

/**
 * The Rollover e-mail (profit / loss and rate figures from BAPI_EXCHANGERATE_GETDETAIL). The gateway exposes no
 * notification, e-mail or workflow-event service, and mail is never sent from the browser, so this reports the gap.
 * It is separate from the creates: a failure here can never undo or repeat a Treasury transaction.
 */
export function sendRolloverNotification(): { state: 'waiting'; reason: string } {
  return {
    state: 'waiting',
    reason: 'WAITING FOR API — no notification / e-mail / workflow-event service is exposed, so the Rollover e-mail was not sent.',
  }
}

/** Whether a retry of this result can still continue (a created transaction must never be created again). */
export const canResume = (r: PrematureResult, key: TxnRef): boolean => !r.ok && sameRef(r.original, key)

/** Text for the failed stage: what stopped, what is already done, what a retry will do. */
export function describeFailure(r: PrematureResult): string {
  if (r.ok || !r.failedStage) return ''
  const done: string[] = []
  const p = r.progress
  if (p.cancellationTransaction) done.push(`cancellation ${p.cancellationTransaction.companyCode}/${p.cancellationTransaction.transaction}`)
  if (p.replacementTransaction) done.push(`new booking ${p.replacementTransaction.companyCode}/${p.replacementTransaction.transaction}`)
  const created = done.length ? ` Already created: ${done.join(', ')} — they will not be created again.` : ''
  return `${STAGE_LABEL[r.failedStage]} failed: ${r.error ?? 'unknown error'}.${created}${done.length || r.failedStage !== 'preflight' ? ' Submit again to continue from this step.' : ''}`
}

