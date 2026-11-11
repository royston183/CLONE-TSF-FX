import { ApiError, apiFetch, entityPath, list, odataString, service } from '@tsfx/ref/api-client'
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'
import type { Deal } from './types.ts'
import { INTERNAL_REFERENCE_MAX_LENGTH } from './references.ts'

/**
 * The MO side of ZSGTSFTR_APP_STR, served as the TrmFxApp entity of ZFS_SB_TRMFXAPP_O4_API (service key
 * "trmfxapp"). It owns the workflow state of a transaction, TXN_STATUS, and the custom fields the legacy
 * program kept in the VTBFHA append structure through ZSGTRMFM_VTBFHA_EXPORT / _IMPORT; those function
 * modules are never called from here.
 *
 * A record is tied to its SAP transaction by BUKRS + RFHA (CompanyCode + FinancialTransaction), both
 * together. Nothing here creates a record: FO's blotter does, and MO only moves the status on.
 *
 * Property names follow the service's camel-case convention (ZTSF_DEAL_ID is ZtsfDealID).
 * Reference and remark properties were checked against live service metadata on 15 October 2026.
 */
const appApi = service('trmfxapp')
const APP = appApi('TrmFxApp')

export type MoAppRecord = {
  CompanyCode: string
  FinancialTransaction: string
  TxnStatus?: string
  ZtsfDealType?: string
  ZtsfDealID?: string
  ZtsfDealDesc?: string
  ZtsfMcRefNo?: string
  NdfFoRem?: string
  NdfMoRem?: string
  /** OPT_FO_REM. */
  OptFoRem?: string
  /** OPT_MO_REM. */
  OptMoRem?: string
  /** ZOLAM_DEAL_NO (Internal Ref), CHAR(15). */
  ZolamDealNo?: string
  /** Unverified name for ZTRCODE (trader). Only read: a record without it simply has no trader. */
  Ztrcode?: string
  BlotterDate?: string | null
}

/** What MO may write. A field with no data is never sent. */
export type MoPatch = {
  TxnStatus: string
  NdfMoRem?: string
  OptMoRem?: string
  ZolamDealNo?: string
}

const S = FX_TXN_STATUS

/** The statuses the MO worklist loads: FO -> MO Unmatched, MO -> FO Correction, Corrected. */
export const MO_WORKLIST_STATUSES: readonly string[] = [S.FO_TO_MO_UNMATCHED, S.MO_TO_FO_CORRECTION, S.CORRECTED]

/** The statuses MO can act on. 04 is already with FO and only comes back as 06. */
export const MO_ACTIONABLE_STATUSES: readonly string[] = [S.FO_TO_MO_UNMATCHED, S.CORRECTED]

/** Remark and status lengths declared by the service. References are validated without truncation below. */
const LENGTH: Record<string, number> = { NdfMoRem: 80, OptMoRem: 80, TxnStatus: 2 }

/** BUKRS + RFHA as one map key. */
export const transactionKey = (companyCode: string, transaction: string): string => `${companyCode}::${transaction}`

/** An OData date, yyyy-mm-dd, of a local day. */
export function odataDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** The legacy selection: status 03 / 04 / 06, BLOTTER_DATE up to the chosen day (not equal to it), the chosen company codes. */
export function worklistFilter(upTo: Date, companyCodes: readonly string[]): string {
  const status = MO_WORKLIST_STATUSES.map((s) => `TxnStatus eq ${odataString(s)}`).join(' or ')
  const companies = companyCodes.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  return `(${status}) and BlotterDate le ${odataDay(upTo)} and (${companies})`
}

export async function loadMoAppRecords(upTo: Date, companyCodes: readonly string[], signal?: AbortSignal): Promise<MoAppRecord[]> {
  if (!companyCodes.length) return []
  return list<MoAppRecord>(APP, { filter: worklistFilter(upTo, companyCodes), top: 1000 }, signal ? { signal } : undefined)
}

const pathOf = (companyCode: string, transaction: string): string =>
  appApi(entityPath('TrmFxApp', { CompanyCode: companyCode, FinancialTransaction: transaction }))

/** One transaction's record, or null when it has none. */
export async function getAppStrRecord(companyCode: string, transaction: string): Promise<MoAppRecord | null> {
  try {
    return (await apiFetch<MoAppRecord>(pathOf(companyCode, transaction))) ?? null
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/**
 * PATCHes the existing record by BUKRS + RFHA. `If-Match: *` because the service guards LocalLastChangedAt as its
 * ETag and this is a status overwrite, not an edit against a version the user was looking at. A blank field is
 * dropped, not sent.
 */
export async function updateAppStrRecord(companyCode: string, transaction: string, patch: MoPatch): Promise<void> {
  if ((patch.ZolamDealNo?.trim().length ?? 0) > INTERNAL_REFERENCE_MAX_LENGTH) {
    throw new Error(`Internal Ref must be at most ${INTERNAL_REFERENCE_MAX_LENGTH} characters.`)
  }
  const body: Record<string, string> = {}
  for (const [name, value] of Object.entries(patch)) {
    if (typeof value !== 'string' || !value.trim()) continue
    body[name] = value.trim().slice(0, LENGTH[name] ?? 255)
  }
  await apiFetch(pathOf(companyCode, transaction), { method: 'PATCH', headers: { 'If-Match': '*' }, body })
}

// ---------------------------------------------------------------- field mapping

const NDF_TYPES = new Set(['631', '632'])

/**
 * The APP_STR field that holds the MO remark of this deal, or null when the table has none for it.
 *   Options  -> OPT_MO_REM
 *   NDF/DNDF -> NDF_MO_REM
 * A plain forward has no MO remark field of its own, and none is invented: its remark is not saved.
 */
export function moRemarkField(deal: Pick<Deal, 'dealType' | 'txnTypeCode'>): 'OptMoRem' | 'NdfMoRem' | null {
  if (deal.dealType === 'Options') return 'OptMoRem'
  return NDF_TYPES.has(deal.txnTypeCode) ? 'NdfMoRem' : null
}

export function moRemarkPatch(deal: Pick<Deal, 'dealType' | 'txnTypeCode'>, remark: string): Partial<MoPatch> {
  const field = moRemarkField(deal)
  return field && remark.trim() ? { [field]: remark.trim() } : {}
}
