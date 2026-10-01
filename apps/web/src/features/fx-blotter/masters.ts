import { ApiError } from '@slc/api-client'
import { replaceInPlace, txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxFilter, type FxRow } from '../../shared/fx/mw.ts'
import { dateFromIso, num } from '../../shared/fx/sap.ts'
import { BUSINESS_AREAS, COMMODITIES, ENTITIES, FX_MODELS, PROFIT_CENTERS, pairOf } from './data.ts'
import type { CodeDesc, CodeLabel, Entity, FxModel, LegTemplate, MasterContract } from './types.ts'

/**
 * The masters the blotter reads from the middleware, instead of the constants that used to sit
 * in data.ts:
 *
 *   comp            ZSGTSFTR_COMP     entities, company codes, profit centres, business areas
 *   fxModel         ZSGTSFTR_RULE_BT  FX models
 *   commodity       ZSGTSFTR_COMODIT  commodities
 *   masterContract  ZSGTSFTR_MAS_CON  Master Contracts
 *   tolerance       ZSGTSFTR_TOLR     the Master Contract tolerance (ID T01)
 *
 * Unlike the other FX screens this does NOT fall back to dummy data when a read fails: a
 * blotter that quietly offered the wrong entities or contracts would book against them. A
 * failure is an error the screen shows, with a retry.
 *
 * Group, trader and business partner are deliberately not here — see the note in data.ts.
 */

// ---------------------------------------------------------------- settings read from the API

/** The tolerance the program reads as the Master Contract tolerance. */
export const MC_TOLERANCE_ID = 'T01'

/**
 * The Master Contract statuses a deal can be assigned to. ZSGTSFTR_MC_STAT reads 03 "Confirmed
 * by MO" and 04 "In Use"; every other status is a contract that has not been confirmed yet
 * (01, 02), is in correction (11, 12, 13, 21, 22) or has ended (09). This is an assumption
 * drawn from those descriptions, not something the API states — change it here if the SAP
 * blotter's rule differs.
 */
export const USABLE_MC_STATUSES = ['03', '04'] as const

/** Kept from the old FX_MODELS: no API column carries it. */
export const VALUE_DATE_TOLERANCE_DAYS = 5
/** The old list gave each model a spread in basis points; the API has no such column, so none is assumed. */
export const SPREAD_BP = 0

// ---------------------------------------------------------------- pure mappers

const unique = (values: readonly string[]): string[] => [...new Set(values.map((v) => v.trim()).filter(Boolean))]

/**
 * `code` is the entity (ZCOM_ID, e.g. OGA) that every row of the blotter stores; `cocode` is the
 * SAP company code (ZBUKRS, e.g. SG03) that goes to SAP. A row needs both to be usable.
 */
export function toEntities(rows: readonly FxRow[]): Entity[] {
  return rows
    .filter((r) => txt(r, 'ZCOM_ID') && txt(r, 'ZBUKRS'))
    .map((r) => ({
      code: txt(r, 'ZCOM_ID'),
      cocode: txt(r, 'ZBUKRS'),
      name: txt(r, 'ZBUTXT'),
      currency: txt(r, 'ZWAERS'),
      defaultProfitCenter: txt(r, 'ZFX_PC_NAME'),
      businessArea: txt(r, 'ZBA_NAME'),
    }))
}

/** The FX profit centre names (ZFX_PC_NAME), each once. */
export function toProfitCenters(rows: readonly FxRow[]): CodeLabel[] {
  return unique(rows.map((r) => txt(r, 'ZFX_PC_NAME'))).map((name) => ({ code: name, label: name }))
}

/**
 * Every business area name the company master carries for a deal: the company's own (ZBA_NAME)
 * and the two other sets a deal can be booked under (ZBA_NAME_O, ZBA_NAME_B), each once. The
 * _CT set belongs to another business (ICFS) and only repeats SINGAPORE.
 */
export function toBusinessAreas(rows: readonly FxRow[]): CodeLabel[] {
  return unique(rows.flatMap((r) => [txt(r, 'ZBA_NAME'), txt(r, 'ZBA_NAME_O'), txt(r, 'ZBA_NAME_B')])).map((name) => ({
    code: name,
    label: name,
  }))
}

export function toCommodities(rows: readonly FxRow[]): CodeDesc[] {
  return rows
    .filter((r) => txt(r, 'ZCOM_ID'))
    .map((r) => ({ code: txt(r, 'ZCOM_ID'), desc: txt(r, 'ZCOM_DESC') || txt(r, 'ZCOM_SDESC') }))
}

/** The value of the tolerance row with the given ID, or undefined when the API has none. */
export function toTolerance(rows: readonly FxRow[], id: string = MC_TOLERANCE_ID): number | undefined {
  const row = rows.find((r) => txt(r, 'ZTOL_ID') === id)
  return row ? num(row['ZTOL_PER']) : undefined
}

/** 'OGA-DMCC-OSIPL' -> ['OGA', 'DMCC', 'OSIPL']. */
export const entityStringParts = (value: string): string[] =>
  value
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)

/**
 * A Long forward sells the first currency in its first leg; a Short one buys it. The rule table
 * has no buy / sell column, so this is read from the model's name — the same split the old list
 * had (its only Short model opened with Buy).
 */
const legSigns = (desc: string): [string, string] => (/\bshort\b/i.test(desc) ? ['B', 'S'] : ['S', 'B'])

/**
 * The entity string gives the legs (first to second entity is D1, second to third is D2) and
 * the two legs' base currencies the pair. Models whose pair is not one the blotter quotes keep
 * an empty pair, and so offer no Auto Deal legs.
 */
export function toFxModels(rows: readonly FxRow[], tolerancePct: number): FxModel[] {
  return rows
    .filter((r) => txt(r, 'ZMOD_ID'))
    .map((r) => {
      const entities = entityStringParts(txt(r, 'ZENT_DESC'))
      const pair = `${txt(r, 'ZD1_BCURR')}/${txt(r, 'ZD2_BCURR')}`
      const desc = txt(r, 'ZMOD_DESC')
      const [bs1, bs2] = legSigns(desc)
      const leg = (from: string | undefined, to: string | undefined): LegTemplate => ({ from: from ?? '', to: to ?? '', bs1, bs2 })
      return {
        code: txt(r, 'ZMOD_ID'),
        desc,
        entities,
        pair: pairOf(pair) ? pair : '',
        d1: leg(entities[0], entities[1]),
        d2: leg(entities[1], entities[2]),
        spreadBp: SPREAD_BP,
        ssEligible: txt(r, 'ZSS') === 'X',
        tolerancePct,
        valueDateToleranceDays: VALUE_DATE_TOLERANCE_DAYS,
      }
    })
}

/**
 * A contract needs a number, a currency pair and both ends of its shipping window to be checked
 * against a deal; a row without them is left out. The balance is read as USD, so a contract in
 * another currency is left out too rather than mixed into a USD total.
 */
export function toMasterContracts(rows: readonly FxRow[]): MasterContract[] {
  const out: MasterContract[] = []
  for (const r of rows) {
    const shipStart = dateFromIso(r['ZSHIP_START'])
    const shipEnd = dateFromIso(r['ZSHIP_END'])
    const mcDate = dateFromIso(r['ZMC_DATE'])
    if (!txt(r, 'ZMC_REF_NO') || !shipStart || !shipEnd || !mcDate) continue
    if (txt(r, 'ZCURR') !== 'USD' || !txt(r, 'ZOCURR')) continue
    const utilized = num(r['ZUTI_AMT'])
    out.push({
      mcNumber: txt(r, 'ZMC_REF_NO'),
      fxModel: txt(r, 'ZMOD_ID'),
      modelDesc: txt(r, 'ZMOD_DESC'),
      entities: entityStringParts(txt(r, 'ZENT_DESC')),
      currPair: `${txt(r, 'ZCURR')}/${txt(r, 'ZOCURR')}`,
      commodityCode: txt(r, 'ZCOMMODITY'),
      commodityDesc: txt(r, 'ZCOM_DESC_LONG') || txt(r, 'ZCOM_DESC'),
      mcDate,
      shipStart,
      shipEnd,
      amtUSD: num(r['ZAMT']),
      utilizedUSD: utilized,
      baseUtilizedUSD: utilized,
      // No Master Contract column carries the blotter group; nothing reads it.
      group: '',
      portShipment: txt(r, 'ZPOS'),
      portDestination: txt(r, 'ZPOD'),
    })
  }
  return out
}

// ---------------------------------------------------------------- loading

export type BlotterMasters = {
  entities: Entity[]
  profitCenters: CodeLabel[]
  businessAreas: CodeLabel[]
  fxModels: FxModel[]
  commodities: CodeDesc[]
  contracts: MasterContract[]
}

/**
 * Names the resource that failed, so the error on screen says which master is missing. An
 * ApiError's message is already the backend's reason (the gateway words its errors two ways, a
 * string or `{ value }`, and ApiError reads both), and its HTTP status is added: a 401 means the
 * session has expired, a 502 that the middleware could not be reached.
 */
export class MasterLoadError extends Error {
  readonly resource: string
  constructor(resource: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    const status = cause instanceof ApiError && cause.status ? ` (HTTP ${cause.status})` : ''
    super(`Could not load ${resource}: ${reason}${status}`)
    this.name = 'MasterLoadError'
    this.resource = resource
  }
}

async function read(resource: string, filter: FxFilter, signal?: AbortSignal): Promise<FxRow[]> {
  try {
    return await fxList(resource, filter, { signal })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new MasterLoadError(resource, error)
  }
}

/** Turns the five reads into the blotter's masters; throws when a master the screen cannot work without is empty. */
export function buildMasters(raw: {
  comp: readonly FxRow[]
  fxModel: readonly FxRow[]
  commodity: readonly FxRow[]
  masterContract: readonly FxRow[]
  tolerance: readonly FxRow[]
}): BlotterMasters {
  const entities = toEntities(raw.comp)
  if (!entities.length) throw new MasterLoadError('comp', new Error('it returned no usable entities.'))
  const tolerancePct = toTolerance(raw.tolerance)
  if (tolerancePct === undefined) {
    throw new MasterLoadError('tolerance', new Error(`it has no ${MC_TOLERANCE_ID} (Master Contract tolerance) row.`))
  }
  const fxModels = toFxModels(raw.fxModel, tolerancePct)
  if (!fxModels.length) throw new MasterLoadError('fxModel', new Error('it returned no FX models.'))
  const commodities = toCommodities(raw.commodity)
  if (!commodities.length) throw new MasterLoadError('commodity', new Error('it returned no commodities.'))
  return {
    entities,
    profitCenters: toProfitCenters(raw.comp),
    businessAreas: toBusinessAreas(raw.comp),
    fxModels,
    commodities,
    // No usable contract is a real answer, not a failure: the Auto Deal list is just empty.
    contracts: toMasterContracts(raw.masterContract),
  }
}

/** Reads the five masters in parallel. Rejects on the first failure; nothing is substituted. */
export async function loadBlotterMasters(signal?: AbortSignal): Promise<BlotterMasters> {
  const [comp, fxModel, commodity, masterContract, tolerance] = await Promise.all([
    read('comp', {}, signal),
    read('fxModel', {}, signal),
    read('commodity', {}, signal),
    read('masterContract', { 'ZMC_STAT[in]': USABLE_MC_STATUSES.join(',') }, signal),
    read('tolerance', {}, signal),
  ])
  return buildMasters({ comp, fxModel, commodity, masterContract, tolerance })
}

/**
 * Puts the masters into the blotter's own lists (data.ts), in place, so every helper that
 * closed over them — entityOf, modelOf, the dropdown builders — sees the loaded rows. Only this
 * screen's lists are touched. The contracts are returned to the caller, which owns them.
 */
export function installMasters(m: BlotterMasters): void {
  replaceInPlace(ENTITIES, m.entities)
  replaceInPlace(PROFIT_CENTERS, m.profitCenters)
  replaceInPlace(BUSINESS_AREAS, m.businessAreas)
  replaceInPlace(FX_MODELS, m.fxModels)
  replaceInPlace(COMMODITIES, m.commodities)
}
