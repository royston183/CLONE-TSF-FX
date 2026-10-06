/**
 * MO: Confirm FX Deal ID — Single Deal ID (ZSGTSFP002 / module pool ZSGTSF_PDEAL_ID_ANALYS)
 * against the SLC middleware.
 *
 * Reads, as the ABAP does them:
 *   Deal ID list (P_DEAL, search help ZSGTSFSH_DEAL_ID — not in the export, so no restriction)
 *                              ZSGTSFTR_DEALID                      middleware "tsfDealId"
 *   Header (FORM screen_desc_fields)
 *                              ZSGTSFTR_DEALID a LEFT JOIN ZSGTSFTR_MAS_CON b ON b~zmc_ref_no = a~zmc_ref
 *                              LEFT JOIN ZSGTSFTR_RULE_BT c ON c~zmod_id = b~zmod_id
 *                              LEFT JOIN ZSGTRMTR_TRADER d ON d~ztcode = a~ztrd_code
 *                                                   "tsfDealId", "masterContract", "fxModel", "trmTrader"
 *   Deal ID Status list box (FORM drop_down)
 *                              ZSGTSFTR_DEAL_ST WHERE zdeal_stat <> '' minus FX1 (model M034/35/36)
 *                              or minus FX2 (any other model), sorted, one per key   "tsfDealStatus"
 *   Model flags (status_9000)  ZSGTSFTR_RULE_BT ZNO_INV / ZSS / ZSUB_TYPE              "fxModel"
 *   REV (FORM top_data)        TVARVC NAME = 'ZSGTSF_UNWIND' SIGN = 'I' OPTI = 'EQ' LOW = SY-UNAME  "tvarvc"
 *   FX Deals (FORM deal_id_alv) ZSGTSFCDS_FX + ZSGTSFCDS_OPTION WHERE ztsf_deal_id = gv_deal
 *                              -> WAITING FOR API: "tsfvFx" (ZSGTSFV_FX) lacks the Deal ID / status /
 *                                 P&L columns and ZSGTSFCDS_OPTION has no resource at all
 *   Planned Trade Invoices (FORM invoice_plan + profit_margin_check)
 *                              ZSGTSFTR_ENT_STR, ZSGTSFTR_CUR_STR, ZSGTSFTR_RULE_BT, ZSGTSFTR_INV_REF,
 *                              ZSGTSFTR_ORG_PRO   "entityString", "curStr", "fxModel", "invRef", "orgPro"
 *                              — only when every T-row is stored in ZSGTSFTR_INV_REF; FORM new_inv_value
 *                              (no stored row, or a Short Straddle model) needs the FX legs -> WAITING
 *   Planned P&L (FORM alv_data_3)  needs the FX legs' premium and FX P&L -> WAITING FOR API
 *   MC Ref No help (MODULE f4_help)
 *                              ZSGTSFTR_COMP a JOIN ZSGTSFTR_MAS_CON b ON b~zorigin = a~zcom_id
 *                              AND b~zmc_stat IN ('03','04') AND b~zmod_id = gv_mod   "comp", "masterContract"
 *   Premium Adjustments (FORM premium_adjustments) class ZSGTSFCL_GET_PRE_ADJUSTMENT -> WAITING FOR API
 *   AUTHORITY-CHECK K_PCA on VTBFHA-PRCTR (FORM auth_check): only an info message in SAP; no browser
 *                              source -> WAITING FOR AUTH, nothing is refused.
 *
 * Writes: only Cancel Deal ID is a plain Z-table UPDATE (FORM deassign_data:
 * ZDEAL_STAT = '30' + ZCHANGED_BY/DATE/TIME WHERE zdeal_id = gv_deal) and is sent as exactly that.
 * Everything else posts through BAPIs / FMs, or needs values computed from the unserved legs:
 * see ACTION_WAITING.
 *
 * Nothing falls back to sample data.
 */
import { setDealStatus, dealStatusText, listDealIds } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num, sapUser } from '../../shared/fx/sap.ts'
import type { Deal, DealPick, DealScreen, Invoice, McHelp } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'

const FX_VIEW = 'tsfvFx'

/** Columns FORM deal_id_alv reads from ZSGTSFCDS_FX (the CDS over ZSGTSFV_FX), its WHERE included. */
// prettier-ignore
export const LEG_VIEW_COLUMNS = [
  'BUKRS', 'RFHA', 'SFHAART', 'BP_NAME', 'KONTRH', 'DBLFZ', 'DELFZ', 'XTEXT', 'ZCOM_ID', 'BS_1', 'BS_2',
  'CURR1', 'CURR2', 'F_CURR1', 'T_CURR1', 'AMT1', 'AMT2', 'OSPOT', 'OSWAP', 'OTOT_RATE', 'ZTSF_MC_REF_NO',
  'TXN_STATUS', 'ZCASH_AMT', 'ZTSF_DEAL_TYPE', 'ZTSF_DEAL_ID',
] as const

/** Columns MODULE f4_rfha_help filters ZSGTSFV_FX by (the Edit Deal Pair replacement help). */
export const REPLACEMENT_VIEW_COLUMNS = ['BUKRS', 'RFHA', 'SFHAART', 'DELFZ', 'BS_1', 'CURR1', 'AMT1', 'SAKTIV', 'TXN_STATUS'] as const

export const missingColumns = (have: readonly string[], need: readonly string[]): string[] => {
  const served = new Set(have)
  return need.filter((c) => !served.has(c))
}

/** The FX Deals gate: ZSGTSFCDS_OPTION has no middleware resource, so the legs are never complete. */
export function legsWaitingReason(viewColumns: readonly string[] | null): string {
  const fx =
    viewColumns === null
      ? `ZSGTSFCDS_FX (middleware "${FX_VIEW}") could not be read`
      : (() => {
          const missing = missingColumns(viewColumns, LEG_VIEW_COLUMNS)
          return missing.length ? `ZSGTSFCDS_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}` : ''
        })()
  return `${WAITING} — ${fx ? `${fx}; ` : ''}ZSGTSFCDS_OPTION (option legs) has no middleware resource.`
}

export function replacementWaitingReason(viewColumns: readonly string[] | null): string {
  const missing = viewColumns === null ? ['(unreadable)'] : missingColumns(viewColumns, REPLACEMENT_VIEW_COLUMNS)
  return `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ') || 'the legs being replaced'}; the New Transaction help (MODULE f4_rfha_help) also needs the selected FX leg.`
}

export const PL_WAITING = (legsReason: string) =>
  `${legsReason} The Planned P&L (FORM alv_data_3) is built from the FX legs' premium (BZBETR) and FX P&L.`

export const PREMIUM_WAITING = `${WAITING} — Premium Adjustments come from class ZSGTSFCL_GET_PRE_ADJUSTMENT (method GET_DATA, structure ZSGTSFST_PRE_ADJ), which has no API and is not in the export.`

export const DMS_LIST_WAITING = `${WAITING} — the Deal ID documents are kept by FM ZSGTSFFM_DMS (category 11), which has no API and is not in the export.`

export const AUTH_NOTE = 'WAITING FOR AUTH — AUTHORITY-CHECK K_PCA (CO_ACTION 3027) on the legs\' profit centres has no browser source; nothing is refused.'

/** WAITING FOR ACTION API, in the brief's words. */
export const waitingAction = (what: string, apis: string): string =>
  `WAITING FOR ACTION API — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

export const ACTION_WAITING = {
  /** USER_COMMAND_9001 CONF -> FORM update_inv_ref. */
  confirm: waitingAction(
    'Change / Confirm',
    'MODIFY ZSGTSFTR_INV_REF + UPDATE ZSGTSFTR_DEALID from the ZSGTSFCDS_FX legs, BAPI_EXCHANGERATE_GETDETAIL, ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS, BAPI_TRANSACTION_COMMIT / _ROLLBACK',
  ),
  /** USER_COMMAND_9000 SS_DEAL -> FORM save_ss_deal_data. */
  ssDeal: waitingAction(
    'Confirm & Save SS Deal ID',
    'MODIFY ZSGTSFTR_INV_REF + UPDATE ZSGTSFTR_DEALID from the ZSGTSFCDS_FX legs, BAPI_EXCHANGERATE_GETDETAIL',
  ),
  /** USER_COMMAND_9004 DEAL_UP -> FORM update_deal_id. */
  editPair: waitingAction(
    'Edit Deal Pair',
    'ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS on the old and new transaction, BAPI_TRANSACTION_COMMIT / _ROLLBACK, then UPDATE ZSGTSFTR_DEALID ZRFHA1-8',
  ),
  /** USER_COMMAND_9000 REV -> FORM reverse_mo_confirmaion. */
  reverse: waitingAction(
    'Reverse MO Confirmation',
    'UPDATE ZSGTSFTR_DEALID ZDEAL_STAT = 01 + DELETE FROM ZSGTSFTR_INV_REF — the middleware client has no delete',
  ),
  /** USER_COMMAND_9000 DMS. */
  dms: waitingAction('DMS', 'FM ZSGTSFFM_DMS, category 11'),
} as const

/* ------------------------------------------------------------------ Deal ID list */

export type DealList = { state: 'sap'; picks: DealPick[] } | { state: 'unavailable'; reason: string }

export function toPick(row: FxRow, statuses: readonly FxRow[]): DealPick {
  const status = txt(row, 'ZDEAL_STAT')
  return { dealId: txt(row, 'ZDEAL_ID'), status, statusText: dealStatusText({ statuses }, txt(row, 'ZSUB_TYPE'), status) }
}

/** P_DEAL's candidates: every ZSGTSFTR_DEALID row (newest first), with its DEAL_ST text. */
export async function loadDealList(signal?: AbortSignal): Promise<DealList> {
  try {
    const [rows, statuses] = await Promise.all([listDealIds({}, signal), fxList('tsfDealStatus', {}, { signal })])
    const seen = new Set<string>()
    const picks = rows
      .map((r) => toPick(r, statuses))
      .filter((p) => p.dealId && !seen.has(p.dealId) && (seen.add(p.dealId), true))
    return { state: 'sap', picks }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Confirm FX Deal ID: ZSGTSFTR_DEALID unavailable', error)
    return { state: 'unavailable', reason: `${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read: ${messageOf(error)}` }
  }
}

/* ------------------------------------------------------------------ Header */

/** FORM drop_down: the Deal ID Status list box, key -> text. */
export function statusListBox(statuses: readonly FxRow[], tsfModel: string): { key: string; text: string }[] {
  const optionModel = ['M034', 'M035', 'M036'].includes(tsfModel.slice(0, 4))
  const drop = optionModel ? 'FX1' : 'FX2'
  const list = statuses
    .filter((r) => txt(r, 'ZDEAL_STAT') !== '' && txt(r, 'ZSUB_TYPE') !== drop)
    .map((r) => ({ key: txt(r, 'ZDEAL_STAT'), text: txt(r, 'ZDEAL_SDESC') }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return list.filter((v, i) => i === 0 || list[i - 1]!.key !== v.key)
}

/**
 * gv_mod / gv_mod_desc: the MC's model (b~zmod_id). FORM deal_id_alv falls back to
 * ZSGTSFTR_DEALID-ZTSF_MODEL INNER JOIN ZSGTSFTR_RULE_BT only when that is blank — after
 * FORM top_data has already taken ZNO_INV / ZSS from the MC's model (`flagModel`).
 */
export function modelOf(
  deal: FxRow,
  mc: FxRow | undefined,
  models: readonly FxRow[],
): { id: string; desc: string; flagModel: string } {
  const mcModel = mc ? txt(mc, 'ZMOD_ID') : ''
  if (mcModel) return { id: mcModel, desc: txt(mc!, 'ZMOD_DESC'), flagModel: mcModel }
  const tsfModel = txt(deal, 'ZTSF_MODEL')
  const rule = tsfModel ? models.find((m) => txt(m, 'ZMOD_ID') === tsfModel) : undefined
  return rule
    ? { id: tsfModel, desc: txt(rule, 'ZMOD_DESC'), flagModel: '' }
    : { id: '', desc: mc ? txt(mc, 'ZMOD_DESC') : '', flagModel: '' }
}

export function toDeal(input: {
  deal: FxRow
  mc: FxRow | undefined
  models: readonly FxRow[]
  trader: FxRow | undefined
  statuses: readonly FxRow[]
  unwind: boolean
}): Deal {
  const { deal, mc, models, trader, statuses, unwind } = input
  const model = modelOf(deal, mc, models)
  // gt_model[ zmod_id = gv_mod ] at FORM top_data: the first RULE_BT row of the MC's model.
  const flags = model.flagModel ? models.find((m) => txt(m, 'ZMOD_ID') === model.flagModel) : undefined
  const status = txt(deal, 'ZDEAL_STAT')
  const listBox = statusListBox(statuses, txt(deal, 'ZTSF_MODEL'))
  return {
    dealId: txt(deal, 'ZDEAL_ID'),
    dealDesc: txt(deal, 'ZDEAL_DESC'),
    trader: txt(deal, 'ZTRD_CODE'),
    traderName: trader ? txt(trader, 'ZTRADER') : '',
    startDate: dmyFromIso(deal['ZS_DATE']),
    endDate: dmyFromIso(deal['ZE_DATE']),
    fxModel: model.id,
    modelDesc: model.desc,
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    currString: txt(deal, 'ZDEAL_CURR_DESC'),
    mcRef: mc ? txt(mc, 'ZMC_REF_NO') : '',
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: dmyFromIso(mc?.['ZMC_DATE']),
    shipStart: dmyFromIso(mc?.['ZSHIP_START']),
    shipEnd: dmyFromIso(mc?.['ZSHIP_END']),
    bukrs: '',
    status,
    statusText: listBox.find((v) => v.key === status)?.text ?? '',
    noInv: (flags ? txt(flags, 'ZNO_INV') !== '' : false) || status === '30',
    ssDeal: flags ? txt(flags, 'ZSS') === 'X' : false,
    unwind,
    legs: [],
  }
}

/** FORM top_data: TVARVC ZSGTSF_UNWIND / I / EQ holds the users who may reverse. */
export function canUnwind(tvarvc: readonly FxRow[], user: string): boolean {
  return (
    !!user &&
    tvarvc.some(
      (r) => txt(r, 'NAME') === 'ZSGTSF_UNWIND' && txt(r, 'SIGN') === 'I' && txt(r, 'OPTI') === 'EQ' && txt(r, 'LOW') === user,
    )
  )
}

/** MODULE f4_help: MCs of the deal's model at status 03 / 04 whose origin is a TSF entity. */
export function mcHelp(comp: readonly FxRow[], mcs: readonly FxRow[], model: string): McHelp[] {
  const entities = new Set(comp.map((r) => txt(r, 'ZCOM_ID')))
  const seen = new Set<string>()
  const out: McHelp[] = []
  for (const mc of mcs) {
    const ref = txt(mc, 'ZMC_REF_NO')
    if (!ref || seen.has(ref)) continue
    if (!['03', '04'].includes(txt(mc, 'ZMC_STAT')) || txt(mc, 'ZMOD_ID') !== model) continue
    if (!entities.has(txt(mc, 'ZORIGIN'))) continue
    seen.add(ref)
    out.push({ ref, desc: txt(mc, 'ZMC_DESC') })
  }
  return out
}

/* ------------------------------------------------------------------ Planned Trade Invoices */

/** ABAP packed-number assignment: round half away from zero to the column's decimals. */
export function abapRound(value: number, decimals: number): number {
  const f = 10 ** decimals
  return (Math.sign(value) * Math.round(Math.abs(value) * f + 1e-9)) / f
}

/** One gt_inv row: ZSGTSFTR_INV_REF's fields. */
export type InvRow = {
  zinv_trm_no: string
  zttype: string
  zdtype: string
  ztrd_sell: string
  ztrd_buy: string
  zmc_ref_p: string
  zmc_ref_s: string
  ztrd_curr: string
  zamt: number
  zinv_amt: number
  zex_rate: number
}

export type InvoicePlan = { state: 'ok'; rows: InvRow[] } | { state: 'waiting'; reason: string }

/**
 * FORM invoice_plan for what does not depend on the legs: three tickets T1-T3 along the entity
 * string (sell -> buy) in the currency string's currencies, each tied to the D1 / D2 deal by
 * the model's invoice links, then overlaid with the stored ZSGTSFTR_INV_REF values. A ticket
 * with no stored row, or any ticket of a Short Straddle model, is valued by FORM new_inv_value
 * from the FX legs — which are not served, so the plan waits.
 */
export function planInvoices(input: {
  dealId: string
  omc: string
  rules: readonly FxRow[]
  entStr: FxRow | undefined
  curStr: FxRow | undefined
  stored: readonly FxRow[]
  ss: boolean
  legsReason: string
}): InvoicePlan {
  const { dealId, omc, rules, entStr, curStr, stored, ss, legsReason } = input
  if (!omc) return { state: 'ok', rows: [] }
  if (rules.length >= 2) {
    return { state: 'waiting', reason: `${legsReason} FORM invoice_plan picks the model's link row (ZLINK_MODEL) by whether the deal has a D3 leg.` }
  }
  const rule = rules.find((r) => txt(r, 'ZD1_INV_LINK') !== '')
  const link = (col: string) => (rule ? txt(rule, col) : '')
  const e = (col: string) => (entStr ? txt(entStr, col) : '')
  const c = (col: string) => (curStr ? txt(curStr, col) : '')
  const dType = (seq: string) =>
    link('ZD1_INV_LINK') === seq ? 'D1'
    : link('ZD1_INV_LINK2') === seq ? 'D1'
    : link('ZD2_INV_LINK') === seq ? 'D2'
    : link('ZD2_INV_LINK2') === seq ? 'D2'
    : ''
  const ticket = (t: string, seq: string, sell: string, buy: string, curr: string): InvRow => ({
    zinv_trm_no: `${dealId}-${t}`,
    zttype: t,
    zdtype: dType(seq),
    ztrd_sell: sell,
    ztrd_buy: buy,
    zmc_ref_p: `${buy}-${sell}-P`,
    zmc_ref_s: `${sell}-${buy}-S`,
    ztrd_curr: curr,
    zamt: 0,
    zinv_amt: 0,
    zex_rate: 0,
  })
  const rows = [
    ticket('T1', '01', e('ZENT1'), e('ZENT2'), c('ZCURR1')),
    ticket('T2', '02', e('ZENT2'), e('ZENT3'), c('ZCURR2')),
    ticket('T3', '03', e('ZENT3'), e('ZENT1'), c('ZCURR3')),
  ]
  if (ss) return { state: 'waiting', reason: `${legsReason} A Short Straddle model values every ticket from the legs (FORM new_inv_value).` }
  const unstored: string[] = []
  for (const row of rows) {
    const s = stored.find((r) => txt(r, 'ZTTYPE') === row.zttype)
    if (!s) {
      unstored.push(row.zttype)
      continue
    }
    row.zex_rate = num(s['ZEX_RATE'])
    row.zamt = num(s['ZAMT'])
    row.zinv_amt = num(s['ZINV_AMT'])
  }
  if (unstored.length) {
    return {
      state: 'waiting',
      reason: `${legsReason} ZSGTSFTR_INV_REF holds no row for ${unstored.join(', ')}, so FORM new_inv_value would value them from the legs.`,
    }
  }
  return { state: 'ok', rows }
}

/**
 * FORM profit_margin_check: with ZSGTSFTR_ORG_PRO-ZPRO_MARG_INV maintained for the MC's origin,
 * M001 marks the D2 tickets up from the D1 ticket's rate and M002 marks the T1 ticket down.
 */
export function applyProfitMargin(rows: readonly InvRow[], model: string, profit: number): InvRow[] {
  if (!profit) return rows.map((r) => ({ ...r }))
  const d1 = rows.find((r) => r.zdtype === 'D1')
  const base = d1 ? d1.zex_rate : 0
  return rows.map((r) => {
    let rate: number | null = null
    if (model === 'M001' && r.zdtype === 'D2') rate = (base * (100 + profit)) / 100
    if (model === 'M002' && r.zttype === 'T1') rate = (base * (100 - profit)) / 100
    if (rate === null) return { ...r }
    const zex_rate = abapRound(rate, 7)
    return { ...r, zex_rate, zinv_amt: abapRound(r.zamt * zex_rate, 2) }
  })
}

export function toInvoice(r: InvRow): Invoice {
  return {
    tradeRef: r.zinv_trm_no,
    invType: r.zdtype ? `${r.zttype} / ${r.zdtype}` : r.zttype,
    exRate: r.zex_rate,
    amt: r.zamt,
    invAmt: r.zinv_amt,
    curr: r.ztrd_curr,
    // ZSGTSFTR_INV_REF has no due date; the column stays blank.
    due: '',
  }
}

/* ------------------------------------------------------------------ One Deal ID */

const first = <T>(rows: readonly T[]): T | undefined => rows[0]

async function columnsOrNull(resource: string, signal?: AbortSignal): Promise<string[] | null> {
  try {
    return await fxColumns(resource, signal)
  } catch (error) {
    if (isAbort(error)) throw error
    return null
  }
}

async function unwindAllowed(signal?: AbortSignal): Promise<boolean> {
  const [rows, user] = await Promise.all([
    fxList('tvarvc', { NAME: 'ZSGTSF_UNWIND', SIGN: 'I', OPTI: 'EQ' }, { signal }),
    sapUser(),
  ])
  return canUnwind(rows, user)
}

/**
 * Everything screen 9000 shows for one Deal ID. Returns null when ZSGTSFTR_DEALID has no such
 * row; throws when the middleware cannot be read (the caller shows the reason).
 */
export async function loadDealScreen(dealId: string, signal?: AbortSignal): Promise<DealScreen | null> {
  const rows = await fxList('tsfDealId', { ZDEAL_ID: dealId }, { signal })
  const deal = first(rows)
  if (!deal) return null
  const mcRef = txt(deal, 'ZMC_REF')
  const trdCode = txt(deal, 'ZTRD_CODE')
  const [mcs, models, statuses, traders, stored, unwind, viewColumns, comp, helpMcs] = await Promise.all([
    mcRef ? fxList('masterContract', { ZMC_REF_NO: mcRef }, { signal }) : Promise.resolve([] as FxRow[]),
    fxList('fxModel', {}, { signal }),
    fxList('tsfDealStatus', {}, { signal }),
    trdCode ? fxList('trmTrader', { ZTCODE: trdCode }, { signal }) : Promise.resolve([] as FxRow[]),
    fxList('invRef', { ZDEAL_ID: dealId }, { signal }),
    unwindAllowed(signal),
    columnsOrNull(FX_VIEW, signal),
    fxList('comp', {}, { signal }),
    fxList('masterContract', { 'ZMC_STAT[in]': '03,04' }, { signal }),
  ])
  const mc = first(mcs)
  const screenDeal = toDeal({ deal, mc, models, trader: first(traders), statuses, unwind })
  const legsReason = legsWaitingReason(viewColumns)

  const entId = mc ? txt(mc, 'ZENT_ID') : ''
  const currId = txt(deal, 'ZDEAL_CURR_ID')
  const origin = mc ? txt(mc, 'ZORIGIN') : ''
  const [entStrs, curStrs, orgPro] = await Promise.all([
    entId ? fxList('entityString', { ZENT_ID: entId }, { signal }) : Promise.resolve([] as FxRow[]),
    currId ? fxList('curStr', { ZCURR_ID: currId }, { signal }) : Promise.resolve([] as FxRow[]),
    // SELECT SINGLE ... WHERE zcom_id = gv_origin; a blank origin must not become "no filter".
    origin ? fxList('orgPro', { ZCOM_ID: origin }, { signal }) : Promise.resolve([] as FxRow[]),
  ])

  const plan = planInvoices({
    dealId,
    omc: screenDeal.mcRef,
    rules: models.filter((m) => txt(m, 'ZMOD_ID') === screenDeal.fxModel),
    entStr: first(entStrs),
    curStr: first(curStrs),
    stored,
    ss: screenDeal.ssDeal,
    legsReason,
  })
  const profit = num(first(orgPro)?.['ZPRO_MARG_INV'])

  return {
    deal: screenDeal,
    rows,
    legsWaiting: legsReason,
    invoices: plan.state === 'ok' ? applyProfitMargin(plan.rows, screenDeal.fxModel, profit).map(toInvoice) : null,
    invoiceWaiting: plan.state === 'waiting' ? plan.reason : null,
    plWaiting: PL_WAITING(legsReason),
    mcHelp: mcHelp(comp, helpMcs, screenDeal.fxModel),
    replacementWaiting: replacementWaitingReason(viewColumns),
  }
}

/**
 * FORM deassign_data: UPDATE zsgtsftr_dealid SET zdeal_stat = '30', zchanged_by / _date / _time
 * WHERE zdeal_id = gv_deal — every row of the Deal ID, nothing else.
 */
export async function cancelDealId(rows: readonly FxRow[]): Promise<void> {
  await setDealStatus(rows, '30')
}
