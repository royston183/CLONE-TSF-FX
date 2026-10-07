import { apiFetch, createEntity, service } from '@slc/api-client'
import { isBackendUnreachable, writeWithFallback } from '../../shared/fallback.ts'
import { fieldOf, mwCreate, mwList, mwUpdate } from '../../shared/middleware.ts'
import type { ColumnLimit, UploadLimits } from './validation.ts'
import { TF_FIELD_MAP, buildBlPayload, buildRowPayload, createKey, isCreateRow, padKey } from './fields.ts'
import type { BusinessUnit, CommodityRow } from './fields.ts'
import type { CellValue } from './xlsx.ts'

const tfApi = service('tf')

/**
 * Business units, from ZSGTSFTR_BU in MySQL.
 *
 * They used to come from the legacy page's embedded payload, and that copy had gone stale: it
 * listed six units where the master holds ten, so Cocoa, Cashew, Almond and Coffee (B04,
 * B07-B09) could not be selected and their trade flows could not be uploaded at all.
 *
 * No SAP OData set exposes business units, so there is nothing to fall back to. A failed read
 * yields no units and the upload cannot start — which is the honest outcome: an upload needs a
 * real business unit, and offering a remembered list is how the stale one happened.
 */
export async function loadBusinessUnits(signal?: AbortSignal): Promise<BusinessUnit[]> {
  const rows = await mwList<{ ZbuId?: string; ZbuName?: string }>('businessUnit', undefined, signal)
  return rows
    .filter((r) => r.ZbuId)
    .map((r) => ({ code: String(r.ZbuId).trim(), name: String(r.ZbuName ?? '').trim() }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Commodity master, exposed by the same service as TrdFlow. A failure yields an empty list:
 * the enrichment it feeds is optional, and losing it must not stop an upload.
 *
 * Deliberately still read from SAP, although ZSGTSFTR_COMODIT is now in MySQL. The two are not
 * the same data. The upload matches the workbook's commodity text against ZCH_NAME1 and
 * ZCH_NAME2 and copies both onto the trade flow; COMODIT carries neither column, and nothing
 * in MySQL does — the table behind this entity set has not been migrated. Only the id agrees
 * (both are data element ZSGTSFDT_COMDTY). Pointing this at COMODIT would match nothing and
 * silently drop the commodity enrichment from every uploaded row.
 */
export async function loadCommodities(): Promise<CommodityRow[]> {
  return apiFetch<{ value?: CommodityRow[] }>(tfApi('ChComm'))
    .then((data) => data?.value ?? [])
    .catch(() => [])
}

/**
 * Confirms the middleware will issue Trade Flow IDs before any create is sent, and throws if
 * it will not.
 *
 * This is not a formality. A middleware with no range for tradeFlow does not reject a create
 * whose ZTF_NO is blank — it stores the blank as the key, since a blank key component is a
 * legitimate value elsewhere (Deal ID's ZSBLC_TXN). Every new trade flow would then be written
 * under the same empty Trade Flow ID. So the range is asked for, not assumed.
 *
 * An unreachable middleware passes: the creates will fall back to SAP, which numbers its own.
 */
export async function assertTradeFlowNumbering(): Promise<void> {
  const ranges: Array<{ resource: string; field: string; what: string }> = [
    { resource: 'tradeFlow', field: 'ZTF_NO', what: 'Trade Flow ID' },
    { resource: 'billOfLading', field: 'ZBL_NO', what: 'BL number' },
  ]
  for (const { resource, field, what } of ranges) {
    let meta: { numberRange?: { field?: string; initialised?: boolean } | null } | undefined
    try {
      meta = await apiFetch(service('middleware')(`meta/resources/${resource}`))
    } catch (error) {
      if (isBackendUnreachable(error)) return
      throw error
    }
    if (meta?.numberRange?.field !== field || meta.numberRange.initialised === false) {
      throw new Error(
        `Not uploaded: the middleware has no ${what} number range, so this row would be stored ` +
          'without one. Put the range in place (npm run registry:publish -- range) and upload again.',
      )
    }
  }
}

/** What one uploaded row became, for the Status column. A create also names its BL. */
export type UploadOutcome = { action: 'created' | 'updated'; tfNo: string; split: string; blNo?: string }

/**
 * A trade flow that was created while its BL was not. The two are separate writes — the
 * middleware has no delete to undo the first — so this is reported, with the Trade Flow ID,
 * rather than retried or hidden.
 */
export class BlNotCreatedError extends Error {
  constructor(
    readonly tfNo: string,
    readonly split: string,
    cause: unknown,
  ) {
    super(
      `Trade flow ${tfNo} / ${split} was created, but its BL was not: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    )
    this.name = 'BlNotCreatedError'
  }
}

/**
 * Uploads one row. A blank Trade Flow ID creates; anything else updates the existing row,
 * addressed by its zero-padded key.
 *
 * Both follow the standard write policy: ZSGTSFTR_TRDFLOW in MySQL first, SAP OData only when
 * the middleware cannot be reached. A row the middleware answers and rejects — including
 * ROW_NOT_FOUND for a trade flow not yet migrated — is not replayed to SAP.
 *
 * A create sends ZTF_NO blank, which makes the middleware draw the next number from the range
 * mirroring SNRO object ZSGTSFNR01 (3000000001-3999999999, the full width of the VARCHAR(10)
 * key), atomically with the insert. Nothing here picks a number, and no row is ever written
 * under a number issued to another row — see createKey.
 */
export async function uploadRow(
  row: readonly CellValue[],
  buCode: string,
  tfTypeCode: string,
  businessUnits: readonly BusinessUnit[],
  commodities: readonly CommodityRow[],
): Promise<UploadOutcome> {
  const isCreate = isCreateRow(row)
  const body = buildRowPayload(row, buCode, tfTypeCode, isCreate, businessUnits, commodities)

  if (isCreate) {
    const newKey = createKey()
    // The TF date is the upload date. SAP's create stamps today's date; a workbook that states
    // one keeps it.
    if (!body['ZtfDate']) body['ZtfDate'] = todayIso()

    const tfNo = await writeWithFallback(
      async () => {
        const { key, assignedNumber } = await mwCreate('tradeFlow', { ...body, ...newKey })
        return assignedNumber ?? key['ZTF_NO'] ?? ''
      },
      // Only when the middleware could not be contacted: SAP issues its own number.
      async () => (await createEntity(tfApi('TrdFlow'), body, 'ZtfNo')).key ?? '',
      'TrdFlow create',
    )
    if (!tfNo) throw new Error('The trade flow was created but no Trade Flow ID came back.')

    // Then its BL, under a BL number of its own. If the trade flow only got written by falling
    // back to SAP, the middleware is unreachable, so this fails too and the row says exactly
    // that: trade flow created, BL not.
    let blNo: string
    try {
      const { key, assignedNumber } = await mwCreate('billOfLading', buildBlPayload(body, tfNo, newKey.ZtfSplit))
      blNo = assignedNumber ?? key['ZBL_NO'] ?? ''
    } catch (error) {
      throw new BlNotCreatedError(tfNo, newKey.ZtfSplit, error)
    }
    return { action: 'created', tfNo, split: newKey.ZtfSplit, blNo }
  }

  const ztfNo = padKey(row[0], 10)
  const ztfSplit = padKey(row[1], 2)
  if (!ztfSplit) throw new Error('Missing TF Split ID')

  const odataKey = `TrdFlow(ZtfNo='${encodeURIComponent(ztfNo)}',ZtfSplit='${encodeURIComponent(ztfSplit)}')`
  await writeWithFallback(
    () => mwUpdate('tradeFlow', { ZtfNo: ztfNo, ZtfSplit: ztfSplit }, body),
    () => apiFetch(tfApi(odataKey), { method: 'PATCH', body }).then(() => undefined),
    'TrdFlow',
  )
  return { action: 'updated', tfNo: ztfNo, split: ztfSplit }
}

/** Today in local time as YYYY-MM-DD — the calendar day the user is uploading on. */
function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Keeps the connection dot honest while the user is idle. Pings the middleware, which is this
 * screen's primary backend for business units and trade flow updates.
 */
export async function pingBackend(): Promise<void> {
  await apiFetch(service('middleware')('meta/resources')).catch(() => undefined)
}

export { TF_FIELD_MAP }

type MetaColumn = { name: string; codec: string; maxLength: number | null; precision: number | null; scale: number | null }

/**
 * The column limits the pre-upload check enforces, read from the middleware's metadata for the
 * two tables an upload writes. Null when the metadata cannot be read: the check then steps
 * aside and the middleware's own validation, which runs regardless, is what reports.
 */
export async function loadUploadLimits(signal?: AbortSignal): Promise<UploadLimits | null> {
  const read = async (resource: string): Promise<Map<string, ColumnLimit>> => {
    const meta = await apiFetch<{ columns?: MetaColumn[] }>(
      service('middleware')(`meta/resources/${resource}`),
      signal ? { signal } : undefined,
    )
    return new Map(
      (meta?.columns ?? []).map((c) => [
        fieldOf(c.name),
        { column: c.name, codec: c.codec, maxLength: c.maxLength, precision: c.precision, scale: c.scale },
      ]),
    )
  }
  try {
    const [tradeFlow, billOfLading] = await Promise.all([read('tradeFlow'), read('billOfLading')])
    return tradeFlow.size ? { tradeFlow, billOfLading } : null
  } catch {
    return null
  }
}
