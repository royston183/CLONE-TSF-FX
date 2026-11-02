import { apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import type { FxTransaction } from '../../features/mo-fx-deal-confirmation/api.ts'
import type { TrmFxApp, TxnKey } from './app-str.ts'
import { currencyDecimals } from './currency-decimals.ts'
import { fxList, isAbort, type FxRow } from './mw.ts'
import { loadNames, type Names } from './names.ts'

/** The existing BAPI-backed entity plus the optional read extension documented in docs/abap/Trader-Workbench-Transaction-Details.md. */
export type FxDetail = FxTransaction & {
  TradedCurrency?: string
  NdfFixingCurrency?: string
  NdfFixingDate?: string | null
  FixingReferenceId?: string
  Portfolio?: string
  ValuationClass?: string
  LiquidityEffect?: number | string | null
  MarketSpotRate?: number | string | null
  MarketSwapRate?: number | string | null
  MarketRateTime?: string | null
  SettlementFlowType?: string
  SettlementFlowTypeName?: string
  SettlementBuyAmount?: number | string | null
  SettlementSellAmount?: number | string | null
  ContractTime?: string | null
  ContractTimeZone?: string
  Trader?: string
  ContactPerson?: string
  MIC?: string
}

export type TransactionDetails = {
  fx: FxDetail
  app: TrmFxApp | null
  view: FxRow | null
  names: Names
  productName: string
  warnings: string[]
}

export const isNdfDetail = (fx: Pick<FxDetail, 'ProductType' | 'TransactionType'>): boolean =>
  fx.ProductType?.endsWith('D') === true || fx.TransactionType === '631' || fx.TransactionType === '632'

/** A fresh read on every open/refresh. Both parts of the SAP business key are required. */
export async function loadTransactionDetails(key: TxnKey, signal?: AbortSignal): Promise<TransactionDetails> {
  if (!key.CompanyCode || !key.FinancialTransaction) throw new Error('Company code and transaction number are required.')
  const opts = signal ? { signal } : undefined
  const fx = await apiFetch<FxDetail>(service('fx')(entityPath('FxTransaction', key)), opts)
  if (!fx || fx.CompanyCode !== key.CompanyCode || fx.FinancialTransaction !== key.FinancialTransaction)
    throw new Error('SAP returned a different transaction. Reload the workbench and try again.')
  const warnings: string[] = []
  const optional = async <T>(label: string, run: () => Promise<T>, empty: T): Promise<T> => {
    try { return await run() } catch (error) {
      if (isAbort(error)) throw error
      warnings.push(`${label} could not be loaded.`)
      return empty
    }
  }
  const [app, names, products, views] = await Promise.all([
    optional('Deal references and remarks', () => apiFetch<TrmFxApp>(service('trmfxapp')(entityPath('TrmFxApp', key)), opts), null),
    loadNames([fx], signal),
    fx.ProductType ? optional('Product description', () => list<{ ProductTypeName?: string }>(service('trmmaster')('ProductType'), { filter: `ProductType eq ${odataString(fx.ProductType!)}`, top: 1 }, opts), []) : [],
    isNdfDetail(fx) ? optional('Supplementary NDF settlement data', () => fxList('tsfvFx', { BUKRS: key.CompanyCode, RFHA: key.FinancialTransaction }, { signal }), []) : [],
  ])
  // Check the key again: a middleware that ignores a filter must never supply another deal's fixing.
  const view = views.find((v) => v.BUKRS?.trim() === key.CompanyCode && v.RFHA?.trim() === key.FinancialTransaction) ?? null
  return { fx, app, names, productName: products[0]?.ProductTypeName?.trim() ?? '', view, warnings }
}

export type DetailField = { label: string; value: string }
export type DetailSection = { title: string; fields: DetailField[] }

const clean = (v: unknown): string => v === null || v === undefined ? '' : String(v).trim()
const present = (v: unknown): boolean => clean(v) !== ''
const first = (...values: unknown[]): unknown => values.find(present)
const decimal = (v: unknown): number | null => {
  if (!present(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
export const detailRate = (v: unknown): string => {
  const n = decimal(v)
  return n === null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 9, maximumFractionDigits: 9 })
}
export const detailAmount = (currency: string | undefined, v: unknown): string => {
  const n = decimal(v)
  if (!currency || n === null) return ''
  const dp = currencyDecimals(currency)
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}
const date = (v: unknown): string => {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(clean(v))
  return m && m[1] !== '0000' ? `${m[3]}.${m[2]}.${m[1]}` : ''
}
const codeName = (code: unknown, name?: unknown): string => [clean(code), clean(name)].filter(Boolean).join(' · ')
const field = (label: string, value: unknown): DetailField => ({ label, value: clean(value) })

/** ActivityCategory is SAP's category, not the activity sequence (2/3) in the GUI screenshots. */
export const activityText = (category: string | undefined): string => {
  const labels: Record<string, string> = { '10': 'Order', '20': 'Contract', '30': 'Contract Settlement', '55': 'Fixing', '65': 'Fixing' }
  return codeName(category, labels[category ?? ''])
}

/** Structure follows the traded currency, which can differ from the pair's lead currency. No settlement amount is inferred from a rate. */
export function transactionSections(d: TransactionDetails, companyName: string): { header: DetailField[]; structure: DetailSection[]; administration: DetailSection[] } {
  const { fx: f, app, view, names } = d
  const traded = f.TradedCurrency || f.LeadCurrency || f.BuyCurrency || ''
  const buysTraded = traded === f.BuyCurrency
  const opposite = buysTraded ? f.SellCurrency : f.BuyCurrency
  const tradedAmount = buysTraded ? f.BuyAmount : f.SellAmount
  const oppositeAmount = buysTraded ? f.SellAmount : f.BuyAmount
  const signed = (v: unknown, buy: boolean): number | null => { const n = decimal(v); return n === null ? null : (buy ? 1 : -1) * Math.abs(n) }
  const ndf = isNdfDetail(f)
  const structure: DetailSection[] = [{ title: 'FX Structure', fields: [
    field('Partner', codeName(f.Partner, names.partners.get(f.Partner))),
    field('Rate', codeName([f.LeadCurrency, f.FollowCurrency].filter(Boolean).join(' / '), detailRate(f.ForwardRate))),
    field('Buy/Sell', traded ? `${buysTraded ? 'B · Buy' : 'S · Sell'} ${traded}` : ''),
    field('Traded Amount', detailAmount(traded, tradedAmount)),
    field('Opposite Amount', detailAmount(opposite, oppositeAmount)),
    field('Value Date', date(f.ValueDate)),
    field('Spot Rate', detailRate(f.SpotRate)),
    field('Market Spot', detailRate(f.MarketSpotRate)),
    field('Swap Rate', detailRate(f.SwapRate)),
    field('Market Swap', detailRate(f.MarketSwapRate)),
    field('Liquidity Eff.', detailRate(f.LiquidityEffect)),
    field('Market Time', f.MarketRateTime),
    ...(ndf ? [field('Fixing Date', date(first(f.NdfFixingDate, view?.NDF_DATE))), field('Settlement Crcy', f.NdfFixingCurrency), field('Fixing Reference', first(f.FixingReferenceId, view?.NDF_REF))] : []),
  ] }]
  if (ndf) structure.push({ title: 'Settlement', fields: [
    field('Rate', detailRate(first(f.NdfFixingRate, view?.NDF_RATE))),
    field('Flow Type', codeName(f.SettlementFlowType, f.SettlementFlowTypeName)),
    field('Contract Amount · Traded', detailAmount(traded, signed(tradedAmount, buysTraded))),
    field('Contract Amount · Opposite', detailAmount(opposite, signed(oppositeAmount, !buysTraded))),
    field('Settlement Amount · Buy', detailAmount(f.BuyCurrency, f.SettlementBuyAmount)),
    field('Settlement Amount · Sell', detailAmount(f.SellCurrency, f.SettlementSellAmount)),
    field('Cash Settlement', detailAmount(clean(first(f.CashSettlementCurrency, view?.CASH_CURR)), first(f.CashSettlementAmount, view?.ZCASH_AMT))),
  ] })
  structure.push({ title: 'Contract Conclusion', fields: [
    field('Contract Date', date(f.ContractDate)), field('Trader', f.Trader),
    field('Contract Time', f.ContractTime), field('Contact Person', f.ContactPerson),
    field('Time Zone', f.ContractTimeZone), field('Ext. Ref.', f.ExternalReference), field('MIC', f.MIC),
  ] })
  return {
    header: [field('Company Code', codeName(f.CompanyCode, companyName)), field('Transaction', f.FinancialTransaction), field('Product Type', codeName(f.ProductType, d.productName)), field('Activity Category', activityText(f.ActivityCategory)), field('Transaction Type', codeName(f.TransactionType, names.txnTypes.get(`${f.ProductType ?? ''}/${f.TransactionType}`)))],
    structure,
    administration: [{ title: 'Administration', fields: [
      field('Deal ID', app?.ZtsfDealID), field('Deal Type', app?.ZtsfDealType), field('Master Contract', app?.ZtsfMcRefNo),
      field('Portfolio', f.Portfolio), field('Valuation Class', f.ValuationClass), field('Active Status', f.ActiveStatus),
      field('Transaction Status', app?.TxnStatus), field('Trader Code', app?.Ztrcode), field('Internal Reference', app?.ZolamDealNo),
      field('FO Remarks', ndf ? app?.NdfFoRem : app?.FoRemark), field('MO Remarks', ndf ? app?.NdfMoRem : app?.Remark),
    ] }],
  }
}
