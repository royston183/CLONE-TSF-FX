/**
 * ZSGTSFP017 — Confirm FX Deal ID for SS (module pool ZSGTSF_PDEAL_MO_SS) against the SLC
 * middleware.
 *
 * Header (FORM screen_desc_fields): ZSGTSFTR_DEALID a
 *   LEFT JOIN ZSGTSFTR_MAS_CON b ON b~zmc_ref_no = a~zmc_ref
 *   LEFT JOIN ZSGTSFTR_RULE_BT c ON c~zmod_id = b~zmod_id
 *   LEFT JOIN ZSGTRMTR_TRADER  d ON d~ztcode  = a~ztrd_code
 *   -> "tsfDealId", "masterContract", "fxModel", "trmTrader".
 * Status list box (FORM drop_down): ZSGTSFTR_DEAL_ST WHERE zdeal_stat <> '', "stat - sdesc",
 *   SORT BY key, DELETE ADJACENT DUPLICATES -> "tsfDealStatus".
 * SS / no-invoice flags: ZSGTSFTR_RULE_BT-ZSS / -ZNO_INV of the MC's model (gt_model).
 * Reverse authorisation: TVARVC NAME = 'ZSGTSF_UNWIND', SIGN 'I', OPTI 'EQ', LOW = SY-UNAME
 *   -> "tvarvc".
 * FX legs (FORM deal_id_alv): ZSGTSFCDS_FX + ZSGTSFCDS_OPTION WHERE ztsf_deal_id = deal, plus
 *   VTBFHA-ZTSF_EX_OPT_NO -> the forward / swap legs are TrmFxApp rows (ZSGTSFTR_APP_STR) WHERE
 *   ZtsfDealID = deal, each with its FxTransaction (shared/fx/app-str.ts): Deal type (D1..), MC ref
 *   and TXN_STATUS from the APP_STR row, partner / dates / amounts / rate from SAP. Still
 *   WAITING FOR API: the option legs (ZSGTSFCDS_OPTION: strike, premium), the partner name, and the
 *   legs' P&L. Planned P&L and Premium Adjustments are built from those, so they wait with them.
 * Invoice plan (FORM invoice_plan): ZSGTSFTR_ENT_STR / _CUR_STR / _RULE_BT links, amounts from
 *   ZSGTSFTR_INV_REF ("invRef"), then FORM profit_margin_check (ZSGTSFTR_ORG_PRO "orgPro").
 *   Wherever the ABAP would compute from the legs instead (Short Straddle, no INV_REF row,
 *   FX2 option logic, a two-row model) the plan says WAITING FOR API.
 *
 * Writes: only the ABAP's own plain UPDATEs of ZSGTSFTR_DEALID (Cancel -> 30, SS Deallocation
 * -> 50, Reverse MO Confirmation -> 01). Everything that needs a BAPI / FM is WAITING FOR
 * ACTION API. Nothing falls back to sample data.
 */
import { messageOf } from '../../shared/fx/master-contract.ts'
import { setDealStatus } from '../../shared/fx/deal-id.ts'
import { tradeCurrency } from '../../shared/fx/currency-string.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num, sapUser } from '../../shared/fx/sap.ts'
import { loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { loadNdfViews, ndfExtras, ndfKey, viewsByKey } from '../../shared/fx/ndf-columns.ts'
import { leg } from './data.ts'
import type { Deal, DealDb, Invoice, Leg } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'
export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'
const NOT_POSTED = 'Nothing was posted to SAP.'

/** ZSGTSFV_FX, the SQL view of ZSGTSFCDS_FX. */
export const FX_VIEW = 'tsfvFx'

/** The ZSGTSFV_FX columns MODULE f4_rfha_help selects and filters on (New Transaction F4). */
export const FX_F4_COLUMNS = [
  'BUKRS', 'RFHA', 'XTEXT', 'DBLFZ', 'DELFZ', 'BS_1', 'CURR1', 'AMT1', 'BS_2', 'CURR2', 'AMT2',
  'SFHAART', 'SAKTIV', 'TXN_STATUS',
] as const

export const missingColumns = (have: readonly string[], need: readonly string[]): string[] =>
  need.filter((c) => !have.includes(c))

/** Why the FX Deals grid is empty: nothing carries the Deal ID, or the legs could not be read. */
export function legsWaitingReason(subType: string, readError: string | null): string {
  if (readError !== null) return `${WAITING} — the FX legs (ZSGTSFTR_APP_STR / FxTransaction) could not be read: ${readError}`
  const option = subType === 'FX2' ? ' Its option legs (ZSGTSFCDS_OPTION) are not served.' : ''
  return `No FX transaction in ZSGTSFTR_APP_STR carries this Deal ID.${option}`
}

/** What is still missing on a grid that does show legs (option legs, strike, premium, P&L). */
export const LEGS_PARTIAL_NOTE =
  `${WAITING} — option legs (ZSGTSFCDS_OPTION: strike, premium), the partner name and the legs' P&L are not served; the P&L columns show —.`

/** Deal IDs carried by TrmFxApp rows (ZSGTSFCDS_FX-ZTSF_DEAL_ID); '' is not a Deal ID. */
export const LEG_APP_FILTER = "ZtsfDealID ne ''"

const day = (v: string | null | undefined): string => (v ? dmyFromIso(v) : '')

/** One FX Deals row (gt_top) from a TrmFxApp row and its FxTransaction; amounts are signed, a sold currency negative. */
export function toLeg({ fx, app }: FxWithApp, view?: FxRow): Leg {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const leadAmt = num(buysLead ? fx.BuyAmount : fx.SellAmount)
  const followAmt = num(buysLead ? fx.SellAmount : fx.BuyAmount)
  return leg({
    bukrs: fx.CompanyCode,
    rfha: fx.FinancialTransaction,
    dealType: app.ZtsfDealType ?? '',
    bpName: fx.Partner,
    instrument: fx.TransactionType,
    tradeDate: day(fx.ContractDate),
    valueDate: day(fx.ValueDate),
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? leadAmt : -leadAmt,
    bs2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: buysLead ? -followAmt : followAmt,
    allInRate: num(fx.ForwardRate),
    strike: 0,
    mcRef: app.ZtsfMcRefNo ?? '',
    txnStatus: app.TxnStatus ?? '',
    fxPl: 0,
    setPl: 0,
    premAmt: 0,
    premCurr: '',
    pInr: 0,
    ndf: ndfExtras(fx, app, view),
  })
}

/** The legs by Deal ID, in transaction order. A reversed transaction (ActiveStatus 3) is not a leg. */
export function legsByDeal(rows: readonly FxWithApp[], views: readonly FxRow[] = []): Map<string, Leg[]> {
  const out = new Map<string, Leg[]>()
  const viewBy = viewsByKey(views)
  for (const r of rows) {
    const id = r.app.ZtsfDealID ?? ''
    if (!id || r.fx.ActiveStatus === '3') continue
    out.set(id, [...(out.get(id) ?? []), toLeg(r, viewBy.get(ndfKey(r.fx.CompanyCode, r.fx.FinancialTransaction)))])
  }
  return out
}

/** Why the New Transaction F4 on Edit Deal Pair has no candidates. */
export function replacementsWaitingReason(fxCols: readonly string[] | null): string {
  if (fxCols === null) return `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") could not be read.`
  const missing = missingColumns(fxCols, FX_F4_COLUMNS)
  return missing.length ? `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` : ''
}

export const PL_WAITING =
  `${WAITING} — the Planned P&L (FORM alv_data_3) also needs the option legs (ZSGTSFCDS_OPTION) and the settlement / exchange-rate figures, which are not served.`

export const PREMIUM_WAITING =
  `${WAITING} — Premium Adjustments come from class ZSGTSFCL_GET_PRE_ADJUSTMENT->GET_DATA (not in the export) and the option legs (ZSGTSFCDS_OPTION); neither has an API yet.`

export const CONFIRM_WAITING =
  `${WAITING_ACTION} — Change / Confirm (MODIFY ZSGTSFTR_INV_REF and UPDATE ZSGTSFTR_DEALID to 02 with the P&L, ` +
  'which needs BAPI_EXCHANGERATE_GETDETAIL and the FX legs; on an MC change ZSGTRMFM_VTBFHA_EXPORT + ' +
  `BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS + BAPI_TRANSACTION_COMMIT) has no API yet. ${NOT_POSTED}`

export const SAVE_PL_WAITING =
  `${WAITING_ACTION} — Save P&L Value (MODIFY ZSGTSFTR_INV_REF and UPDATE ZSGTSFTR_DEALID ZPL*, ` +
  `which needs BAPI_EXCHANGERATE_GETDETAIL and the FX legs) has no API yet. ${NOT_POSTED}`

export const DEAL_PAIR_WAITING =
  `${WAITING_ACTION} — Edit Deal Pair (ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS ` +
  `on the old and the new transaction, BAPI_TRANSACTION_COMMIT / _ROLLBACK, then UPDATE ZSGTSFTR_DEALID ZRFHAn) has no API yet. ${NOT_POSTED}`

export const DMS_WAITING = `${WAITING_ACTION} — DMS (function module ZSGTSFFM_DMS, category 11) has no API yet. ${NOT_POSTED}`

export const REVERSE_INV_REF_WAITING =
  `${WAITING_ACTION} — Reverse MO Confirmation also deletes this Deal ID's ZSGTSFTR_INV_REF rows ` +
  `(DELETE FROM zsgtsftr_inv_ref), and the middleware client has no delete. ${NOT_POSTED}`

/* ------------------------------------------------------------------ status list box */

export type StatusOption = { key: string; text: string }

/** FORM drop_down: every ZSGTSFTR_DEAL_ST row with a status, "stat - sdesc", one per key (first in key order). */
export function statusOptions(rows: readonly FxRow[]): StatusOption[] {
  const sorted = [...rows].sort((a, b) =>
    `${txt(a, 'ZDEAL_TYPE')}|${txt(a, 'ZSUB_TYPE')}`.localeCompare(`${txt(b, 'ZDEAL_TYPE')}|${txt(b, 'ZSUB_TYPE')}`),
  )
  const out = new Map<string, StatusOption>()
  for (const r of sorted) {
    const key = txt(r, 'ZDEAL_STAT')
    if (!key || out.has(key)) continue
    out.set(key, { key, text: `${key} - ${txt(r, 'ZDEAL_SDESC')}` })
  }
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/* ------------------------------------------------------------------ invoice plan */

export type PlanInput = {
  dealId: string
  /** gv_omc: the MC's ZMC_REF_NO from the header join ('' when the deal has no MC). */
  mcRef: string
  /** ZSGTSFTR_MAS_CON row of gv_omc. */
  mc: FxRow | undefined
  /** gv_mod after FORM deal_id_alv (MC model, else ZTSF_MODEL). */
  modelId: string
  /** ZSGTSFTR_DEALID-ZDEAL_CURR_ID. */
  dealCurrId: string
  /** gv_origin: the MC's ZORIGIN (ZSGTSFTR_ORG_PRO lookup). */
  origin: string
  isSS: boolean
  rules: readonly FxRow[]
  entStr: readonly FxRow[]
  curStr: readonly FxRow[]
  orgPro: readonly FxRow[]
  /** This Deal ID's ZSGTSFTR_INV_REF rows. */
  invRef: readonly FxRow[]
}

export type Plan = { invoices: Invoice[]; waiting: string }

type Line = Invoice & { zamt: number }

const linkDealType = (rule: FxRow | undefined, n: string): string => {
  if (!rule) return ''
  if (txt(rule, 'ZD1_INV_LINK') === n || txt(rule, 'ZD1_INV_LINK2') === n) return 'D1'
  if (txt(rule, 'ZD2_INV_LINK') === n || txt(rule, 'ZD2_INV_LINK2') === n) return 'D2'
  return ''
}

/**
 * FORM invoice_plan + FORM profit_margin_check, for the cases the middleware can reproduce.
 * The trade lines T1..T3 come from the MC's entity string, the deal's currency string and the
 * model's invoice links; their amounts and rates from ZSGTSFTR_INV_REF. The ABAP computes the
 * amounts from the FX legs instead (FORM new_inv_value) for a Short Straddle model, for a line
 * without an INV_REF row and for an FX2 model (the lv_record >= 4 option logic), and picks the
 * rule row by the presence of a D3 leg for a two-row model: those return WAITING FOR API.
 */
export function planInvoices(p: PlanInput): Plan {
  if (!p.mcRef) return { invoices: [], waiting: '' }

  const legsNeeded = (why: string): Plan => ({
    invoices: [],
    waiting: `${WAITING} — ${why} needs the option legs (ZSGTSFCDS_OPTION) and the ABAP's amount computation (FORM new_inv_value), which are not served.`,
  })

  const modelRules = p.rules.filter((r) => txt(r, 'ZMOD_ID') === p.modelId)
  if (modelRules.length >= 2) return legsNeeded(`The invoice links of model ${p.modelId} (two ZSGTSFTR_RULE_BT rows, chosen by the D3 leg)`)
  const rule = modelRules.find((r) => txt(r, 'ZD1_INV_LINK') !== '')

  const entId = p.mc ? txt(p.mc, 'ZENT_ID') : ''
  const ent = entId ? p.entStr.find((r) => txt(r, 'ZENT_ID') === entId) : undefined
  const cur = p.dealCurrId ? p.curStr.find((r) => txt(r, 'ZCURR_ID') === p.dealCurrId) : undefined
  const e = (n: 1 | 2 | 3) => (ent ? txt(ent, `ZENT${n}`) : '')
  const c = (n: 1 | 2 | 3) => tradeCurrency(cur, n)

  const shape: [string, string, string, string, string][] = [
    // ttype, link, sell, buy, currency
    ['T1', '01', e(1), e(2), c(1)],
    ['T2', '02', e(2), e(3), c(2)],
    ['T3', '03', e(3), e(1), c(3)],
  ]

  if (p.isSS) return legsNeeded('A Short Straddle invoice plan (FORM new_inv_value)')
  const subType = modelRules[0] ? txt(modelRules[0], 'ZSUB_TYPE') : ''
  if (subType === 'FX2') return legsNeeded('The option invoice plan of an FX2 model (lv_record over gt_top)')

  const lines: Line[] = []
  for (const [ttype, link, sell, buy, currency] of shape) {
    const ref = p.invRef.find((r) => txt(r, 'ZTTYPE') === ttype)
    if (!ref) return legsNeeded(`Trade line ${ttype} has no ZSGTSFTR_INV_REF row; computing it (FORM new_inv_value)`)
    const zamt = num(ref['ZAMT'])
    const invAmt = num(ref['ZINV_AMT'])
    let exRate = num(ref['ZEX_RATE'])
    // Last loop of FORM invoice_plan: zex_rate = zinv_amt / zamt, unchanged on a zero divide.
    if (zamt !== 0) exRate = invAmt / zamt
    lines.push({
      ttype,
      dtype: linkDealType(rule, link),
      buy,
      sell,
      currency,
      exRate,
      invAmt,
      invAmtUsd: zamt,
      zamt,
      trmRef: `${p.dealId}-${ttype}`,
      mcRef: `${buy}-${sell}-P / ${sell}-${buy}-S`,
    })
  }

  applyProfitMargin(lines, p)
  return { invoices: lines.map(toInvoice), waiting: '' }
}

const toInvoice = (l: Line): Invoice => ({
  ttype: l.ttype,
  dtype: l.dtype,
  buy: l.buy,
  sell: l.sell,
  currency: l.currency,
  exRate: l.exRate,
  invAmt: l.invAmt,
  invAmtUsd: l.invAmtUsd,
  trmRef: l.trmRef,
  mcRef: l.mcRef,
})

/**
 * FORM profit_margin_check: with a ZPRO_MARG_INV for the origin, M001 marks up the D2 lines
 * and M002 marks down T1 from the D1 line's rate (0 when there is no D1 line).
 */
function applyProfitMargin(lines: Line[], p: PlanInput): void {
  const org = p.orgPro.find((r) => txt(r, 'ZCOM_ID') === p.origin)
  const profit = org ? num(org['ZPRO_MARG_INV']) : 0
  if (!profit) return
  const d1Rate = lines.find((l) => l.dtype === 'D1')?.exRate ?? 0
  for (const l of lines) {
    if (p.modelId === 'M001' && l.dtype === 'D2') l.exRate = (d1Rate * (100 + profit)) / 100
    else if (p.modelId === 'M002' && l.ttype === 'T1') l.exRate = (d1Rate * (100 - profit)) / 100
    else continue
    l.invAmt = l.zamt * l.exRate
  }
}

/* ------------------------------------------------------------------ deal header */

export type Masters = {
  mcs: readonly FxRow[]
  rules: readonly FxRow[]
  traders: readonly FxRow[]
  statuses: readonly StatusOption[]
  entStr: readonly FxRow[]
  curStr: readonly FxRow[]
  orgPro: readonly FxRow[]
  invRef: readonly FxRow[]
  /** TVARVC rows NAME = 'ZSGTSF_UNWIND'. */
  unwind: readonly FxRow[]
  /** SY-UNAME as the audit columns hold it. */
  user: string
  /** ZSGTSFV_FX's columns, or null when its meta could not be read. */
  fxColumns: readonly string[] | null
  /** The FX legs by Deal ID (TrmFxApp + FxTransaction). */
  legs: ReadonlyMap<string, readonly Leg[]>
  /** Why the legs could not be read; null when they were. */
  legsError: string | null
}

const first = (rows: readonly FxRow[], column: string, value: string): FxRow | undefined =>
  value ? rows.find((r) => txt(r, column) === value) : undefined

/** FORM top_data's TVARVC check: the user is listed under ZSGTSF_UNWIND. */
export function unwindAuthorized(rows: readonly FxRow[], user: string): boolean {
  return !!user && rows.some((r) => txt(r, 'SIGN') === 'I' && txt(r, 'OPTI') === 'EQ' && txt(r, 'LOW') === user)
}

export function toDeal(row: FxRow, m: Masters): Deal {
  const dealId = txt(row, 'ZDEAL_ID')
  const mc = first(m.mcs, 'ZMC_REF_NO', txt(row, 'ZMC_REF'))
  const trader = first(m.traders, 'ZTCODE', txt(row, 'ZTRD_CODE'))
  const mcModel = mc ? txt(mc, 'ZMOD_ID') : ''

  // gv_noinv / gv_ss are read before FORM deal_id_alv, i.e. from the MC's model only.
  const flags = first(m.rules, 'ZMOD_ID', mcModel)
  // FORM deal_id_alv: without an MC model, ZTSF_MODEL INNER JOIN ZSGTSFTR_RULE_BT.
  let modelId = mcModel
  let modelDesc = mc ? txt(mc, 'ZMOD_DESC') : ''
  if (!modelId) {
    const own = first(m.rules, 'ZMOD_ID', txt(row, 'ZTSF_MODEL'))
    if (own) {
      modelId = txt(own, 'ZMOD_ID')
      modelDesc = txt(own, 'ZMOD_DESC')
    }
  }

  const status = txt(row, 'ZDEAL_STAT')
  const isSS = flags ? txt(flags, 'ZSS') !== '' : false
  const mcRef = mc ? txt(mc, 'ZMC_REF_NO') : ''
  const plan = planInvoices({
    dealId,
    mcRef,
    mc,
    modelId,
    dealCurrId: txt(row, 'ZDEAL_CURR_ID'),
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    isSS,
    rules: m.rules,
    entStr: m.entStr,
    curStr: m.curStr,
    orgPro: m.orgPro,
    invRef: m.invRef.filter((r) => txt(r, 'ZDEAL_ID') === dealId),
  })

  return {
    key: { ZDEAL_ID: dealId, ZDEAL_TYPE: txt(row, 'ZDEAL_TYPE'), ZSUB_TYPE: txt(row, 'ZSUB_TYPE') },
    dealId,
    dealRef: txt(row, 'ZDEAL_REF'),
    startDate: dmyFromIso(row['ZS_DATE']),
    endDate: dmyFromIso(row['ZE_DATE']),
    mcRefNo: mcRef,
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: dmyFromIso(mc?.['ZMC_DATE']),
    shipStart: dmyFromIso(mc?.['ZSHIP_START']),
    shipEnd: dmyFromIso(mc?.['ZSHIP_END']),
    fxModel: modelId,
    fxModelDesc: modelDesc,
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    fxInvModel: txt(row, 'ZFX_INV_MODEL'),
    traderCode: txt(row, 'ZTRD_CODE'),
    traderDesc: trader ? txt(trader, 'ZTRADER') : '',
    currString: txt(row, 'ZDEAL_CURR_DESC'),
    status,
    statusText: m.statuses.find((s) => s.key === status)?.text ?? status,
    noInvoiceModel: flags ? txt(flags, 'ZNO_INV') !== '' : false,
    isSS,
    reversalAuthorized: unwindAuthorized(m.unwind, m.user),
    legs: [...(m.legs.get(dealId) ?? [])],
    legsWaiting: legsWaitingReason(txt(row, 'ZSUB_TYPE'), m.legsError),
    invoices: plan.invoices,
    invoicesWaiting: plan.waiting,
  }
}

/* ------------------------------------------------------------------ load */

export type DataSource = 'sap' | 'unavailable'
export type Loaded = { deals: DealDb; source: DataSource; reason: string; replacementsWaiting: string }

/** Every Deal ID with its header, flags and invoice plan. No seed fallback. */
export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  const opts = { signal }
  try {
    const [rows, mcs, rules, traders, statuses, entStr, curStr, orgPro, invRef, unwind, user, fxCols] = await Promise.all([
      fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal }),
      fxList('masterContract', {}, opts),
      // gt_model: WHERE zmod_id <> ''.
      fxList('fxModel', { 'ZMOD_ID[ne]': '' }, opts),
      fxList('trmTrader', {}, opts),
      fxList('tsfDealStatus', {}, opts),
      fxList('entityString', {}, opts),
      fxList('curStr', {}, opts),
      fxList('orgPro', {}, opts),
      fxList('invRef', {}, opts),
      fxList('tvarvc', { NAME: 'ZSGTSF_UNWIND' }, opts),
      sapUser(),
      fxColumns(FX_VIEW, signal).catch((error: unknown) => {
        if (isAbort(error)) throw error
        return null
      }),
    ])
    let legs: ReadonlyMap<string, readonly Leg[]> = new Map()
    let legsError: string | null = null
    try {
      const legRows = await loadFxWithApp(LEG_APP_FILTER, signal)
      legs = legsByDeal(legRows, await loadNdfViews(legRows.map((r) => r.fx), signal))
    } catch (error) {
      if (isAbort(error)) throw error
      legsError = messageOf(error)
    }
    const m: Masters = {
      mcs,
      rules,
      traders,
      statuses: statusOptions(statuses),
      entStr,
      curStr,
      orgPro,
      invRef,
      unwind,
      user,
      fxColumns: fxCols,
      legs,
      legsError,
    }
    const deals: DealDb = {}
    for (const r of rows) {
      const id = txt(r, 'ZDEAL_ID')
      if (id && !deals[id]) deals[id] = toDeal(r, m)
    }
    return { deals, source: 'sap', reason: '', replacementsWaiting: replacementsWaitingReason(fxCols) }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Confirm FX Deal ID for SS: ZSGTSFTR_DEALID unavailable', error)
    return {
      deals: {},
      source: 'unavailable',
      reason: `${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID and its masters could not be read: ${messageOf(error)}`,
      replacementsWaiting: replacementsWaitingReason(null),
    }
  }
}

/* ------------------------------------------------------------------ writes */

/** FORM deassign_data: UPDATE zsgtsftr_dealid SET zdeal_stat = '30' + changed stamp. */
export function cancelDealId(deal: Deal): Promise<void> {
  return setDealStatus([deal.key], '30')
}

/** FORM deallocate_deal: UPDATE zsgtsftr_dealid SET zdeal_stat = '50' + changed stamp. */
export function ssDeallocate(deal: Deal): Promise<void> {
  return setDealStatus([deal.key], '50')
}

/**
 * FORM reverse_mo_confirmaion: UPDATE zdeal_stat = '01' + changed stamp, then DELETE the
 * Deal ID's ZSGTSFTR_INV_REF rows. The middleware client cannot delete, so the update is only
 * written when there is nothing to delete; otherwise nothing is written at all.
 */
export async function reverseMoConfirmation(deal: Deal): Promise<{ posted: boolean; message: string }> {
  const refs = await fxList('invRef', { ZDEAL_ID: deal.dealId })
  if (refs.length) return { posted: false, message: REVERSE_INV_REF_WAITING }
  await setDealStatus([deal.key], '01')
  return { posted: true, message: 'MO Confirmation has been reversed successfully.' }
}
