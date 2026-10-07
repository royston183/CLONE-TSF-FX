/**
 * MO: View List of Deal IDs for Confirmation (ZSGTSFR044 / ZSGTSF_RDEAL_LIST_CONF) against the
 * SLC middleware.
 *
 * Mirrors the report's selection: ZSGTSFTR_DEALID at ZDEAL_STAT 01 / 02, joined to
 * ZSGTSFTR_MAS_CON (MC description, date, amount, model, shipment window), the MC's origin in
 * ZSGTSFTR_COMP (region) and ZSGTSFTR_DEAL_ST (status text). The key-date rule — deal end
 * date, or the MC's shipment end for a Short Straddle deal — stays in logic.ts, as before.
 *
 * Read-only, like the report. Utilization (ZSGTSFCDS_FX / _OPTION) is 0: the FX view has no
 * deals in MySQL yet. Regions come from shared/fx/regions.ts: the SAP codes of COMP and BPEXT,
 * named only where BPEXT names a code consistently (no region master is migrated).
 *
 * Nothing falls back to sample data: when ZSGTSFTR_DEALID cannot be read the table stays empty
 * and says WAITING FOR DEAL ID API.
 */
import { replaceInPlace, txt } from '../../shared/fx/masters.ts'
import type { DealRow } from '../../shared/fx/master-contract.ts'
import { isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { loadRegions, type RegionOption } from '../../shared/fx/regions.ts'
import { FORWARD_SUB_TYPE, OPTION_SUB_TYPE, dealJoin, dealStatusText, listDealIds, loadDealContext, type DealContext } from '../../shared/fx/deal-id.ts'
import { dateFromIso, num } from '../../shared/fx/sap.ts'
import { ENTITIES, MODELS, REGIONS, STATUSES } from './data.ts'
import type { Deal, Entity, Flag, FxModel, Region, Status, StatusCode } from './types.ts'

/** The report's base selection: WHERE zdeal_stat IN ('01','02'). */
export const STATUS_FILTER = { 'ZDEAL_STAT[in]': '01,02' }

/** FORM modify_drop_down: WHERE zsub_type = 'FX1' AND zdeal_stat <= '02'. */
export const STATUS_HELP_MAX = '02'

export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'

/** 'sap': ZSGTSFTR_DEALID and its masters were read; 'unavailable': they could not be. */
export type DataSource = 'sap' | 'unavailable'
export type Loaded = { deals: Deal[]; source: DataSource }

const EPOCH = new Date(0)
const day = (value: string | null | undefined): Date => dateFromIso(value) ?? EPOCH
const flag = (value: string): Flag => (value === 'X' ? 'X' : '')

/**
 * The deals and the masters their filters offer. The masters are swapped in place, so the
 * screen's option lists and lookups see MySQL's rows; a middleware failure keeps the seed.
 */
export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const [ctx, deals, regions] = await Promise.all([
      loadDealContext(signal),
      listDealIds(STATUS_FILTER, signal),
      loadRegions(signal).catch((error: unknown) => {
        if (isAbort(error)) throw error
        return null
      }),
    ])
    applyMasters(ctx, regions)
    return { deals: deals.map((d) => toDeal(d, ctx)), source: 'sap' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Deal IDs for confirmation: ZSGTSFTR_DEALID unavailable', error)
    replaceInPlace(REGIONS, [])
    replaceInPlace(ENTITIES, [])
    replaceInPlace(MODELS, [])
    replaceInPlace(STATUSES, [])
    return { deals: [], source: 'unavailable' }
  }
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** ZSGTSFSH_ENTITY: ZSGTSFTR_COMP. */
export function entityHelp(comp: readonly FxRow[]): Entity[] {
  return comp
    .map((r) => ({ id: txt(r, 'ZCOM_ID'), name: txt(r, 'ZBUTXT'), region: txt(r, 'ZREG_ID'), currency: txt(r, 'ZWAERS') }))
    .filter((e) => e.id)
    .sort(byId)
}

/**
 * ZSGTSFSH_REGION: the SAP region codes (shared/fx/regions.ts: COMP and BPEXT, named from BPEXT).
 * Without that list, the codes the TSF entities carry (COMP-ZREG_ID).
 */
export function regionHelp(comp: readonly FxRow[], regions: readonly RegionOption[] | null = null): Region[] {
  if (regions) return regions.map((r) => ({ id: r.id, desc: r.name }))
  return [...new Set(comp.map((r) => txt(r, 'ZREG_ID')).filter(Boolean))].map((id) => ({ id, desc: '' })).sort(byId)
}

/** ZSGTSFSH_MODEL: ZSGTSFTR_RULE_BT, one row per model. */
export function modelHelp(models: readonly FxRow[]): FxModel[] {
  return models
    .map((r) => ({
      id: txt(r, 'ZMOD_ID'),
      desc: txt(r, 'ZMOD_DESC'),
      type: txt(r, 'ZSUB_TYPE') === OPTION_SUB_TYPE ? ('OPTION' as const) : ('FORWARD' as const),
    }))
    .filter((m) => m.id)
    .sort(byId)
}

/** P_STAT's list box, exactly as FORM modify_drop_down selects it. */
export function statusHelp(statuses: readonly FxRow[]): Status[] {
  return statuses
    .filter((r) => txt(r, 'ZSUB_TYPE') === FORWARD_SUB_TYPE && txt(r, 'ZDEAL_STAT') !== '' && txt(r, 'ZDEAL_STAT') <= STATUS_HELP_MAX)
    .map((r) => ({ code: txt(r, 'ZDEAL_STAT') as StatusCode, desc: txt(r, 'ZDEAL_SDESC') }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/** The masters are swapped in place, so every list and lookup the screen imported sees SAP's rows. */
function applyMasters(ctx: DealContext, regions: readonly RegionOption[] | null): void {
  const comp = [...ctx.comp.values()]
  replaceInPlace(ENTITIES, entityHelp(comp))
  replaceInPlace(REGIONS, regionHelp(comp, regions))
  replaceInPlace(MODELS, modelHelp([...ctx.models.values()]))
  replaceInPlace(STATUSES, statusHelp(ctx.statuses))
}

export function toDeal(d: DealRow, ctx: DealContext): Deal {
  const { mc, comp, model } = dealJoin(ctx, d)
  const subType = txt(d, 'ZSUB_TYPE')
  const status = txt(d, 'ZDEAL_STAT') as StatusCode
  // b~zmod_id: the model is the Master Contract's (S_MOD filters on it), not ZSGTSFTR_DEALID-ZTSF_MODEL.
  const modelId = mc ? txt(mc, 'ZMOD_ID') : ''
  const plLocal = txt(d, 'ZPL_LCURR') || (comp ? txt(comp, 'ZWAERS') : '')
  return {
    zdeal_type: subType === OPTION_SUB_TYPE ? 'OPTION' : 'FORWARD',
    zsub_type: subType,
    zdeal_id: txt(d, 'ZDEAL_ID'),
    zdeal_desc: txt(d, 'ZDEAL_DESC'),
    zs_date: day(d['ZS_DATE']),
    ze_date: day(d['ZE_DATE']),
    zrev_dedate: dateFromIso(d['ZREV_DEDATE']),
    zmc_ref: txt(d, 'ZMC_REF'),
    zdeal_stat: status,
    // LEFT OUTER JOIN zsgtsftr_deal_st ON zdeal_stat = a~zdeal_stat AND zsub_type = 'FX1'.
    zdeal_sdesc: dealStatusText(ctx, FORWARD_SUB_TYPE, status),
    zconfirm: flag(txt(d, 'ZCONFIRM')),
    zss: flag(txt(d, 'ZSS')),
    zship_start: day(mc?.['ZSHIP_START']),
    zship_end: day(mc?.['ZSHIP_END']),
    zpl: num(d['ZPL']),
    zpl_curr: txt(d, 'ZPL_CURR') || 'USD',
    zpl_rate: num(d['ZPL_RATE']),
    zpl_lamt: num(d['ZPL_LAMT']),
    zpl_lcurr: plLocal,
    zcreated_by: txt(d, 'ZCREATED_BY'),
    zcreated_date: day(d['ZCREATED_DATE']),
    zcreated_time: txt(d, 'ZCREATED_TIME'),
    zchanged_by: txt(d, 'ZCHANGED_BY'),
    // A row never changed carries no ZCHANGED_DATE; the report shows its creation date then.
    zchanged_date: dateFromIso(d['ZCHANGED_DATE']) ?? day(d['ZCREATED_DATE']),
    zchanged_time: txt(d, 'ZCHANGED_TIME'),
    zorigin: mc ? txt(mc, 'ZORIGIN') : '',
    zreg_id: comp ? txt(comp, 'ZREG_ID') : '',
    zmod_id: modelId,
    zmod_desc: (mc ? txt(mc, 'ZMOD_DESC') : '') || (model ? txt(model, 'ZMOD_DESC') : ''),
    zmc_desc: mc ? txt(mc, 'ZMC_DESC') : '',
    zmc_date: day(mc?.['ZMC_DATE']),
    zamt: mc ? num(mc['ZAMT']) : 0,
    // ZSGTSFCDS_FX / _OPTION are not in MySQL: nothing to sum.
    uti_amt: 0,
  }
}
