/**
 * MO: Reject MC after Expiry (ZSGTSFR097) against the SLC middleware.
 *
 * There is no functional spec, so the legacy page is the statement of behaviour:
 * - the selection screen reads ZSGTSFTR_MAS_CON by MC date range (mandatory), MC number range,
 *   origin entity, region, FX model, CO area and MC status;
 * - Reject moves every selected contract that is not already Rejected to "Rejected" — status
 *   13, the code the other FX screens show as "13-Rejected by MO" (legacy
 *   confirm-master-contract.html: STATUS.REJECTED, short text "Rejected"). The page writes the
 *   status and nothing else: its confirmation has no remark field, so ZMO_REMARKS is untouched.
 *
 * What MySQL cannot answer keeps the screen's dummy values: FX models / CO areas while
 * ZSGTSFTR_RULE_BT is empty, region names (no region master is migrated — MySQL rows carry
 * COMP's ZREG_ID code), and ZSGTSFV_FX's business partners and utilization (a view over SAP
 * TRM tables, not in MySQL).
 */
import { distinctBy, loadMaster, replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import { listMasterContracts, setMcStatus, type McRow } from '../../shared/fx/master-contract.ts'
import { isAbort, type FxFilter, type FxRow } from '../../shared/fx/mw.ts'
import { loadRegions } from '../../shared/fx/regions.ts'
import { dmyFromIso, isoFromDate, num } from '../../shared/fx/sap.ts'
import { loadMcStatuses, statusText, type McStatusRow } from '../../shared/fx/status.ts'
import {
  CO_AREA_MASTER,
  DUMMY_CO_AREA_BY_ENTITY,
  ENTITY_MASTER,
  FX_MODEL_MASTER,
  REGION_MASTER,
  REGION_NAMES,
  SEED_CO_AREA_MASTER,
  SEED_ENTITY_MASTER,
  SEED_FX_MODEL_MASTER,
  SEED_REGION_MASTER,
  REJECTED,
} from './data.ts'
import { isRejectable } from './logic.ts'
import type { Criteria, Entity, MasterContract } from './types.ts'

/** The code Reject writes to ZMC_STAT: 13 Rejected by MO. */
export const REJECT_STATUS = '13'

/**
 * This screen's own words for the statuses it names (MC_STATUS_MASTER, STATUS_CLASS, and
 * REJECTED all compare these strings); any other code shows ZSGTSFTR_MC_STAT's text.
 * "Correction after Deal" is in the legacy dropdown but no FX screen gives it a code, so it
 * is not mapped: selecting it filters client-side on the label and matches no MySQL row.
 */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  '03': 'Confirmed by MO',
  '04': 'In Use',
  '09': 'Expired',
  [REJECT_STATUS]: REJECTED,
}

const CODE_BY_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([code, label]) => [label, code]),
)

export function statusLabel(statuses: readonly McStatusRow[], code: string): string {
  return STATUS_LABEL[code] ?? statusText(statuses, code)
}

/** The rows the mapping reads besides MAS_CON itself. */
export type MapContext = {
  statuses: readonly McStatusRow[]
  /** Every company in ZSGTSFTR_COMP (not only origins), for the origin's name and region. */
  entities: readonly Entity[]
  /** ZSGTSFTR_RULE_BT rows (ZMOD_ID, ZORIGIN, ZCO_AREA); empty while RULE_BT is. */
  rules: readonly FxRow[]
}

let context: MapContext = { statuses: [], entities: SEED_ENTITY_MASTER, rules: [] }

// ---------------------------------------------------------------- masters

export type MasterSources = Record<'entities' | 'fxModels' | 'statuses', MasterSource>

/** Loads the value helps and swaps them into data.ts in place. */
export async function loadMasters(signal?: AbortSignal): Promise<MasterSources> {
  const [comp, rules, statuses, sapRegions] = await Promise.all([
    loadMaster('comp', (rows) => rows.map(toEntity), [], { signal }),
    loadMaster('fxModel', (rows) => rows, [], { signal }),
    loadMcStatuses(signal),
    loadRegions(signal).catch((error: unknown) => {
      if (isAbort(error)) throw error
      return null
    }),
  ])

  if (comp.source === 'mysql') {
    // ZORIGIN = 'X' marks the origin entities an MC is raised for; the dropdown offers those.
    const origins = comp.rows.filter((e) => e.origin)
    replaceInPlace(ENTITY_MASTER, origins.length ? origins.map(stripOrigin) : SEED_ENTITY_MASTER)
    // No region master is migrated, so the Region list is the origins' ZREG_ID codes.
    const regions = [...new Set(origins.map((e) => e.region).filter(Boolean))].sort()
    replaceInPlace(REGION_MASTER, regions.length ? regions : SEED_REGION_MASTER)
  } else {
    replaceInPlace(ENTITY_MASTER, SEED_ENTITY_MASTER)
    replaceInPlace(REGION_MASTER, SEED_REGION_MASTER)
  }
  // ZSGTSFSH_REGION: the SAP region codes (shared/fx/regions.ts), named where BPEXT names them.
  for (const k of Object.keys(REGION_NAMES)) delete REGION_NAMES[k]
  if (sapRegions?.length) {
    replaceInPlace(REGION_MASTER, sapRegions.map((r) => r.id))
    for (const r of sapRegions) if (r.name) REGION_NAMES[r.id] = r.name
  }

  if (rules.source === 'mysql') {
    replaceInPlace(
      FX_MODEL_MASTER,
      distinctBy(rules.rows, (r) => txt(r, 'ZMOD_ID')).map((r) => ({ code: txt(r, 'ZMOD_ID'), desc: txt(r, 'ZMOD_DESC') })),
    )
    const areas = [...new Set(rules.rows.map((r) => txt(r, 'ZCO_AREA')).filter(Boolean))].sort()
    replaceInPlace(CO_AREA_MASTER, areas.length ? areas : SEED_CO_AREA_MASTER)
  } else {
    replaceInPlace(FX_MODEL_MASTER, SEED_FX_MODEL_MASTER)
    replaceInPlace(CO_AREA_MASTER, SEED_CO_AREA_MASTER)
  }

  context = {
    statuses: statuses.rows,
    entities: comp.source === 'mysql' ? comp.rows.map(stripOrigin) : SEED_ENTITY_MASTER,
    rules: rules.source === 'mysql' ? rules.rows : [],
  }
  return { entities: comp.source, fxModels: rules.source, statuses: statuses.source }
}

type CompEntity = Entity & { origin: boolean }

function toEntity(r: FxRow): CompEntity {
  return { code: txt(r, 'ZCOM_ID'), name: txt(r, 'ZBUTXT'), region: txt(r, 'ZREG_ID'), origin: txt(r, 'ZORIGIN') === 'X' }
}

const stripOrigin = ({ code, name, region }: Entity): Entity => ({ code, name, region })

// ---------------------------------------------------------------- selection

/**
 * The selection criteria the middleware can apply itself. Region and CO Area are derived
 * (from COMP and RULE_BT), so they, and everything else again, are applied client-side by
 * getCriteriaRows afterwards, exactly as before.
 */
export function criteriaFilter(c: Criteria): FxFilter {
  const filter: FxFilter = {}
  const from = isoFromDate(c.mcDateFrom)
  const to = isoFromDate(c.mcDateTo)
  if (from && to) filter['ZMC_DATE[between]'] = `${from},${to}`

  // The screen compares MC numbers as numbers; ZMC_REF_NO is a 10-digit NUMC, so a
  // zero-padded bound compares the same way. Anything else is left to the client.
  const mcFrom = mcBound(c.mcFrom)
  const mcTo = mcBound(c.mcTo)
  if (mcFrom && mcTo) filter['ZMC_REF_NO[between]'] = `${mcFrom},${mcTo}`
  else if (mcFrom) filter['ZMC_REF_NO[gte]'] = mcFrom
  else if (mcTo) filter['ZMC_REF_NO[lte]'] = mcTo

  if (c.originEntity) filter['ZORIGIN'] = c.originEntity
  if (c.fxModel) filter['ZMOD_ID'] = c.fxModel
  const code = CODE_BY_LABEL[c.mcStatus]
  if (c.mcStatus && code) filter['ZMC_STAT'] = code
  return filter
}

function mcBound(value: string): string {
  const v = value.trim()
  return /^\d{1,10}$/.test(v) ? v.padStart(10, '0') : ''
}

export type Loaded = { contracts: MasterContract[]; source: MasterSource }

/**
 * The Master Contracts matching the criteria, as MySQL holds them — an empty answer is a real
 * one. `source: 'dummy'` with no rows means the middleware could not be reached; the screen
 * then keeps working on its seed contracts.
 */
export async function loadContracts(c: Criteria, signal?: AbortSignal): Promise<Loaded> {
  try {
    const rows = await listMasterContracts(criteriaFilter(c), signal)
    return { contracts: rows.map((r) => toContract(r, context)), source: 'mysql' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Reject MC after Expiry: middleware unavailable — showing the dummy contracts', error)
    return { contracts: [], source: 'dummy' }
  }
}

/** ZSGTSFTR_MAS_CON row -> the screen's contract. */
export function toContract(r: McRow, ctx: MapContext): MasterContract {
  const origin = txt(r, 'ZORIGIN')
  const model = txt(r, 'ZMOD_ID')
  const entity = ctx.entities.find((e) => e.code === origin)
  const amountUSD = num(r['ZAMT'])
  const amountOrigin = num(r['ZORG_AMT'])

  return {
    mcNumber: txt(r, 'ZMC_REF_NO'),
    // MAS_CON has one text column for both: Create MC stores its "reference" in ZMC_DESC.
    mcReferenceNo: txt(r, 'ZMC_DESC'),
    mcDescription: txt(r, 'ZMC_DESC'),
    originEntity: origin,
    originEntityName: entity?.name ?? '',
    // COMP's ZREG_ID code: region names have no master in MySQL.
    region: entity?.region ?? '',
    coArea: coAreaFor(ctx.rules, model, origin),
    fxModel: model,
    modelDescription: txt(r, 'ZMOD_DESC'),
    entityString: txt(r, 'ZENT_DESC'),
    mcDate: dmyFromIso(r['ZMC_DATE']),
    currencyString: txt(r, 'ZCURR_DESC'),
    status: statusLabel(ctx.statuses, txt(r, 'ZMC_STAT')),
    gtCommodity: txt(r, 'ZCOMMODITY'),
    commodity: txt(r, 'ZCOM_DESC'),
    commodityDescriptionLong: txt(r, 'ZCOM_DESC_LONG'),
    // The business partners (KONTRH / BP_NAME) come from ZSGTSFV_FX, a view over SAP TRM
    // deals that is not in MySQL — unavailable, not invented.
    businessPartnerD1: '',
    businessPartnerD2: '',
    shipmentStart: dmyFromIso(r['ZSHIP_START']),
    shipmentEnd: dmyFromIso(r['ZSHIP_END']),
    mcAmountUSD: amountUSD,
    currency: txt(r, 'ZCURR'),
    exchangeRate: num(r['ZEX_RATE']),
    mcAmountOrigin: amountOrigin,
    originCurrency: txt(r, 'ZOCURR'),
    // Utilization is computed from ZSGTSFV_FX (not in MySQL), so it reads 0 and the balance
    // is the full amount. MAS_CON's own ZUTI_AMT is not what the screen showed.
    utilization: 0,
    balanceAmount: amountUSD,
    utilizationOrigin: 0,
    balanceOrigin: amountOrigin,
    portOfShipment: txt(r, 'ZPOS'),
    portOfDestination: txt(r, 'ZPOD'),
    paymentTerms: txt(r, 'ZPAY_TERMS'),
    paymentTermsDesc: txt(r, 'ZPAY_TERMS_TEXT'),
    moRemarks: txt(r, 'ZMO_REMARKS'),
    foRemarks: txt(r, 'ZFO_REMARKS'),
    createdMCReference: txt(r, 'ZOLD_MC_REF_NO'),
    enteredBy: txt(r, 'ZCREATED_BY'),
    enteredOn: dmyFromIso(r['ZCREATED_DATE']),
  }
}

/**
 * The FX model's controlling area from ZSGTSFTR_RULE_BT (the row for the MC's origin when
 * the model has several). With RULE_BT empty, the dummy data's per-entity CO Area stands in.
 */
export function coAreaFor(rules: readonly FxRow[], model: string, origin: string): string {
  if (!rules.length) return DUMMY_CO_AREA_BY_ENTITY[origin] ?? ''
  const forModel = rules.filter((r) => txt(r, 'ZMOD_ID') === model)
  const row = forModel.find((r) => txt(r, 'ZORIGIN') === origin) ?? forModel[0]
  return row ? txt(row, 'ZCO_AREA') : ''
}

// ---------------------------------------------------------------- reject

/**
 * Which contracts Reject sends: the selected ones not already Rejected (the page's only
 * eligibility rule — it does not re-check expiry), as MAS_CON keys.
 */
export function rejectKeys(contracts: readonly MasterContract[], mcNumbers: readonly string[]): string[] {
  const ids = new Set(mcNumbers)
  return contracts.filter((c) => ids.has(c.mcNumber) && isRejectable(c)).map((c) => c.mcNumber)
}

/**
 * Moves each contract to 13, one update per contract, stopping at the first failure. Only
 * ZMC_STAT is written (setMcStatus adds the ZCHANGED_* stamp); no remark, as on the page.
 */
export async function rejectContracts(mcNumbers: readonly string[]): Promise<void> {
  await setMcStatus(mcNumbers, REJECT_STATUS)
}
