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
 * deals in MySQL yet. Region texts come from REGION_TEXT, since no region master is migrated.
 */
import { replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import { loadTransactions, type DealRow } from '../../shared/fx/master-contract.ts'
import { dealJoin, dealStatusText, listDealIds, loadDealContext, OPTION_SUB_TYPE, REGION_TEXT, type DealContext } from '../../shared/fx/deal-id.ts'
import { dateFromIso, num } from '../../shared/fx/sap.ts'
import { ENTITIES, MODELS, REGIONS, STATUSES, loadDeals } from './data.ts'
import type { Deal, Flag, StatusCode } from './types.ts'

/** The report's base selection: WHERE zdeal_stat IN ('01','02'). */
export const STATUS_FILTER = { 'ZDEAL_STAT[in]': '01,02' }

export type Loaded = { deals: Deal[]; source: MasterSource }

const EPOCH = new Date(0)
const day = (value: string | null | undefined): Date => dateFromIso(value) ?? EPOCH
const flag = (value: string): Flag => (value === 'X' ? 'X' : '')

/**
 * The deals and the masters their filters offer. The masters are swapped in place, so the
 * screen's option lists and lookups see MySQL's rows; a middleware failure keeps the seed.
 */
export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  let ctx: DealContext | undefined
  const { rows, source } = await loadTransactions(
    async () => {
      const [context, deals] = await Promise.all([loadDealContext(signal), listDealIds(STATUS_FILTER, signal)])
      ctx = context
      return deals.map((d) => toDeal(d, context))
    },
    loadDeals,
    'Deal IDs for confirmation',
  )
  if (ctx) applyMasters(ctx)
  return { deals: rows, source }
}

function applyMasters(ctx: DealContext): void {
  const comp = [...ctx.comp.values()]
  if (comp.length) {
    replaceInPlace(
      ENTITIES,
      comp.map((r) => ({ id: txt(r, 'ZCOM_ID'), name: txt(r, 'ZBUTXT'), region: txt(r, 'ZREG_ID'), currency: txt(r, 'ZWAERS') })),
    )
    const used = new Set(comp.map((r) => txt(r, 'ZREG_ID')).filter(Boolean))
    replaceInPlace(
      REGIONS,
      Object.entries(REGION_TEXT)
        .filter(([id]) => used.has(id))
        .map(([id, desc]) => ({ id, desc })),
    )
  }
  const models = [...ctx.models.values()]
  if (models.length) {
    replaceInPlace(
      MODELS,
      models.map((r) => ({
        id: txt(r, 'ZMOD_ID'),
        desc: txt(r, 'ZMOD_DESC'),
        type: txt(r, 'ZSUB_TYPE') === OPTION_SUB_TYPE ? ('OPTION' as const) : ('FORWARD' as const),
      })),
    )
  }
  const statuses = STATUSES.map((s) => ({ ...s, desc: dealStatusText(ctx, '', s.code) || s.desc }))
  replaceInPlace(STATUSES, statuses)
}

export function toDeal(d: DealRow, ctx: DealContext): Deal {
  const { mc, comp, model } = dealJoin(ctx, d)
  const subType = txt(d, 'ZSUB_TYPE')
  const status = txt(d, 'ZDEAL_STAT') as StatusCode
  const modelId = txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : '')
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
    zdeal_sdesc: dealStatusText(ctx, subType, status),
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
