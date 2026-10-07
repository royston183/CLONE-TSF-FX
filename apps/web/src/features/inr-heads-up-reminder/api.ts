/**
 * MO: INR Head-Ups Reminder (ZSGTSFR061 / ZSGTSF_RDEAL_ID_SETT) against the SLC middleware.
 *
 * Reads what FORM sub_get_data / modify_drop_down / send_email read, unfiltered beyond the
 * report's own WHERE clauses; the report's in-program deletes and lookups run in logic.ts
 * (selectRows, mailPlanForRow), so every selection change is applied without a reload.
 *
 *   ZSGTSFTR_DEALID   tsfDealId       main list (WHERE zmc_ref <> space, applied in selectRows)
 *   ZSGTSFTR_MAS_CON  masterContract  LEFT OUTER JOIN on zmc_ref_no
 *   ZSGTSFTR_COMP     comp            LEFT OUTER JOIN on zcom_id = MC origin; Origin Entity / Region helps
 *   ZSGTSFTR_DEAL_ST  tsfDealStatus   WHERE zsub_type = 'FX1': P_STAT list box and the status text
 *   ZSGTSFTR_RULE_BT  fxModel         CO-area model lookup; send_email's sub type
 *   ZSGTSFTR_SET_TYP  setTyp          WHERE zhead_fx <> space OR zhead_opt <> space
 *   ZSGTSFTR_IN_SPOT  inSpot          FOR ALL ENTRIES on zdeal_id: the "Save Spot Data" flag
 *   ZSGTSFCDS_FX      -               the view ("tsfvFx") lacks the TSF link columns, so the FX legs are the
 *                                     ZSGTSFTR_APP_STR rows (TrmFxApp WHERE ZtsfMcRefNo IN the listed MC refs)
 *                                     joined by CompanyCode + FinancialTransaction to FxTransaction. Deal ID /
 *                                     type / MC ref come from APP_STR, currencies, amounts and product type from
 *                                     the transaction, the bank (BP_NAME) is the partner's name. Fixing Day
 *                                     (NDF_DATE) is in neither service, so it stays blank.
 *   ZSGTSFCDS_OPTION  (none)          not served at all: the FX Utilisation Amount stays WAITING FOR API
 *
 * Read-only, like the report. No sample data: if a table cannot be read the screen says which
 * and stays empty.
 */
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { odataString } from '@slc/api-client'
import { allOf, loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { fxList, isAbort, type FxFilter, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { loadNames, NO_NAMES, type Names } from '../mo-confirm-ndf-fixing/api.ts'
import { ABAP } from './data.ts'
import type { Deal, DealStatus, Entity, FxLeg, HeadsUpIndicator, Leg, MasterContract, RuleBt, ScreenData } from './types.ts'

export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'

/** ZSGTSFCDS_OPTION has no middleware resource; the report needs it for the option utilization. */
export const OPTION_NOT_SERVED = 'ZSGTSFCDS_OPTION is not served by the middleware'

export type Loaded =
  | { source: 'sap'; data: ScreenData; notice: string | null }
  | { source: 'unavailable'; data: null; reason: string }

/* ---------- pure mappings (tested) ---------- */

/** A middleware DATS ('YYYY-MM-DD', null, or an initial date) as ISO, '' for none. */
export function isoDay(value: string | null | undefined): string {
  const v = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith('0000') ? v : ''
}

export function toDeal(r: FxRow): Deal {
  return {
    dealId: txt(r, 'ZDEAL_ID'),
    dealType: txt(r, 'ZDEAL_TYPE'),
    subType: txt(r, 'ZSUB_TYPE'),
    dealDesc: txt(r, 'ZDEAL_DESC'),
    startDate: isoDay(r['ZS_DATE']),
    maturityDate: isoDay(r['ZE_DATE']),
    mcRef: txt(r, 'ZMC_REF'),
    status: txt(r, 'ZDEAL_STAT'),
    confirmed: txt(r, 'ZCONFIRM') !== '',
    plAmt: num(r['ZPL']),
    plCurr: txt(r, 'ZPL_CURR'),
    plRate: num(r['ZPL_RATE']),
    currId: txt(r, 'ZDEAL_CURR_ID'),
    createdBy: txt(r, 'ZCREATED_BY'),
    createdDate: isoDay(r['ZCREATED_DATE']),
    createdTime: txt(r, 'ZCREATED_TIME'),
    changedBy: txt(r, 'ZCHANGED_BY'),
    changedDate: isoDay(r['ZCHANGED_DATE']),
    changedTime: txt(r, 'ZCHANGED_TIME'),
  }
}

/** b~zorigin, zmod_id, zmod_desc, zmc_desc, zmc_date, zamt (+ the currency ID and commodity the MC popup shows). */
export function toMasterContract(r: FxRow): MasterContract {
  return {
    ref: txt(r, 'ZMC_REF_NO'),
    origin: txt(r, 'ZORIGIN'),
    modelId: txt(r, 'ZMOD_ID'),
    modelDesc: txt(r, 'ZMOD_DESC'),
    currId: txt(r, 'ZCURR_ID'),
    desc: txt(r, 'ZMC_DESC'),
    commodity: txt(r, 'ZCOMMODITY'),
    date: isoDay(r['ZMC_DATE']),
    amt: num(r['ZAMT']),
  }
}

/** ZSGTSFSH_ENTITY: ZSGTSFTR_COMP, one row per entity, by code. */
export function entityHelp(rows: readonly FxRow[]): Entity[] {
  const seen = new Set<string>()
  const out: Entity[] = []
  for (const r of rows) {
    const code = txt(r, 'ZCOM_ID')
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: txt(r, 'ZBUTXT'), regionId: txt(r, 'ZREG_ID') })
  }
  return out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/**
 * FORM modify_drop_down: SELECT zdeal_stat, zdeal_sdesc FROM zsgtsftr_deal_st WHERE zsub_type = 'FX1'
 * (the `AND zdeal_stat <= '02'` is commented out in the source, so every FX1 status is offered).
 * Key order as the table returns it; one entry per code.
 */
export function statusHelp(rows: readonly FxRow[]): DealStatus[] {
  const seen = new Set<string>()
  const out: DealStatus[] = []
  for (const r of rows) {
    const code = txt(r, 'ZDEAL_STAT')
    if (txt(r, 'ZSUB_TYPE') !== ABAP.SUB_FX1 || !code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, sdesc: txt(r, 'ZDEAL_SDESC') })
  }
  return out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/** ZSGTSFTR_RULE_BT rows in table order (the report's ASSIGN takes the first match). */
export function ruleRows(rows: readonly FxRow[]): RuleBt[] {
  return rows.map((r) => ({ coArea: txt(r, 'ZCO_AREA'), id: txt(r, 'ZMOD_ID'), desc: txt(r, 'ZMOD_DESC'), subType: txt(r, 'ZSUB_TYPE') }))
}

/** ZSGTSFTR_SET_TYP WHERE zhead_fx <> space OR zhead_opt <> space, in table order. */
export function indicatorRows(rows: readonly FxRow[]): HeadsUpIndicator[] {
  return rows
    .map((r) => ({ modelId: txt(r, 'ZMOD_ID'), headFx: txt(r, 'ZHEAD_FX'), headOpt: txt(r, 'ZHEAD_OPT') }))
    .filter((i) => i.headFx !== '' || i.headOpt !== '')
}

/** ZSGTSFTR_IN_SPOT: line_exists( lt_spot[ zdeal_id = ... ] ). */
export function spotFlags(rows: readonly FxRow[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const r of rows) {
    const id = txt(r, 'ZDEAL_ID')
    if (id) out[id] = true
  }
  return out
}

export function toLeg(r: FxRow): Leg {
  return {
    dealId: txt(r, 'ZTSF_DEAL_ID'),
    type: txt(r, 'ZTSF_DEAL_TYPE'),
    mcRef: txt(r, 'ZTSF_MC_REF_NO'),
    curr1: txt(r, 'CURR1'),
    curr2: txt(r, 'CURR2'),
    amt1: num(r['AMT1']),
    amt2: num(r['AMT2']),
  }
}

/**
 * One TrmFxApp row joined to its FxTransaction as a ZSGTSFCDS_FX leg. Leg 1 is the lead currency; the
 * utilisation only reads the absolute USD side. NDF_DATE has no source, so the fixing day stays blank.
 */
export function toFxLeg({ fx, app }: FxWithApp, names: Names = NO_NAMES): FxLeg {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  return {
    dealId: (app.ZtsfDealID ?? '').trim(),
    type: (app.ZtsfDealType ?? '').trim(),
    mcRef: (app.ZtsfMcRefNo ?? '').trim(),
    curr1: lead,
    curr2: follow,
    amt1: Math.abs(num(buysLead ? fx.BuyAmount : fx.SellAmount)),
    amt2: Math.abs(num(buysLead ? fx.SellAmount : fx.BuyAmount)),
    sgsart: fx.ProductType ?? '',
    bp: names.partners.get(fx.Partner) || fx.Partner,
    ndfDate: '',
  }
}

/** The WHERE of the FX legs: ZtsfMcRefNo IN the listed Master Contract references (one chunk of them). */
export const mcRefFilter = (refs: readonly string[]): string => allOf(refs.map((r) => `ZtsfMcRefNo eq ${odataString(r)}`).join(' or '))

/** The banner text while the option legs cannot be read (the FX legs are read); null once they are. */
export function legsNotice(optionServed: boolean): string | null {
  if (optionServed) return null
  return `WAITING FOR API — ${OPTION_NOT_SERVED}. FX Utilisation Amount stays blank; Fixing Day (NDF_DATE) has no source in ZSGTSFTR_APP_STR / FxTransaction.`
}

/* ---------- loading ---------- */

const chunk = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** fxList with an [in] filter split into URL-sized pieces (FOR ALL ENTRIES). */
async function listIn(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const distinct = [...new Set(values.filter(Boolean))]
  const pages = await Promise.all(
    chunk(distinct, 100).map((part) => fxList(resource, { [`${column}[in]`]: part.join(',') } as FxFilter, { signal })),
  )
  return pages.flat()
}

/** The FX legs of the listed Master Contracts, with the partner names for the bank column. */
export async function loadFxLegs(mcRefs: readonly string[], signal?: AbortSignal): Promise<FxLeg[]> {
  const distinct = [...new Set(mcRefs.filter(Boolean))]
  const pages = await Promise.all(chunk(distinct, 25).map((part) => loadFxWithApp(mcRefFilter(part), signal)))
  const joined = pages.flat()
  const names = await loadNames(joined.map((j) => j.fx), signal).catch((error: unknown) => {
    if (isAbort(error)) throw error
    return NO_NAMES
  })
  return joined.map((j) => toFxLeg(j, names))
}

class ReadError extends Error {}

async function read<T>(table: string, resource: string, load: Promise<T>): Promise<T> {
  try {
    return await load
  } catch (error) {
    if (isAbort(error)) throw error
    throw new ReadError(`${table} (middleware "${resource}") could not be read: ${messageOf(error)}`)
  }
}

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const opts = { signal }
    const [dealRows, mcRows, compRows, statusRows, ruleBt, setTyp] = await Promise.all([
      read('ZSGTSFTR_DEALID', 'tsfDealId', fxList('tsfDealId', {}, { sort: 'ZDEAL_ID', signal })),
      read('ZSGTSFTR_MAS_CON', 'masterContract', fxList('masterContract', {}, opts)),
      read('ZSGTSFTR_COMP', 'comp', fxList('comp', {}, opts)),
      read('ZSGTSFTR_DEAL_ST', 'tsfDealStatus', fxList('tsfDealStatus', { ZSUB_TYPE: ABAP.SUB_FX1 }, opts)),
      read('ZSGTSFTR_RULE_BT', 'fxModel', fxList('fxModel', {}, opts)),
      read('ZSGTSFTR_SET_TYP', 'setTyp', fxList('setTyp', {}, opts)),
    ])
    const deals = dealRows.map(toDeal)
    const listed = deals.filter((d) => d.mcRef !== '')
    const [spotRows, fxRows] = await Promise.all([
      read('ZSGTSFTR_IN_SPOT', 'inSpot', listIn('inSpot', 'ZDEAL_ID', listed.map((d) => d.dealId), signal)),
      read('ZSGTSFCDS_FX (ZSGTSFTR_APP_STR + FxTransaction)', 'trmfxapp', loadFxLegs(listed.map((d) => d.mcRef), signal)),
    ])
    return {
      source: 'sap',
      notice: legsNotice(false),
      data: {
        deals,
        masterContracts: mcRows.map(toMasterContract),
        entities: entityHelp(compRows),
        statuses: statusHelp(statusRows),
        rules: ruleRows(ruleBt),
        indicators: indicatorRows(setTyp),
        spotDealIds: spotFlags(spotRows),
        fxLegs: fxRows,
        // ZSGTSFCDS_OPTION has no resource, so the option legs (and the utilization) stay unavailable.
        optLegs: null,
      },
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] INR Head-Ups Reminder: SAP tables unavailable', error)
    const why = error instanceof ReadError ? error.message : messageOf(error)
    return { source: 'unavailable', data: null, reason: `${WAITING_DEAL_ID_API} — ${why}` }
  }
}
