/**
 * MO: Deal ID Invoice Marking (ZSGTSFR015 / ZSGTSF_RDEAL_ID_INV_MARK) against the SLC
 * middleware.
 *
 * FORM get_data, "Mark Deal for invoicing Manual" (P_MARK — the only mode the screen has):
 *   SELECT ... FROM zsgtsftr_dealid AS a
 *     LEFT OUTER JOIN zsgtsftr_mas_con AS b ON b~zmc_ref_no = a~zmc_ref
 *     INNER JOIN      zsgtsftr_comp    AS c ON c~zcom_id    = b~zorigin
 *     LEFT OUTER JOIN zsgtsftr_deal_st AS d ON d~zdeal_stat = a~zdeal_stat AND d~zsub_type = 'FX1'
 *     LEFT OUTER JOIN zsgtsftr_rule_bt AS e ON e~zmod_id    = b~zmod_id
 *   WHERE a~zdeal_stat = '02' AND e~zno_inv = ''
 *     AND b~zship_start >= p_date-low AND b~zship_end >= p_date-high
 *   then SORT / DELETE ADJACENT DUPLICATES by zdeal_id and DELETE by P_REG / P_MOD / P_ORG.
 * The status, COMP, RULE_BT and duplicate rules are applied here (eligibleDeals); the date
 * range and the optional filters stay in logic.ts filterRows, as the screen filters live.
 *
 * Selection-screen helps: P_ORG ZSGTSFSH_ENTITY (ZSGTSFTR_COMP), P_REG ZSGTSFSH_REGION (the
 * COMP region codes), P_MOD ZSGTSFSH_MODEL (ZSGTSFTR_RULE_BT).
 *
 * Mark for Invoicing (fcode UPD) reproduces the report's own write exactly:
 *   UPDATE zsgtsftr_dealid SET zdeal_stat = '03' zchanged_by = sy-uname
 *          zchanged_date = sy-datum zchanged_time = sy-uzeit
 *    WHERE zdeal_id = .. AND zdeal_type = .. AND zsub_type = ..
 * one row per checked deal (shared/fx/deal-id.ts setDealStatus).
 *
 * Not reproduced:
 *  - Deal Amt (USD) (UTI_AMT): summed from ZSGTSFCDS_FX + ZSGTSFCDS_OPTION (D1, USD legs).
 *    "tsfvFx" lacks the TSF deal columns and no option view is served: WAITING FOR API.
 *  - AUTHORITY-CHECK F_BKPF_BUK on the CDS company codes: WAITING FOR AUTH, nothing refused.
 *  - P_VIEW ("Deals Automarked for invoicing", MODIFY to 03 on display): the screen has no
 *    such mode (LEGACY-NOT REACHED).
 *
 * Nothing falls back to sample data: when ZSGTSFTR_DEALID cannot be read the list stays empty
 * and says WAITING FOR DEAL ID API, and nothing can be marked.
 */
import { replaceInPlace, txt } from '../../shared/fx/masters.ts'
import type { DealRow as DealIdRow } from '../../shared/fx/master-contract.ts'
import { FORWARD_SUB_TYPE, dealJoin, listDealIds, loadDealContext, setDealStatus, type DealContext } from '../../shared/fx/deal-id.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { MODEL_OPTIONS, ORIGIN_OPTIONS, REGION_OPTIONS } from './data.ts'
import { enrichRow } from './logic.ts'
import type { DealRow } from './types.ts'

/** The report's selection: WHERE a~zdeal_stat = '02' (c_02). */
export const ELIGIBLE_STATUS = '02'
/** What Mark for Invoicing writes (c_03). */
export const MARKED_STATUS = '03'

export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'
export const WAITING_AUTH = 'WAITING FOR AUTH — AUTHORITY-CHECK F_BKPF_BUK (ACTVT 03) on the deals’ company codes has no browser source; nothing is refused'

/** The columns FORM get_data reads from ZSGTSFCDS_FX / _OPTION to sum the Deal Amt (USD). */
export const UTILIZATION_COLUMNS = ['BUKRS', 'ZTSF_DEAL_ID', 'ZTSF_DEAL_TYPE', 'ZTSF_MC_REF_NO', 'CURR1', 'CURR2', 'AMT1', 'AMT2'] as const

export type DataSource = 'sap' | 'unavailable'
export type Loaded = {
  rows: DealRow[]
  /** The DEALID rows behind the screen rows, by Deal ID — their key is needed to write. */
  keys: ReadonlyMap<string, DealIdRow>
  source: DataSource
  notes: string[]
}

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const [ctx, deals, ruleBt, utilization] = await Promise.all([
      loadDealContext(signal),
      listDealIds({ ZDEAL_STAT: ELIGIBLE_STATUS }, signal),
      // Every RULE_BT row: a model may carry several, and the join takes any with ZNO_INV = ''.
      fxList('fxModel', {}, { signal }),
      utilizationGate(signal),
    ])
    applyMasters(ctx, ruleBt)
    const eligible = eligibleDeals(deals, ctx, ruleBt)
    const keys = new Map<string, DealIdRow>()
    for (const d of eligible) keys.set(txt(d, 'ZDEAL_ID'), d)
    return { rows: eligible.map((d) => toRow(d, ctx)), keys, source: 'sap', notes: [utilization, WAITING_AUTH] }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Deal IDs for invoice marking: ZSGTSFTR_DEALID unavailable', error)
    replaceInPlace(ORIGIN_OPTIONS, [])
    replaceInPlace(REGION_OPTIONS, [])
    replaceInPlace(MODEL_OPTIONS, [])
    return { rows: [], keys: new Map(), source: 'unavailable', notes: [`${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read`] }
  }
}

export async function utilizationGate(signal?: AbortSignal): Promise<string> {
  let missing: string[] = [...UTILIZATION_COLUMNS]
  try {
    const served = new Set(await fxColumns('tsfvFx', signal))
    missing = UTILIZATION_COLUMNS.filter((c) => !served.has(c))
  } catch (error) {
    if (isAbort(error)) throw error
  }
  const fx = missing.length ? `ZSGTSFCDS_FX (middleware "tsfvFx") does not serve ${missing.join(', ')}; ` : ''
  return `Deal Amt (USD): WAITING FOR API — ${fx}ZSGTSFCDS_OPTION has no middleware resource`
}

/**
 * The SELECT's join conditions and WHERE (besides the date range): status 02, the MC's origin
 * in ZSGTSFTR_COMP (INNER JOIN), a RULE_BT row for the MC's model with ZNO_INV = '' (a missing
 * row is NULL there, which the WHERE drops too), one row per Deal ID, sorted by it.
 */
export function eligibleDeals(deals: readonly DealIdRow[], ctx: DealContext, ruleBt: readonly FxRow[]): DealIdRow[] {
  const invoiced = new Set(ruleBt.filter((r) => txt(r, 'ZNO_INV') === '').map((r) => txt(r, 'ZMOD_ID')))
  const seen = new Set<string>()
  return deals
    .filter((d) => {
      if (txt(d, 'ZDEAL_STAT') !== ELIGIBLE_STATUS) return false
      const { mc, comp } = dealJoin(ctx, d)
      if (!mc || !comp) return false
      if (!invoiced.has(txt(mc, 'ZMOD_ID'))) return false
      const id = txt(d, 'ZDEAL_ID')
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .sort((a, b) => (txt(a, 'ZDEAL_ID') < txt(b, 'ZDEAL_ID') ? -1 : txt(a, 'ZDEAL_ID') > txt(b, 'ZDEAL_ID') ? 1 : 0))
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].filter(Boolean).sort()

/** P_ORG (ZSGTSFSH_ENTITY: COMP-ZCOM_ID), P_REG (COMP-ZREG_ID), P_MOD (ZSGTSFSH_MODEL: RULE_BT-ZMOD_ID). */
export function selectionHelps(comp: readonly FxRow[], ruleBt: readonly FxRow[]): { origins: string[]; regions: string[]; models: string[] } {
  return {
    origins: sorted(comp.map((r) => txt(r, 'ZCOM_ID'))),
    regions: sorted(comp.map((r) => txt(r, 'ZREG_ID'))),
    models: sorted(ruleBt.map((r) => txt(r, 'ZMOD_ID'))),
  }
}

function applyMasters(ctx: DealContext, ruleBt: readonly FxRow[]): void {
  const helps = selectionHelps([...ctx.comp.values()], ruleBt)
  replaceInPlace(ORIGIN_OPTIONS, helps.origins)
  replaceInPlace(REGION_OPTIONS, helps.regions)
  replaceInPlace(MODEL_OPTIONS, helps.models)
}

export function toRow(d: DealIdRow, ctx: DealContext): DealRow {
  const { mc, comp } = dealJoin(ctx, d)
  const status = txt(d, 'ZDEAL_STAT')
  const fx1 = ctx.statuses.find((s) => txt(s, 'ZSUB_TYPE') === FORWARD_SUB_TYPE && txt(s, 'ZDEAL_STAT') === status)
  const row = enrichRow({
    dealId: txt(d, 'ZDEAL_ID'),
    dealDesc: txt(d, 'ZDEAL_DESC'),
    mcRef: txt(d, 'ZMC_REF'),
    // b~zcom_desc.
    commodity: mc ? txt(mc, 'ZCOM_DESC') : '',
    dealStart: dmyFromIso(d['ZS_DATE']),
    dealEnd: dmyFromIso(d['ZE_DATE']),
    // b~zorigin, b~zmod_id: the MC's.
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    model: mc ? txt(mc, 'ZMOD_ID') : '',
    region: comp ? txt(comp, 'ZREG_ID') : '',
    // UTI_AMT: ZSGTSFCDS_FX / _OPTION not served — WAITING FOR API.
    amount: null,
    shipStart: mc ? dmyFromIso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? dmyFromIso(mc['ZSHIP_END']) : '',
    trader: txt(d, 'ZTRD_CODE'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: mc ? dmyFromIso(mc['ZMC_DATE']) : '',
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    currencyString: mc ? txt(mc, 'ZCURR_DESC') : '',
  })
  return {
    ...row,
    status,
    // LEFT OUTER JOIN zsgtsftr_deal_st ... AND zsub_type = 'FX1'.
    statusDesc: fx1 ? txt(fx1, 'ZDEAL_SDESC') : '',
    // b~zmod_desc.
    modelDesc: mc ? txt(mc, 'ZMOD_DESC') : '',
  }
}

/** Mark for Invoicing: each checked eligible Deal ID to 03. Throws on the first failure, naming what moved. */
export async function markForInvoicing(deals: readonly DealIdRow[]): Promise<void> {
  await setDealStatus(deals, MARKED_STATUS)
}
