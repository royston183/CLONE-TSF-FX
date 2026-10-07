/**
 * MO: View List of Deal IDs for Invoicing (ZSGTSFR008 / ZSGTSF_RDEAL_INV_LIST) against the
 * SLC middleware. Read-only, like the report.
 *
 * FORM modify_drop_down reads the status thresholds from ZGTCATR_PARAM
 * (PROGNAM = 'ZSGTSFVNP_BP_WORKBENCH'):
 *   gv_deal  = param4(1) && ( param6 + param6 + param4 )   '08' with the live 02 / 01 / 03
 *   gv_deal2 = param4(1) && ( param6 + param4 )            '05'
 *   gv_deal3 = param4(1) && ( param6 + param5 )            '04' (FORM sub_get_data)
 * and P_STAT's list box is ZSGTSFTR_DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= gv_deal.
 *
 * FORM sub_get_data:
 *   SELECT ... FROM zsgtsftr_dealid AS a
 *     INNER JOIN zsgtsftr_mas_con AS b ON b~zmc_ref_no = a~zmc_ref
 *     INNER JOIN zsgtsftr_comp    AS c ON c~zcom_id    = b~zorigin
 *     INNER JOIN zsgtsftr_deal_st AS d ON d~zdeal_stat = a~zdeal_stat AND d~zsub_type = 'FX1'
 *     INNER JOIN zsgtsftr_comodit AS e ON e~zcom_id    = b~zcommodity
 *   WHERE a~zdeal_stat <= gv_deal AND a~ze_date IN p_date AND c~zreg_id IN s_reg
 *     AND b~zmod_id IN s_mod AND b~zorigin IN s_org
 *   (date / region / model / origin / status stay in logic.ts filterDeals, as the screen filters live)
 * then appends the deal's ZSGTSFTR_BIL_ADJ T1 invoices (zinv_ref+11(2) = 'T1'), flags a deal row
 * past gv_deal3 without an invoice type, and DELETEs rows with zdeal_stat > gv_deal OR
 * (zdeal_stat >= gv_deal2 AND flagged). The screen keeps one row per Deal ID, so a deal is
 * listed when either its own row or one of its T1 invoice rows survives (dealListed), and its
 * Total Invoiced Amt is the running ZTOT_AMT_INV — the sum of those T1 ZAMT_USD.
 *
 * Gated:
 *  - FX Utilization Amt / Current Balance: UTI_AMT and BP D1/D2 come from ZSGTSFCDS_FX_N /
 *    ZSGTSFCDS_OPTION_N. The forward legs are read from TrmFxApp (ZtsfDealID + ZtsfDealType D1 / D2) with
 *    their FxTransaction (dealFx.ts); the utilization is the D1 leg's USD amount (the same rule as Deal
 *    Amt (USD) on Deal ID Invoice Marking). The header states no further rule, so a deal whose D1 leg
 *    is an option (ZSGTSFCDS_OPTION_N, not served) or has no USD side stays WAITING FOR API (blank).
 *  - FORM auth_check (AUTHORITY-CHECK K_PCA on the deals' VTBFHA profit centres): WAITING FOR
 *    AUTH; the report only shows an info message, nothing is refused here either.
 *  - The Deal ID hotspot SUBMITs ZSGTSF_RBILL_ADJUST (not in this export). Its popup shows the
 *    planned legs (ZSGTSFTR_INV_REF), raised invoices (ZSGTSFTR_BIL_ADJ) and BLs (ZSGTSFTR_BL)
 *    read here; every action in it is WAITING FOR ACTION API (index.tsx).
 *
 * Nothing falls back to sample data: when ZSGTSFTR_DEALID or the thresholds cannot be read
 * the list stays empty and says why.
 */
import { txt } from '../../shared/fx/masters.ts'
import type { DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { dealJoin, FORWARD_SUB_TYPE, listDealIds, loadDealContext, type DealContext } from '../../shared/fx/deal-id.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { loadRegions, regionLabel, type RegionOption } from '../../shared/fx/regions.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { loadFxLegsByDeal } from './dealFx.ts'
import { ENTITIES, FX_MODELS, REGIONS, STATUS_META, STATUS_OPTIONS, TRADERS } from './data.ts'
import type { BillOfLading, Deal, FxLeg, InvoiceLeg } from './types.ts'

const STATUS_CLASS: Readonly<Record<string, string>> = { '04': 'st-booked', '05': 'st-confirmed', '07': 'st-partial' }

export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'
export const PARAM_PROGRAM = 'ZSGTSFVNP_BP_WORKBENCH'
export const WAITING_UTILIZATION = 'FX Utilization Amt / Current Balance: from the D1 forward leg (ZSGTSFTR_APP_STR + FxTransaction); WAITING FOR API where the D1 leg is an option (ZSGTSFCDS_OPTION_N, not served), has no USD side or is not linked'
export const WAITING_UTILIZATION_READ = 'FX Utilization Amt / Current Balance: WAITING FOR API — ZSGTSFTR_APP_STR (trmfxapp) or FxTransaction (fx) could not be read'
export const WAITING_AUTH = 'WAITING FOR AUTH — AUTHORITY-CHECK K_PCA on the deals’ profit centres has no browser source; nothing is refused'

export type DataSource = 'sap' | 'unavailable'
export type Loaded = { deals: Deal[]; source: DataSource; notes: string[] }

export type Thresholds = { deal: string; deal2: string; deal3: string }

/**
 * FORM modify_drop_down / sub_get_data: the char params are added as numbers and the first
 * character of PARAM4 is put in front ('0' + 8 = '08').
 */
export function statusThresholds(param: FxRow): Thresholds | null {
  const p4 = txt(param, 'PARAM4')
  const p5 = Number(txt(param, 'PARAM5'))
  const p6 = Number(txt(param, 'PARAM6'))
  const n4 = Number(p4)
  if (!p4 || [n4, p5, p6].some((n) => !Number.isFinite(n))) return null
  const code = (n: number) => `${p4.charAt(0)}${n}`.slice(0, 2)
  return { deal: code(p6 + p6 + n4), deal2: code(p6 + n4), deal3: code(p6 + p5) }
}

/** zinv_ref+11(2) = 'T1': the report keeps only the T1 invoices. */
export const isT1 = (r: FxRow): boolean => txt(r, 'ZINV_REF').substring(11, 13) === 'T1'

/**
 * Whether any of the deal's report rows survives the final DELETE. The deal's own row has no
 * invoice type, so past gv_deal3 it is flagged 'X' and dropped from gv_deal2 on; its T1 invoice
 * rows carry their ZINV_TYPE (I01 / I02 / I03) and are dropped only when it is blank.
 */
export function dealListed(status: string, t1: readonly FxRow[], th: Thresholds): boolean {
  if (status > th.deal) return false
  const flagged = (invType: string) => status > th.deal3 && !invType
  const dropped = (invType: string) => status >= th.deal2 && flagged(invType)
  return !dropped('') || t1.some((r) => !dropped(txt(r, 'ZINV_TYPE')))
}

/** ZTOT_AMT_INV after the last T1 invoice: the T1 ZAMT_USD summed in zinv_type order. */
export function totalInvoicedT1(t1: readonly FxRow[]): number {
  return t1.filter((r) => ['I01', 'I02', 'I03'].includes(txt(r, 'ZINV_TYPE'))).reduce((t, r) => t + num(r['ZAMT_USD']), 0)
}

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const [ctx, params, commodities, traders, regions] = await Promise.all([
      loadDealContext(signal),
      fxList('catrParam', { PROGNAM: PARAM_PROGRAM }, { signal }),
      fxList('commodity', {}, { signal }),
      fxList('trmTrader', {}, { signal }).catch((error: unknown) => {
        if (isAbort(error)) throw error
        return [] as FxRow[]
      }),
      loadRegions(signal).catch((error: unknown) => {
        if (isAbort(error)) throw error
        return null
      }),
    ])
    // SELECT SINGLE ... WHERE prognam = ...: the first row.
    const th = params[0] ? statusThresholds(params[0]) : null
    if (!th) {
      clearMasters()
      return { deals: [], source: 'unavailable', notes: [`WAITING FOR API — ZGTCATR_PARAM (middleware "catrParam") has no usable PARAM4/5/6 row for PROGNAM ${PARAM_PROGRAM}, so the status range cannot be set`] }
    }
    applyMasters(ctx, traders, th, regions)
    const deals = await listDealIds({ 'ZDEAL_STAT[lte]': th.deal }, signal)
    const comodit = new Map(commodities.map((r) => [txt(r, 'ZCOM_ID'), r]))
    const joined = deals.filter((d) => joins(d, ctx, comodit))
    const ids = joined.map((d) => txt(d, 'ZDEAL_ID'))
    let legs = new Map<string, FxLeg[]>()
    let utilizationNote = WAITING_UTILIZATION
    try {
      legs = await loadFxLegsByDeal(signal)
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn('[fx] Deal IDs for invoicing: APP_STR / FxTransaction unavailable for FX Utilization Amt', error)
      utilizationNote = WAITING_UTILIZATION_READ
    }
    const [plans, invoices, bls, blStatuses] = await Promise.all([
      inChunks('invRef', 'ZDEAL_ID', ids, signal),
      inChunks('billAdjustment', 'ZDEAL_ID', ids, signal),
      inChunks('billOfLading', 'ZDEAL_ID', ids, signal),
      fxList('blStatus', {}, { signal }),
    ])
    const out: Deal[] = []
    for (const d of joined) {
      const t1 = invoices.filter((r) => txt(r, 'ZDEAL_ID') === txt(d, 'ZDEAL_ID') && isT1(r))
      if (!dealListed(txt(d, 'ZDEAL_STAT'), t1, th)) continue
      out.push(toDeal(d, ctx, comodit, { plans, invoices, bls, blStatuses, legs }))
    }
    return { deals: out, source: 'sap', notes: [utilizationNote, WAITING_AUTH] }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Deal IDs for invoicing: ZSGTSFTR_DEALID unavailable', error)
    clearMasters()
    return { deals: [], source: 'unavailable', notes: [`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") or its masters could not be read`] }
  }
}

/** The SELECT's INNER JOINs: an MC, its origin in COMP, an FX1 status row, the MC's commodity in COMODIT. */
export function joins(d: DealIdRow, ctx: DealContext, comodit: ReadonlyMap<string, FxRow>): boolean {
  const { mc, comp } = dealJoin(ctx, d)
  if (!mc || !comp) return false
  if (!ctx.statuses.some((s) => txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE && txt(s, 'ZDEAL_STAT') === txt(d, 'ZDEAL_STAT'))) return false
  return comodit.has(txt(mc, 'ZCOMMODITY'))
}

/** `col[in]` reads, 50 values at a time to keep the URLs short. */
async function inChunks(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const out: FxRow[] = []
  for (let i = 0; i < values.length; i += 50) {
    const chunk = values.slice(i, i + 50)
    if (chunk.length) out.push(...(await fxList(resource, { [`${column}[in]`]: chunk.join(',') }, { signal })))
  }
  return out
}

function clear(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key]
}

function clearMasters(): void {
  clear(ENTITIES)
  clear(REGIONS)
  clear(FX_MODELS)
  clear(STATUS_META)
  clear(TRADERS)
  STATUS_OPTIONS.length = 0
}

/** P_STAT: DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= gv_deal, '<code> - <text>'. */
export function statusHelp(statuses: readonly FxRow[], th: Thresholds): Array<[string, string]> {
  return statuses
    .filter((s) => txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE && txt(s, 'ZDEAL_STAT') !== '' && txt(s, 'ZDEAL_STAT') <= th.deal)
    .map((s): [string, string] => [txt(s, 'ZDEAL_STAT'), txt(s, 'ZDEAL_SDESC')])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/** The lookups the table and popups index with `!`, so every code a row can carry is in them. */
function applyMasters(ctx: DealContext, traders: readonly FxRow[], th: Thresholds, regions: readonly RegionOption[] | null = null): void {
  clearMasters()
  for (const r of ctx.comp.values()) {
    const code = txt(r, 'ZCOM_ID')
    ENTITIES[code] = { code, cocode: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT') }
    const region = txt(r, 'ZREG_ID')
    if (region) REGIONS[region] = region
  }
  // P_REG: the SAP region list (shared/fx/regions.ts), named where BPEXT names a code consistently.
  for (const r of regions ?? []) REGIONS[r.id] = regionLabel(r)
  for (const r of ctx.models.values()) {
    const code = txt(r, 'ZMOD_ID')
    FX_MODELS[code] = {
      code,
      desc: txt(r, 'ZMOD_DESC'),
      entities: txt(r, 'ZENT_DESC').split('-').filter(Boolean),
      curr: txt(r, 'ZCURR_DESC').split('-').filter(Boolean),
      region: txt(r, 'ZREG_ID'),
    }
  }
  for (const r of traders) {
    const code = txt(r, 'ZTCODE')
    if (code) TRADERS[code] = txt(r, 'ZTRADER') || txt(r, 'ZNAME')
  }
  for (const s of ctx.statuses) {
    if (txt(s, 'ZSUB_TYPE') !== FORWARD_SUB_TYPE) continue
    const code = txt(s, 'ZDEAL_STAT')
    STATUS_META[code] = { label: txt(s, 'ZDEAL_SDESC'), cls: STATUS_CLASS[code] ?? 'st-booked' }
  }
  STATUS_OPTIONS.push(...statusHelp(ctx.statuses, th))
}

type Related = { plans: readonly FxRow[]; invoices: readonly FxRow[]; bls: readonly FxRow[]; blStatuses: readonly FxRow[]; legs?: ReadonlyMap<string, readonly FxLeg[]> }

export function toDeal(d: DealIdRow, ctx: DealContext, comodit: ReadonlyMap<string, FxRow>, rel: Related): Deal {
  const { mc, comp } = dealJoin(ctx, d)
  const dealId = txt(d, 'ZDEAL_ID')
  const status = txt(d, 'ZDEAL_STAT')
  // b~zmod_id: the Master Contract's model.
  const modelId = mc ? txt(mc, 'ZMOD_ID') : ''
  ensureModel(modelId, mc)
  const origin = mc ? txt(mc, 'ZORIGIN') : ''
  if (origin && !ENTITIES[origin]) ENTITIES[origin] = { code: origin, cocode: '', name: origin }
  // b~zcommodity with e~zcom_desc (ZSGTSFTR_COMODIT).
  const comCode = mc ? txt(mc, 'ZCOMMODITY') : ''
  const comDesc = txt(comodit.get(comCode) ?? {}, 'ZCOM_DESC')
  const t1 = rel.invoices.filter((r) => txt(r, 'ZDEAL_ID') === dealId && isT1(r))
  return {
    dealId,
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: mc ? dmyFromIso(mc['ZMC_DATE']) : '',
    shipStart: mc ? dmyFromIso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? dmyFromIso(mc['ZSHIP_END']) : '',
    model: modelId,
    commodity: comCode ? `${comDesc} (${comCode})` : comDesc,
    trader: txt(d, 'ZTRD_CODE'),
    dealStart: dmyFromIso(d['ZS_DATE']),
    dealEnd: dmyFromIso(d['ZE_DATE']),
    dealStat: status,
    origin,
    region: comp ? txt(comp, 'ZREG_ID') : '',
    // b~zamt.
    mcAmtUsd: mc ? num(mc['ZAMT']) : 0,
    // ZSGTSFCDS_FX_N: the D1 / D2 forward legs (dealFx.ts); _OPTION_N is not served.
    fx: [...(rel.legs?.get(dealId) ?? [])],
    totInvUsd: totalInvoicedT1(t1),
    inv: invoiceLegs(dealId, rel),
    bls: rel.bls.filter((b) => txt(b, 'ZDEAL_ID') === dealId).map((b) => toBl(b, rel.blStatuses)),
  }
}

/** A deal whose model RULE_BT lacks still needs an FX_MODELS entry; its MC describes it. */
function ensureModel(modelId: string, mc: FxRow | undefined): void {
  if (!modelId || FX_MODELS[modelId]) return
  FX_MODELS[modelId] = {
    code: modelId,
    desc: mc ? txt(mc, 'ZMOD_DESC') : modelId,
    entities: mc ? txt(mc, 'ZENT_DESC').split('-').filter(Boolean) : [],
    curr: mc ? txt(mc, 'ZCURR_DESC').split('-').filter(Boolean) : [],
    region: '',
  }
}

const TTYPES = new Set(['T1', 'T2', 'T3'])

/** The planned legs (INV_REF), each overlaid with the invoice raised against it (BIL_ADJ). */
function invoiceLegs(dealId: string, rel: Related): InvoiceLeg[] {
  const raised = rel.invoices.filter((r) => txt(r, 'ZDEAL_ID') === dealId)
  return rel.plans
    .filter((p) => txt(p, 'ZDEAL_ID') === dealId && TTYPES.has(txt(p, 'ZTTYPE')))
    .map((p) => {
      const ttype = txt(p, 'ZTTYPE') as InvoiceLeg['ttype']
      const inv = raised.find((r) => txt(r, 'ZINV_TYPE') === ttype)
      const invNo = inv ? txt(inv, 'ZINV_NO') : ''
      return {
        ttype,
        ref: txt(p, 'ZINV_TRM_NO'),
        seller: txt(p, 'ZTRD_SELL'),
        buyer: txt(p, 'ZTRD_BUY'),
        qty: inv ? num(inv['ZQTY']) : 0,
        usdPrice: inv ? num(inv['ZUSD_PRICE']) : 0,
        dueDate: inv ? dmyFromIso(inv['ZDUE_DATE']) : '',
        invDate: inv ? dmyFromIso(inv['ZINV_DATE']) : '',
        invNo,
        marked: !!inv,
        invoiced: !!invNo,
        hb: inv ? txt(inv, 'ZHBKID') : '',
        acct: inv ? txt(inv, 'ZHKTID') : '',
        ptnr: inv ? txt(inv, 'ZPTNR_BKID') : '',
      }
    })
}

function toBl(b: FxRow, statuses: readonly FxRow[]): BillOfLading {
  const statusId = txt(b, 'ZBL_STAT_ID')
  const status = statuses.find((s) => txt(s, 'ZBL_ST_ID') === statusId)
  return {
    blNo: txt(b, 'ZBL_NO'),
    vessel: txt(b, 'ZBL_VSSL_NAME'),
    loadPort: txt(b, 'ZPOL'),
    dischargePort: txt(b, 'ZPOD'),
    shipDate: dmyFromIso(b['ZBL_DATE']),
    qty: num(b['ZQUANTITY']),
    status: status ? txt(status, 'ZBL_ST_NAME') || txt(status, 'ZBL_ST_DESC') : statusId,
  }
}
