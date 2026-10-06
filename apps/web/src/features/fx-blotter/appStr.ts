import { ApiError, apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import { blotterStageOf, statusAfterRelease } from '../../shared/fx/txn-status.ts'
import type { BlotterRow } from './types.ts'

/**
 * The FX application data: ZSGTSFTR_APP_STR, served as the TrmFxApp entity of ZFS_SB_TRMFXAPP_O4_API
 * (OData V4, service key "trmfxapp"). It holds what SAP's own FxTransaction has no field for — the Deal
 * ID / Master Contract the transaction is on, the leg currencies, the FO / MO remarks and, above all,
 * TXN_STATUS, the lifecycle status — in place of the VTBFHA append fields the legacy program filled
 * through ZSGTRMFM_VTBFHA_EXPORT / _IMPORT. Those function modules are never called from here.
 *
 * A row is tied to its SAP transaction by CompanyCode (BUKRS) + FinancialTransaction (RFHA), both
 * together: the transaction number alone repeats across company codes.
 *
 * The service names its fields in camel case (ZtsfDealID for ZTSF_DEAL_ID). LocalCreated* /
 * LocalLastChanged* / LastChangedAt are filled by the service and are never sent.
 */
const appApi = service('trmfxapp')
const APP = appApi('TrmFxApp')

/** Entity fields the blotter writes. Every one is optional: a field with no reliable source is left out, not sent blank. */
export type AppStrFields = {
  ZtsfDealType?: string
  ZtsfDealID?: string
  ZtsfDealDesc?: string
  ZtsfMcRefNo?: string
  ZtsfBcurr?: string
  ZtsfScurr?: string
  ZtsfDealSq?: string
  NdfFoRem?: string
  NdfMoRem?: string
  TxnStatus?: string
  /** An OData date, yyyy-mm-dd. */
  BlotterDate?: string
}

export type AppStrRecord = AppStrFields & {
  CompanyCode: string
  FinancialTransaction: string
  '@odata.etag'?: string
}

/** Maximum lengths of the string fields, from the service's $metadata. */
const LENGTH: Record<keyof AppStrFields, number> = {
  ZtsfDealType: 4,
  ZtsfDealID: 15,
  ZtsfDealDesc: 80,
  ZtsfMcRefNo: 10,
  ZtsfBcurr: 3,
  ZtsfScurr: 3,
  ZtsfDealSq: 2,
  NdfFoRem: 80,
  NdfMoRem: 80,
  TxnStatus: 2,
  BlotterDate: 10,
}

/** The SAP deal type of every Deal ID the blotter writes (ZSGTSFTR_DEALID.ZDEAL_TYPE). */
export const DEAL_TYPE = 'FX'

/** BUKRS + RFHA as one map key. */
export const transactionKey = (companyCode: string, transaction: string): string => `${companyCode}::${transaction}`

const clip = (v: string, n: number): string => v.trim().slice(0, n)

/** Drops blank values and cuts each to the length the service stores, so a long remark cannot fail the whole save. */
export function cleanFields(fields: AppStrFields): AppStrFields {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || !value.trim()) continue
    out[name] = clip(value, LENGTH[name as keyof AppStrFields] ?? 255)
  }
  return out as AppStrFields
}

const NDF_TYPES = new Set(['NDF', 'DNDF'])

/**
 * The application fields a row can supply today. A field the row does not carry is simply absent:
 * Deal ID / Master Contract appear once the row has them, the FO / MO remarks only on NDF rows that
 * have them (Upload rows), and nothing is invented for the rest.
 */
export function fieldsOfRow(r: BlotterRow): AppStrFields {
  const hasDeal = !!r.dealId
  return cleanFields({
    ...(hasDeal ? { ZtsfDealType: DEAL_TYPE, ZtsfDealID: r.dealId } : {}),
    ZtsfMcRefNo: r.mcRef,
    ZtsfDealDesc: r.dealDescription ?? '',
    ZtsfDealSq: r.dealSequence ?? '',
    ...(NDF_TYPES.has(r.txnType) ? { NdfFoRem: r.foRemark ?? '', NdfMoRem: r.moRemark ?? '' } : {}),
  })
}

const keyOf = (companyCode: string, transaction: string): Record<string, string> => ({
  CompanyCode: companyCode,
  FinancialTransaction: transaction,
})
const pathOf = (companyCode: string, transaction: string): string =>
  appApi(entityPath('TrmFxApp', keyOf(companyCode, transaction)))

// ---------------------------------------------------------------- reads

/** Transactions per request: the filter is one `(CompanyCode eq .. and FinancialTransaction eq ..)` per key. */
const CHUNK = 25

/** The application data of the given transactions, matched on company code AND transaction number. */
export async function loadAppStrRecords(
  txns: ReadonlyArray<{ CompanyCode: string; FinancialTransaction: string }>,
  signal?: AbortSignal,
): Promise<AppStrRecord[]> {
  const chunks: Array<typeof txns> = []
  for (let i = 0; i < txns.length; i += CHUNK) chunks.push(txns.slice(i, i + CHUNK))
  const pages = await Promise.all(
    chunks.map((chunk) =>
      list<AppStrRecord>(
        APP,
        {
          filter: chunk
            .map((t) => `(CompanyCode eq ${odataString(t.CompanyCode)} and FinancialTransaction eq ${odataString(t.FinancialTransaction)})`)
            .join(' or '),
          top: CHUNK,
        },
        signal ? { signal } : undefined,
      ),
    ),
  )
  return pages.flat()
}

/** One transaction's record, or null when it has none yet. */
export async function getAppStrRecord(companyCode: string, transaction: string): Promise<AppStrRecord | null> {
  try {
    return (await apiFetch<AppStrRecord>(pathOf(companyCode, transaction))) ?? null
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

// ---------------------------------------------------------------- writes

export async function createAppStrRecord(companyCode: string, transaction: string, fields: AppStrFields): Promise<void> {
  await apiFetch(APP, { method: 'POST', body: { ...keyOf(companyCode, transaction), ...cleanFields(fields) } })
}

/**
 * PATCH by composite key. `If-Match: *` because the service guards LocalLastChangedAt as its ETag and the
 * blotter's change is a status / field overwrite, not an edit made against a version the user was looking at.
 */
export async function updateAppStrRecord(companyCode: string, transaction: string, fields: AppStrFields): Promise<void> {
  await apiFetch(pathOf(companyCode, transaction), {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: cleanFields(fields),
  })
}

/**
 * Why the status is being written, which decides how it meets the status already stored:
 *   create    a new transaction: an existing record keeps its status (a retried create never moves it back)
 *   release   Release to MO: 03, unless the transaction is already past FO (07, a fixing status, ...)
 *   reverse   FO delete / reverse: the given status, always
 */
export type AppStrIntent = 'create' | 'release' | 'reverse'

export function resolveStatus(intent: AppStrIntent, current: string | undefined, wanted: string): string {
  if (intent === 'reverse') return wanted
  if (intent === 'release') return statusAfterRelease(current)
  return current?.trim() ? current : wanted
}

/**
 * Writes a transaction's application data: updates the record when it exists, creates it when it does not.
 * Looking first is what keeps a retry from making a second record, and what lets the status rules above
 * see the status that is really stored.
 */
export async function saveAppStr(
  companyCode: string,
  transaction: string,
  fields: AppStrFields,
  intent: AppStrIntent,
  wantedStatus: string,
): Promise<void> {
  const existing = await getAppStrRecord(companyCode, transaction)
  const body = { ...fields, TxnStatus: resolveStatus(intent, existing?.TxnStatus, wantedStatus) }
  if (existing) return updateAppStrRecord(companyCode, transaction, body)
  try {
    await createAppStrRecord(companyCode, transaction, body)
  } catch (e) {
    // Someone created it between the read and the write: the record exists now, so update it.
    if (e instanceof ApiError && (e.status === 409 || e.status === 412)) return updateAppStrRecord(companyCode, transaction, body)
    throw e
  }
}

// ---------------------------------------------------------------- merge

type Incoming = Omit<BlotterRow, 'id' | 'seq'>

/**
 * Deals read from SAP with their application data put back, matched on BUKRS + RFHA. The stored TXN_STATUS
 * is authoritative for how far a deal has got: a deal SAP reports as Created turns Released when its status
 * says it went to MO (03, 07, ...). SAP's own word that a deal was reversed is never overridden, and a status
 * that shows as Created / Reversed never changes what SAP reports.
 */
export function applyAppStr<T extends Incoming>(incoming: readonly T[], records: readonly AppStrRecord[]): T[] {
  const byKey = new Map(records.map((r) => [transactionKey(r.CompanyCode, r.FinancialTransaction), r]))
  return incoming.map((row) => {
    const rec = byKey.get(transactionKey(row.companyCode ?? '', row.transactionNumber))
    if (!rec) return row
    const stage = blotterStageOf(rec.TxnStatus)
    const next: T = { ...row }
    if (rec.TxnStatus) next.txnStatus = rec.TxnStatus
    if (stage === 'RELEASED' && row.status === 'CREATED') next.status = 'RELEASED'
    if (rec.ZtsfDealID && !row.dealId) next.dealId = rec.ZtsfDealID
    if (rec.ZtsfMcRefNo && !row.mcRef) next.mcRef = rec.ZtsfMcRefNo
    if (rec.ZtsfDealDesc && !row.dealDescription) next.dealDescription = rec.ZtsfDealDesc
    return next
  })
}
