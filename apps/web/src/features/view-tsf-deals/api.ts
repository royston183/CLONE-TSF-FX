import { odataString } from '@slc/api-client'
import { appKey, loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { matchesSelection, selectionError } from './logic.ts'
import type { DealReportRow, Lookups, Selection } from './types.ts'

export async function loadLookups(signal?: AbortSignal): Promise<Lookups> {
  const [companies, traders] = await Promise.all([fxList('comp', {}, { signal }), fxList('trmTrader', {}, { signal })])
  const unique = <T>(rows: T[], key: (row: T) => string) => [...new Map(rows.map((row) => [key(row), row])).values()]
  return {
    companies: unique(companies.map((r) => ({ code: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT') || txt(r, 'ZCOM_ID') })).filter((r) => r.code), (r) => r.code).sort((a, b) => a.code.localeCompare(b.code)),
    traders: unique(traders.map((r) => ({ code: txt(r, 'ZTCODE'), name: txt(r, 'ZNAME') || txt(r, 'ZTRADER') })).filter((r) => r.code), (r) => r.code).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The ABAP selection on the VTBFHA append data, with the actual Treasury transaction joined by both key fields. */
export function reportFilter(selection: Selection, companies: readonly string[]): string {
  const error = selectionError(selection, companies)
  if (error) throw new Error(error)
  const codes = selection.company === 'ALL' ? companies : [selection.company]
  return `(${codes.map((code) => `CompanyCode eq ${odataString(code)}`).join(' or ')}) and BlotterDate ge ${selection.from} and BlotterDate le ${selection.to} and ZtsfDealID ne ''`
}

const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const date = (value: unknown) => {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(value ?? ''))
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}
const absolute = (value: unknown) => { const n = amount(value); return n === null ? null : Math.abs(n) }

export type Enrichment = { contracts: FxRow[]; deals: FxRow[]; rules: FxRow[]; view: FxRow[] }

/** LEFT JOIN Master Contract: missing contract/configuration never removes a Treasury transaction. */
export function buildRows(source: readonly FxWithApp[], enrichment: Enrichment, lookups: Lookups): DealReportRow[] {
  const contracts = new Map(enrichment.contracts.map((r) => [txt(r, 'ZMC_REF_NO'), r]))
  const deals = new Map(enrichment.deals.map((r) => [txt(r, 'ZDEAL_ID'), r]))
  const rules = new Map<string, FxRow>()
  for (const rule of enrichment.rules) {
    const model = txt(rule, 'ZMOD_ID')
    if (!rules.has(model) || !txt(rule, 'ZLINK_MODEL')) rules.set(model, rule)
  }
  const view = new Map(enrichment.view.map((r) => [appKey(txt(r, 'BUKRS'), txt(r, 'RFHA')), r]))
  const seen = new Set<string>()
  return source.flatMap(({ fx, app }): DealReportRow[] => {
    const id = appKey(fx.CompanyCode, fx.FinancialTransaction)
    const dealId = String(app.ZtsfDealID ?? '').trim()
    if (!dealId || seen.has(id)) return []
    seen.add(id)
    const deal = deals.get(dealId) ?? {}
    const mcRef = String(app.ZtsfMcRefNo ?? '').trim() || txt(deal, 'ZMC_REF')
    const mc = contracts.get(mcRef) ?? {}
    const model = txt(deal, 'ZTSF_MODEL') || txt(mc, 'ZMOD_ID')
    const rule = rules.get(model) ?? {}
    const raw = view.get(id) ?? {}
    const traderCode = String(app.Ztrcode ?? '').trim()
    const trader = lookups.traders.find((t) => t.code === traderCode)
    // USD becomes side 1 when it is either leg; buy/sell and amounts always move together.
    const firstIsBuy = fx.BuyCurrency === 'USD' || (fx.SellCurrency !== 'USD' && (fx.LeadCurrency || fx.BuyCurrency) === fx.BuyCurrency)
    const statusCode = String(app.TxnStatus ?? '').trim()
    const reversed = fx.ActiveStatus === '3' || statusCode === '02' || statusCode === '05'
    const product = txt(raw, 'LTX') || fx.ProductType || ''
    const pnlCurrency = txt(deal, 'ZPL_CURR'), localPnlCurrency = txt(deal, 'ZPL_LCURR')
    const ndf = fx.TransactionType === '631' || fx.TransactionType === '632'
    const portfolio = (fx as typeof fx & { Portfolio?: string }).Portfolio ?? txt(raw, 'RPORTB')
    return [{
      id, rfha: fx.FinancialTransaction, bukrs: fx.CompanyCode,
      companyName: lookups.companies.find((c) => c.code === fx.CompanyCode)?.name ?? txt(raw, 'BUTXT'),
      dealId, dealDesc: String(app.ZtsfDealDesc ?? '').trim() || txt(deal, 'ZDEAL_DESC'),
      dealType: String(app.ZtsfDealType ?? '').trim(), product, transactionType: fx.TransactionType, activity: fx.ActivityCategory ?? '',
      partner: fx.Partner, bpName: txt(raw, 'BP_NAME') || fx.Partner,
      blotter: date(app.BlotterDate), tradeDate: date(fx.ContractDate), valueDate: date(fx.ValueDate),
      bs1: firstIsBuy ? 'Buy' : 'Sell', curr1: (firstIsBuy ? fx.BuyCurrency : fx.SellCurrency) ?? '', amt1: absolute(firstIsBuy ? fx.BuyAmount : fx.SellAmount),
      bs2: firstIsBuy ? 'Sell' : 'Buy', curr2: (firstIsBuy ? fx.SellCurrency : fx.BuyCurrency) ?? '', amt2: absolute(firstIsBuy ? fx.SellAmount : fx.BuyAmount),
      spot: amount(fx.SpotRate), swap: amount(fx.SwapRate), allRate: amount(fx.ForwardRate),
      rateBasis: `${fx.LeadCurrency || fx.BuyCurrency || '—'} / ${fx.FollowCurrency || fx.SellCurrency || '—'}`,
      // Saved Deal ID P&L only. No invented CDS rollover aggregation or local-currency conversion.
      pnl: pnlCurrency ? amount(deal['ZPL']) : null, pnlCurrency,
      localPnl: localPnlCurrency ? amount(deal['ZPL_LAMT']) : null, localPnlCurrency,
      traderCode, trader: trader ? `${traderCode} · ${trader.name}` : traderCode,
      externalRef: fx.ExternalReference ?? txt(raw, 'REFER'), internalRef: String(app.ZolamDealNo ?? '').trim(),
      statusCode, status: reversed ? 'Deleted / reversed' : fxTxnStatusLabel(statusCode) || 'Status unavailable', reversed,
      execution: /internal/i.test(product) ? 'Internal' : /external/i.test(product) ? 'External' : '',
      mcRef, mcDesc: txt(mc, 'ZMC_DESC'), commodity: txt(mc, 'ZCOM_DESC') || txt(mc, 'ZCOMMODITY'),
      model, modelDesc: txt(rule, 'ZMOD_DESC') || txt(mc, 'ZMOD_DESC'), subType: txt(rule, 'ZSUB_TYPE') || txt(deal, 'ZSUB_TYPE'),
      portfolio, businessArea: txt(raw, 'RBUSA'),
      foRemark: String((ndf ? app.NdfFoRem : app.FoRemark) ?? '').trim(), moRemark: String((ndf ? app.NdfMoRem : app.Remark) ?? '').trim(),
      enteredBy: txt(raw, 'CRUSER'), created: date(raw['DCRDAT']), changedBy: txt(raw, 'UPUSER'), changed: date(raw['DUPDAT']),
    }]
  })
}

export type ReportDeps = {
  transactions: (filter: string, signal?: AbortSignal) => Promise<FxWithApp[]>
  table: (resource: string, signal?: AbortSignal) => Promise<FxRow[]>
  details: (source: readonly FxWithApp[], signal?: AbortSignal) => Promise<FxRow[]>
}

const defaultDeps: ReportDeps = {
  transactions: loadFxWithApp,
  table: (resource, signal) => fxList(resource, {}, { signal }),
  details: async (source, signal) => {
    const rows: FxRow[] = []
    const companies = [...new Set(source.map(({ fx }) => fx.CompanyCode))]
    for (const company of companies) {
      const numbers = source.filter(({ fx }) => fx.CompanyCode === company).map(({ fx }) => fx.FinancialTransaction)
      for (let start = 0; start < numbers.length; start += 50) {
        rows.push(...await fxList('tsfvFx', { BUKRS: company, 'RFHA[in]': numbers.slice(start, start + 50).join(',') }, { signal }))
      }
    }
    return rows
  },
}

export async function loadReport(selection: Selection, lookups: Lookups, signal?: AbortSignal, deps: ReportDeps = defaultDeps): Promise<{ rows: DealReportRow[]; notice: string }> {
  const companies = lookups.companies.map((c) => c.code)
  const source = await deps.transactions(reportFilter(selection, companies), signal)
  if (!source.length) return { rows: [], notice: '' }
  let notice = ''
  const details = deps.details(source, signal).catch((error: unknown) => {
    if (isAbort(error)) throw error
    notice = 'Some counterparty descriptions and transaction audit details could not be loaded. Transaction amounts and selection still use current Treasury data.'
    return [] as FxRow[]
  })
  const [contracts, deals, rules, view] = await Promise.all([
    deps.table('masterContract', signal), deps.table('tsfDealId', signal), deps.table('fxModel', signal), details,
  ])
  return { rows: buildRows(source, { contracts, deals, rules, view }, lookups).filter((row) => matchesSelection(row, selection, companies)), notice }
}
