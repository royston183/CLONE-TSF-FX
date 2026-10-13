import { ApiError, apiFetch, createEntity, entityPath, list, odataString, service } from '@slc/api-client'
import { ENTITIES, SPOT_TXN_TYPES, TRANSACTION_TYPES, entityOf, pairOf } from './data.ts'
import { extendCreatePayload } from './extendedFields.ts'
import { parseAmount, parseUiDate, toISO } from './format.ts'
import type { AutoSpotForm, BlotterRow, BusinessPartner, Num } from './types.ts'

/**
 * The FX blotter's SAP contract: the FxTransaction entity of ZFS_SB_TRMFX_O4_API. A POST runs
 * BAPI_FTR_FXT_DEALCREATE, a DELETE reverses the deal (BAPI_FTR_FXT_REVERSE, reason 04 — a
 * financial transaction is never physically deleted) and a GET reads it back.
 */
const fxApi = service('fx')
const FX = fxApi('FxTransaction')

/** DEALCREATE refuses a deal without a general valuation class; 0011 is "Hedge Accounting". */
export const VALUATION_CLASS = '0011'

/**
 * The blotter's transaction types as SAP product type / transaction type, from the one table in
 * data.ts (the SAP value help). A type with no SAP counterpart (SWAP) is left out, so creating
 * one fails before any call is made.
 */
export const SAP_PRODUCTS: Record<string, { productType: string; transactionType: string }> = Object.fromEntries(
  TRANSACTION_TYPES.filter((t) => t.product && t.sapType).map((t) => [
    t.code,
    { productType: t.product, transactionType: t.sapType },
  ]),
)

/**
 * Deals booked before the value-help mapping used these product types; they are still in SAP,
 * so a load keeps reading them.
 */
const LEGACY_PRODUCTS: Record<string, string> = { '40A/400': 'FWD', '40B/401': 'SPOT', '40D/400': 'NDF' }

/**
 * The blotter type of a SAP deal: an exact product / transaction type match first, else by
 * product family (12A is a spot product, 12B forward, 12D NDF), so a deal made elsewhere with
 * another transaction type of the same family still shows.
 */
export function txnTypeOfProduct(productType: string, transactionType: string): string | undefined {
  const exact = Object.entries(SAP_PRODUCTS).find(
    ([, p]) => p.productType === productType && p.transactionType === transactionType,
  )?.[0]
  if (exact) return exact
  const legacy = LEGACY_PRODUCTS[`${productType}/${transactionType}`]
  if (legacy) return legacy
  if (!SPOT_TXN_TYPES.some((t) => t.product === productType && t.code === transactionType)) return undefined
  return productType === '12A' ? 'SPOT' : productType === '12B' ? 'FWD' : 'NDF'
}

/** FTR0/161 "BAPI processing was terminated" and FTR0/030 "No payment details entered" say nothing about the cause. */
const NOISE_CODES = new Set(['FTR0/161', 'FTR0/030'])

/**
 * SAP's reason for a refusal. The service's top-level message is usually the generic
 * "BAPI processing was terminated"; the cause is in `details`, so those come first. (The cause
 * is not always at error severity — a missing number range arrives as info — so codes are
 * filtered, not severities.)
 */
export function sapMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = (e.body as { error?: { details?: Array<{ code?: string; message?: string }> } } | null)?.error
      ?.details
    const causes = (details ?? []).filter((d) => d.message && !NOISE_CODES.has(d.code ?? '')).map((d) => d.message as string)
    if (causes.length) return [...new Set(causes)].join(' ')
  }
  return e instanceof Error ? e.message : String(e)
}

/** What the service returns for a deal; only the fields the blotter uses. */
export type FxTransaction = {
  CompanyCode: string
  FinancialTransaction: string
  ProductType: string
  TransactionType: string
  Partner: string
  ContractDate?: string | null
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  ValueDate?: string | null
  SpotRate?: number | string
  SwapRate?: number | string
  ForwardRate?: number | string
  /** '0' for a live deal; a reversed one comes back as '3' (seen after DELETE) and stays in the list. */
  ActiveStatus?: string
}

const ACTIVE_STATUS_REVERSED = '3'

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const num = (v: Num): number => (v === '' ? 0 : v)
/** Amounts go out with the four decimals the service stores, not with floating-point noise. */
const money = (v: Num): number => Math.round(num(v) * 10000) / 10000

/** What an error message calls a row: its draft label, else its Auto Deal leg name. */
const rowLabel = (r: BlotterRow): string => r.draftLabel || r.dealType || 'Row'

export const companyCodeOf =(r: BlotterRow): string => r.companyCode || entityOf(r.entity)?.cocode || ''

/**
 * The POST body for a draft row. Buy / Sell is read from the first currency: Buy means the
 * blotter buys Currency 1 and sells Currency 2. Rates are left for SAP to derive from the two
 * amounts, which is how the deals created so far came back (forward rate = sell / buy).
 */
export function toCreatePayload(r: BlotterRow): Record<string, unknown> {
  const product = SAP_PRODUCTS[r.txnType]
  if (!product) {
    throw new Error(`${rowLabel(r)}: ${r.txnType || 'This transaction type'} is not available in SAP yet — use Spot, TOM, Forward, NDF or DNDF.`)
  }
  const companyCode = companyCodeOf(r)
  if (!companyCode) throw new Error(`${rowLabel(r)}: Entity is required.`)
  if (!r.bp) throw new Error(`${rowLabel(r)}: Business Partner is required.`)
  if (!r.curr1 || !r.curr2) throw new Error(`${rowLabel(r)}: Both currencies are required.`)
  if (!r.tradeDate || !r.valueDate) throw new Error(`${rowLabel(r)}: Trade Date and Value Date are required.`)

  const buysFirst = r.buySell === 'B'
  return dealBody({
    companyCode,
    productType: product.productType,
    transactionType: product.transactionType,
    partner: r.bp,
    tradeDate: r.tradeDate,
    valueDate: r.valueDate,
    buyCurrency: buysFirst ? r.curr1 : r.curr2,
    sellCurrency: buysFirst ? r.curr2 : r.curr1,
    buyAmount: buysFirst ? r.amt1 : r.amt2,
    sellAmount: buysFirst ? r.amt2 : r.amt1,
    tradedCurrency: r.curr1,
  })
}

/** The catalogue's lead / follow for two currencies in either order; the given order when the pair is unlisted. */
function leadFollow(a: string, b: string): { lead: string; follow: string } {
  const p = pairOf(`${a}/${b}`) ?? pairOf(`${b}/${a}`)
  return p ? { lead: p.lead, follow: p.follow } : { lead: a, follow: b }
}

type DealFields = {
  companyCode: string
  productType: string
  transactionType: string
  partner: string
  tradeDate: Date
  valueDate: Date
  buyCurrency: string
  sellCurrency: string
  buyAmount: Num
  sellAmount: Num
  tradedCurrency: string
}

/** The one POST body both Create Transaction and Create Spot send. */
function dealBody(f: DealFields): Record<string, unknown> {
  const { lead, follow } = leadFollow(f.buyCurrency, f.sellCurrency)
  return {
    CompanyCode: f.companyCode,
    ProductType: f.productType,
    TransactionType: f.transactionType,
    Partner: f.partner,
    ValuationClass: VALUATION_CLASS,
    ContractDate: toISO(f.tradeDate),
    ValueDate: toISO(f.valueDate),
    BuyCurrency: f.buyCurrency,
    SellCurrency: f.sellCurrency,
    BuyAmount: money(f.buyAmount),
    SellAmount: money(f.sellAmount),
    LeadCurrency: lead,
    FollowCurrency: follow,
    TradedCurrency: f.tradedCurrency,
  }
}

/** Creates one deal and returns its transaction number; SAP's own message is the thrown error. */
export async function createDeal(r: BlotterRow): Promise<{ companyCode: string; transaction: string }> {
  const payload = await extendCreatePayload(toCreatePayload(r), r)
  const { key } = await createEntity<FxTransaction>(FX, payload, 'FinancialTransaction')
  if (!key) throw new Error(`${rowLabel(r)}: SAP accepted the deal but returned no transaction number.`)
  return { companyCode: String(payload.CompanyCode), transaction: key }
}

/**
 * Books the Create Spot popup as one deal, with the product type that goes with the chosen
 * transaction type. The popup holds its dates and amounts as text, so they are read here.
 */
export async function createSpotDeal(form: AutoSpotForm): Promise<{ companyCode: string; transaction: string }> {
  const entity = entityOf(form.company)
  const txn = SPOT_TXN_TYPES.find((t) => t.code === form.txnType)
  if (!entity) throw new Error('Company Code is required.')
  if (!txn) throw new Error('Transaction Type is required.')
  if (!form.bp) throw new Error('Business Partner is required.')
  const tradeDate = parseUiDate(form.tradeDate)
  const valueDate = parseUiDate(form.valueDate)
  if (!tradeDate || !valueDate) throw new Error('Trade Date and Value Date are required.')
  const buyAmount = parseAmount(form.buyAmt)
  const sellAmount = parseAmount(form.sellAmt)
  if (!(buyAmount > 0) || !(sellAmount > 0)) throw new Error('Buy Amount and Sell Amount must be greater than zero.')

  const payload = dealBody({
    companyCode: entity.cocode,
    productType: txn.product,
    transactionType: txn.code,
    partner: form.bp,
    tradeDate,
    valueDate,
    buyCurrency: form.buyCurr,
    sellCurrency: form.sellCurr,
    buyAmount,
    sellAmount,
    tradedCurrency: form.buyCurr,
  })
  const { key } = await createEntity<FxTransaction>(FX, payload, 'FinancialTransaction')
  if (!key) throw new Error('SAP accepted the spot but returned no transaction number.')
  return { companyCode: entity.cocode, transaction: key }
}

/** Reverses a deal in SAP (reason 04). */
export async function reverseDeal(companyCode: string, transaction: string): Promise<void> {
  await apiFetch(fxApi(entityPath('FxTransaction', { CompanyCode: companyCode, FinancialTransaction: transaction })), {
    method: 'DELETE',
  })
}

const parseDay = (v: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * A SAP deal as a blotter row (without id / seq, which the blotter's counters hand out), or
 * null for a deal whose product type the blotter has no name for.
 */
export function fromFxTransaction(
  d: FxTransaction,
  ctx: { group: string; trader: string },
  partners: BusinessPartner[],
): { row: Omit<BlotterRow, 'id' | 'seq'>; partners: BusinessPartner[] } | null {
  const txnType = txnTypeOfProduct(d.ProductType, d.TransactionType)
  const entity = ENTITIES.find((e) => e.cocode === d.CompanyCode)
  if (!txnType || !entity) return null

  const lead = d.LeadCurrency || d.BuyCurrency || ''
  const follow = d.FollowCurrency || d.SellCurrency || ''
  const buysLead = d.BuyCurrency === lead
  const leadAmt = n(buysLead ? d.BuyAmount : d.SellAmount)
  const followAmt = n(buysLead ? d.SellAmount : d.BuyAmount)
  const knownPartner = partners.some((p) => p.code === d.Partner)
  return {
    partners: knownPartner
      ? partners
      : [...partners, { code: d.Partner, short: d.Partner, name: d.Partner, group: 'ALL' }],
    row: {
      status: d.ActiveStatus === ACTIVE_STATUS_REVERSED ? 'REVERSED' : 'CREATED',
      draftLabel: '',
      transactionNumber: d.FinancialTransaction,
      group: ctx.group,
      trader: ctx.trader,
      tradeDate: parseDay(d.ContractDate),
      entity: entity.code,
      bp: d.Partner,
      txnType,
      buySell: buysLead ? 'B' : 'S',
      buySell2: buysLead ? 'S' : 'B',
      curr1: lead,
      amt1: leadAmt,
      curr2: follow,
      amt2: followAmt,
      spotRate: n(d.SpotRate),
      swapPoints: n(d.SwapRate) * 100,
      totalRate: n(d.ForwardRate),
      valueDate: parseDay(d.ValueDate),
      ndfDate: null,
      ndfRef: '',
      portfolio: '',
      assignment: '',
      profitCenter: entity.defaultProfitCenter,
      businessArea: entity.businessArea,
      mcRef: '',
      dealId: '',
      dealType: '',
      fxModel: '',
      notes: '',
      companyCode: d.CompanyCode,
      live: true,
    },
  }
}

/**
 * The deals of the blotter's entities that were contracted on `date`. The service cannot
 * filter on ContractDate (its query rejects the column), so the day is applied here.
 */
export async function loadDeals(date: Date, signal?: AbortSignal): Promise<FxTransaction[]> {
  const day = toISO(date)
  const filter = ENTITIES.map((e) => `CompanyCode eq ${odataString(e.cocode)}`).join(' or ')
  const rows = await list<FxTransaction>(FX, { filter, top: 1000 }, signal ? { signal } : undefined)
  return rows.filter((d) => d.ContractDate === day)
}
