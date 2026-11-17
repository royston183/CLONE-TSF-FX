import { apiFetch, odataString, service } from '@slc/api-client'
import type { FxFilter, FxRow } from './mw.ts'

/**
 * Reads of the two TSF resources from their own SAP OData V4 services instead of the middleware:
 *
 *   tsfDealId   ZSGTSFTR_DEALID   ZFS_SB_TRMTSFDEALID_O4_API   TrmTsfDealId   key ZdealID + ZdealType + ZsubType
 *   tsfvFx      ZSGTSFV_FX        ZFS_SB_TRMTSFFX_O4_API       TrmTsfFx       key CompanyCode + FinancialTransaction + ObjectReference
 *
 * The screens speak the SAP column names (ZDEAL_ID, BUKRS, RFHA …) and the middleware's filter syntax
 * (`ZMC_REF[in]`), so this module translates both ways: a filter becomes a $filter, a sort a $orderby,
 * and each OData property is renamed back to its column, with booleans as 'X' / '' and decimals as
 * strings, exactly the row shape the middleware serves. No screen has to change.
 *
 * Only reads go this way. Creating and changing a Deal ID stays on the middleware, which is the one
 * place those writes are proven.
 */

type Kind = 'str' | 'date' | 'time' | 'bool' | 'dec'
type Spec = {
  service: string
  entity: string
  /** OData property -> kind */
  props: Record<string, Kind>
  /** OData property -> the column the screens use, where the plain conversion would be wrong */
  columns?: Record<string, string>
}

const kinds = (kind: Kind, names: string): [string, Kind][] => names.split(' ').map((n) => [n, kind])

export const SPECS: Record<string, Spec> = {
  tsfDealId: {
    service: 'trmtsfdealid',
    entity: 'TrmTsfDealId',
    props: Object.fromEntries([
      ...kinds(
        'str',
        'ZdealID ZdealType ZsubType ZdealDesc ZfxInvModel ZmcRef ZtrdCode ZregionID ZdealRef ZtsfModel ' +
          'Zbukrs1 Zrfha1 Zbukrs2 Zrfha2 Zbukrs3 Zrfha3 Zbukrs4 Zrfha4 Zbukrs5 Zrfha5 Zbukrs6 Zrfha6 Zbukrs7 Zrfha7 Zbukrs8 Zrfha8 ' +
          'ZdealStat ZplCurr ZplLcurr ZmcCurrID ZmcCurrDesc ZdealCurrID ZdealCurrDesc ZcreatedBy ZchangedBy',
      ),
      ...kinds('date', 'ZsDate ZeDate ZrevDedate ZcreatedDate ZchangedDate'),
      ...kinds('time', 'ZcreatedTime ZchangedTime'),
      ...kinds('bool', 'Zconfirm Zdm Zss ZoverUtl'),
      ...kinds('dec', 'Zpl ZplRate ZplLamt ZdealAmt'),
    ]),
  },
  tsfvFx: {
    service: 'trmtsffx',
    entity: 'TrmTsfFx',
    props: Object.fromEntries([
      ...kinds(
        'str',
        'CompanyCode FinancialTransaction ObjectReference Saktiv Sgsart Butxt Ltx Sfhaart Xtext BpName Rfhazul Kontrh Rbusa BaName ' +
          'Rportb Xportb Zuonr Zuond AssignDesc Refer IntRefDesc Objnr Sfgtyp Sanlf Zwaers ZcomID Rdealer Gsppart Nordext NdfRef ' +
          'ZtsfDealDesc ZtsfDealID ZtsfMcRefNo ZtsfDealType ZtsfTrftype ZtsfTrftype2 ZtsfDealSq ZtsfBhbkID ZtsfBhktID ZtsfShbkID ZtsfShktID ' +
          'Bs BsO Bs1 Bs2 Curr1 Curr2 CurrSt1 CurrSt2 Cruser Upuser',
      ),
      ...kinds('date', 'Dblfz Delfz NdfDate Dcrdat Dupdat'),
      ...kinds('time', 'Tcrtim Tuptim'),
      ...kinds('bool', 'ZtsfPreMature ZtsfUnwind'),
      ...kinds('dec', 'Amt1 Amt2 ZamtSt1 ZamtSt2 Ospot Oswap OtotRate TRate'),
    ]),
    columns: { CompanyCode: 'BUKRS', FinancialTransaction: 'RFHA', ObjectReference: 'REFNR', TRate: 'T_RATE', Bs1: 'BS_1', Bs2: 'BS_2' },
  },
}

/** ZdealID -> ZDEAL_ID, ZtsfBhbkID -> ZTSF_BHBK_ID, Amt1 -> AMT1: a break before each capital that follows a lower-case letter or digit. */
export function columnOf(spec: Spec, property: string): string {
  return spec.columns?.[property] ?? property.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
}

const byColumn = new Map<string, Map<string, string>>()
function propertyOf(resource: string, column: string): string {
  let map = byColumn.get(resource)
  if (!map) {
    const spec = SPECS[resource]!
    map = new Map(Object.keys(spec.props).map((p) => [columnOf(spec, p), p]))
    byColumn.set(resource, map)
  }
  const property = map.get(column.toUpperCase())
  if (!property) throw new Error(`${resource} has no column ${column} in its OData service`)
  return property
}

/** One OData entity as a middleware row. */
export function toRow(resource: string, entity: Record<string, unknown>): FxRow {
  const spec = SPECS[resource]!
  const row: FxRow = {}
  for (const [property, value] of Object.entries(entity)) {
    const kind = spec.props[property]
    if (!kind) continue
    const column = columnOf(spec, property)
    if (value === null || value === undefined) row[column] = null
    else if (kind === 'bool') row[column] = value ? 'X' : ''
    else row[column] = String(value)
  }
  return row
}

function literal(kind: Kind, raw: string): string {
  switch (kind) {
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`'${raw}' is not a date`)
      return raw
    case 'time':
      if (!/^\d{2}:\d{2}:\d{2}$/.test(raw)) throw new Error(`'${raw}' is not a time`)
      return raw
    case 'bool':
      return raw === 'X' || raw === 'true' ? 'true' : 'false'
    case 'dec':
      if (raw.trim() === '' || !Number.isFinite(Number(raw))) throw new Error(`'${raw}' is not a number`)
      return String(Number(raw))
    default:
      return odataString(raw)
  }
}

const COMPARE: Record<string, string> = { eq: 'eq', ne: 'ne', gt: 'gt', gte: 'ge', lt: 'lt', lte: 'le' }

function condition(resource: string, key: string, raw: string): string {
  const match = /^([A-Za-z0-9_]+)(?:\[(\w+)\])?$/.exec(key)
  if (!match) throw new Error(`Unreadable filter key ${key}`)
  const property = propertyOf(resource, match[1]!)
  const kind = SPECS[resource]!.props[property]!
  const op = match[2] ?? 'eq'
  const empty = raw === '' && kind !== 'str'
  if (op === 'isNull') return `${property} eq null`
  if (op === 'isNotNull') return `${property} ne null`
  if (op in COMPARE) {
    if (empty) return `${property} ${op === 'eq' ? 'eq' : 'ne'} null`
    return `${property} ${COMPARE[op]} ${literal(kind, raw)}`
  }
  if (op === 'in') {
    const values = raw.split(',').map((v) => v.trim()).filter((v) => v !== '')
    if (!values.length) throw new Error(`${key} has no values`)
    return `(${values.map((v) => `${property} eq ${literal(kind, v)}`).join(' or ')})`
  }
  if (op === 'between') {
    const [from, to] = raw.split(',')
    if (from === undefined || to === undefined) throw new Error(`${key} needs two values`)
    return `(${property} ge ${literal(kind, from.trim())} and ${property} le ${literal(kind, to.trim())})`
  }
  if (op === 'like') {
    const start = raw.startsWith('%'), end = raw.endsWith('%')
    const text = raw.replace(/^%|%$/g, '')
    const arg = odataString(text)
    return start && end ? `contains(${property},${arg})` : end ? `startswith(${property},${arg})` : start ? `endswith(${property},${arg})` : `${property} eq ${arg}`
  }
  throw new Error(`Unsupported filter operator ${op}`)
}

export function toFilter(resource: string, filter: FxFilter): string {
  return Object.entries(filter).map(([key, raw]) => condition(resource, key, raw)).join(' and ')
}

/** 'a,-b' -> 'A asc,B desc' */
export function toOrderBy(resource: string, sort: string): string {
  return sort
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('-') ? `${propertyOf(resource, s.slice(1))} desc` : `${propertyOf(resource, s.replace(/^\+/, ''))} asc`))
    .join(',')
}

const PAGE = 500
const MAX_PAGES = 200

/** Every row of the resource that matches, paged until the service's own count is reached. */
export async function listFromOData(
  resource: string,
  filter: FxFilter,
  options: { sort?: string | undefined; signal?: AbortSignal | undefined },
): Promise<FxRow[]> {
  const spec = SPECS[resource]!
  const url = service(spec.service)(spec.entity)
  const $filter = toFilter(resource, filter)
  const $orderby = options.sort ? toOrderBy(resource, options.sort) : ''
  const rows: FxRow[] = []
  let total = Infinity
  for (let page = 0; page < MAX_PAGES && rows.length < total; page++) {
    const params = new URLSearchParams({ $top: String(PAGE), $skip: String(rows.length) })
    if (page === 0) params.set('$count', 'true')
    if ($filter) params.set('$filter', $filter)
    if ($orderby) params.set('$orderby', $orderby)
    const body = await apiFetch<{ value?: Record<string, unknown>[]; '@odata.count'?: number }>(
      `${url}?${params.toString()}`,
      options.signal ? { signal: options.signal } : undefined,
    )
    const batch = body?.value ?? []
    if (page === 0 && typeof body?.['@odata.count'] === 'number') total = body['@odata.count']
    rows.push(...batch.map((e) => toRow(resource, e)))
    if (!batch.length) break
  }
  return rows
}

const PROBE_MINUTES = 5
const probes = new Map<string, { at: number; ready: boolean }>()

/**
 * Whether the resource's OData service currently returns rows. A service SAP exposes but that answers
 * nothing (an authorization or access rule on the view, or no data yet) would blank every screen, so the
 * middleware keeps serving the reads until the service has data; one cheap request, re-checked every
 * few minutes, so the screens move over by themselves once SAP answers.
 */
export async function odataReadable(resource: string): Promise<boolean> {
  const spec = SPECS[resource]
  if (!spec || middlewareOnly) return false
  const known = probes.get(resource)
  if (known && Date.now() - known.at < PROBE_MINUTES * 60_000) return known.ready
  let ready = false
  try {
    const body = await apiFetch<{ value?: unknown[] }>(`${service(spec.service)(spec.entity)}?${new URLSearchParams({ $top: '1' }).toString()}`)
    ready = (body?.value?.length ?? 0) > 0
  } catch {
    ready = false
  }
  probes.set(resource, { at: Date.now(), ready })
  if (typeof console !== 'undefined') console.info(`[fx] ${resource}: reading from ${ready ? `OData ${spec.entity}` : 'the middleware (the OData service returned no rows)'}`)
  return ready
}

/** For tests. */
export function resetProbes(): void {
  probes.clear()
}

let middlewareOnly = false
/** For tests that stub every fetch: reads stay on the middleware and no probe request is made. */
export function useMiddlewareOnly(): void {
  middlewareOnly = true
}
