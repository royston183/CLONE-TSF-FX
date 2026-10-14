import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { FX_TXN_STATUS, statusAfterReverse } from '../../shared/fx/txn-status.ts'
import {
  companyCodeOf,
  createDeal,
  createSpotDeal,
  loadDeals,
  reverseDeal,
  sapMessage,
  toCreatePayload,
  type FxTransaction,
} from './api.ts'
import {
  fieldsOfRow,
  loadAppStrRecords,
  saveAppStr,
  type AppStrFields,
  type AppStrIntent,
  type AppStrRecord,
} from './appStr.ts'
import { TRADERS } from './data.ts'
import { isInSap, traderCodeOf } from './dealIds.ts'
import { extendedAppFields } from './extendedFields.ts'
import { toISO } from './format.ts'
import type { AppDataPending, AutoSpotForm, BlotterRow } from './types.ts'

/**
 * The blotter's business operations. Each one runs the SAP Treasury operation first (the standard
 * FxTransaction service) and only then saves the application data (ZSGTSFTR_APP_STR). They are two
 * separate services, so the second can fail after the first has succeeded; that is reported, never
 * hidden, and never undone — the SAP transaction stays, and only the save is retried.
 */

/** A transaction SAP has booked, and whether its application data was saved. */
export type Booked = {
  companyCode: string
  transaction: string
  /** Set when the application data did not save; the SAP transaction exists regardless. */
  appDataPending?: AppDataPending
  appDataError?: string
}

const reasonOf = (e: unknown): string => sapMessage(e)

/** What the user is told when SAP did its part and the application data did not save. */
export function appDataMessage(transaction: string, doing: string, e: unknown): string {
  return `SAP transaction ${transaction} was ${doing} successfully, but the application data could not be saved (${reasonOf(e)}). It is saved again on the next Refresh; the SAP transaction is not repeated.`
}

type Target = { companyCode: string; transaction: string }

async function persist(
  t: Target,
  fields: AppStrFields,
  intent: AppStrIntent,
  status: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await saveAppStr(t.companyCode, t.transaction, fields, intent, status)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

// ---------------------------------------------------------------- trader

let traderMaster: Promise<FxRow[]> | undefined

/**
 * The trader (ZTRD_CODE / Ztrcode) of a transaction as SAP's ZSGTRMTR_TRADER knows it. The blotter's own
 * trader code is only a dropdown key, so the code is found by the trader's name, as the Deal ID does.
 * Nothing is written when the trader is not in the master or the master cannot be read: the save goes on without it.
 */
async function traderField(blotterTrader: string | undefined): Promise<AppStrFields> {
  const name = TRADERS.find((t) => t.code === blotterTrader)?.name ?? ''
  if (!name) return {}
  traderMaster ??= fxList('trmTrader', {}).catch((error: unknown) => {
    traderMaster = undefined
    throw error
  })
  try {
    const code = traderCodeOf(await traderMaster, name)
    return code ? { Ztrcode: code } : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------- create

/**
 * Books one deal in SAP and saves its application data with TXN_STATUS 01 (FO Create), keyed by the
 * company code and transaction number SAP returned. A failed SAP create throws, as createDeal does;
 * a failed application-data save does not — the result carries `appDataPending` so the row can be
 * shown as Created and the save retried without booking the deal again.
 */
export async function createBlotterDeal(r: BlotterRow, blotterDate: Date, options?: { initialStatus?: string; appProperties?: ReadonlySet<string> }): Promise<Booked> {
  const initialStatus = options?.initialStatus ?? FX_TXN_STATUS.FO_CREATE
  const payload = toCreatePayload(r)
  const created = await createDeal(r)
  const fields: AppStrFields = {
    ...fieldsOfRow(r),
    ...(await traderField(r.trader)),
    ...((await extendedAppFields(r, `${payload['LeadCurrency']}/${payload['FollowCurrency']}`)) as AppStrFields),
    ZtsfBcurr: String(payload['BuyCurrency'] ?? ''),
    ZtsfScurr: String(payload['SellCurrency'] ?? ''),
    BlotterDate: toISO(blotterDate),
  }
  const supported = options?.appProperties
    ? Object.fromEntries(Object.entries(fields).filter(([name]) => options.appProperties!.has(name))) as AppStrFields
    : fields
  const saved = await persist(created, supported, options?.appProperties ? 'upload' : 'create', initialStatus)
  return saved.ok
    ? created
    : { ...created, appDataPending: { intent: options?.appProperties ? 'upload' : 'create', ...(initialStatus !== FX_TXN_STATUS.FO_CREATE ? { status: initialStatus } : {}), ...(options?.appProperties ? { fields: supported as Record<string, string | boolean> } : {}) }, appDataError: appDataMessage(created.transaction, 'created', saved.error) }
}

/** The Create Spot popup's version of the same: one SAP spot, then its application data. */
export async function createBlotterSpot(form: AutoSpotForm, blotterDate: Date, blotterTrader?: string): Promise<Booked> {
  const created = await createSpotDeal(form)
  const fields: AppStrFields = {
    ...(await traderField(blotterTrader)),
    ZtsfBcurr: form.buyCurr,
    ZtsfScurr: form.sellCurr,
    BlotterDate: toISO(blotterDate),
  }
  const saved = await persist(created, fields, 'create', FX_TXN_STATUS.FO_CREATE)
  return saved.ok
    ? created
    : { ...created, appDataPending: { intent: 'create' }, appDataError: appDataMessage(created.transaction, 'created', saved.error) }
}

// ---------------------------------------------------------------- deal id / release

/** The Deal ID a transaction was given; what Assign / Create Deal ID persists. */
export type DealLink = { dealId: string; mcRef: string; dealDesc?: string }

export type SaveOutcome = { row: BlotterRow; ok: boolean; error?: string }

const dealFields = (link: DealLink | undefined): AppStrFields =>
  link
    ? {
        // ZTSF_DEAL_TYPE (D1 / D2) is the row's own leg, written by fieldsOfRow; it is never the Deal ID's type.
        ZtsfDealID: link.dealId,
        ZtsfMcRefNo: link.mcRef,
        ...(link.dealDesc ? { ZtsfDealDesc: link.dealDesc } : {}),
      }
    : {}

/**
 * Saves the Deal ID fields and moves each transaction to 03, FO -> MO Unmatched, which is what
 * "Released to MO" means. It runs after the Deal ID operation has succeeded and is a save on its
 * own: if it fails, retrying it never touches the Deal ID again. 07 (MO Match & Release) is never
 * written here, and a transaction already past FO keeps the status it has.
 */
export async function releaseBlotterRows(
  rows: readonly BlotterRow[],
  link: DealLink | undefined,
  blotterDate: Date,
): Promise<SaveOutcome[]> {
  const outs: SaveOutcome[] = []
  for (const row of rows) {
    if (!isInSap(row)) continue // a demo row has no SAP transaction to attach data to
    const fields: AppStrFields = { ...fieldsOfRow(row), ...(await traderField(row.trader)), ...dealFields(link), BlotterDate: toISO(blotterDate) }
    const saved = await persist(
      { companyCode: row.companyCode ?? '', transaction: row.transactionNumber },
      fields,
      'release',
      FX_TXN_STATUS.FO_TO_MO_UNMATCHED,
    )
    outs.push(saved.ok ? { row, ok: true } : { row, ok: false, error: appDataMessage(row.transactionNumber, 'released', saved.error) })
  }
  return outs
}

/** Saves the Deal ID fields alone, leaving the status at 01: an Auto Deal's legs have a Deal ID but are not released yet. */
export async function saveDealLink(rows: readonly BlotterRow[], link: DealLink, blotterDate: Date): Promise<SaveOutcome[]> {
  const outs: SaveOutcome[] = []
  for (const row of rows) {
    if (!isInSap(row)) continue
    const fields: AppStrFields = { ...fieldsOfRow(row), ...(await traderField(row.trader)), ...dealFields(link), BlotterDate: toISO(blotterDate) }
    const saved = await persist(
      { companyCode: row.companyCode ?? '', transaction: row.transactionNumber },
      fields,
      'create',
      FX_TXN_STATUS.FO_CREATE,
    )
    outs.push(saved.ok ? { row, ok: true } : { row, ok: false, error: appDataMessage(row.transactionNumber, 'linked to its Deal ID', saved.error) })
  }
  return outs
}

// ---------------------------------------------------------------- reverse

/**
 * Reverses the deal in SAP (a failure throws, and nothing is saved), then records it: 02 FO Delete for
 * a transaction still with FO, 05 FO Error Correction - Reverse for one already released to MO.
 */
export async function reverseBlotterDeal(
  row: BlotterRow,
  blotterDate: Date,
): Promise<{ status: string; pending?: AppDataPending; error?: string }> {
  const companyCode = companyCodeOf(row)
  await reverseDeal(companyCode, row.transactionNumber)
  const status = statusAfterReverse(row.status === 'RELEASED' ? 'RELEASED' : 'CREATED')
  const saved = await persist(
    { companyCode, transaction: row.transactionNumber },
    { ...fieldsOfRow(row), BlotterDate: toISO(blotterDate) },
    'reverse',
    status,
  )
  return saved.ok
    ? { status }
    : { status, pending: { intent: 'reverse', status }, error: appDataMessage(row.transactionNumber, 'reversed', saved.error) }
}

// ---------------------------------------------------------------- retry

/**
 * Saves again the application data that earlier failed to save, for the rows that owe it. Only the
 * save is repeated: the SAP transaction, release or reversal it belongs to is not.
 */
export async function retryPendingAppData(rows: readonly BlotterRow[], blotterDate: Date): Promise<SaveOutcome[]> {
  const outs: SaveOutcome[] = []
  for (const row of rows) {
    const pending = row.appDataPending
    if (!pending || !isInSap(row)) continue
    const wanted = pending.status ?? (pending.intent === 'reverse' ? FX_TXN_STATUS.FO_DELETE : pending.intent === 'settle' ? FX_TXN_STATUS.MO_MATCH_RELEASE : pending.intent === 'release' ? FX_TXN_STATUS.FO_TO_MO_UNMATCHED : FX_TXN_STATUS.FO_CREATE)
    const saved = await persist(
      { companyCode: row.companyCode ?? '', transaction: row.transactionNumber },
      pending.fields ?? { ...fieldsOfRow(row), ...(pending.intent === 'reverse' ? {} : await traderField(row.trader)), BlotterDate: toISO(row.uploadBlotterDate ?? blotterDate) },
      pending.intent,
      wanted,
    )
    outs.push(saved.ok ? { row, ok: true } : { row, ok: false, error: reasonOf(saved.error) })
  }
  return outs
}

// ---------------------------------------------------------------- load

/**
 * The day's deals from SAP with the application data that goes with them, read together. A failed
 * application-data read does not hide the deals — they are returned with `appDataError` so the screen
 * can say the Released state could not be read — but nothing is guessed in its place.
 */
export async function loadBlotterDeals(
  date: Date,
  signal?: AbortSignal,
): Promise<{ deals: FxTransaction[]; records: AppStrRecord[]; appDataError?: string }> {
  const deals = await loadDeals(date, signal)
  if (!deals.length) return { deals, records: [] }
  try {
    return { deals, records: await loadAppStrRecords(deals, signal) }
  } catch (e) {
    if (signal?.aborted) throw e
    return { deals, records: [], appDataError: reasonOf(e) }
  }
}
