import { FX_TXN_STATUS, fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { sapMessage, settleFxDeal } from './api.ts'
import {
  MO_ACTIONABLE_STATUSES,
  getAppStrRecord,
  moRemarkField,
  moRemarkPatch,
  updateAppStrRecord,
  type MoPatch,
} from './appStr.ts'
import type { Deal } from './types.ts'
import { assertExternalReferenceSupported, EXTERNAL_REFERENCE_MAX_LENGTH, INTERNAL_REFERENCE_MAX_LENGTH, saveExternalReference } from './references.ts'

/**
 * The MO actions on FX deals. Match & Release runs the SAP settlement first and writes the workflow status to
 * ZSGTSFTR_APP_STR only once SAP has accepted it; Correction Required is workflow data alone and never calls SAP.
 * The two are separate services, so the second can fail after the first has succeeded. That is reported with
 * what is needed to save again, and the settlement is never repeated.
 */

export const CORRECTION_REMARK_REQUIRED = 'Please fill the MO Remarks and Update'

export type MoInput = { externalRef: string; internalRef: string; moRemark: string }

/** A workflow save SAP has already earned: the transaction is settled, the status is not yet written. */
export type PendingSave = { id: string; companyCode: string; transaction: string; patch: MoPatch; externalRef?: string }

export type MoFailure = {
  id: string
  stage: 'validate' | 'settle' | 'workflow'
  reason: string
  /** Set when SAP settled but the workflow save failed: retry this without settling again. */
  pending?: PendingSave
}

export type MoDone = { id: string; txnStatus: string; moRemark: string }

/** What a batch of deals did. A batch stops at the first failure; what was done before it stays done. */
export type MoBatch = { done: MoDone[]; failed?: MoFailure; notStored: string[] }

// ---------------------------------------------------------------- eligibility

/** Why MO cannot act on a deal in this status, or null when it can (03 and 06 only). */
export function moBlockReason(txnStatus: string): string | null {
  if (MO_ACTIONABLE_STATUSES.includes(txnStatus)) return null
  if (txnStatus === FX_TXN_STATUS.MO_TO_FO_CORRECTION) return 'it is already with FO for correction and comes back to MO once FO has corrected it'
  if (txnStatus === FX_TXN_STATUS.MO_MATCH_RELEASE) return 'it has already been matched and released'
  if (txnStatus === FX_TXN_STATUS.OFFSET_TRANSACTION) return 'it is an offset transaction and is already complete'
  return `its status is ${txnStatus ? `${txnStatus} (${fxTxnStatusLabel(txnStatus)})` : 'not set'}, which MO does not process here`
}

export const canMoAct = (deal: Pick<Deal, 'txnStatus'>): boolean => moBlockReason(deal.txnStatus) === null

/** The first selected deal MO cannot act on, as a sentence; null when every one can. */
export function selectionBlockMessage(deals: readonly Deal[]): string | null {
  for (const d of deals) {
    const why = moBlockReason(d.txnStatus)
    if (why) return `Deal ${d.dealId || d.transaction} cannot be processed: ${why}.`
  }
  return null
}

/** 59 for an FX cancellation deal (ZTSF_DEAL_TYPE 00), 07 otherwise. */
export const statusAfterMatchRelease = (dealTypeCode: string | undefined): string =>
  dealTypeCode === '00' ? FX_TXN_STATUS.OFFSET_TRANSACTION : FX_TXN_STATUS.MO_MATCH_RELEASE

/** The deal's stored status, read again just before acting, so a stale row cannot be processed twice. */
async function currentRecord(deal: Deal): Promise<{ dealTypeCode: string | undefined } | MoFailure> {
  let rec
  try {
    rec = await getAppStrRecord(deal.coCode, deal.transaction)
  } catch (e) {
    return { id: deal.id, stage: 'validate', reason: `The workflow data could not be read: ${sapMessage(e)}` }
  }
  if (!rec) return { id: deal.id, stage: 'validate', reason: 'This transaction has no application-data record, so MO cannot process it.' }
  const why = moBlockReason((rec.TxnStatus ?? '').trim())
  if (why) return { id: deal.id, stage: 'validate', reason: `Deal ${deal.dealId || deal.transaction} cannot be processed: ${why}. Refresh to see its current status.` }
  return { dealTypeCode: rec.ZtsfDealType ?? deal.dealTypeCode }
}

// ---------------------------------------------------------------- match & release

/**
 * Validate, settle in SAP, then save the status. A deal SAP already shows settled skips the settlement, which is how a
 * save that failed earlier is completed after a reload.
 */
export async function matchAndReleaseDeal(deal: Deal, input: MoInput): Promise<{ ok: true; done: MoDone } | { ok: false; failure: MoFailure }> {
  const externalRef = input.externalRef.trim()
  const internalRef = input.internalRef.trim()
  if (externalRef.length > EXTERNAL_REFERENCE_MAX_LENGTH || internalRef.length > INTERNAL_REFERENCE_MAX_LENGTH) {
    return { ok: false, failure: { id: deal.id, stage: 'validate', reason: `External Ref must be at most ${EXTERNAL_REFERENCE_MAX_LENGTH} characters and Internal Ref at most ${INTERNAL_REFERENCE_MAX_LENGTH} characters.` } }
  }
  if (externalRef) {
    try {
      await assertExternalReferenceSupported()
    } catch (e) {
      return { ok: false, failure: { id: deal.id, stage: 'validate', reason: sapMessage(e) } }
    }
  }
  const checked = await currentRecord(deal)
  if ('stage' in checked) return { ok: false, failure: checked }

  if (!deal.settledInSap) {
    try {
      await settleFxDeal(deal.coCode, deal.transaction)
    } catch (e) {
      return { ok: false, failure: { id: deal.id, stage: 'settle', reason: sapMessage(e) } }
    }
  }

  const txnStatus = statusAfterMatchRelease(checked.dealTypeCode)
  const patch: MoPatch = {
    TxnStatus: txnStatus,
    ...moRemarkPatch(deal, input.moRemark),
    ...(internalRef ? { ZolamDealNo: internalRef } : {}),
  }
  const pending: PendingSave = { id: deal.id, companyCode: deal.coCode, transaction: deal.transaction, patch, ...(externalRef ? { externalRef } : {}) }
  try {
    if (externalRef) await saveExternalReference(deal.coCode, deal.transaction, externalRef)
    await updateAppStrRecord(deal.coCode, deal.transaction, patch)
  } catch (e) {
    return {
      ok: false,
      failure: {
        id: deal.id,
        stage: 'workflow',
        reason: `SAP transaction ${deal.transaction} was settled successfully, but its references or MO workflow data could not be updated (${sapMessage(e)}). Retry the save; the transaction is not settled again.`,
        pending,
      },
    }
  }
  return { ok: true, done: { id: deal.id, txnStatus, moRemark: input.moRemark.trim() } }
}

/** What the screen collected that no SAP FX service property takes. */
function notStoredFor(deals: readonly Deal[], input: MoInput, remarkField: boolean): string[] {
  const out: string[] = []
  if (remarkField && input.moRemark.trim() && deals.some((d) => moRemarkField(d) === null)) {
    out.push('MO Remarks on a plain forward (APP_STR has no MO remark field for it)')
  }
  return out
}

export async function matchAndReleaseDeals(deals: readonly Deal[], input: MoInput): Promise<MoBatch> {
  const done: MoDone[] = []
  for (const deal of deals) {
    const r = await matchAndReleaseDeal(deal, input)
    if (!r.ok) return { done, failed: r.failure, notStored: notStoredFor(deals, input, true) }
    done.push(r.done)
  }
  return { done, notStored: notStoredFor(deals, input, true) }
}

/** Saves the status of a deal SAP has already settled. Only the save is repeated. */
export async function retryWorkflowSave(pending: PendingSave): Promise<{ ok: true; done: MoDone } | { ok: false; reason: string }> {
  try {
    if (pending.externalRef) {
      await assertExternalReferenceSupported()
      await saveExternalReference(pending.companyCode, pending.transaction, pending.externalRef)
    }
    await updateAppStrRecord(pending.companyCode, pending.transaction, pending.patch)
    return { ok: true, done: { id: pending.id, txnStatus: pending.patch.TxnStatus, moRemark: pending.patch.NdfMoRem ?? pending.patch.OptMoRem ?? '' } }
  } catch (e) {
    return { ok: false, reason: sapMessage(e) }
  }
}

// ---------------------------------------------------------------- correction required

/** The remark is mandatory before anything else is checked or written. */
export const isCorrectionRemarkValid = (remark: string): boolean => remark.trim() !== ''

/** Sends deals back to FO: status 04 and the MO remark, in APP_STR alone. SAP is not called. */
export async function requestCorrectionDeals(deals: readonly Deal[], remark: string): Promise<MoBatch> {
  if (!isCorrectionRemarkValid(remark)) {
    return { done: [], failed: { id: deals[0]?.id ?? '', stage: 'validate', reason: CORRECTION_REMARK_REQUIRED }, notStored: [] }
  }
  const done: MoDone[] = []
  const notStored = deals.some((d) => moRemarkField(d) === null) ? ['MO Remarks on a plain forward (APP_STR has no MO remark field for it)'] : []
  for (const deal of deals) {
    const checked = await currentRecord(deal)
    if ('stage' in checked) return { done, failed: checked, notStored }
    try {
      await updateAppStrRecord(deal.coCode, deal.transaction, { TxnStatus: FX_TXN_STATUS.MO_TO_FO_CORRECTION, ...moRemarkPatch(deal, remark) })
    } catch (e) {
      return { done, failed: { id: deal.id, stage: 'workflow', reason: `The correction request could not be saved: ${sapMessage(e)}` }, notStored }
    }
    done.push({ id: deal.id, txnStatus: FX_TXN_STATUS.MO_TO_FO_CORRECTION, moRemark: remark.trim() })
  }
  return { done, notStored }
}
