import { apiFetch, createEntity, entityPath, list, odataString, service, toNum } from '@slc/api-client'
import { isBackendUnreachable, readWithFallback, writeWithFallback } from '../../shared/fallback.ts'
import { listDealIds, setDealStatus } from '../../shared/fx/deal-id.ts'
import { mwCreate, mwList, mwUpdate } from '../../shared/middleware.ts'
import { dealAssignedTotals, invoiceDetailChanges } from './bl.ts'
import type { BlSavePlan } from './bl.ts'
import type { BlInvoiceDetails, BlKey, BlRow, TrdFlowKey, TrdFlowRow } from './types.ts'

const tfApi = service('tf')

/**
 * The amounts the grid sums and formats. SAP's OData service returns them as numbers, but the
 * middleware carries DECIMAL as a string ('1250.50') so no precision is lost on the wire — and
 * subtotal() tests Number.isFinite, which does not coerce. Left as strings, every MySQL row
 * would silently contribute 0 to the subtotal.
 */
const NUMERIC_FIELDS = ['Zquantity', 'Zunit', 'Zcprice', 'Zttv', 'ZcpmAmt', 'Zamt'] as const

function normaliseNumbers(row: TrdFlowRow): TrdFlowRow {
  const out: TrdFlowRow = { ...row }
  for (const field of NUMERIC_FIELDS) {
    const value = row[field] as unknown
    if (value !== undefined && value !== null && value !== '') out[field] = toNum(value)
  }
  return out
}

/** Newest first, which is the order the OData call asked SAP for. */
function byTfNoDesc(a: TrdFlowRow, b: TrdFlowRow): number {
  return String(b.ZtfNo ?? '').localeCompare(String(a.ZtfNo ?? ''))
}

/**
 * The trade flow list: ZSGTSFTR_TRDFLOW in MySQL first, SAP's TrdFlow set as the fallback.
 *
 * The field names already agree — the CDS view camelises exactly as fieldOf() does, so all 45
 * fields this screen shows land in the same place from either source — and only the amounts
 * need normalising.
 *
 * An empty MySQL table is a legitimate answer for a transactional list, so it does not trigger
 * the fallback. A failure propagates: an empty table with no explanation is worse than an error
 * message, and the caller renders one.
 */
export async function loadTradeFlows(signal?: AbortSignal): Promise<TrdFlowRow[]> {
  return readWithFallback(
    async () => (await mwList<TrdFlowRow>('tradeFlow', undefined, signal)).map(normaliseNumbers).sort(byTfNoDesc),
    () => list<TrdFlowRow>(tfApi('TrdFlow'), { orderby: 'ZtfNo desc' }, signal ? { signal } : undefined),
    { label: 'TrdFlow' },
  )
}

/**
 * One trade flow as stored, read back after an update so the audit stamps the middleware wrote
 * (ZCHANGED_BY / DATE / TIME) reach the screen. Null when it cannot be read — the save itself
 * already succeeded, so this is never worth an error.
 */
export async function reloadTradeFlow(key: TrdFlowKey): Promise<TrdFlowRow | null> {
  try {
    const rows = await mwList<TrdFlowRow>('tradeFlow', { ZtfNo: key.ZtfNo, ZtfSplit: key.ZtfSplit })
    return rows[0] ? normaliseNumbers(rows[0]) : null
  } catch {
    return null
  }
}

/**
 * Updates one row: the middleware first, SAP only when the middleware cannot be reached.
 *
 * A row the middleware answers and rejects — including ROW_NOT_FOUND — is not replayed against
 * SAP, which is the write policy every console follows: replaying it would change a trade flow
 * in one store that the other says does not exist.
 */
export async function patchTradeFlow(key: TrdFlowKey, changes: Partial<TrdFlowRow>): Promise<void> {
  await writeWithFallback(
    () => mwUpdate('tradeFlow', { ...key }, changes),
    () => apiFetch(tfApi(entityPath('TrdFlow', { ...key })), { method: 'PATCH', body: changes }).then(() => undefined),
    'TrdFlow',
  )
}

/**
 * The SAP entity set BL Data 1 falls back to. UNCONFIRMED: the TF OData service documents only
 * TrdFlow and ChComm, no BL entity is recorded anywhere in this repository, and the SAP host is
 * unreachable from development, so the name cannot be checked here. It is kept in one place so
 * that confirming it — or pointing the fallback at the dynamic gateway instead — is one edit.
 */
export const SAP_BL_ENTITY_SET = 'TrdFlowBl'

const BL_NUMBERS = ['Zquantity', 'Zcprice', 'ZcpmAmt'] as const

function normaliseBl(row: BlRow): BlRow {
  const out: BlRow = { ...row }
  for (const field of BL_NUMBERS) {
    const value = row[field] as unknown
    if (value !== undefined && value !== null && value !== '') out[field] = toNum(value)
  }
  return out
}

/** BL order on screen: by BL number, then split, as the legacy grid listed them. */
function byBl(a: BlRow, b: BlRow): number {
  return (
    String(a.ZblNo ?? '').localeCompare(String(b.ZblNo ?? '')) ||
    String(a.ZblSplit ?? '').localeCompare(String(b.ZblSplit ?? ''))
  )
}

/**
 * The BLs of one trade flow split: ZSGTSFTR_BL in MySQL first, SAP only when the middleware
 * cannot answer.
 *
 * The legacy page never read these from anywhere — it rendered DUMMY_TRADEFLOWS[].blDetails —
 * so this is the first real source the tab has had. An empty list is a legitimate answer (a
 * trade flow with no BL yet) and does not trigger the fallback; a failure does.
 */
export async function loadBls(key: TrdFlowKey, signal?: AbortSignal): Promise<BlRow[]> {
  const rows = await readWithFallback(
    () => mwList<BlRow>('billOfLading', { ZtfNo: key.ZtfNo, ZtfSplit: key.ZtfSplit }, signal),
    () =>
      list<BlRow>(
        tfApi(SAP_BL_ENTITY_SET),
        { filter: `ZtfNo eq ${odataString(key.ZtfNo)} and ZtfSplit eq ${odataString(key.ZtfSplit)}` },
        signal ? { signal } : undefined,
      ),
    { label: 'BL' },
  )
  return rows.map(normaliseBl).sort(byBl)
}

/**
 * Total already-assigned amount per Deal ID, summed over every BL in the system rather than
 * one trade flow — read for the Assign Deal ID popup's Deal ID suggestions, which drop a Deal
 * ID once it has no remaining value. MySQL only, and it degrades to "nothing assigned" rather
 * than blocking the popup: this list is a convenience filter, not a validation the assignment
 * itself depends on.
 */
export async function loadDealAssignedTotals(signal?: AbortSignal): Promise<Map<string, number>> {
  const rows = await mwList<BlRow>('billOfLading', undefined, signal).catch(() => [] as BlRow[])
  return dealAssignedTotals(rows.map(normaliseBl))
}

/**
 * BL status text from ZSGTSFTR_BL_STAT (01 BL Created, 02 Assigned to Deal ID, ...). No SAP
 * OData set exposes it, so a failed read degrades to no text and the grid shows the code.
 */
export async function loadBlStatusText(signal?: AbortSignal): Promise<Map<string, string>> {
  const rows = await mwList<{ ZblStId?: string; ZblStName?: string }>('blStatus', undefined, signal)
  return new Map(rows.map((r) => [String(r.ZblStId ?? '').trim(), String(r.ZblStName ?? '').trim()]))
}

/** ZSGTSFTR_BL_STAT 02: BL assigned to a Deal ID, pending release for invoicing. */
export const BL_ASSIGNED_STATUS = '02'

/**
 * Assigns a Deal ID to one BL: ZDEAL_ID and status 02 on its ZSGTSFTR_BL row, MySQL first with
 * SAP only when the middleware cannot be reached.
 *
 * With the Deal ID and status 02 go the popup's Invoice Details (SO/PO date, invoice date, invoice
 * commodity, incoterms, exception notes, GT commodity) — the BL fields the Trade Invoice Workbench
 * builds its invoice lines from. Only entered values are written. A rejected write, a BL the
 * middleware cannot find included, is not replayed to SAP.
 */
export async function assignBlDeal(
  tfKey: TrdFlowKey,
  bl: BlKey,
  dealId: string,
  details?: BlInvoiceDetails,
): Promise<void> {
  const key = { ...tfKey, ...bl }
  const changes = { ...invoiceDetailChanges(details), ZdealId: dealId, ZblStatId: BL_ASSIGNED_STATUS }
  await writeWithFallback(
    () => mwUpdate('billOfLading', key, changes),
    () => apiFetch(tfApi(entityPath(SAP_BL_ENTITY_SET, key)), { method: 'PATCH', body: changes }).then(() => undefined),
    'BL assign',
  )
}

/** ZSGTSFTR_DEALID.ZDEAL_STAT 04: the Deal ID has a BL assigned to it (legacy BL_UPDATE). */
export const DEAL_ASSIGNED_STATUS = '04'

/**
 * Legacy BL_UPDATE's `UPDATE zsgtsftr_dealid SET zdeal_stat = '04' WHERE zdeal_id = ..`: once the
 * BL assignment is saved, the Deal ID moves to 04 (03 -> 04 on the first assignment). Like the
 * ABAP it is keyed on ZDEAL_ID alone, so every DEALID row of that Deal ID moves, and it does not
 * test the current status. Writing 04 again is harmless, so a retry is idempotent.
 *
 * Call it only after the BL rows are written: the assignment itself is Update, never the popup's
 * Assign button. Throws when the Deal ID cannot be found or a row cannot be written.
 */
export async function markDealAssigned(dealId: string, signal?: AbortSignal): Promise<void> {
  const rows = await listDealIds({ ZDEAL_ID: dealId }, signal)
  if (rows.length === 0) throw new Error(`Deal ID ${dealId} was not found in ZSGTSFTR_DEALID`)
  await setDealStatus(rows, DEAL_ASSIGNED_STATUS)
}

/** One document attached to a BL, as BL Data 1's document list shows it. */
export type BlDocumentRow = {
  blNo: string
  dmsCode: string
  standardDms: string
  name: string
  extension: string
  typeText: string
  description: string
}

type BlDmsRow = { ZblNo?: string; ZtsfDmsCode?: string; ZstndDms?: string }
type TsfDmsRow = {
  ZtsfDmsCode?: string
  ZstndDms?: string
  ZdmsCat?: string
  ZdocName?: string
  ZdocExtn?: string
  ZdocType?: string
  ZdocDesc?: string
}
type DmsTypeRow = { ZdmsCat?: string; ZdmsType?: string; ZdmsDesc?: string; ZdmsDdesc?: string }

const s = (v: unknown) => String(v ?? '').trim()

/**
 * Joins the three DMS tables into one list: ZSGTSFTR_BL_DMS says which DMS code each BL carries,
 * ZSGTSFTR_TSF_DMS holds the documents filed under that code, and ZSGTSFTR_DMS_TYP names their
 * type. A document with no TSF_DMS row still lists, by its code, rather than disappearing.
 */
export function joinBlDocuments(
  links: readonly BlDmsRow[],
  documents: readonly TsfDmsRow[],
  types: readonly DmsTypeRow[],
): BlDocumentRow[] {
  const typeText = new Map(types.map((t) => [`${s(t.ZdmsCat)}|${s(t.ZdmsType)}`, s(t.ZdmsDesc) || s(t.ZdmsDdesc)]))
  return links.flatMap((link) => {
    const code = s(link.ZtsfDmsCode)
    const standard = s(link.ZstndDms)
    const docs = documents.filter((d) => s(d.ZtsfDmsCode) === code && (!standard || s(d.ZstndDms) === standard))
    const base = { blNo: s(link.ZblNo), dmsCode: code, standardDms: standard }
    if (docs.length === 0) return [{ ...base, name: '', extension: '', typeText: '', description: '' }]
    return docs.map((d) => ({
      ...base,
      name: s(d.ZdocName),
      extension: s(d.ZdocExtn),
      typeText: typeText.get(`${s(d.ZdmsCat)}|${s(d.ZdocType)}`) || s(d.ZdocType),
      description: s(d.ZdocDesc),
    }))
  })
}

/**
 * The documents of the given BLs. MySQL only: no SAP OData set exposes the DMS tables, so a
 * failure is reported rather than masked by a fallback that does not exist.
 */
export async function loadBlDocuments(blNos: readonly string[], signal?: AbortSignal): Promise<BlDocumentRow[]> {
  const unique = [...new Set(blNos.map(s).filter(Boolean))]
  if (unique.length === 0) return []
  const links = (await Promise.all(unique.map((ZblNo) => mwList<BlDmsRow>('blDocument', { ZblNo }, signal)))).flat()
  if (links.length === 0) return []
  const codes = [...new Set(links.map((l) => s(l.ZtsfDmsCode)).filter(Boolean))]
  const [documents, types] = await Promise.all([
    Promise.all(codes.map((ZtsfDmsCode) => mwList<TsfDmsRow>('tsfDocument', { ZtsfDmsCode }, signal))).then((r) => r.flat()),
    mwList<DmsTypeRow>('dmsType', undefined, signal).catch(() => [] as DmsTypeRow[]),
  ])
  return joinBlDocuments(links, documents, types)
}

/**
 * Refuses to insert a BL without a number range: a middleware with none would store the blank
 * ZBL_NO as the key rather than draw one (see tf-upload's assertTradeFlowNumbering, which guards
 * the same thing for trade flows). An unreachable middleware passes — the SAP fallback numbers
 * its own.
 */
async function assertBlNumbering(): Promise<void> {
  let meta: { numberRange?: { field?: string; initialised?: boolean } | null } | undefined
  try {
    meta = await apiFetch(service('middleware')('meta/resources/billOfLading'))
  } catch (error) {
    if (isBackendUnreachable(error)) return
    throw error
  }
  if (meta?.numberRange?.field !== 'ZBL_NO' || meta.numberRange.initialised === false) {
    throw new Error('Not saved: the middleware has no BL number range, so a new BL would be stored without a BL ID.')
  }
}

/**
 * Writes BL Data 1's pending work to ZSGTSFTR_BL, MySQL first with SAP only when the middleware
 * cannot be reached: updates first (a split's source gives up its quantity before the split row
 * is written), then inserts. Returns each created row's own id on screen alongside the BL number
 * the range issued it, so a caller can tell which row a given number belongs to.
 */
export async function saveBlChanges(plan: BlSavePlan): Promise<Array<{ localId: string; blNo: string }>> {
  if (plan.inserts.some((i) => i.allocate)) await assertBlNumbering()
  for (const { key, changes } of plan.updates) {
    await writeWithFallback(
      () => mwUpdate('billOfLading', key, changes),
      () => apiFetch(tfApi(entityPath(SAP_BL_ENTITY_SET, key)), { method: 'PATCH', body: changes }).then(() => undefined),
      'BL update',
    )
  }
  const issued: Array<{ localId: string; blNo: string }> = []
  for (const { row, allocate, localId } of plan.inserts) {
    const number = await writeWithFallback(
      async () => {
        const { key, assignedNumber } = await mwCreate('billOfLading', row)
        return assignedNumber ?? key['ZBL_NO'] ?? ''
      },
      async () => (await createEntity(tfApi(SAP_BL_ENTITY_SET), row, 'ZblNo')).key ?? '',
      'BL create',
    )
    if (allocate) issued.push({ localId, blNo: number })
  }
  return issued
}
