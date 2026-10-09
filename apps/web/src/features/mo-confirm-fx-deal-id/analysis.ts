/**
 * Deal ID Analysis operations (ZSGTSF_PDEAL_ID_ANALYS): Confirm, Change MC, Edit Deal Pair, Cancel and
 * Reverse MO Confirmation, as business functions over three separate services:
 *
 *   Deal ID + slots + P&L   middleware tsfDealId   ZSGTSFTR_DEALID
 *   Invoice references      middleware invRef      ZSGTSFTR_INV_REF
 *   Transaction linkage     TrmFxApp OData         ZSGTSFTR_APP_STR (Deal ID / type / desc / MC ref, TXN_STATUS)
 *
 * None of them is atomic with another, so every operation is a list of steps that each check what is
 * already stored before writing. A step that fails stops the run, is reported by name together with what
 * had already been done, and running the same operation again completes it without repeating a step that
 * already succeeded. The legacy calls to ZSGTRMFM_VTBFHA_EXPORT / BAPI_FTR_FXT_CHANGE existed only to
 * persist the ZTSF_* fields; those now live in APP_STR, so no standard FX / Option CHANGE is made here.
 *
 * No operation here writes TXN_STATUS. A Deal ID status change (ZDEAL_STAT) and a transaction status
 * (TXN_STATUS) are separate lifecycles.
 */
import { createAppStrRecord, clearDealLink, getAppStrRecord, loadAppStrRecords, updateAppStrRecord, type AppStrFields, type AppStrRecord } from '../fx-blotter/appStr.ts'
import { DEAL_STATUS, REVERSIBLE_DEAL_STATUSES } from '../../shared/fx/deal-status.ts'
import { dealKey } from '../../shared/fx/deal-id.ts'
import { messageOf, type DealRow } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxCreate, fxDelete, fxList, fxUpdate, type FxRow } from '../../shared/fx/mw.ts'
import { changedStamp, dec } from '../../shared/fx/sap.ts'
import {
  blockerMessage,
  confirmationBlockers,
  isEligibleReplacement,
  isSlotName,
  referenceOf,
  SLOT_ORDER,
  slotColumns,
  slotOf,
  slotReplacement,
  type ReplacementReference,
  type SlotName,
  type TxnRef,
} from './analysisRules.ts'

// ---------------------------------------------------------------- ports

/** The service calls the operations make; tests substitute these. */
export type Ports = {
  /** PATCH ZSGTSFTR_DEALID (the changed-by stamp is added here). */
  patchDeal(row: DealRow, changes: Record<string, unknown>): Promise<void>
  /** The Deal ID row as it is stored now. */
  readDeal(dealId: string): Promise<DealRow | undefined>
  listInvoiceRefs(dealId: string): Promise<FxRow[]>
  createInvoiceRef(row: Record<string, unknown>): Promise<void>
  updateInvoiceRef(key: Record<string, string>, changes: Record<string, unknown>): Promise<void>
  deleteInvoiceRef(key: Record<string, string>): Promise<void>
  getAppStr(companyCode: string, rfha: string): Promise<AppStrRecord | null>
  createAppStr(companyCode: string, rfha: string, fields: AppStrFields): Promise<void>
  /** PATCH of non-blank fields only. */
  updateAppStr(companyCode: string, rfha: string, fields: AppStrFields): Promise<void>
  /** PATCH that sends the Deal ID linkage fields as explicit nulls. */
  clearAppStrLink(companyCode: string, rfha: string): Promise<void>
}

/** ZSGTSFTR_INV_REF's key as these operations address a row: the Deal ID and the invoice's TRM number. */
const INV_REF_KEY = ['ZDEAL_ID', 'ZINV_TRM_NO'] as const
export const invoiceRefKey = (row: FxRow | Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(INV_REF_KEY.map((c) => [c, String((row as Record<string, unknown>)[c] ?? '')]))

export const livePorts: Ports = {
  async patchDeal(row, changes) {
    await fxUpdate('tsfDealId', dealKey(row), { ...changes, ...(await changedStamp()) })
  },
  async readDeal(dealId) {
    return (await fxList('tsfDealId', { ZDEAL_ID: dealId, ZDEAL_TYPE: 'FX' }))[0]
  },
  listInvoiceRefs: (dealId) => fxList('invRef', { ZDEAL_ID: dealId }),
  createInvoiceRef: async (row) => void (await fxCreate('invRef', row)),
  updateInvoiceRef: (key, changes) => fxUpdate('invRef', key, changes),
  deleteInvoiceRef: (key) => fxDelete('invRef', key),
  getAppStr: getAppStrRecord,
  createAppStr: createAppStrRecord,
  updateAppStr: updateAppStrRecord,
  clearAppStrLink: clearDealLink,
}

// ---------------------------------------------------------------- step runner

export type StepStatus = 'done' | 'skipped' | 'failed' | 'not-run'
export type Step = { name: string; status: StepStatus; detail?: string }
export type OpResult = { ok: boolean; steps: Step[]; error?: string }

type StepDef = { name: string; run: () => Promise<'skipped' | void> }

/** Runs the steps in order; the first failure stops the run and the rest are reported as not run. */
async function runSteps(defs: readonly StepDef[]): Promise<OpResult> {
  const steps: Step[] = []
  let error: string | undefined
  for (const def of defs) {
    if (error !== undefined) {
      steps.push({ name: def.name, status: 'not-run' })
      continue
    }
    try {
      steps.push({ name: def.name, status: (await def.run()) === 'skipped' ? 'skipped' : 'done' })
    } catch (e) {
      error = messageOf(e)
      steps.push({ name: def.name, status: 'failed', detail: error })
    }
  }
  return error === undefined ? { ok: true, steps } : { ok: false, steps, error }
}

const rejected = (name: string, error: string): OpResult => ({ ok: false, steps: [{ name, status: 'failed', detail: error }], error })

/** The sentence shown after a run that did not finish: what failed, what was kept, how to finish. */
export function partialFailureMessage(result: OpResult): string {
  if (result.ok) return ''
  const done = result.steps.filter((s) => s.status === 'done').map((s) => s.name)
  const failed = result.steps.find((s) => s.status === 'failed')
  const rest = result.steps.filter((s) => s.status === 'not-run').map((s) => s.name)
  const kept = done.length ? ` Already saved and kept: ${done.join('; ')}.` : ''
  const todo = rest.length ? ` Not run: ${rest.join('; ')}.` : ''
  const retry = done.length || rest.length ? ' Run the action again to finish; steps already saved are not repeated.' : ''
  return `${failed ? `${failed.name} failed: ${failed.detail ?? result.error ?? 'unknown error'}.` : (result.error ?? '')}${kept}${todo}${retry}`
}

// ---------------------------------------------------------------- shared helpers

export type Target = { bukrs: string; rfha: string }

/** The linkage a transaction carries on a Deal ID. */
export type DealLinkValues = { dealId: string; dealType: string; dealDesc: string; mcRef: string }

const linkFields = (l: DealLinkValues): AppStrFields => ({
  ZtsfDealDesc: l.dealDesc,
  ZtsfDealType: l.dealType,
  ZtsfDealID: l.dealId,
  ZtsfMcRefNo: l.mcRef,
})

const sameLink = (rec: AppStrRecord, l: DealLinkValues): boolean =>
  (rec.ZtsfDealID ?? '') === l.dealId &&
  (rec.ZtsfDealType ?? '') === l.dealType &&
  (rec.ZtsfMcRefNo ?? '') === l.mcRef &&
  (rec.ZtsfDealDesc ?? '') === l.dealDesc.slice(0, 80)

/**
 * Writes the linkage to a transaction's APP_STR record: a PATCH when the record exists, a create when
 * it does not, and nothing when it already holds exactly these values. TXN_STATUS is never sent.
 */
export async function updateTransactionDealLink(ports: Ports, t: Target, link: DealLinkValues): Promise<'skipped' | void> {
  const rec = await ports.getAppStr(t.bukrs, t.rfha)
  if (!rec) return ports.createAppStr(t.bukrs, t.rfha, linkFields(link))
  if (sameLink(rec, link)) return 'skipped'
  return ports.updateAppStr(t.bukrs, t.rfha, linkFields(link))
}

/**
 * Clears the Deal ID linkage of a transaction. Skipped when there is no record, nothing to clear, or the
 * record now points at a different Deal ID (someone else's link is not ours to remove).
 */
export async function clearTransactionDealLink(ports: Ports, t: Target, fromDealId: string): Promise<'skipped' | void> {
  const rec = await ports.getAppStr(t.bukrs, t.rfha)
  if (!rec) return 'skipped'
  const linked = rec.ZtsfDealID ?? ''
  const hasAny = linked || rec.ZtsfDealType || rec.ZtsfDealDesc || rec.ZtsfMcRefNo
  if (!hasAny || (linked && linked !== fromDealId)) return 'skipped'
  return ports.clearAppStrLink(t.bukrs, t.rfha)
}

/**
 * Sets ZTSF_MC_REF_NO on every given transaction (BUKRS + RFHA), skipping those that already hold it. A
 * transaction with no APP_STR record is reported as a failure rather than given a half-empty record.
 */
export async function updateTransactionsMcRef(ports: Ports, txns: readonly Target[], mcRef: string): Promise<'skipped' | void> {
  let changed = 0
  for (const t of txns) {
    const rec = await ports.getAppStr(t.bukrs, t.rfha)
    if (!rec) throw new Error(`Transaction ${t.rfha} (company ${t.bukrs}) has no application data to carry the Master Contract.`)
    if ((rec.ZtsfMcRefNo ?? '') === mcRef) continue
    await ports.updateAppStr(t.bukrs, t.rfha, { ZtsfMcRefNo: mcRef })
    changed++
  }
  return changed ? undefined : 'skipped'
}

/** The transactions in a Deal ID row's slots. */
export function linkedTransactions(deal: FxRow): Array<Target & { slot: SlotName }> {
  return SLOT_ORDER.flatMap((slot) => {
    const c = slotColumns(slot)
    const rfha = txt(deal, c.rfha)
    return rfha ? [{ slot, rfha, bukrs: txt(deal, c.bukrs) }] : []
  })
}

// ---------------------------------------------------------------- confirm

/** One ZSGTSFTR_INV_REF row of the confirmation (ZDEAL_ID is added from the Deal ID). */
export type InvoiceRefInput = {
  ZINV_TRM_NO: string
  ZTTYPE: string
  ZDTYPE: string
  ZTRD_SELL: string
  ZTRD_BUY: string
  ZMC_REF_P: string
  ZMC_REF_S: string
  ZAMT: number
  ZINV_AMT: number
  ZTRD_CURR: string
  ZEX_RATE: number
}

/** The P&L persisted on the Deal ID. ZPL_CURR is always USD. */
export type PlInput = { pl: number; localAmount: number; localCurrency: string; rate: number }

export type ConfirmInput = {
  dealId: string
  /** The Master Contract the Deal ID should end up on; blank keeps the stored one. */
  mcRef?: string
  /** ZTSF_MODEL to store with the confirmation. */
  model: string
  invoices: readonly InvoiceRefInput[]
  pl: PlInput | null
}

/** How the stored decimals are written; the middleware rejects more decimals than the column holds. */
const AMOUNT_SCALE = 2
const RATE_SCALE = 4

const invoiceColumns = (dealId: string, i: InvoiceRefInput): Record<string, unknown> => ({
  ZDEAL_ID: dealId,
  ZINV_TRM_NO: i.ZINV_TRM_NO,
  ZTTYPE: i.ZTTYPE,
  ZDTYPE: i.ZDTYPE,
  ZTRD_SELL: i.ZTRD_SELL,
  ZTRD_BUY: i.ZTRD_BUY,
  ZMC_REF_P: i.ZMC_REF_P,
  ZMC_REF_S: i.ZMC_REF_S,
  ZAMT: dec(i.ZAMT, AMOUNT_SCALE),
  ZINV_AMT: dec(i.ZINV_AMT, AMOUNT_SCALE),
  ZTRD_CURR: i.ZTRD_CURR,
  ZEX_RATE: dec(i.ZEX_RATE, RATE_SCALE),
})

/** Saves the invoice references: an existing row (same Deal ID + TRM number) is updated, a new one created. */
export async function saveInvoiceReferences(ports: Ports, dealId: string, invoices: readonly InvoiceRefInput[]): Promise<'skipped' | void> {
  if (!invoices.length) return 'skipped'
  const existing = new Set((await ports.listInvoiceRefs(dealId)).map((r) => txt(r, 'ZINV_TRM_NO')))
  for (const inv of invoices) {
    const cols = invoiceColumns(dealId, inv)
    if (existing.has(inv.ZINV_TRM_NO)) {
      const { ZDEAL_ID: _d, ZINV_TRM_NO: _t, ...changes } = cols
      await ports.updateInvoiceRef(invoiceRefKey(cols), changes)
    } else await ports.createInvoiceRef(cols)
  }
}

/** Deletes every invoice reference of the Deal ID; the rows already gone are not an error on a retry. */
export async function deleteInvoiceReferences(ports: Ports, dealId: string): Promise<'skipped' | void> {
  const rows = await ports.listInvoiceRefs(dealId)
  if (!rows.length) return 'skipped'
  for (const r of rows) await ports.deleteInvoiceRef(invoiceRefKey(r))
}


export type Confirmable = { ok: true; row: DealRow; linked: Array<Target & { slot: SlotName }> } | { ok: false; error: string }

/**
 * Whether the Deal ID can be confirmed right now, from what is stored: it is Created (01) and every linked
 * transaction's persisted TXN_STATUS is at least 07. Run again immediately before the writes.
 */
export async function checkConfirmable(dealId: string, ports: Ports = livePorts): Promise<Confirmable> {
  const row = await ports.readDeal(dealId)
  if (!row) return { ok: false, error: `Deal ID ${dealId} was not found.` }
  if (txt(row, 'ZDEAL_STAT') !== DEAL_STATUS.CREATED) {
    return { ok: false, error: `Deal ID ${dealId} has status ${txt(row, 'ZDEAL_STAT')}; only a Created (01) Deal ID can be confirmed.` }
  }
  const linked = linkedTransactions(row)
  const refs: TxnRef[] = []
  for (const t of linked) {
    const rec = await ports.getAppStr(t.bukrs, t.rfha)
    refs.push({ bukrs: t.bukrs, rfha: t.rfha, txnStatus: rec?.TxnStatus ?? '' })
  }
  const blockers = confirmationBlockers(refs)
  return blockers.length ? { ok: false, error: blockerMessage(blockers) } : { ok: true, row, linked }
}

/**
 * Change / Confirm. Validates against what is stored now (the Deal ID is still Created and every linked
 * transaction's persisted TXN_STATUS is at least 07), then: changes the MC on the Deal ID and on every
 * linked APP_STR when it differs, saves the invoice references, and finally sets ZDEAL_STAT 02 / ZCONFIRM X
 * with the P&L. The status is last, so a failure earlier leaves the Deal ID Created and the run repeatable.
 */
export async function confirmDealId(input: ConfirmInput, ports: Ports = livePorts): Promise<OpResult> {
  const check = await checkConfirmable(input.dealId, ports)
  if (!check.ok) return rejected('Validate', check.error)
  const { row, linked } = check

  const storedMc = txt(row, 'ZMC_REF')
  const mcRef = (input.mcRef ?? '').trim() || storedMc
  const dealChanges: Record<string, unknown> = {
    ZDEAL_STAT: DEAL_STATUS.CONFIRMED,
    ZCONFIRM: 'X',
    ZMC_REF: mcRef,
    ZTSF_MODEL: input.model,
    ...(input.pl
      ? {
          ZPL: dec(input.pl.pl, AMOUNT_SCALE),
          ZPL_LAMT: dec(input.pl.localAmount, AMOUNT_SCALE),
          ZPL_LCURR: input.pl.localCurrency,
          ZPL_CURR: 'USD',
          ZPL_RATE: dec(input.pl.rate, RATE_SCALE),
        }
      : {}),
  }

  return runSteps([
    ...(mcRef !== storedMc ? [{ name: 'Change Master Contract on the Deal ID', run: () => ports.patchDeal(row, { ZMC_REF: mcRef, ZTSF_MODEL: input.model }) }] : []),
    // Also on a retry: the Deal ID may already hold the new MC while some transactions do not.
    { name: 'Stamp the Master Contract on the linked transactions', run: () => updateTransactionsMcRef(ports, linked, mcRef) },
    { name: 'Save invoice references', run: () => saveInvoiceReferences(ports, input.dealId, input.invoices) },
    { name: 'Confirm the Deal ID (status 02)', run: () => ports.patchDeal(row, dealChanges) },
  ])
}

// ---------------------------------------------------------------- cancel / reverse

/** Cancel Deal ID: ZDEAL_STAT = 30 on the Deal ID and nothing else — no transaction status, no APP_STR, no reversal. */
export async function cancelDealId(row: DealRow, ports: Ports = livePorts): Promise<OpResult> {
  return runSteps([{ name: 'Cancel the Deal ID (status 30)', run: () => ports.patchDeal(row, { ZDEAL_STAT: DEAL_STATUS.CANCELLED }) }])
}

/**
 * Reverse MO Confirmation: ZDEAL_STAT back to 01 and the Deal ID's invoice references deleted. It is not
 * a Treasury reversal: no FX / Option API is called and TXN_STATUS is not touched. Allowed from 02 / 03;
 * from 01 only to finish a run that stopped after the status step (`resume`), and then only the deletion runs.
 */
export async function reverseMoConfirmation(dealId: string, options: { resume?: boolean } = {}, ports: Ports = livePorts): Promise<OpResult> {
  const row = await ports.readDeal(dealId)
  if (!row) return rejected('Validate', `Deal ID ${dealId} was not found.`)
  const status = txt(row, 'ZDEAL_STAT')
  const reversible = REVERSIBLE_DEAL_STATUSES.includes(status)
  if (!reversible && !(options.resume && status === DEAL_STATUS.CREATED)) {
    return rejected('Validate', `Deal ID ${dealId} has status ${status}; Reverse MO Confirmation applies to status 02 or 03.`)
  }
  return runSteps([
    { name: 'Set the Deal ID back to Created (status 01)', run: async () => (reversible ? ports.patchDeal(row, { ZDEAL_STAT: DEAL_STATUS.CREATED }) : 'skipped') },
    { name: 'Delete the invoice references', run: () => deleteInvoiceReferences(ports, dealId) },
  ])
}

// ---------------------------------------------------------------- edit deal pair

export type ReplaceInput = {
  dealId: string
  /** The slot being replaced (D1 .. DSS2). */
  slot: string
  oldTxn: Target
  newTxn: Target
  /** The Deal ID's current description and MC reference, written to the new transaction. */
  dealDesc: string
  mcRef: string
}

/**
 * Edit Deal Pair: the OLD transaction's APP_STR linkage is cleared, the NEW one is linked to the Deal ID
 * (description, the slot name as the deal leg type, Deal ID, MC ref), and the Deal ID's slot is overwritten
 * with the new BUKRS + RFHA. TXN_STATUS is not written on either transaction. Every step reads first, so a
 * retry after a partial failure finishes the rest.
 */
export async function replaceDealTransaction(input: ReplaceInput, ports: Ports = livePorts): Promise<OpResult> {
  if (!isSlotName(input.slot)) return rejected('Validate', `${input.slot} is not a Deal ID slot.`)
  const slot = input.slot
  const { oldTxn, newTxn } = input
  if (oldTxn.rfha === newTxn.rfha && oldTxn.bukrs === newTxn.bukrs) return rejected('Validate', 'The new transaction must differ from the old one.')
  if (oldTxn.bukrs !== newTxn.bukrs) return rejected('Validate', 'The new transaction must be in the same company code.')

  const row = await ports.readDeal(input.dealId)
  if (!row) return rejected('Validate', `Deal ID ${input.dealId} was not found.`)
  if (txt(row, 'ZDEAL_STAT') !== DEAL_STATUS.CREATED) {
    return rejected('Validate', `Deal ID ${input.dealId} has status ${txt(row, 'ZDEAL_STAT')}; a pair can be edited only while it is Created (01).`)
  }
  const holdsOld = slotOf(row, oldTxn.bukrs, oldTxn.rfha) === slot
  const holdsNew = slotOf(row, newTxn.bukrs, newTxn.rfha) === slot
  if (!holdsOld && !holdsNew) return rejected('Validate', `Slot ${slot} does not hold transaction ${oldTxn.rfha}; refresh the Deal ID and try again.`)
  const elsewhere = slotOf(row, newTxn.bukrs, newTxn.rfha)
  if (elsewhere && elsewhere !== slot) return rejected('Validate', `Transaction ${newTxn.rfha} is already in slot ${elsewhere} of this Deal ID.`)

  const link: DealLinkValues = { dealId: input.dealId, dealType: slot, dealDesc: input.dealDesc, mcRef: input.mcRef }
  return runSteps([
    { name: `Clear the Deal ID linkage of ${oldTxn.rfha}`, run: () => clearTransactionDealLink(ports, oldTxn, input.dealId) },
    { name: `Link ${newTxn.rfha} to the Deal ID`, run: () => updateTransactionDealLink(ports, newTxn, link) },
    {
      name: `Put ${newTxn.rfha} in slot ${slot}`,
      run: async () => (holdsNew ? 'skipped' : ports.patchDeal(row, slotReplacement(slot, newTxn))),
    },
  ])
}

// ---------------------------------------------------------------- replacement candidates

export type ReplacementCandidate = {
  bukrs: string
  rfha: string
  description: string
  valueDate: string
  side: string
  currency: string
  amount: number
  txnStatus: string
  /** The Deal ID the candidate is already linked to in APP_STR, if any. */
  linkedDealId: string
}

/** The transaction being replaced, as ZSGTSFV_FX reports it; throws when it cannot be found, since nothing can be compared. */
export async function loadReplacementReference(old: Target): Promise<ReplacementReference> {
  const [view] = await fxList('tsfvFx', { BUKRS: old.bukrs, RFHA: old.rfha })
  if (!view) throw new Error(`Transaction ${old.rfha} (company ${old.bukrs}) is not in ZSGTSFV_FX, so replacements cannot be matched to it.`)
  return referenceOf(view)
}

/**
 * The transactions that may replace `ref`: the legacy filters applied to ZSGTSFV_FX rows of the same
 * company code and transaction type, with each one's status taken from APP_STR (BUKRS + RFHA).
 */
export async function loadReplacementCandidates(ref: ReplacementReference, signal?: AbortSignal): Promise<ReplacementCandidate[]> {
  const rows = await fxList('tsfvFx', { BUKRS: ref.bukrs, SFHAART: ref.sfhaart, DELFZ: ref.delfz }, { signal })
  const pool = rows.filter((r) => txt(r, 'RFHA') !== ref.rfha)
  const records = pool.length ? await loadAppStrRecords(pool.map((r) => ({ CompanyCode: txt(r, 'BUKRS'), FinancialTransaction: txt(r, 'RFHA') })), signal) : []
  const byKey = new Map(records.map((r) => [`${r.CompanyCode}|${r.FinancialTransaction}`, r]))
  return pool.flatMap((r) => {
    const rec = byKey.get(`${txt(r, 'BUKRS')}|${txt(r, 'RFHA')}`)
    const status = rec?.TxnStatus ?? ''
    if (!isEligibleReplacement(ref, r, status)) return []
    const c = referenceOf(r)
    return [{ bukrs: c.bukrs, rfha: c.rfha, description: txt(r, 'XTEXT'), valueDate: c.delfz, side: c.side, currency: c.currency, amount: c.amount, txnStatus: status, linkedDealId: rec?.ZtsfDealID ?? '' }]
  })
}
