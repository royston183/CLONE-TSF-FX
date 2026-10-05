import { apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dealKey, dealIdsByTransaction, sapMessage, type FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { STATUS } from './data.ts'
import { parseAmountShorthand, parseRate, safeParseDate } from './format.ts'
import type { CorrectionForm, Txn } from './types.ts'

/**
 * The FX half of EC2, from the FxTransaction OData service (ZFS_SB_TRMFX_O4_API) and the masters around it.
 *
 * What SAP can do here, and what it cannot:
 *
 *   Reverse   DELETE FxTransaction = BAPI_FTR_FXT_REVERSE (reason 04).
 *   Correct   PATCH FxTransaction = BAPI_FTR_FXT_DEALCHANGE: rates, Amount 1, value date and trade date (ContractDate).
 *             SAP works Amount 2 out itself (Buy Amount x Forward Rate), so it is never sent.
 *
 * What the service has no field for, and the screen therefore shows blank and read-only instead of inventing:
 * Correction Required / Released to MO (a row is only "Open" or, once SAP reversed it, "Reversed"), the MO remark,
 * trader, mode of trade, account category, business area and profit center of the transaction, blotter date, and
 * who changed it. The Deal ID and Master Contract come from ZSGTSFTR_DEALID; the names from the TRM and
 * business-partner masters. Options are not part of this service and stay out.
 */
export { sapMessage }

const fxApi = service('fx')
const FX = fxApi('FxTransaction')
const masterApi = service('trmmaster')
const partnerApi = service('businesspartner')

const ACTIVE_REVERSED = '3'

type V2<T> = { d?: { results?: T[] } }
type V4<T> = { value?: T[] }

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const parseDay = (v: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** A date as the service takes it: YYYY-MM-DD from the pickers' DD-MM-YYYY. */
const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The names the queue shows, each looked up once. Any map may be empty: the code then stands in for its name. */
export type Names = {
  /** Company code -> its row in ZSGTSFTR_COMP. */
  companies: ReadonlyMap<string, { name: string; entity: string }>
  productTypes: ReadonlyMap<string, string>
  /** Keyed product type + transaction type, as a transaction type is only unique within its product type. */
  transactionTypes: ReadonlyMap<string, string>
  partners: ReadonlyMap<string, string>
}

export const EMPTY_NAMES: Names = { companies: new Map(), productTypes: new Map(), transactionTypes: new Map(), partners: new Map() }

export const txnTypeKey = (productType: string, transactionType: string) => `${productType}/${transactionType}`

/** The company codes of the TSF entities, with the name and entity short code the queue shows. */
export function companiesOf(rows: readonly FxRow[]): Map<string, { name: string; entity: string }> {
  const out = new Map<string, { name: string; entity: string }>()
  for (const r of rows) {
    const code = txt(r, 'ZBUKRS')
    if (code && !out.has(code)) out.set(code, { name: txt(r, 'ZBUTXT'), entity: txt(r, 'ZCOM_ID') })
  }
  return out
}

/** The Deal ID row of each transaction (Deal ID, its description, its Master Contract), keyed like dealKey. */
export function dealInfoByTransaction(dealRows: readonly FxRow[]): Map<string, { dealId: string; desc: string; mc: string }> {
  const ids = dealIdsByTransaction(dealRows)
  const rowOf = new Map(dealRows.map((r) => [txt(r, 'ZDEAL_ID'), r]))
  const out = new Map<string, { dealId: string; desc: string; mc: string }>()
  for (const [key, dealId] of ids) {
    const r = rowOf.get(dealId)
    out.set(key, { dealId, desc: r ? txt(r, 'ZDEAL_DESC') : '', mc: r ? txt(r, 'ZMC_REF') : '' })
  }
  return out
}

/**
 * An FxTransaction as a queue row. A reversed one stays (read-only, "Reversed"); anything without dates is dropped.
 * Leg 1 is the lead currency; Amount 1 and 2 are shown unsigned.
 */
export function toTxn(
  d: FxTransaction,
  deals: ReadonlyMap<string, { dealId: string; desc: string; mc: string }>,
  names: Names,
): Txn | null {
  const tradeDate = parseDay(d.ContractDate)
  const valueDate = parseDay(d.ValueDate)
  if (!tradeDate || !valueDate) return null

  const lead = d.LeadCurrency || d.BuyCurrency || ''
  const follow = d.FollowCurrency || d.SellCurrency || ''
  const buysLead = d.BuyCurrency === lead
  const leadAmt = n(buysLead ? d.BuyAmount : d.SellAmount)
  const followAmt = n(buysLead ? d.SellAmount : d.BuyAmount)
  const company = names.companies.get(d.CompanyCode)
  const deal = deals.get(dealKey(d.CompanyCode, d.FinancialTransaction))
  const productType = d.ProductType ?? ''
  return {
    rfha: d.FinancialTransaction,
    dealId: deal?.dealId ?? '',
    dealIdDesc: deal?.desc ?? '',
    mc: deal?.mc ?? '',
    coCode: d.CompanyCode,
    companyName: company?.name ?? '',
    tsfEntity: company?.entity ?? '',
    prodType: productType,
    prodTypeDesc: names.productTypes.get(productType) ?? '',
    txnType: d.TransactionType,
    txnTypeDesc: names.transactionTypes.get(txnTypeKey(productType, d.TransactionType)) ?? '',
    partnerCode: d.Partner,
    partnerName: names.partners.get(d.Partner) ?? '',
    buySell1: buysLead ? 'Buy' : 'Sell',
    ccy1: lead,
    amt1: leadAmt,
    buySell2: buysLead ? 'Sell' : 'Buy',
    ccy2: follow,
    amt2: followAmt,
    spotRate: n(d.SpotRate),
    swapRate: n(d.SwapRate),
    allInRate: n(d.ForwardRate),
    tradeDate,
    valueDate,
    blotterDate: null,
    busArea: '',
    busAreaDesc: '',
    profitCenter: '',
    profitCenterDesc: '',
    traderCode: '',
    traderName: '',
    modeOfTrade: '',
    acctCat: '',
    status: d.ActiveStatus === ACTIVE_REVERSED ? STATUS.REVERSED : STATUS.OPEN,
    moRemark: '',
    changedBy: '',
    changedOn: null,
    live: true,
    buysLead,
  }
}

/** The names, read from the masters. A master that cannot be read leaves its codes unnamed; it never stops the queue. */
export async function loadNames(rows: readonly FxTransaction[], companies: Map<string, { name: string; entity: string }>, signal?: AbortSignal): Promise<Names> {
  const opts = signal ? { signal } : undefined
  const productTypes = new Map<string, string>()
  const transactionTypes = new Map<string, string>()
  const partners = new Map<string, string>()
  const types = [...new Set(rows.map((r) => r.ProductType ?? '').filter(Boolean))]
  const bps = [...new Set(rows.map((r) => r.Partner).filter(Boolean))]
  const typeFilter = types.map((t) => `ProductType eq ${odataString(t)}`).join(' or ')
  const soft = async (what: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn(`[ec2] ${what} unavailable`, error)
    }
  }
  await Promise.all([
    soft('product type names', async () => {
      if (!types.length) return
      const v4 = await apiFetch<V4<{ ProductType?: string; ProductTypeName?: string }>>(
        `${masterApi('ProductType')}?${new URLSearchParams({ $filter: typeFilter })}`,
        opts,
      )
      for (const p of v4?.value ?? []) if (p.ProductType) productTypes.set(p.ProductType, (p.ProductTypeName ?? '').trim())
    }),
    soft('transaction type names', async () => {
      if (!types.length) return
      const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string; TransactionTypeName?: string }>>(
        `${masterApi('TransactionType')}?${new URLSearchParams({ $filter: typeFilter })}`,
        opts,
      )
      for (const t of v4?.value ?? [])
        if (t.TransactionType) transactionTypes.set(txnTypeKey(t.ProductType ?? '', t.TransactionType), (t.TransactionTypeName ?? '').trim())
    }),
    soft('partner names', async () => {
      if (!bps.length) return
      const filter = bps.map((b) => `BusinessPartner eq ${odataString(b)}`).join(' or ')
      const v2 = await apiFetch<V2<{ BusinessPartner?: string; BusinessPartnerFullName?: string }>>(
        `${partnerApi('A_BusinessPartner')}?${new URLSearchParams({ $filter: filter, $select: 'BusinessPartner,BusinessPartnerFullName', $format: 'json' })}`,
        opts,
      )
      for (const p of v2?.d?.results ?? []) if (p.BusinessPartner) partners.set(p.BusinessPartner, (p.BusinessPartnerFullName ?? '').trim())
    }),
  ])
  return { companies, productTypes, transactionTypes, partners }
}

/** Every FX transaction of the TSF entities, reversed ones included, with its Deal ID, Master Contract and names. */
export async function loadQueue(signal?: AbortSignal): Promise<Txn[]> {
  const opts = signal ? { signal } : undefined
  const [compRows, dealRows] = await Promise.all([fxList('comp', {}, { signal }), fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal })])
  const companies = companiesOf(compRows)
  if (!companies.size) throw new Error('No TSF company code (ZSGTSFTR_COMP) was returned, so there is nothing to list.')
  const filter = [...companies.keys()].map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  const rows = await list<FxTransaction>(FX, { filter, top: 1000 }, opts)
  const names = await loadNames(rows, companies, signal)
  const deals = dealInfoByTransaction(dealRows)
  return rows.map((d) => toTxn(d, deals, names)).filter((t): t is Txn => t !== null)
}

/**
 * The PATCH body for a correction: only the fields that changed, in the service's own names. Nothing for Amount 2
 * (SAP derives it) and nothing for the fields SAP has no home for. Amount 1 is only sent when it is the amount bought,
 * as that is the one SAP takes; the screen leaves it read-only otherwise.
 */
export function toCorrectionPatch(old: Txn, form: CorrectionForm): Record<string, string | number> {
  const patch: Record<string, string | number> = {}
  const rate = (text: string, was: number, key: string) => {
    const v = parseRate(text)
    if (Number.isFinite(v) && v > 0 && v !== was) patch[key] = v
  }
  rate(form.allInRate, old.allInRate, 'ForwardRate')
  rate(form.spotRate, old.spotRate, 'SpotRate')
  // A swap rate may be 0, so it is not held to > 0.
  const swap = parseRate(form.swapRate)
  if (Number.isFinite(swap) && swap !== old.swapRate) patch.SwapRate = swap
  const amount = parseAmountShorthand(form.amount1)
  if (old.buysLead && amount > 0 && amount !== old.amt1) patch.BuyAmount = amount
  const value = safeParseDate(form.valueDate)
  if (value && isoDay(value) !== isoDay(old.valueDate)) patch.ValueDate = isoDay(value)
  const trade = safeParseDate(form.tradeDate)
  if (trade && isoDay(trade) !== isoDay(old.tradeDate)) patch.ContractDate = isoDay(trade)
  return patch
}

/** A human line for what a patch changes, for the confirmation toast. */
export const patchLabels: Record<string, string> = {
  ForwardRate: 'All in Rate',
  SpotRate: 'Spot Rate',
  SwapRate: 'Swap Rate',
  BuyAmount: 'Amount 1',
  ValueDate: 'Value Date',
  ContractDate: 'Trade Date',
}

const keyOf = (t: Pick<Txn, 'coCode' | 'rfha'>) => fxApi(entityPath('FxTransaction', { CompanyCode: t.coCode, FinancialTransaction: t.rfha }))

/** Changes one transaction in SAP (BAPI_FTR_FXT_DEALCHANGE through PATCH). */
export async function correctTxn(t: Txn, patch: Record<string, string | number>): Promise<void> {
  await apiFetch(keyOf(t), { method: 'PATCH', body: patch })
}

/** Reverses one transaction in SAP (BAPI_FTR_FXT_REVERSE through DELETE). */
export async function reverseTxn(t: Txn): Promise<void> {
  await apiFetch(keyOf(t), { method: 'DELETE' })
}

export type ReverseOutcome = { reversed: string[]; failed?: { rfha: string; reason: string } }

/** Reverses in order and stops at the first SAP refusal: each reversal is its own SAP commit, so the earlier ones stay done. */
export async function reverseTxns(ts: readonly Txn[]): Promise<ReverseOutcome> {
  const reversed: string[] = []
  for (const t of ts) {
    try {
      await reverseTxn(t)
      reversed.push(t.rfha)
    } catch (e) {
      return { reversed, failed: { rfha: t.rfha, reason: sapMessage(e) } }
    }
  }
  return { reversed }
}
