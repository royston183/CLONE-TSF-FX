/**
 * Pure ports of ZSGTSF_RBILL_ADJUST's calculations (PBO / F01 / INV_IDFF includes). No I/O:
 * api.ts reads the tables and passes the rows in, the tests pass fixtures.
 *
 *   rollDealTypes      FORM deal_detals        — the R<n>-D1 / C<n>-D1 roll numbering of gt_top
 *   invoiceGroups      FORM sub_total          — gt_inv_temp: BLs grouped by inv date / commodity
 *   buildInvoiceRows   FORM invoice_plan       — gt_inv (T1 / T2 / T3 per group, rates, planned)
 *                      FORM invoice_total      — the roll-over Planned Inv Amt override
 *   invoiceDifference  FORM fetch_invoice_diff — gt_diff (screen 9004)
 *   statusList         FORM drop_down          — the Deal ID Status list box
 *   modelWithCurrency  FORM screen_desc_fields — M030/M034/M020 + 01/02 by the deal's currency ID
 */
import { tradeCurrency } from '../../shared/fx/currency-string.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow as MwRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import type { AdjRecord, DiffRow, FxRow, InvRow } from './types.ts'

const USD = 'USD'
const T1 = 'T1'
const T2 = 'T2'
const T3 = 'T3'
const D1 = 'D1'
const D2 = 'D2'

/** Packed-number rounding (half away from zero) to a column's decimals. */
export const round = (value: number, decimals: number): number => {
  if (!Number.isFinite(value)) return 0
  const f = 10 ** decimals
  return (Math.sign(value) * Math.round(Math.abs(value) * f)) / f
}

/** YYYY-MM-DD or YYYYMMDD -> YYYYMMDD ('' for blank), so DATS compare as the ABAP does. */
export const dats = (value: string | null | undefined): string => {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(value ?? ''))
  return m && m[1] !== '0000' ? `${m[1]}${m[2]}${m[3]}` : ''
}

/** YYYYMMDD / YYYY-MM-DD -> YYYY-MM-DD (null for blank), as the middleware stores DATS. */
export const isoDate = (value: string | null | undefined): string | null => {
  const d = dats(value)
  return d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/* ------------------------------------------------------------------ screen 9000 header */

/** FORM screen_desc_fields: M030 / M034 / M020 get 01 (currency ID C001) or 02 (C003) appended. */
export function modelWithCurrency(model: string, dealCurrId: string): string {
  if (model !== 'M030' && model !== 'M034' && model !== 'M020') return model
  if (dealCurrId === 'C001') return `${model}01`
  if (dealCurrId === 'C003') return `${model}02`
  return model
}

export type StatusOption = { key: string; text: string }

/**
 * FORM drop_down: ZSGTSFTR_DEAL_ST WHERE zdeal_stat <> space; FX1 rows dropped for an M034 / M035 /
 * M036 deal (ZTSF_MODEL), FX2 rows dropped otherwise; "<stat> - <desc>", sorted, one per code.
 */
export function statusList(statuses: readonly MwRow[], tsfModel: string): StatusOption[] {
  const optionModel = ['M034', 'M035', 'M036'].includes(tsfModel.slice(0, 4))
  const drop = optionModel ? 'FX1' : 'FX2'
  const seen = new Set<string>()
  return statuses
    .filter((r) => txt(r, 'ZDEAL_STAT') !== '' && txt(r, 'ZSUB_TYPE') !== drop)
    .map((r) => ({ key: txt(r, 'ZDEAL_STAT'), text: `${txt(r, 'ZDEAL_STAT')} - ${txt(r, 'ZDEAL_SDESC')}` }))
    .sort((a, b) => byText(a.key, b.key))
    .filter((o) => !seen.has(o.key) && !!seen.add(o.key))
}

/* ------------------------------------------------------------------ gt_top */

/** A ZSGTSFCDS_FX / ZSGTSFCDS_OPTION row as gt_top holds it (before the roll numbering). */
export function fxRowFromView(r: MwRow): FxRow {
  return {
    dealType: txt(r, 'ZTSF_DEAL_TYPE'),
    roll: '',
    bukrs: txt(r, 'BUKRS'),
    bp: txt(r, 'BP_NAME'),
    partner: txt(r, 'KONTRH'),
    rfha: txt(r, 'RFHA'),
    start: dmyFromIso(txt(r, 'DBLFZ')),
    end: dmyFromIso(txt(r, 'DELFZ')),
    entity: txt(r, 'ZCOM_ID'),
    pc1: txt(r, 'PC1'),
    bs1: txt(r, 'BS_1'),
    curr1: txt(r, 'CURR1'),
    amt1: num(r['AMT1']),
    bs2: txt(r, 'BS_2'),
    pc2: txt(r, 'PC2'),
    curr2: txt(r, 'CURR2'),
    amt2: num(r['AMT2']),
    allIn: num(r['OTOT_RATE']),
    strike: num(r['KKURS']),
    preAmt: num(r['BZBETR']),
    mc: txt(r, 'ZTSF_MC_REF_NO'),
    txn: txt(r, 'TXN_STATUS'),
  }
}

/**
 * FORM deal_detals (GSDK926841): numbers the roll-over transactions against the D1 deal.
 * TXN_STATUS 61 rows on D1's side (bs_1-curr1 matches either leg) become R<n>-D1, the others
 * R<n>-D2; deal type 00 rows at status >= 03 (not 61) become C<n>-D2 when they touch D1's
 * second leg, else C<n>-D1. Each list is sorted by transaction number before numbering.
 */
export function rollDealTypes(top: readonly FxRow[]): FxRow[] {
  const rows = top.map((r) => ({ ...r, roll: '' }))
  const d1 = rows.find((r) => r.dealType === D1)
  if (!d1) return rows
  const leg1 = (r: FxRow) => `${r.bs1}-${r.curr1}`
  const leg2 = (r: FxRow) => `${r.bs2}-${r.curr2}`
  const txnD1: string[] = []
  const txnD2: string[] = []
  const rollD1: string[] = []
  const rollD2: string[] = []
  for (const r of rows.filter((x) => x.txn === '61')) {
    if (leg1(r) === leg1(d1) || leg2(r) === leg1(d1)) txnD1.push(r.rfha)
    else txnD2.push(r.rfha)
  }
  for (const r of rows.filter((x) => x.txn >= '03' && x.dealType === '00' && x.txn !== '61')) {
    if (leg1(r) === leg2(d1) || leg2(r) === leg2(d1)) rollD2.push(r.rfha)
    else rollD1.push(r.rfha)
  }
  for (const list of [txnD1, txnD2, rollD1, rollD2]) list.sort(byText)
  const mark = (rfha: string | undefined, label: string) => {
    const row = rfha === undefined ? undefined : rows.find((r) => r.rfha === rfha)
    if (row) row.roll = label
  }
  txnD1.forEach((rfha, i) => {
    mark(rfha, `R${i + 1}-D1`)
    mark(rollD1[i], `C${i + 1}-D1`)
  })
  txnD2.forEach((rfha, i) => {
    mark(rfha, `R${i + 1}-D2`)
    mark(rollD2[i], `C${i + 1}-D2`)
  })
  return rows
}

/** The USD amount of the D1 deal (PAI 'UPD': curr1 USD ? |amt1| : |amt2|); 0 without a D1. */
export function d1UsdAmount(top: readonly FxRow[]): number {
  const d1 = top.find((r) => r.dealType === D1)
  if (!d1) return 0
  return d1.curr1 === USD ? Math.abs(d1.amt1) : Math.abs(d1.amt2)
}

/* ------------------------------------------------------------------ gt_inv_temp */

export type InvoiceGroup = {
  invDate: string
  invComm: string
  trmComId: string
  soDate: string
  invType: string
  inco: string
  quantity: number
  ttv: number
  cprice: number
}

/**
 * FORM sub_total, second half: the BLs grouped by ZINV_DATE + ZINV_COMM + ZTRM_COM_ID (sorted,
 * first row of each group kept for the other fields), quantity and ZTTV summed, ZCPRICE =
 * ZTTV / quantity (initial when the quantity is 0).
 */
export function invoiceGroups(bls: readonly MwRow[]): InvoiceGroup[] {
  const key = (r: MwRow) => [dats(txt(r, 'ZINV_DATE')), txt(r, 'ZINV_COMM'), txt(r, 'ZTRM_COM_ID')]
  const sorted = bls
    .map((r, i) => ({ r, i, k: key(r) }))
    .sort((a, b) => byText(a.k[0]!, b.k[0]!) || byText(a.k[1]!, b.k[1]!) || byText(a.k[2]!, b.k[2]!) || a.i - b.i)
  const groups: InvoiceGroup[] = []
  const seen = new Set<string>()
  for (const { r, k } of sorted) {
    const id = k.join('\u0000')
    if (seen.has(id)) continue
    seen.add(id)
    const members = bls.filter((x) => key(x).join('\u0000') === id)
    const quantity = round(members.reduce((s, x) => s + num(x['ZQUANTITY']), 0), 3)
    const ttv = round(members.reduce((s, x) => s + num(x['ZTTV']), 0), 2)
    groups.push({
      invDate: txt(r, 'ZINV_DATE'),
      invComm: k[1]!,
      trmComId: k[2]!,
      soDate: txt(r, 'ZSO_DATE'),
      invType: txt(r, 'ZINV_TYPE'),
      inco: txt(r, 'ZINCO'),
      quantity,
      ttv,
      cprice: quantity ? ttv / quantity : 0,
    })
  }
  return groups
}

/* ------------------------------------------------------------------ gt_inv */

/** ZSGTRMFM_LEAD_CURR is not in the export: KEPT STATIC ranking (needs backend parity). */
export const LEAD_RANK = ['EUR', 'GBP', 'AUD', 'NZD', 'USD'] as const
export function leadCurrency(c1: string, c2: string): string {
  const rank = (c: string) => {
    const i = (LEAD_RANK as readonly string[]).indexOf(c)
    return i < 0 ? 99 : i
  }
  return rank(c1) <= rank(c2) ? c1 : c2
}

/** The ZSGTSFTR_BIL_ADJ columns gs_inv carries, all initial. */
export const ADJ_COLUMNS = [
  'ZDEAL_ID', 'ZINV_REF', 'ZINV_TYPE', 'ZPRE_T_REF', 'ZINV_PDATE', 'ZINV_DATE', 'ZSO_DATE', 'ZINV_NO', 'ZINV_COMM',
  'ZGT_COMM', 'ZPC', 'ZDUE_DATE', 'ZINCO', 'ZSELL', 'ZBUY', 'ZMC_REF_P', 'ZMC_REF_S', 'ZMC_REF', 'ZQTY', 'ZPRICE',
  'ZUSD_PRICE', 'ZAMT_USD', 'ZDIFF_AMT', 'ZAMT', 'ZCURR', 'ZRATE', 'ZPRATE', 'ZINV_OUT', 'ZPAY_TERMS', 'ZBUKRS',
  'ZCOUNT', 'ZBP', 'ZHBKID', 'ZHKTID', 'ZPTNR_BKID', 'ZPRE_DISCOUNT', 'ZNET_AMOUNT', 'ZPROFIT_MARGIN', 'ZBL_DATE',
  'ZRISK_AMT', 'ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME',
  'ZAMDT_CHECK',
] as const

const NUMERIC = new Set(['ZQTY', 'ZPRICE', 'ZUSD_PRICE', 'ZAMT_USD', 'ZDIFF_AMT', 'ZAMT', 'ZRATE', 'ZPRATE', 'ZCOUNT', 'ZPRE_DISCOUNT', 'ZNET_AMOUNT', 'ZPROFIT_MARGIN', 'ZRISK_AMT'])
const DATES = new Set(['ZINV_PDATE', 'ZINV_DATE', 'ZSO_DATE', 'ZDUE_DATE', 'ZBL_DATE', 'ZCREATED_DATE', 'ZCHANGED_DATE'])
const TIMES = new Set(['ZCREATED_TIME', 'ZCHANGED_TIME'])

export function emptyAdj(): AdjRecord {
  const rec: AdjRecord = {}
  for (const c of ADJ_COLUMNS) rec[c] = NUMERIC.has(c) ? 0 : DATES.has(c) ? null : TIMES.has(c) ? '00:00:00' : ''
  return rec
}

/** The columns invoice_plan's SELECT on ZSGTSFTR_BIL_ADJ reads (lt_bil); CORRESPONDING copies only these. */
const LT_BIL_COLUMNS = [
  'ZDEAL_ID', 'ZINV_REF', 'ZINV_TYPE', 'ZINV_PDATE', 'ZINV_DATE', 'ZINV_NO', 'ZINV_COMM', 'ZGT_COMM', 'ZPC', 'ZDUE_DATE',
  'ZINCO', 'ZSELL', 'ZBUY', 'ZMC_REF_P', 'ZMC_REF_S', 'ZMC_REF', 'ZQTY', 'ZPRICE', 'ZUSD_PRICE', 'ZAMT_USD', 'ZAMT', 'ZCURR',
  'ZRATE', 'ZPRATE', 'ZINV_OUT', 'ZSO_DATE', 'ZHBKID', 'ZHKTID', 'ZPTNR_BKID',
] as const

const fromMw = (row: MwRow, column: string): string | number | null => {
  if (NUMERIC.has(column)) return num(row[column])
  if (DATES.has(column)) return isoDate(row[column])
  return txt(row, column)
}

/** The inputs invoice_plan reads; api.ts loads them for one Deal ID. */
export type PlanInput = {
  dealId: string
  /** gs_zsgtsftr_dealid-zdm */
  dm: boolean
  zrfha1: string
  zrfha2: string
  /** gv_mod: the MC's model with the currency suffix */
  model: string
  /** gv_reg: ZSGTSFTR_COMP-ZREG_ID of RULE_BT(gv_mod)-ZORIGIN */
  region: string
  /** ZSGTSFTR_RULE_BT of the MC's ZMOD_ID (first row) */
  rule: MwRow | undefined
  /** ZSGTSFTR_ENT_STR of the MC's ZENT_ID */
  entStr: MwRow | undefined
  /** ZSGTSFTR_CUR_STR of the deal's ZDEAL_CURR_ID */
  curStr: MwRow | undefined
  invRef: readonly MwRow[]
  bilAdj: readonly MwRow[]
  /** ZSGTSFTR_ORG_PRO WHERE zcom_id = the MC's ZORIGIN */
  orgPro: readonly MwRow[]
  /** TVARVC name = sy-tcode && '_MOD' AND low = gv_mod was found */
  profitModel: boolean
  /** The deal's BLs (ZSGTSFTR_BL + unconfirmed ZSGTSFTR_BL_RUSE) */
  bls: readonly MwRow[]
  /** gt_top, roll-numbered */
  top: readonly FxRow[]
  /**
   * gs_zsgtsfst_pre_adj-zirate from class ZSGTSFCL_GET_PRE_ADJUSTMENT (not in the export): null
   * means unknown, and the option-rate LOWER / HIGHER comparison is skipped.
   */
  premiumRate: number | null
  /** sy-datum as YYYYMMDD */
  today: string
}

/** The ORG_PRO window containing today: the last one that matches wins, as in the ABAP loop. */
export function profitWindow(orgPro: readonly MwRow[], today: string): { percent: number; check: string; maintained: boolean } {
  let out = { percent: 0, check: '', maintained: false }
  for (const r of orgPro) {
    if (today >= dats(txt(r, 'ZSDATE')) && today <= dats(txt(r, 'ZEDATE'))) {
      out = { percent: num(r['ZPRO_MARG_INV']), check: txt(r, 'ZPRO_COMP'), maintained: true }
    }
  }
  return out
}

/** The trade type's link code ('01' T1, '02' T2, '03' T3) -> the FX deal it is priced from. */
function linkedDeal(rule: MwRow | undefined, code: string): { dealType: string; rfhaSlot: 1 | 2 } | undefined {
  if (!rule) return undefined
  if (txt(rule, 'ZD1_INV_LINK') === code || txt(rule, 'ZD1_INV_LINK2') === code) return { dealType: D1, rfhaSlot: 1 }
  if (txt(rule, 'ZD2_INV_LINK') === code || txt(rule, 'ZD2_INV_LINK2') === code) return { dealType: D2, rfhaSlot: 2 }
  return undefined
}

type Work = { rec: AdjRecord; ttype: string; cinvType: string; usdPrice: number; zdtype: string; kontrh: string; invAmt: number }

const n = (rec: AdjRecord, c: string) => Number(rec[c] ?? 0)

/**
 * FORM invoice_plan + the Planned Inv Amt override of FORM invoice_total. Returns the gt_inv
 * rows (without invoice_total's sub-total lines, which the grid does not show) and gv_val_flag.
 */
export function buildInvoiceRows(p: PlanInput): { rows: InvRow[]; profitMaintained: boolean } {
  const profit = profitWindow(p.orgPro, p.today)
  const work: Work[] = []
  const refOf = (ttype: string) => p.invRef.find((r) => txt(r, 'ZTTYPE') === ttype)

  if (p.dm) {
    // Data migration: the saved rows as they are; the trade type is the ZINV_REF suffix.
    for (const b of p.bilAdj) {
      const rec = emptyAdj()
      for (const c of LT_BIL_COLUMNS) rec[c] = fromMw(b, c)
      work.push({ rec, ttype: txt(b, 'ZINV_REF').slice(11, 13), cinvType: txt(b, 'ZINV_TYPE'), usdPrice: num(b['ZUSD_PRICE']), zdtype: '', kontrh: '', invAmt: 0 })
    }
  } else {
    const groups = invoiceGroups(p.bls)
      .map((g, i) => ({ g, i }))
      .sort((a, b) => byText(b.g.invType, a.g.invType) || a.i - b.i)
      .map((x) => x.g)
    // gs_exch_rate is global and never cleared: a trade without its FX deal keeps the last rate.
    let exchRate = 0
    const trades: Array<[string, string, string, string, string]> = [
      [T1, 'ZENT1', 'ZENT2', 'ZCURR1', '01'],
      [T2, 'ZENT2', 'ZENT3', 'ZCURR2', '02'],
      [T3, 'ZENT3', 'ZENT1', 'ZCURR3', '03'],
    ]
    for (const [ttype, sell, buy, currCol, code] of trades) {
      groups.forEach((g, idx) => {
        const rec = emptyAdj()
        rec['ZINV_TYPE'] = g.invType || `I${String(idx + 1).padStart(2, '0')}`
        rec['ZSELL'] = p.entStr ? txt(p.entStr, sell) : ''
        rec['ZBUY'] = p.entStr ? txt(p.entStr, buy) : ''
        rec['ZCURR'] = tradeCurrency(p.curStr, Number(currCol.slice(5)) as 1 | 2 | 3)
        rec['ZINCO'] = g.inco
        rec['ZINV_PDATE'] = isoDate(g.invDate)
        rec['ZINV_DATE'] = isoDate(g.invDate)
        rec['ZSO_DATE'] = isoDate(g.soDate)
        rec['ZINV_COMM'] = g.invComm
        rec['ZGT_COMM'] = g.trmComId
        if (ttype === T3) rec['ZQTY'] = g.quantity
        const ref = refOf(ttype)
        if (ref) rec['ZINV_REF'] = txt(ref, 'ZINV_TRM_NO')
        let usdPrice: number
        const saved = p.bilAdj.find(
          (b) => txt(b, 'ZINV_REF') === rec['ZINV_REF'] && dats(txt(b, 'ZINV_PDATE')) === dats(String(rec['ZINV_PDATE'] ?? '')) && txt(b, 'ZINV_TYPE') === rec['ZINV_TYPE'],
        )
        if (saved) {
          for (const c of LT_BIL_COLUMNS) rec[c] = fromMw(saved, c)
          usdPrice = num(saved['ZUSD_PRICE'])
        } else {
          usdPrice = g.cprice
          rec['ZQTY'] = g.quantity
          if (rec['ZCURR'] === USD) {
            rec['ZPRICE'] = g.cprice
            rec['ZRATE'] = 1
          } else {
            const link = linkedDeal(p.rule, code)
            const rfha = link ? (link.rfhaSlot === 1 ? p.zrfha1 : p.zrfha2) : ''
            const top = p.top.find((t) => t.rfha === rfha)
            if (top) exchRate = top.strike ? top.strike : top.allIn
            rec['ZRATE'] = round(exchRate, 4)
            const lead = leadCurrency(USD, String(rec['ZCURR']))
            rec['ZPRICE'] = lead === USD ? g.cprice * exchRate : exchRate ? g.cprice / exchRate : 0
          }
        }
        // "Converting the Prices 4 decimals to 2 decimals": lv_price is TB_LIMIT_AMOUNT.
        rec['ZPRICE'] = round(n(rec, 'ZPRICE'), 2)
        rec['ZAMT'] = round(n(rec, 'ZPRICE') * n(rec, 'ZQTY'), 2)
        rec['ZAMT_USD'] = round(usdPrice * n(rec, 'ZQTY'), 2)
        work.push({ rec, ttype, cinvType: g.invType, usdPrice, zdtype: '', kontrh: '', invAmt: 0 })
      })
    }
  }

  work.sort((a, b) => byText(a.ttype, b.ttype) || byText(String(a.rec['ZINV_TYPE']), String(b.rec['ZINV_TYPE'])))
  const dueDate = p.top.find((t) => t.dealType === D1)?.end ?? ''
  const topD1 = p.top.find((t) => t.dealType === D1)
  const topD2 = p.top.find((t) => t.dealType === D2)
  const subType = p.rule ? txt(p.rule, 'ZSUB_TYPE') : ''
  const d1Bcurr = p.rule ? txt(p.rule, 'ZD1_BCURR') : ''
  const preSign = p.rule ? txt(p.rule, 'ZPRE_SIGN') : ''
  const compare = (savedRate: number, rate: number, against: number | null): number => {
    if (against === null) return rate
    if (profit.check === 'LOWER' && against < rate) return against
    if (profit.check === 'HIGHER' && against > rate) return against
    return rate
  }

  for (const w of work) {
    const rec = w.rec
    rec['ZDUE_DATE'] = dueDate ? isoDateFromDmy(dueDate) : null
    rec['ZAMT'] = round(n(rec, 'ZQTY') * n(rec, 'ZPRICE'), 2)
    rec['ZAMT_USD'] = round(n(rec, 'ZQTY') * w.usdPrice, 2)
    const ref = refOf(w.ttype)
    if (ref) {
      rec['ZINV_REF'] = txt(ref, 'ZINV_TRM_NO')
      rec['ZMC_REF_P'] = txt(ref, 'ZMC_REF_P')
      rec['ZMC_REF_S'] = txt(ref, 'ZMC_REF_S')
      rec['ZPRATE'] = num(ref['ZEX_RATE'])
      w.invAmt = rec['ZCURR'] === USD ? num(ref['ZAMT']) : num(ref['ZINV_AMT'])
    }
    const code = w.ttype === T1 ? '01' : w.ttype === T2 ? '02' : w.ttype === T3 ? '03' : ''
    const link = code ? linkedDeal(p.rule, code) : undefined
    if (link) {
      w.zdtype = link.dealType
      w.kontrh = p.top.find((t) => t.dealType === w.zdtype)?.partner ?? ''
    }

    const savedRate = n(rec, 'ZRATE')
    let rate = savedRate
    if (!w.cinvType && p.region !== 'R01') {
      if (d1Bcurr === USD && w.zdtype !== D1 && !p.profitModel && topD1) {
        if (subType === 'FX1') {
          rate = topD1.allIn
          rate += rate * (profit.percent / 100)
          rate = compare(savedRate, rate, savedRate)
        } else {
          rate = topD1.strike
          const pr = rate * (profit.percent / 100)
          rate = preSign === '+' ? rate + pr : rate - pr
          rate = compare(savedRate, rate, p.premiumRate)
        }
      }
      if (d1Bcurr !== USD && w.zdtype !== D2 && topD2) {
        if (subType === 'FX1') {
          rate = topD2.allIn
          const pr = rate * (profit.percent / 100)
          rate = rec['ZCURR'] === USD ? savedRate : rate - pr
          rate = compare(savedRate, rate, savedRate)
        } else {
          rate = topD2.strike
          const pr = rate * (profit.percent / 100)
          rate = preSign === '+' ? rate + pr : rate - pr
          rate = compare(savedRate, rate, p.premiumRate)
        }
      }
    }
    if (rec['ZCURR'] === USD) rate = savedRate
    rec['ZRATE'] = round(rate, 4)

    // Premium in the T3 invoice amount for M030 (Put option on D1).
    if (p.model === 'M030' && w.ttype === T3) {
      const put = p.top.find((t) => t.dealType === D1 && t.pc1 === 'Put')
      if (put) rec['ZAMT'] = round(n(rec, 'ZAMT') + Math.abs(put.preAmt), 2)
    }
  }

  // FORM invoice_total: a roll-over deal plans each trade at its FX deal's amount and rate.
  if (p.top.some((t) => t.roll)) {
    for (const w of work) {
      if (!w.zdtype) continue
      const t = p.top.find((x) => x.dealType === w.zdtype && x.pc1 === '' && x.pc2 === '')
      if (!t) continue
      w.invAmt = t.curr1 !== USD ? t.amt1 : t.amt2
      w.rec['ZPRATE'] = t.allIn
    }
  }

  return { rows: work.map((w) => toInvRow(w, p.dealId)), profitMaintained: profit.maintained }
}

const isoDateFromDmy = (dmy: string): string | null => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function toInvRow(w: Work, dealId: string): InvRow {
  const r = w.rec
  r['ZDEAL_ID'] = dealId
  const s = (c: string) => String(r[c] ?? '')
  return {
    ttype: w.ttype,
    invType: s('ZINV_TYPE'),
    seller: s('ZSELL'),
    buyer: s('ZBUY'),
    bp: w.kontrh,
    partnerBank: s('ZPTNR_BKID'),
    houseBank: s('ZHBKID'),
    accountId: s('ZHKTID'),
    invDate: dmyFromIso(s('ZINV_DATE')),
    dueDate: dmyFromIso(s('ZDUE_DATE')),
    commodity: s('ZINV_COMM'),
    gtComm: s('ZGT_COMM'),
    qty: n(r, 'ZQTY'),
    usdPrice: w.usdPrice,
    rate: n(r, 'ZRATE'),
    price: n(r, 'ZPRICE'),
    amt: n(r, 'ZAMT'),
    amtUsd: n(r, 'ZAMT_USD'),
    planned: w.invAmt,
    invNo: s('ZINV_NO'),
    invTrmRef: s('ZINV_REF'),
    pc: s('ZPC'),
    locked: w.cinvType !== '',
    curr: s('ZCURR'),
    dealType: w.zdtype,
    rec: r,
  }
}

/* ------------------------------------------------------------------ gt_diff */

/**
 * FORM fetch_invoice_diff: one row per ZSGTSFTR_INV_REF of the deal. Planned = ZAMT for a USD
 * trade, else ZINV_AMT; the n-th row is linked to D1 / D2 by RULE_BT(gv_mod) zdN_inv_link(2)
 * second digit; Final = the deal's ZSGTSFTR_BIL_ADJ ZAMT_USD (USD) or ZAMT summed over the rows
 * whose ZINV_REF+11(2) is the trade type. `top` null = FX deals unreadable: no deal amount.
 */
export function invoiceDifference(invRef: readonly MwRow[], bilAdj: readonly MwRow[], rule: MwRow | undefined, top: readonly FxRow[] | null): DiffRow[] {
  const second = (c: string) => (rule ? txt(rule, c).charAt(1) : '')
  return invRef.map((ref, i) => {
    const count = String(i + 1)
    const currency = txt(ref, 'ZTRD_CURR')
    const ttype = txt(ref, 'ZTTYPE')
    const planned = currency === USD ? num(ref['ZAMT']) : num(ref['ZINV_AMT'])
    let dealType = ''
    if (second('ZD1_INV_LINK') === count || second('ZD1_INV_LINK2') === count) dealType = D1
    else if (second('ZD2_INV_LINK') === count || second('ZD2_INV_LINK2') === count) dealType = D2
    let dealAmt: number | null = top === null ? null : 0
    if (top && dealType) {
      const t = top.find((x) => x.dealType === dealType)
      if (t) dealAmt = t.curr1 === currency ? Math.abs(t.amt1) : Math.abs(t.amt2)
    }
    const finalSigned = round(
      bilAdj.filter((b) => txt(b, 'ZINV_REF').slice(11, 13) === ttype).reduce((s, b) => s + (currency === USD ? num(b['ZAMT_USD']) : num(b['ZAMT'])), 0),
      2,
    )
    return {
      ttype,
      finalAmt: Math.abs(finalSigned),
      currency,
      planned,
      diff1: round(finalSigned - planned, 2),
      dealType,
      dealAmt,
      diff2: dealAmt === null ? null : Math.abs(round(finalSigned - dealAmt, 2)),
    }
  })
}
