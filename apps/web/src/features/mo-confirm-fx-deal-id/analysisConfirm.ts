/**
 * Change / Confirm, the calculating half: reads what the legacy FORMs read (model rule, entity string,
 * currency string, profit margin, saved invoice references, the TCURR rate), builds the invoice plan and
 * P&L with analysisPlan.ts, and hands the result to `confirmDealId`, which revalidates and writes.
 *
 *   ZSGTSFTR_RULE_BT   middleware fxModel        links, adjustments, sub type
 *   ZSGTSFTR_ENT_STR   middleware entityString   ZENT1..3 of the Master Contract's ZENT_ID
 *   ZSGTSFTR_CUR_STR   middleware curStr         ZCURR1..3 of the Deal ID's ZDEAL_CURR_ID
 *   ZSGTSFTR_ORG_PRO   middleware orgPro         ZPRO_MARG_INV of the Deal origin
 *   ZSGTSFTR_INV_REF   middleware invRef         the saved rows, reused
 *   ZSGTSFV_FX         middleware tsfvFx         strike, premium and the currency pair of a leg, when it has a row
 *   TCURR (type M)     SAP ExchangeRate OData   the P&L rate; BAPI_EXCHANGERATE_GETDETAIL is not wired
 *
 * Not available, and said so when it matters: option legs (ZSGTSFCDS_OPTION), so FX2 / Short Straddle
 * deals are refused with that reason, and the premium-adjustment interest rate (ZIRATE), which is simply
 * absent. Neither stops an ordinary FX1 deal.
 */
import { listMasterContracts } from '../../shared/fx/master-contract.ts'
import { getExchangeRate, type GetExchangeRate } from '../../shared/fx/exchange-rate.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { isoFromDmy, num } from '../../shared/fx/sap.ts'
import { checkConfirmable, confirmDealId, livePorts, type ConfirmInput, type OpResult, type Ports, type PlInput } from './analysis.ts'
import { buildInvoicePlan, buildPnl, fxSummaryPl, fxSummaryRow, pnlRateRequest, type PlanLeg, type PlanLine, type PnlRow } from './analysisPlan.ts'
import type { Leg } from './types.ts'

/** The reads the calculation makes; tests substitute these. */
export type PlanPorts = {
  masterContract(mcRef: string): Promise<FxRow | undefined>
  /** The Master Contracts a Deal ID of this model may be moved to: status 03 / 04 under the same model. */
  pickableContracts(modelId: string): Promise<FxRow[]>
  rules(modelId: string): Promise<FxRow[]>
  entityString(entId: string): Promise<FxRow | undefined>
  /** CUR_STR rows whose ZCURR_ID is any of the given values (the Deal ID's ZDEAL_CURR_ID and ZDEAL_CURR_DESC). */
  currencyStrings(ids: readonly string[]): Promise<FxRow[]>
  orgProfit(origin: string): Promise<FxRow | undefined>
  /** The ZSGTSFV_FX row of a transaction, or undefined (the view lacks the newest transactions). */
  fxView(bukrs: string, rfha: string): Promise<FxRow | undefined>
  exchangeRate: GetExchangeRate
}

export const livePlanPorts: PlanPorts = {
  masterContract: async (ref) => (ref ? (await listMasterContracts({ ZMC_REF_NO: ref }))[0] : undefined),
  pickableContracts: async (modelId) => (await listMasterContracts({ ZMOD_ID: modelId })).filter((m) => ['03', '04'].includes(txt(m, 'ZMC_STAT'))),
  rules: (modelId) => fxList('fxModel', { ZMOD_ID: modelId }),
  entityString: async (id) => (id ? (await fxList('entityString', { ZENT_ID: id }))[0] : undefined),
  currencyStrings: async (ids) => (ids.length ? fxList('curStr', { 'ZCURR_ID[in]': ids.join(',') }) : []),
  orgProfit: async (origin) => (origin ? (await fxList('orgPro', { ZCOM_ID: origin }))[0] : undefined),
  fxView: async (bukrs, rfha) => (await fxList('tsfvFx', { BUKRS: bukrs, RFHA: rfha }).catch(() => [] as FxRow[]))[0],
  exchangeRate: getExchangeRate,
}

/** The P&L rate type (TCURR-KURST). */
export const PNL_RATE_TYPE = 'M'

export type Prepared = {
  ok: true
  confirm: ConfirmInput
  lines: PlanLine[]
  pnl: PnlRow[]
  rate: number
  rateDate: string
  mcRef: string
  /** Master Contracts the Deal ID may be moved to (including the current one). */
  contracts: FxRow[]
}
export type NotPrepared = { ok: false; reason: string }

/**
 * The Deal ID's currency string. ZDEAL_CURR_ID is tried first, as the legacy lookup reads it; on this system it
 * holds a currency-ID code (C001) while ZSGTSFTR_CUR_STR is keyed by the string itself (INR-INR-INR), which is
 * the Deal ID's ZDEAL_CURR_DESC, so that is the fallback.
 */
export function pickCurrencyString(rows: readonly FxRow[], currId: string, currDesc: string): FxRow | undefined {
  return (currId ? rows.find((r) => txt(r, 'ZCURR_ID') === currId) : undefined) ?? (currDesc ? rows.find((r) => txt(r, 'ZCURR_ID') === currDesc) : undefined)
}

/** The saved rule row of a model: the one that carries invoice links (a model repeats once per link set). */
const pickRule = (rows: readonly FxRow[]): FxRow | undefined => rows.find((r) => txt(r, 'ZD1_INV_LINK') !== '') ?? rows[0]

/** A leg of the screen as the calculation's D1 / D2, with the strike, premium and currency pair of its view row. */
async function planLeg(leg: Leg, ports: PlanPorts): Promise<PlanLeg> {
  const view = await ports.fxView(leg.bukrs, leg.rfha)
  return {
    dealType: leg.dealType as 'D1' | 'D2',
    rfha: leg.rfha,
    curr1: leg.curr1,
    curr2: leg.curr2,
    fromCurrency: view ? txt(view, 'F_CURR1') : '',
    toCurrency: view ? txt(view, 'T_CURR1') : '',
    amt1: leg.amt1,
    amt2: leg.amt2,
    allIn: leg.rateVal ?? 0,
    strike: view ? num(view['KKURS']) : 0,
    preAmt: view ? num(view['BZBETR']) : 0,
    start: isoFromDmy(leg.dealDate) ?? '',
  }
}

/**
 * Calculates the confirmation for a Deal ID without writing anything: the invoice plan (T1..T3), the P&L and
 * the rate it used. `mcRef` is the Master Contract to confirm on (blank: the stored one); a different one
 * changes the entity string, so the plan is calculated for it. Refuses, with the specific reason, when the
 * Deal ID is not Created, a linked transaction is below 07, or an input cannot be read.
 */
export async function prepareConfirmation(
  dealId: string,
  legs: readonly Leg[],
  mcRef = '',
  ports: Ports = livePorts,
  plan: PlanPorts = livePlanPorts,
): Promise<Prepared | NotPrepared> {
  const check = await checkConfirmable(dealId, ports)
  if (!check.ok) return { ok: false, reason: check.error }
  const row = check.row
  const wantedMc = mcRef.trim() || txt(row, 'ZMC_REF')
  const mc = await plan.masterContract(wantedMc)
  if (!mc) return { ok: false, reason: `Master Contract ${wantedMc || '(none)'} was not found, so its entity string and origin are unknown.` }

  const modelId = txt(mc, 'ZMOD_ID') || txt(row, 'ZTSF_MODEL')
  const rules = await plan.rules(modelId)
  const rule = pickRule(rules)
  if (rule && txt(rule, 'ZSS') !== '') return { ok: false, reason: 'This is a Short Straddle model: use Confirm & Save SS Deal ID.' }
  if (rule && txt(rule, 'ZSUB_TYPE') === 'FX2') {
    return { ok: false, reason: 'Option deals (FX2) are calculated from the option legs (ZSGTSFCDS_OPTION), which no service provides yet.' }
  }

  const currId = txt(row, 'ZDEAL_CURR_ID')
  const currDesc = txt(row, 'ZDEAL_CURR_DESC')
  const [entityString, currencyRows, org, existing, contracts] = await Promise.all([
    plan.entityString(txt(mc, 'ZENT_ID')),
    plan.currencyStrings([currId, currDesc].filter(Boolean)),
    plan.orgProfit(txt(mc, 'ZORIGIN')),
    ports.listInvoiceRefs(dealId),
    plan.pickableContracts(modelId),
  ])
  const currencyString = pickCurrencyString(currencyRows, currId, currDesc)
  const planLegs = await Promise.all(legs.filter((l) => l.dealType === 'D1' || l.dealType === 'D2').map((l) => planLeg(l, plan)))

  const built = buildInvoicePlan({
    dealId,
    modelId,
    rule,
    entityString,
    currencyString,
    profitMargin: org ? num(org['ZPRO_MARG_INV']) : 0,
    existing,
    legs: planLegs,
  })
  if (built.problems.length) return { ok: false, reason: built.problems.join(' ') }
  if (!built.lines.length) return { ok: false, reason: 'The model produces no invoice trades for this Deal ID.' }

  // The P&L rate: TCURR type M, F_CURR1 -> T_CURR1, on the earlier of the D1 / D2 start dates.
  const req = pnlRateRequest(planLegs)
  if (!req || !req.date) return { ok: false, reason: 'The P&L rate date is unknown: neither D1 nor D2 has a start date.' }
  const rate = await plan.exchangeRate(req.from, req.to, req.date, PNL_RATE_TYPE)
  if (rate === null) {
    return { ok: false, reason: `Exchange-rate service unavailable or no rate: TCURR type ${PNL_RATE_TYPE}, ${req.from} to ${req.to}, on or before ${req.date}.` }
  }
  const usdToLocal = req.from === 'USD' ? rate : req.to === 'USD' ? 1 / rate : 1
  const pnl = buildPnl(built.lines, usdToLocal)
  // The stored P&L is the FX Deal P&L summary row (ALV1_SUB_TOTAL), not an entity row of the invoice-plan P&L above.
  const summary = fxSummaryRow(planLegs)
  if (!summary) return { ok: false, reason: 'The FX Deal P&L cannot be calculated: the Deal ID has no D1 or D2 transaction.' }
  const summaryDate = summary.date || req.date
  const leadRate =
    summary.lead === req.from && summary.foreign === req.to ? rate : await plan.exchangeRate(summary.lead, summary.foreign, summaryDate, PNL_RATE_TYPE)
  if (leadRate === null) {
    return { ok: false, reason: `Exchange-rate service unavailable or no rate: TCURR type ${PNL_RATE_TYPE}, ${summary.lead} to ${summary.foreign}, on or before ${summaryDate}.` }
  }
  const pl: PlInput | undefined = fxSummaryPl(planLegs, leadRate, rate)
  if (!pl) return { ok: false, reason: 'The FX Deal P&L cannot be calculated: the exchange rate is zero.' }

  return {
    ok: true,
    confirm: {
      dealId,
      mcRef: wantedMc,
      model: modelId,
      invoices: built.lines.map(({ linked: _l, reused: _r, seller: _s, buyer: _b, ...invoice }) => invoice),
      pl,
    },
    lines: built.lines,
    pnl,
    rate,
    rateDate: req.date,
    mcRef: wantedMc,
    contracts,
  }
}

/** Writes a prepared confirmation. `confirmDealId` revalidates status and transaction statuses first. */
export function confirmPrepared(prepared: Prepared, ports: Ports = livePorts): Promise<OpResult> {
  return confirmDealId(prepared.confirm, ports)
}
