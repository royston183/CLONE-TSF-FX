/**
 * MO: Check Invoice Status of Deal IDs (ZSGTSFR014 / ZSGTSF_RDEAL_ID_INV_STAT) against the
 * SLC middleware.
 *
 * FORM get_data, as the report runs it:
 *   SELECT ... FROM zsgtsftr_dealid AS a                         (no WHERE: every Deal ID)
 *     LEFT OUTER JOIN zsgtsftr_mas_con AS b ON b~zmc_ref_no = a~zmc_ref
 *     LEFT OUTER JOIN zsgtsftr_comp    AS c ON c~zcom_id    = b~zorigin
 *     LEFT OUTER JOIN zsgtsftr_deal_st AS d ON d~zdeal_stat = a~zdeal_stat AND d~zsub_type = 'FX1'
 *   then DELETE by P_DATE (zs_date <= key date <= ze_date), P_REG, P_MOD, P_ORG — those stay
 *   in logic.ts filterRows. ZORIGIN / ZMOD_ID / ZMOD_DESC are the MC's (b~), ZREG_ID is COMP's.
 *
 * Selection-screen helps: P_ORG ZSGTSFSH_ENTITY (ZSGTSFTR_COMP), P_REG ZSGTSFSH_REGION (the
 * COMP region codes; no region text master is migrated, so no invented names), P_MOD
 * ZSGTSFSH_MODEL (ZSGTSFTR_RULE_BT).
 *
 * Read-only, like the report. What stays empty, and why:
 *  - D1(USD) (UTI_AMT): summed from ZSGTSFV_FX + ZSGTSFV_OP by ZTSF_MC_REF_NO / ZTSF_DEAL_ID.
 *    The middleware's "tsfvFx" lacks those columns and no option view is served, so the column
 *    shows '—' and the screen says WAITING FOR API (checked live with fxColumns).
 *  - Inv Status / T1(USD): the report reads ZSGTSFTR_BIL_ADJ but its assignment block is
 *    commented out, so it shows nothing there either — reproduced as blank.
 *
 * Nothing falls back to sample data: when ZSGTSFTR_DEALID cannot be read the list stays empty
 * and says WAITING FOR DEAL ID API.
 */
import { replaceInPlace, txt } from '../../shared/fx/masters.ts'
import type { DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { FORWARD_SUB_TYPE, dealJoin, listDealIds, loadDealContext, type DealContext } from '../../shared/fx/deal-id.ts'
import { fxColumns, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { MODELS, ORIGIN_OPTIONS, REGION_OPTIONS, STATUS_MAP } from './data.ts'
import type { CodeDesc, DealRow } from './types.ts'

export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'

/** The columns FORM get_data reads from ZSGTSFV_FX (and ZSGTSFV_OP) to sum D1(USD). */
export const UTILIZATION_COLUMNS = ['BUKRS', 'RFHA', 'ZTSF_DEAL_ID', 'ZTSF_DEAL_TYPE', 'ZTSF_MC_REF_NO', 'CURR1', 'CURR2', 'AMT1', 'AMT2'] as const

/** 'sap': ZSGTSFTR_DEALID and its masters were read; 'unavailable': they could not be. */
export type DataSource = 'sap' | 'unavailable'
export type Loaded = {
  rows: DealRow[]
  source: DataSource
  /** Why the list is empty ('unavailable'), or which columns are gated (D1(USD)). */
  notes: string[]
}

/** YYYY-MM-DD, the shape filterRows compares; '' for a missing date. */
const iso = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : '')

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const [ctx, deals, utilization] = await Promise.all([loadDealContext(signal), listDealIds({}, signal), utilizationGate(signal)])
    applyMasters(ctx)
    return { rows: deals.map((d) => toRow(d, ctx)), source: 'sap', notes: [utilization] }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Deal ID invoice status: ZSGTSFTR_DEALID unavailable', error)
    clearMasters()
    return { rows: [], source: 'unavailable', notes: [`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read`] }
  }
}

/**
 * D1(USD) needs ZSGTSFV_FX and ZSGTSFV_OP with the TSF deal columns. ZSGTSFV_OP has no
 * middleware resource at all, so the sum cannot be reproduced; the message names exactly
 * what is missing from what is served.
 */
export async function utilizationGate(signal?: AbortSignal): Promise<string> {
  let missing: string[] = [...UTILIZATION_COLUMNS]
  try {
    const served = new Set(await fxColumns('tsfvFx', signal))
    missing = UTILIZATION_COLUMNS.filter((c) => !served.has(c))
  } catch (error) {
    if (isAbort(error)) throw error
  }
  return utilizationReason(missing)
}

export function utilizationReason(missingFxColumns: readonly string[]): string {
  const fx = missingFxColumns.length ? `ZSGTSFV_FX (middleware "tsfvFx") does not serve ${missingFxColumns.join(', ')}; ` : ''
  return `D1(USD): WAITING FOR API — ${fx}ZSGTSFV_OP (option deals) has no middleware resource`
}

function clearMasters(): void {
  for (const code of Object.keys(STATUS_MAP)) delete STATUS_MAP[code]
  replaceInPlace(ORIGIN_OPTIONS, [])
  replaceInPlace(REGION_OPTIONS, [])
  replaceInPlace(MODELS, [])
}

const byId = (a: CodeDesc, b: CodeDesc) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** ZSGTSFSH_ENTITY: ZSGTSFTR_COMP. */
export function originHelp(comp: readonly FxRow[]): CodeDesc[] {
  return comp
    .map((r) => ({ id: txt(r, 'ZCOM_ID'), desc: txt(r, 'ZBUTXT') }))
    .filter((o) => o.id)
    .sort(byId)
}

/** ZSGTSFSH_REGION: the region codes the TSF entities carry (COMP-ZREG_ID); no text master exists. */
export function regionHelp(comp: readonly FxRow[]): CodeDesc[] {
  return [...new Set(comp.map((r) => txt(r, 'ZREG_ID')).filter(Boolean))].map((id) => ({ id, desc: '' })).sort(byId)
}

/** ZSGTSFSH_MODEL: ZSGTSFTR_RULE_BT, one entry per model. */
export function modelHelp(models: readonly FxRow[]): CodeDesc[] {
  const seen = new Map<string, CodeDesc>()
  for (const r of models) {
    const id = txt(r, 'ZMOD_ID')
    if (id && !seen.has(id)) seen.set(id, { id, desc: txt(r, 'ZMOD_DESC') })
  }
  return [...seen.values()].sort(byId)
}

/** ZSGTSFTR_DEAL_ST rows at sub type 'FX1' — the only ones the report's join reads. */
export function fx1Statuses(statuses: readonly FxRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const s of statuses) if (txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE && txt(s, 'ZDEAL_STAT')) map[txt(s, 'ZDEAL_STAT')] = txt(s, 'ZDEAL_SDESC')
  return map
}

function applyMasters(ctx: DealContext): void {
  const comp = [...ctx.comp.values()]
  replaceInPlace(ORIGIN_OPTIONS, originHelp(comp))
  replaceInPlace(REGION_OPTIONS, regionHelp(comp))
  replaceInPlace(MODELS, modelHelp([...ctx.models.values()]))
  for (const code of Object.keys(STATUS_MAP)) delete STATUS_MAP[code]
  Object.assign(STATUS_MAP, fx1Statuses(ctx.statuses))
}

export function toRow(d: DealIdRow, ctx: DealContext): DealRow {
  const { mc, comp } = dealJoin(ctx, d)
  const status = txt(d, 'ZDEAL_STAT')
  return {
    dealId: txt(d, 'ZDEAL_ID'),
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    startDate: iso(d['ZS_DATE']),
    endDate: iso(d['ZE_DATE']),
    rfha1: txt(d, 'ZRFHA1'),
    rfha2: txt(d, 'ZRFHA2'),
    rfha3: txt(d, 'ZRFHA3'),
    rfha4: txt(d, 'ZRFHA4'),
    rfha5: txt(d, 'ZRFHA5'),
    dealStatus: status,
    // LEFT OUTER JOIN zsgtsftr_deal_st ... AND d~zsub_type = 'FX1': blank when DEAL_ST has no FX1 row.
    dealStatusDesc: fx1Statuses(ctx.statuses)[status] ?? '',
    // b~zorigin, b~zmod_id, b~zmod_desc: the Master Contract's, blank without one (LEFT OUTER JOIN).
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    modelId: mc ? txt(mc, 'ZMOD_ID') : '',
    region: comp ? txt(comp, 'ZREG_ID') : '',
    modelDesc: mc ? txt(mc, 'ZMOD_DESC') : '',
    // ZSGTSFV_FX / ZSGTSFV_OP are not served with their TSF columns: WAITING FOR API.
    utiAmt: null,
    // The report's BIL_ADJ assignment is commented out: always blank.
    invStatus: '',
    t1Amt: null,
    bukrs1: txt(d, 'ZBUKRS1'),
    bukrs2: txt(d, 'ZBUKRS2'),
    trader: txt(d, 'ZTRD_CODE'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: mc ? iso(mc['ZMC_DATE']) : '',
    shipStart: mc ? iso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? iso(mc['ZSHIP_END']) : '',
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    currencyString: mc ? txt(mc, 'ZCURR_DESC') : '',
  }
}
