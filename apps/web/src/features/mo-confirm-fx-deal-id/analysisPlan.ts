/**
 * Invoice plan and P&L of Change / Confirm (ZSGTSF_PDEAL_ID_ANALYS: FORM invoice_plan, new_inv_value,
 * profit_margin_check, ALV_DATA_3), as pure functions. No I/O: analysisConfirm.ts reads the masters and
 * the exchange rate and passes them in, the tests pass fixtures.
 *
 * Assumptions that the supplied legacy description leaves open are marked ASSUMPTION and gathered in
 * the report that accompanied this change; each is one line to adjust here.
 */
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { tradeCurrency } from '../../shared/fx/currency-string.ts'
import { num } from '../../shared/fx/sap.ts'
import { leadCurrency, round } from '../mo-generate-invoices-deal-id/invoice.ts'
import type { InvoiceRefInput, PlInput } from './analysis.ts'

const USD = 'USD'
const TWD = 'TWD'
export type TradeType = 'T1' | 'T2' | 'T3'
export type LegType = 'D1' | 'D2'

/** The Deal ID's D1 / D2 transaction as the calculation needs it. Amounts are as stored (signed). */
export type PlanLeg = {
  dealType: LegType
  rfha: string
  curr1: string
  curr2: string
  /** F_CURR1 / T_CURR1 of ZSGTSFV_FX: the pair the P&L rate is looked up for. */
  fromCurrency: string
  toCurrency: string
  amt1: number
  amt2: number
  /** OTOT_RATE: the all-in (total) rate; 0 when none. */
  allIn: number
  /** KKURS: the option strike; 0 for a forward. */
  strike: number
  /** BZBETR: the option premium. */
  preAmt: number
  /** The leg's start date, YYYY-MM-DD. */
  start: string
}

export type PlanInput = {
  dealId: string
  modelId: string
  /** ZSGTSFTR_RULE_BT row of the model (ZSUB_TYPE, ZD*_INV_LINK*, ZD*_ADJ). */
  rule: FxRow | undefined
  /** ZSGTSFTR_ENT_STR row (ZENT1..3). */
  entityString: FxRow | undefined
  /** ZSGTSFTR_CUR_STR row (ZCURR1..3). */
  currencyString: FxRow | undefined
  /** ZSGTSFTR_ORG_PRO-ZPRO_MARG_INV of the Deal origin; 0 when none. */
  profitMargin: number
  /** The Deal ID's saved ZSGTSFTR_INV_REF rows. */
  existing: readonly FxRow[]
  legs: readonly PlanLeg[]
  /** The premium-adjustment interest rate (ZIRATE) when the premium service supplies one. */
  premiumRate?: number
}

export type PlanLine = InvoiceRefInput & {
  /** The leg the line is linked to ('' when the model links none). */
  linked: LegType | ''
  /** True when the amounts came from an existing ZSGTSFTR_INV_REF row. */
  reused: boolean
  /** Seller / buyer entities and currency, as the P&L reads them. */
  seller: string
  buyer: string
}

export type PlanResult = { lines: PlanLine[]; problems: string[] }

const TRADES: ReadonlyArray<{ type: TradeType; link: string; sell: 1 | 2 | 3; buy: 1 | 2 | 3 }> = [
  { type: 'T1', link: '01', sell: 1, buy: 2 },
  { type: 'T2', link: '02', sell: 2, buy: 3 },
  { type: 'T3', link: '03', sell: 3, buy: 1 },
]

/** Which Deal leg a trade is linked to: ZD1_INV_LINK / ZD1_INV_LINK2 -> D1, ZD2_INV_LINK / ZD2_INV_LINK2 -> D2. */
export function linkedLeg(rule: FxRow | undefined, code: string): LegType | '' {
  if (!rule) return ''
  if (txt(rule, 'ZD1_INV_LINK') === code || txt(rule, 'ZD1_INV_LINK2') === code) return 'D1'
  if (txt(rule, 'ZD2_INV_LINK') === code || txt(rule, 'ZD2_INV_LINK2') === code) return 'D2'
  return ''
}

/** ZUSD amount of a leg: the absolute amount on its USD side (ASSUMPTION: the first side when neither is USD). */
export function usdSideAmount(leg: PlanLeg): number {
  if (leg.curr1 === USD) return Math.abs(leg.amt1)
  if (leg.curr2 === USD) return Math.abs(leg.amt2)
  return Math.abs(leg.amt1)
}

/** The exchange rate a new invoice value uses: the strike when the leg has one, else the all-in rate. */
export const legRate = (leg: PlanLeg): number => (leg.strike ? leg.strike : leg.allIn)

const AMOUNT_DECIMALS = 2
const RATE_DECIMALS = 4

/**
 * FORM invoice_plan: up to three rows T1 / T2 / T3 from the entity string and currency string, each linked
 * to D1 or D2 by the model's invoice links.
 *   - a row with a saved ZSGTSFTR_INV_REF of the same ZTTYPE reuses its ZEX_RATE / ZAMT / ZINV_AMT;
 *   - otherwise ZEX_RATE is the linked leg's strike (else all-in rate), ZAMT its USD side (plus ABS of
 *     the leg's premium when the model's ZD1_ADJ / ZD2_ADJ is X), and D2 takes ZIRATE when one is given;
 *   - ZINV_AMT = ZAMT * ZEX_RATE;
 *   - then the profit margin (FORM profit_margin_check): M001 marks D2 rows up and M002 marks T1 down,
 *     both from D1's rate, and only for those models.
 */
export function buildInvoicePlan(p: PlanInput): PlanResult {
  const problems: string[] = []
  const ent = (n: 1 | 2 | 3) => (p.entityString ? txt(p.entityString, `ZENT${n}`) : '')
  const cur = (n: 1 | 2 | 3) => tradeCurrency(p.currencyString, n)
  const leg = (t: LegType) => p.legs.find((l) => l.dealType === t)
  const adj = (t: LegType) => !!p.rule && txt(p.rule, t === 'D1' ? 'ZD1_ADJ' : 'ZD2_ADJ') === 'X'

  if (!p.entityString) problems.push('The Master Contract has no entity string (ZSGTSFTR_ENT_STR), so the invoice trades cannot be planned.')
  if (!p.currencyString) problems.push('The Deal ID has no currency string (ZSGTSFTR_CUR_STR, by ZDEAL_CURR_ID or ZDEAL_CURR_DESC), so the invoice currencies are unknown.')
  if (!p.rule) problems.push(`Model ${p.modelId || '(none)'} has no rule row (ZSGTSFTR_RULE_BT), so the trades cannot be linked to D1 / D2.`)
  if (problems.length) return { lines: [], problems }

  const lines: PlanLine[] = []
  for (const t of TRADES) {
    const seller = ent(t.sell)
    const buyer = ent(t.buy)
    if (!seller || !buyer) continue
    const linked = linkedLeg(p.rule, t.link)
    const saved = p.existing.find((r) => txt(r, 'ZTTYPE') === t.type)
    const base = {
      ZINV_TRM_NO: `${p.dealId}-${t.type}`,
      ZTTYPE: t.type,
      ZDTYPE: linked,
      ZTRD_SELL: seller,
      ZTRD_BUY: buyer,
      ZMC_REF_P: `${buyer}-${seller}-P`,
      ZMC_REF_S: `${seller}-${buyer}-S`,
      ZTRD_CURR: cur(t.sell === 1 ? 1 : t.sell === 2 ? 2 : 3),
      linked,
      seller,
      buyer,
    }
    if (saved) {
      lines.push({ ...base, ZAMT: num(saved['ZAMT']), ZINV_AMT: num(saved['ZINV_AMT']), ZEX_RATE: num(saved['ZEX_RATE']), reused: true })
      continue
    }
    const source = linked ? leg(linked) : undefined
    if (!source) {
      problems.push(linked ? `Trade ${t.type} is linked to ${linked}, but this Deal ID has no ${linked} transaction.` : `Trade ${t.type} is not linked to D1 or D2 by model ${p.modelId}, and has no saved invoice reference.`)
      continue
    }
    let rate = base.ZTRD_CURR === USD ? 1 : legRate(source)
    let amount = usdSideAmount(source)
    if (adj(linked as LegType)) amount += Math.abs(source.preAmt)
    if (linked === 'D2' && p.premiumRate) rate = p.premiumRate
    amount = round(amount, AMOUNT_DECIMALS)
    rate = round(rate, RATE_DECIMALS)
    if (!rate) problems.push(`Trade ${t.type} has no exchange rate: ${linked} has neither a strike nor an all-in rate.`)
    lines.push({ ...base, ZAMT: amount, ZEX_RATE: rate, ZINV_AMT: round(amount * rate, AMOUNT_DECIMALS), reused: false })
  }

  applyProfitMargin(lines, p.modelId, p.profitMargin)
  return { lines, problems }
}

/**
 * FORM profit_margin_check. D1's invoice rate is read before any row changes. M001: every D2 row gets
 * D1 rate * (100 + margin) / 100. M002: the T1 row gets D1 rate * (100 - margin) / 100. The amount is the
 * row's base amount (ZAMT) times the new rate. Other models are never adjusted.
 */
export function applyProfitMargin(lines: PlanLine[], modelId: string, margin: number): void {
  if (!margin) return
  const d1Rate = lines.find((l) => l.linked === 'D1')?.ZEX_RATE ?? 0
  for (const l of lines) {
    let rate: number
    if (modelId === 'M001' && l.linked === 'D2') rate = (d1Rate * (100 + margin)) / 100
    else if (modelId === 'M002' && l.ZTTYPE === 'T1') rate = (d1Rate * (100 - margin)) / 100
    else continue
    l.ZEX_RATE = round(rate, RATE_DECIMALS)
    l.ZINV_AMT = round(l.ZAMT * l.ZEX_RATE, AMOUNT_DECIMALS)
  }
}

// ---------------------------------------------------------------- P&L

/** One entity's row of ALV_DATA_3. Local = ZINV_AMT, foreign = ZAMT; purchases are negative. */
export type PnlRow = {
  entity: string
  currency: string
  saleLocal: number
  saleForeign: number
  purchaseLocal: number
  purchaseForeign: number
  premiumIncome: number
  premiumExpense: number
  plLocal: number
  plForeign: number
  /** P&L as a percentage of the sale (ASSUMPTION: the legacy base is not in the description). */
  plPercent: number
}

/** Option premium income / expense per entity, for the product / model that carries them. */
export type Premiums = { income?: Readonly<Record<string, number>>; expense?: Readonly<Record<string, number>> }

/**
 * ALV_DATA_3: per entity, Sale (the lines it sells: ZINV_AMT local, ZAMT foreign), Purchase (the lines it
 * buys, each times -1), Option Premium Income and Expense where given, and P&L as their total. A USD line is
 * converted to the entity's own currency with `usdToLocal`, so a row never adds two currencies.
 */
export function buildPnl(lines: readonly PlanLine[], usdToLocal: number, premiums: Premiums = {}): PnlRow[] {
  const entities = [...new Set(lines.flatMap((l) => [l.seller, l.buyer]))]
  return entities.map((entity) => {
    const sold = lines.filter((l) => l.seller === entity)
    const bought = lines.filter((l) => l.buyer === entity)
    const currency = sold[0]?.ZTRD_CURR ?? bought[0]?.ZTRD_CURR ?? ''
    const local = (l: PlanLine) => (l.ZTRD_CURR === currency || l.ZTRD_CURR !== USD ? l.ZINV_AMT : l.ZINV_AMT * usdToLocal)
    const saleLocal = round(sold.reduce((s, l) => s + local(l), 0), 2)
    const saleForeign = round(sold.reduce((s, l) => s + l.ZAMT, 0), 2)
    const purchaseLocal = round(-bought.reduce((s, l) => s + local(l), 0), 2)
    const purchaseForeign = round(-bought.reduce((s, l) => s + l.ZAMT, 0), 2)
    const premiumIncome = premiums.income?.[entity] ?? 0
    const premiumExpense = premiums.expense?.[entity] ?? 0
    const plLocal = round(saleLocal + purchaseLocal + premiumIncome + premiumExpense, 2)
    const plForeign = round(saleForeign + purchaseForeign, 2)
    return {
      entity,
      currency,
      saleLocal,
      saleForeign,
      purchaseLocal,
      purchaseForeign,
      premiumIncome,
      premiumExpense,
      plLocal,
      plForeign,
      plPercent: saleLocal ? round((plLocal / saleLocal) * 100, 2) : 0,
    }
  })
}

/** ASSUMPTION: the P&L the Deal ID stores is the middle entity's (ENT2's) row — the one that buys T1 and sells T2. */
export const PNL_ENTITY_INDEX = 2

/**
 * The figures stored on the Deal ID: ZPL (the USD side), ZPL_LAMT and ZPL_LCURR (the non-USD side and its
 * currency), ZPL_CURR = USD, ZPL_RATE (the TCURR rate type M). USD-only deals store the rate 1.
 */
export function persistedPl(rows: readonly PnlRow[], entityString: FxRow | undefined, rate: number): PlInput | undefined {
  const entity = entityString ? txt(entityString, `ZENT${PNL_ENTITY_INDEX}`) : ''
  const row = rows.find((r) => r.entity === entity)
  if (!row) return undefined
  return { pl: row.plForeign, localAmount: row.plLocal, localCurrency: row.currency, rate }
}

/**
 * ALV1_SUB_TOTAL, first half: the FX Deal P&L summary row (FX1 only). Every D1 / D2 leg whose CURR1 is not USD adds its
 * AMT1 to the summary AMT1, any other leg adds its AMT2 to the summary AMT2 (USD legs therefore contribute the
 * non-USD side); the currencies are the last leg's. A TWD pair scales AMT1 by 100, then both are made absolute.
 * Returns the pair the RATE form then looks up (ZSGTRMFM_LEAD_CURR: lead, foreign) and the date (the earlier D1 / D2 start).
 */
export function fxSummaryRow(legs: readonly PlanLeg[]): { amt1: number; amt2: number; curr1: string; curr2: string; lead: string; foreign: string; date: string } | undefined {
  const used = legs.filter((l) => l.dealType === 'D1' || l.dealType === 'D2')
  if (!used.length) return undefined
  let amt1 = 0
  let amt2 = 0
  for (const l of used) {
    if (l.curr1 !== USD) amt1 += l.amt1
    else amt2 += l.amt2
  }
  const last = used[used.length - 1]!
  if (last.curr1 === TWD || last.curr2 === TWD) amt1 *= 100
  const lead = leadCurrency(last.curr1, last.curr2)
  return {
    amt1: Math.abs(amt1),
    amt2: Math.abs(amt2),
    curr1: last.curr1,
    curr2: last.curr2,
    lead,
    foreign: lead === last.curr1 ? last.curr2 : last.curr1,
    date: used.map((l) => l.start).filter(Boolean).sort()[0] ?? '',
  }
}

/**
 * ALV1_SUB_TOTAL (RATE form) + UPDATE_INV_REF: the P&L an FX1 Deal ID stores. The summary row is completed with the
 * lead-pair rate (a zero AMT1 is derived from AMT2, otherwise AMT2 from AMT1, each divided by the rate; TWD scales AMT1
 * by 100 again), then the saved figures are chosen by the FIRST leg's CURR1: USD gives ZPL = AMT1, ZPL_LAMT = AMT2 and the
 * currency CURR2; otherwise ZPL = AMT2, ZPL_LAMT = AMT1 and the currency CURR1. No sign is applied after the ABS above,
 * so the stored amounts are never negative. `storedRate` is ZPL_RATE (GET_RATE for the first leg's F_CURR1 -> T_CURR1).
 */
export function fxSummaryPl(legs: readonly PlanLeg[], leadRate: number, storedRate: number): PlInput | undefined {
  const row = fxSummaryRow(legs)
  const first = legs.find((l) => l.dealType === 'D1' || l.dealType === 'D2')
  if (!row || !first || !(leadRate > 0)) return undefined
  let { amt1, amt2 } = row
  if (amt1 !== 0) amt2 = amt1 / leadRate
  else amt1 = amt2 / leadRate
  if (row.lead === TWD || row.foreign === TWD) amt1 *= 100
  return first.curr1 === USD
    ? { pl: amt1, localAmount: amt2, localCurrency: row.curr2, rate: storedRate }
    : { pl: amt2, localAmount: amt1, localCurrency: row.curr1, rate: storedRate }
}

/** The pair and date of the P&L rate: the leg's F_CURR1 -> T_CURR1 on the earlier of the D1 / D2 start dates. */
export function pnlRateRequest(legs: readonly PlanLeg[]): { from: string; to: string; date: string } | undefined {
  const dated = legs.filter((l) => l.start)
  const first = dated.find((l) => l.dealType === 'D1') ?? dated[0] ?? legs[0]
  if (!first) return undefined
  const date = dated.map((l) => l.start).sort()[0] ?? ''
  const lead = leadCurrency(first.curr1, first.curr2)
  return { from: first.fromCurrency || lead, to: first.toCurrency || (lead === first.curr1 ? first.curr2 : first.curr1), date }
}
