/**
 * Deal Amt (USD) = UTI_AMT of FORM get_data, rebuilt from the modern sources.
 *
 * The report read ZSGTSFCDS_FX / ZSGTSFCDS_OPTION, whose ZTSF_DEAL_ID / ZTSF_DEAL_TYPE /
 * ZTSF_MC_REF_NO were VTBFHA append fields. They now live in ZSGTSFTR_APP_STR (entity TrmFxApp of
 * service "trmfxapp"), and the currencies and amounts in the standard FxTransaction service. The
 * two are merged on CompanyCode + FinancialTransaction (BUKRS + RFHA), never on RFHA alone.
 *
 * Read only: nothing here writes APP_STR (TXN_STATUS in particular) or any Treasury transaction.
 *
 * Options: no standard Option service is configured (config/services.json), so option legs cannot
 * be read yet. calculateDealUsdAmount takes legs from any source, so adding one needs no change
 * here; until then the amount is the FX part only, and loadUsdAmounts says so.
 */
import { list, odataString, service } from '@slc/api-client'
import { isAbort } from '../../shared/fx/mw.ts'

const APP = service('trmfxapp')('TrmFxApp')
const FX = service('fx')('FxTransaction')

/** ZTSF_DEAL_TYPE of the legs the report sums. */
export const UTILIZATION_DEAL_TYPE = 'D1'

/** Keys per request: one `(CompanyCode eq .. and FinancialTransaction eq ..)` per transaction. */
const CHUNK = 25

export type AppStrLink = { companyCode: string; transaction: string; dealId: string; dealType: string; mcRef: string }

/** The slice of TrmFxApp this screen reads. TxnStatus is deliberately not selected. */
type AppStrEntity = {
  CompanyCode: string
  FinancialTransaction: string
  ZtsfDealID?: string | null
  ZtsfDealType?: string | null
  ZtsfMcRefNo?: string | null
}

export type FxEntity = {
  CompanyCode: string
  FinancialTransaction: string
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  /** '3' once reversed. */
  ActiveStatus?: string
}

/** CURR1 / AMT1 / CURR2 / AMT2 of a transaction, from either FX or Option. */
export type Leg = { companyCode: string; transaction: string; curr1: string; amt1: number; curr2: string; amt2: number }
export type MergedTxn = Leg & { dealId: string; dealType: string; mcRef: string }

/** BUKRS + RFHA as one key. */
export const txnKey = (companyCode: string, transaction: string): string => `${companyCode}::${transaction}`

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * An FxTransaction as CURR1 / AMT1 / CURR2 / AMT2: leg 1 is the lead currency and a sell leg
 * carries a negative amount, the same convention as the MO confirmation screen. A reversed
 * deal (ActiveStatus 3) is not a leg.
 */
export function fxLeg(t: FxEntity): Leg | null {
  if (t.ActiveStatus === '3') return null
  const lead = t.LeadCurrency || t.BuyCurrency || ''
  const follow = t.FollowCurrency || t.SellCurrency || ''
  const buysLead = t.BuyCurrency === lead
  const leadAmt = n(buysLead ? t.BuyAmount : t.SellAmount)
  const followAmt = n(buysLead ? t.SellAmount : t.BuyAmount)
  return {
    companyCode: t.CompanyCode,
    transaction: t.FinancialTransaction,
    curr1: lead,
    amt1: buysLead ? leadAmt : -leadAmt,
    curr2: follow,
    amt2: buysLead ? -followAmt : followAmt,
  }
}

/**
 * APP_STR links joined to legs on BUKRS + RFHA. A link without a leg (reversed, or not served)
 * adds nothing; the same RFHA under another company code stays a distinct transaction.
 */
export function mergeTransactions(links: readonly AppStrLink[], legs: readonly Leg[]): MergedTxn[] {
  const byKey = new Map(legs.map((l) => [txnKey(l.companyCode, l.transaction), l]))
  const out: MergedTxn[] = []
  for (const link of links) {
    const leg = byKey.get(txnKey(link.companyCode, link.transaction))
    if (leg) out.push({ ...leg, dealId: link.dealId, dealType: link.dealType, mcRef: link.mcRef })
  }
  return out
}

/**
 * UTI_AMT: for this Deal ID's D1 transactions, AMT1 when CURR1 is USD plus AMT2 when CURR2 is
 * USD, as an absolute value. Not every transaction on the MC: Deal ID and Deal Type D1 both.
 */
export function calculateDealUsdAmount(dealId: string, txns: readonly MergedTxn[]): number {
  let total = 0
  for (const t of txns) {
    if (t.dealId !== dealId || t.dealType !== UTILIZATION_DEAL_TYPE) continue
    if (t.curr1 === 'USD') total += t.amt1
    if (t.curr2 === 'USD') total += t.amt2
  }
  return Math.abs(total)
}

export const toLink = (r: AppStrEntity): AppStrLink => ({
  companyCode: r.CompanyCode,
  transaction: r.FinancialTransaction,
  dealId: (r.ZtsfDealID ?? '').trim(),
  dealType: (r.ZtsfDealType ?? '').trim(),
  mcRef: (r.ZtsfMcRefNo ?? '').trim(),
})

const chunked = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

/** The report's first read: the transactions of these Master Contracts, by ZTSF_MC_REF_NO. */
export async function loadAppStrLinks(mcRefs: readonly string[], signal?: AbortSignal): Promise<AppStrLink[]> {
  const pages = await Promise.all(
    chunked([...new Set(mcRefs.filter(Boolean))]).map((chunk) =>
      list<AppStrEntity>(APP, { filter: chunk.map((m) => `ZtsfMcRefNo eq ${odataString(m)}`).join(' or '), top: 1000 }, signal ? { signal } : undefined),
    ),
  )
  return pages.flat().map(toLink).filter((l) => l.dealId)
}

/** The standard FX transactions behind those links, matched on company code AND number. */
export async function loadFxLegs(links: readonly AppStrLink[], signal?: AbortSignal): Promise<Leg[]> {
  const pages = await Promise.all(
    chunked(links).map((chunk) =>
      list<FxEntity>(
        FX,
        { filter: chunk.map((t) => `(CompanyCode eq ${odataString(t.companyCode)} and FinancialTransaction eq ${odataString(t.transaction)})`).join(' or '), top: 1000 },
        signal ? { signal } : undefined,
      ),
    ),
  )
  return pages.flat().map(fxLeg).filter((l): l is Leg => !!l)
}

export const WAITING_OPTION_API = 'Deal Amt (USD): FX transactions only — WAITING FOR API: no standard Option OData service is configured, so option legs are not summed'

export type UsdAmounts = { amounts: ReadonlyMap<string, number> | null; note: string }

/**
 * Deal Amt (USD) per Deal ID for the given deals (Deal ID -> MC Ref). When APP_STR or the FX
 * service cannot be read, `amounts` is null and the column stays blank — a zero would claim
 * there is no utilization.
 */
export async function loadUsdAmounts(deals: ReadonlyMap<string, string>, signal?: AbortSignal): Promise<UsdAmounts> {
  try {
    const links = await loadAppStrLinks([...deals.values()], signal)
    const merged = mergeTransactions(links, await loadFxLegs(links, signal))
    const amounts = new Map<string, number>()
    for (const dealId of deals.keys()) amounts.set(dealId, calculateDealUsdAmount(dealId, merged))
    return { amounts, note: WAITING_OPTION_API }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Deal ID invoice marking: APP_STR / FxTransaction unavailable for Deal Amt (USD)', error)
    return { amounts: null, note: 'Deal Amt (USD): WAITING FOR API — ZSGTSFTR_APP_STR (trmfxapp) or FxTransaction (fx) could not be read' }
  }
}
