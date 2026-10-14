import { service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { toISO } from './format.ts'
import { workingDaysBack } from './logic.ts'
import type { BlotterRow } from './types.ts'

/**
 * The deal fields the legacy Auto Deal / blotter (ZSGTSF_PFX_BLOTTER, BAPI_FTR_FXT_ORDERCREATE) saves that the
 * first blotter version did not send: Business Area, Profit Center, Portfolio, Mode of Trade (the BAPI's
 * ASSIGNMENT), the NDF fixing date / reference / currency, and the TSF code, group and currency pair that the
 * legacy program wrote through ZSGTRMFM_VTBFHA_EXPORT.
 *
 * Two safeguards, so that this can never stop a deal being booked:
 *
 *   1. EXTENDED_DEAL_FIELDS below. Setting it to false makes every payload exactly what it was before this file.
 *   2. A field is sent only when the live service's $metadata declares it. The services did not declare most of
 *      these when this was written, so until the SAP team adds them nothing new goes out; once they do, the
 *      next page load sends them. The property names SAP will choose are not known, so each field lists the
 *      likely spellings and the first one the service declares is used.
 */
export const EXTENDED_DEAL_FIELDS = true

/** Off while the Fixing Reference ID has configuration issues in SAP: only the NDF fixing date goes out. */
export const SEND_FIXING_REFERENCE = false

/** TSF_CODE the legacy blotter stamps on every transaction it creates. */
export const TSF_CODE = 'DE6'
/** The portfolio the legacy program falls back to when none is given. */
export const DEFAULT_PORTFOLIO = '1000'
/**
 * Whether a deal with no real portfolio is booked under DEFAULT_PORTFOLIO. Off until 1000 is confirmed to exist in
 * every company code: SAP refuses a portfolio the company code does not define ("Portfolio X in company code Y not defined").
 */
export const SEND_DEFAULT_PORTFOLIO = false
/** The blotter's own Portfolio dropdown holds only this placeholder (data.ts PORTFOLIOS); it is not a SAP portfolio. */
export const PLACEHOLDER_PORTFOLIO = 'TRADING'

/** The portfolio to send for a row, or '' to leave it to SAP. */
export function portfolioOf(r: Pick<BlotterRow, 'portfolio'>): string {
  const p = r.portfolio?.trim() ?? ''
  if (p && p !== PLACEHOLDER_PORTFOLIO) return p
  return SEND_DEFAULT_PORTFOLIO ? DEFAULT_PORTFOLIO : ''
}

// ---------------------------------------------------------------- what the services declare

/** Entity-type property names of a service's $metadata, for the first entity type whose name starts with `typePrefix`. */
export function declaredProperties(xml: string, typePrefix: string): ReadonlySet<string> {
  const type = new RegExp(`<EntityType\\s+Name="${typePrefix}[^"]*"[\\s\\S]*?</EntityType>`).exec(xml)?.[0] ?? ''
  return new Set([...type.matchAll(/<Property\s+Name="([^"]+)"/g)].map((m) => m[1] ?? ''))
}

const probes = new Map<string, Promise<ReadonlySet<string>>>()

/** Read once per page load; a failed read declares nothing and is tried again next time. */
function propertiesOf(serviceKey: string, typePrefix: string): Promise<ReadonlySet<string>> {
  const key = `${serviceKey}/${typePrefix}`
  let probe = probes.get(key)
  if (!probe) {
    probe = fetch(service(serviceKey)('$metadata'), { headers: { accept: 'application/xml' }, credentials: 'same-origin' })
      .then(async (res) => (res.ok ? declaredProperties(await res.text(), typePrefix) : new Set<string>()))
      .catch(() => new Set<string>())
    probes.set(key, probe)
    void probe.then((props) => {
      if (!props.size) probes.delete(key)
    })
  }
  return probe
}

/** Test hook: forget what the services declared. */
export const forgetDeclaredProperties = (): void => probes.clear()

/** The first of `names` the service declares, or undefined. */
const declared = (props: ReadonlySet<string>, names: readonly string[]): string | undefined => names.find((n) => props.has(n))

// ---------------------------------------------------------------- name -> code

/**
 * The comp master (ZSGTSFTR_COMP) carries the profit centre and business area as names for the dropdowns and
 * as codes for SAP. A row holds the name; SAP wants the code. A name that appears under two codes keeps the first.
 */
export type AreaCodes = { profitCenters: Record<string, string>; businessAreas: Record<string, string> }

export function toAreaCodes(rows: readonly FxRow[]): AreaCodes {
  const profitCenters: Record<string, string> = {}
  const businessAreas: Record<string, string> = {}
  const add = (into: Record<string, string>, name: string, code: string) => {
    if (name && code && !(name in into)) into[name] = code
  }
  for (const r of rows) {
    add(profitCenters, txt(r, 'ZFX_PC_NAME'), txt(r, 'ZFX_PRCTR'))
    add(businessAreas, txt(r, 'ZBA_NAME'), txt(r, 'ZRBUSA'))
    add(businessAreas, txt(r, 'ZBA_NAME_O'), txt(r, 'ZRBUSA_O'))
    add(businessAreas, txt(r, 'ZBA_NAME_B'), txt(r, 'ZRBUSA_B'))
  }
  return { profitCenters, businessAreas }
}

/** Filled by installMasters. */
export const AREA_CODES: AreaCodes = { profitCenters: {}, businessAreas: {} }

export function installAreaCodes(codes: AreaCodes): void {
  for (const k of ['profitCenters', 'businessAreas'] as const) {
    for (const name of Object.keys(AREA_CODES[k])) delete AREA_CODES[k][name]
    Object.assign(AREA_CODES[k], codes[k])
  }
}

// ---------------------------------------------------------------- derived values

/** The fixing date the row names, else two working days before its value date, which is what SAP itself defaults to. */
export function fixingDateOf(r: Pick<BlotterRow, 'ndfDate' | 'valueDate'>): Date | null {
  if (r.ndfDate) return r.ndfDate
  return r.valueDate ? workingDaysBack(r.valueDate, 2) : null
}

const isNdf = (r: Pick<BlotterRow, 'txnType'>): boolean => r.txnType === 'NDF' || r.txnType === 'DNDF'

// ---------------------------------------------------------------- the payload additions

/** FxTransaction property -> the spellings the SAP team may give it. */
const FX_NAMES = {
  businessArea: ['BusinessArea', 'Rbusa'],
  profitCenter: ['ProfitCenter', 'Prctr'],
  assignment: ['Assignment', 'Zuond'],
  ndfFixingDate: ['NdfFixingDate', 'NdfDate'],
  fixingReferenceId: ['FixingReferenceId', 'NdfRef', 'FixingRefId'],
  externalReference: ['ExternalReference', 'Nordext'],
  financeProject: ['FinanceProject'],
  remark: ['Characteristics'],
} as const

/**
 * What to add to the create POST for a row: Portfolio when the row has a real one, every other field only when the
 * service declares it and the row has a value.
 */
export async function extendCreatePayload(payload: Record<string, unknown>, r: BlotterRow): Promise<Record<string, unknown>> {
  if (!EXTENDED_DEAL_FIELDS) return payload
  const out: Record<string, unknown> = { ...payload }
  const props = await propertiesOf('fx', 'FxTransaction')
  const put = (names: readonly string[], value: unknown) => {
    const name = declared(props, names)
    if (name && value !== undefined && value !== null && value !== '') out[name] = value
  }
  const portfolio = portfolioOf(r)
  if (portfolio) out['Portfolio'] = portfolio
  put(FX_NAMES.businessArea, AREA_CODES.businessAreas[r.businessArea ?? ''] ?? (r.uploaded ? r.businessArea : undefined))
  put(FX_NAMES.profitCenter, AREA_CODES.profitCenters[r.profitCenter ?? ''] ?? (r.uploaded ? r.profitCenter : undefined))
  put(FX_NAMES.assignment, r.assignment?.trim())
  if (r.uploaded) {
    put(FX_NAMES.externalReference, r.externalReference)
    put(FX_NAMES.financeProject, r.financeProject)
    put(FX_NAMES.remark, r.notes)
  }
  if (isNdf(r)) {
    const fixing = fixingDateOf(r)
    put(FX_NAMES.ndfFixingDate, fixing ? toISO(fixing) : '')
    if (SEND_FIXING_REFERENCE) put(FX_NAMES.fixingReferenceId, r.ndfRef?.trim())
  }
  return out
}

/** TrmFxApp property -> spellings. */
const APP_NAMES = {
  tsfCode: ['ZtsfCode', 'TsfCode', 'Ztsfcode'],
  group: ['Zgrp', 'Grp', 'Group'],
  currencyPair: ['Zcpair', 'Cpair', 'CurrencyPair'],
} as const

/** The TSF code, group and currency pair a row's application record should carry, under the names the service declares. */
export async function extendedAppFields(r: BlotterRow, pair: string): Promise<Record<string, string>> {
  if (!EXTENDED_DEAL_FIELDS) return {}
  const props = await propertiesOf('trmfxapp', 'TrmFxApp')
  const out: Record<string, string> = {}
  const put = (names: readonly string[], value: string) => {
    const name = declared(props, names)
    if (name && value) out[name] = value
  }
  put(APP_NAMES.tsfCode, TSF_CODE)
  put(APP_NAMES.group, r.group)
  put(APP_NAMES.currencyPair, pair)
  return out
}
