import { list, odataString, service } from '@slc/api-client'
import type { FxTransaction } from '../../features/mo-fx-deal-confirmation/api.ts'

/**
 * ZSGTSFTR_APP_STR, read as the TrmFxApp entity of ZFS_SB_TRMFXAPP_O4_API (service "trmfxapp").
 *
 * It holds what SAP's FxTransaction has no field for: the VTBFHA append fields the legacy FX views
 * (ZSGTSFV_FX / ZSGTSFCDS_FX) carried — Deal ID / type / description, Master Contract reference,
 * TXN_STATUS, the NDF and option remarks, leg banks and currencies. Where a screen was waiting on
 * the middleware view "tsfvFx" because it lacked those columns, this is the source.
 *
 * A row belongs to its SAP transaction by CompanyCode (BUKRS) + FinancialTransaction (RFHA) TOGETHER:
 * the transaction number alone repeats across company codes.
 *
 * READ ONLY. Writes live in features/fx-blotter/appStr.ts and features/mo-confirm-fx-deal-id/analysis.ts,
 * where the status rules (resolveStatus) are enforced; nothing here writes TXN_STATUS.
 *
 * What is NOT here and still has no source: the bank-posting documents (BKPF), the house-bank masters
 * (T012*), ZSGTSFCDS_* utilisation views, the option service, and every BAPI / report / e-mail action.
 */
const APP = service('trmfxapp')('TrmFxApp')
const FX = service('fx')('FxTransaction')

/** Every field TrmFxApp serves (from the live service). Audit fields are service-filled. */
export type TrmFxApp = {
  CompanyCode: string
  FinancialTransaction: string
  ZtsfDealType?: string | null
  ZtsfDealID?: string | null
  ZtsfDealDesc?: string | null
  ZtsfMcRefNo?: string | null
  ZtsfExOptNo?: string | null
  ZtsfExSpotNo?: string | null
  ZtsfBcurr?: string | null
  ZtsfBhbkID?: string | null
  ZtsfBhktID?: string | null
  ZtsfScurr?: string | null
  ZtsfShbkID?: string | null
  ZtsfShktID?: string | null
  ZtsfExeCo?: boolean | null
  ZtsfAccCo?: boolean | null
  ZtsfBpayID?: string | null
  ZtsfSpayID?: string | null
  ZtsfRbukrs?: string | null
  ZtsfRpayID?: string | null
  ZtsfPbukrs?: string | null
  ZtsfPpayID?: string | null
  ZtsfTrftype?: string | null
  ZtsfTrftype2?: string | null
  ZtsfBnktype?: string | null
  ZtsfBnktype2?: string | null
  ZtsfDealSq?: string | null
  ZtsfPreMature?: boolean | null
  ZtsfUnwind?: boolean | null
  NdfFoRem?: string | null
  NdfMoRem?: string | null
  OptFoRem?: string | null
  OptMoRem?: string | null
  ZolamDealNo?: string | null
  /** FO_REMARK and REMARK (added to ZSGTSFTR_APP_STR). Property names assumed from the CDS naming; unverified against the live $metadata. */
  FoRemark?: string | null
  Remark?: string | null
  /** TXN_STATUS: the transaction's lifecycle (shared/fx/txn-status.ts). */
  TxnStatus?: string | null
  Ztrcode?: string | null
  /** yyyy-mm-dd */
  BlotterDate?: string | null
  LocalCreatedBy?: string | null
  LocalCreatedAt?: string | null
  LocalLastChangedBy?: string | null
  LocalLastChangedAt?: string | null
  LastChangedAt?: string | null
}

export type TxnKey = { CompanyCode: string; FinancialTransaction: string }

/** A transaction as SAP's FxTransaction reports it, with its application data when it has any. */
export type FxWithApp = { fx: FxTransaction; app: TrmFxApp }

/** BUKRS + RFHA as one map key. */
export const appKey = (companyCode: string, transaction: string): string => `${companyCode}::${transaction}`

/** Keys per request: one `(CompanyCode eq .. and FinancialTransaction eq ..)` per transaction. */
const KEY_CHUNK = 25
/** Rows per page when a filter can match more than one request returns. */
const PAGE = 500

/** `(CompanyCode eq 'A' and FinancialTransaction eq '1') or (...)`; '' for no keys. */
export function keysFilter(keys: readonly TxnKey[]): string {
  return keys
    .map((k) => `(CompanyCode eq ${odataString(k.CompanyCode)} and FinancialTransaction eq ${odataString(k.FinancialTransaction)})`)
    .join(' or ')
}

/** `TxnStatus eq '07' or TxnStatus eq '10'`; '' for no statuses. */
export function statusFilter(statuses: readonly string[]): string {
  return statuses.map((s) => `TxnStatus eq ${odataString(s)}`).join(' or ')
}

/** Joins filter clauses with `and`, each parenthesised so an inner `or` keeps its meaning; blanks are dropped. */
export function allOf(...clauses: Array<string | undefined>): string {
  return clauses
    .filter((c): c is string => !!c?.trim())
    .map((c) => `(${c})`)
    .join(' and ')
}

const chunked = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Every TrmFxApp row matching the filter (all of them for ''), paged so a large result is not cut off. */
export async function listTrmFxApp(filter = '', signal?: AbortSignal): Promise<TrmFxApp[]> {
  const rows: TrmFxApp[] = []
  for (let skip = 0; ; skip += PAGE) {
    const page = await list<TrmFxApp>(
      APP,
      { ...(filter ? { filter } : {}), orderby: 'CompanyCode,FinancialTransaction', top: PAGE, skip },
      signal ? { signal } : undefined,
    )
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** The application data of the given transactions, matched on company code AND transaction number. */
export async function loadTrmFxAppFor(keys: readonly TxnKey[], signal?: AbortSignal): Promise<TrmFxApp[]> {
  const pages = await Promise.all(
    chunked(keys, KEY_CHUNK).map((chunk) =>
      list<TrmFxApp>(APP, { filter: keysFilter(chunk), top: KEY_CHUNK }, signal ? { signal } : undefined),
    ),
  )
  return pages.flat()
}

/** SAP's FxTransaction for the given keys. Reversed deals (ActiveStatus 3) are returned; callers decide. */
export async function loadFxFor(keys: readonly TxnKey[], signal?: AbortSignal): Promise<FxTransaction[]> {
  const pages = await Promise.all(
    chunked(keys, KEY_CHUNK).map((chunk) =>
      list<FxTransaction>(FX, { filter: keysFilter(chunk), top: KEY_CHUNK }, signal ? { signal } : undefined),
    ),
  )
  return pages.flat()
}

/** A TrmFxApp row has no FxTransaction when SAP no longer serves the transaction; those are left out. */
export function joinFxWithApp(apps: readonly TrmFxApp[], fxRows: readonly FxTransaction[]): FxWithApp[] {
  const byKey = new Map(fxRows.map((f) => [appKey(f.CompanyCode, f.FinancialTransaction), f]))
  const out: FxWithApp[] = []
  for (const app of apps) {
    const fx = byKey.get(appKey(app.CompanyCode, app.FinancialTransaction))
    if (fx) out.push({ fx, app })
  }
  return out
}

/**
 * The replacement for a ZSGTSFV_FX worklist whose selection is on application data (TXN_STATUS, Deal ID,
 * NDF fields, blotter date): the TrmFxApp rows that match `appFilter`, each with its SAP transaction.
 * `appFilter` is an OData filter on TrmFxApp fields only, e.g. `statusFilter(['11'])`.
 */
export async function loadFxWithApp(appFilter: string, signal?: AbortSignal): Promise<FxWithApp[]> {
  const apps = await listTrmFxApp(appFilter, signal)
  if (!apps.length) return []
  return joinFxWithApp(apps, await loadFxFor(apps, signal))
}

/** Looks transactions up by key the other way round: SAP transactions first, each with its record if it has one. */
export async function attachTrmFxApp<T extends TxnKey>(
  fxRows: readonly T[],
  signal?: AbortSignal,
): Promise<Array<{ fx: T; app: TrmFxApp | undefined }>> {
  const apps = await loadTrmFxAppFor(fxRows, signal)
  const byKey = new Map(apps.map((a) => [appKey(a.CompanyCode, a.FinancialTransaction), a]))
  return fxRows.map((fx) => ({ fx, app: byKey.get(appKey(fx.CompanyCode, fx.FinancialTransaction)) }))
}
