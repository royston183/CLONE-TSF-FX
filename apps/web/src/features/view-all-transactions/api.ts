import { list, odataString, service } from '@slc/api-client'
import { appKey, attachTrmFxApp, loadFxWithApp } from '../../shared/fx/app-str.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { matchesSelection, selectionError, validDate } from './logic.ts'
import type { Lookups, ReportDeps, Row, Selection, Source } from './types.ts'

const FX = service('fx')('FxTransaction')
export const COVERAGE_NOTICE = 'This report uses the available FX transaction services. Deal Dump-specific source, trader group, profit center and category fields may be unavailable and display as —. Internal / External uses explicit product descriptions; TSF-linked means a TSF Deal ID is present. Email, server upload and SAP GUI launch are not connected.'

export async function loadLookups(signal?: AbortSignal): Promise<Lookups> {
  const traders = fxList('trdGrp', {}, { signal }).catch((error: unknown) => {
    if (isAbort(error)) throw error
    return null
  })
  const [companies, traderRows] = await Promise.all([fxList('comp', {}, { signal }), traders])
  const unique = <T,>(rows: T[], key: (r: T) => string) => [...new Map(rows.map((r) => [key(r), r])).values()]
  return {
    companies: unique(companies.map((r) => ({ code: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT') || txt(r, 'ZCOM_ID') })).filter((c) => c.code), (r) => r.code).sort((a, b) => a.code.localeCompare(b.code)),
    traders: unique((traderRows ?? []).map((r) => ({ code: txt(r, 'ZTCODE'), name: txt(r, 'ZTRADER') })).filter((t) => t.code), (r) => r.code).sort((a, b) => a.code.localeCompare(b.code)),
    notice: traderRows === null ? 'Trader names could not be loaded; trader codes remain available.' : '',
  }
}

/** The selected date basis changes the query's source and date field. No TSF-only condition. */
export function reportFilter(selection: Selection, companies: readonly string[]): string {
  const error = selectionError(selection, companies)
  if (error) throw new Error(error)
  const codes = selection.company === 'ALL' ? companies : [selection.company]
  const field = { blotter: 'BlotterDate', trade: 'ContractDate', value: 'ValueDate' }[selection.basis]
  return `(${codes.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')}) and ${field} ge ${selection.from} and ${field} le ${selection.to}`
}

export const defaultDeps: ReportDeps = {
  transactions: async (selection, companies, signal) => {
    const filter = reportFilter(selection, companies)
    if (selection.basis === 'blotter') return loadFxWithApp(filter, signal)
    // Start with Treasury for trade/value dates: transactions without application records must survive.
    const rows: FxTransaction[] = []
    const pageSize = 500
    for (let skip = 0; ; skip += pageSize) {
      const page = await list<FxTransaction>(FX, { filter, top: pageSize, skip, orderby: 'CompanyCode,FinancialTransaction' }, signal ? { signal } : undefined)
      rows.push(...page)
      if (page.length < pageSize) break
    }
    return attachTrmFxApp(rows, signal)
  },
  details: async (source, signal) => {
    const rows: FxRow[] = []
    for (const company of new Set(source.map(({ fx }) => fx.CompanyCode))) {
      const numbers = [...new Set(source.filter(({ fx }) => fx.CompanyCode === company).map(({ fx }) => fx.FinancialTransaction))]
      for (let start = 0; start < numbers.length; start += 50) {
        rows.push(...await fxList('tsfvFx', { BUKRS: company, 'RFHA[in]': numbers.slice(start, start + 50).join(',') }, { signal }))
      }
    }
    return rows
  },
}

const day = (value: unknown): string => {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(value ?? ''))
  const iso = match ? `${match[1]}-${match[2]}-${match[3]}` : ''
  return validDate(iso) ? iso : ''
}
const number = (value: unknown, absolute = false): number | null => {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? absolute ? Math.abs(n) : n : null
}

export function buildRows(source: readonly Source[], view: readonly FxRow[], lookups: Lookups): Row[] {
  const details = new Map(view.map((r) => [appKey(txt(r, 'BUKRS'), txt(r, 'RFHA')), r]))
  const seen = new Set<string>()
  return source.flatMap(({ fx, app }): Row[] => {
    const id = appKey(fx.CompanyCode, fx.FinancialTransaction)
    if (!fx.CompanyCode || !fx.FinancialTransaction || seen.has(id)) return []
    seen.add(id)
    const raw = details.get(id) ?? {}
    const productText = txt(raw, 'LTX')
    const firstCurrency = fx.LeadCurrency || fx.BuyCurrency || fx.SellCurrency || ''
    const firstBuy = firstCurrency === fx.BuyCurrency
    const traderCode = String(app?.Ztrcode ?? '').trim()
    const statusCode = String(app?.TxnStatus ?? '').trim()
    const reversed = fx.ActiveStatus === '3' || statusCode === '02' || statusCode === '05'
    return [{
      id, company: fx.CompanyCode, deal: fx.FinancialTransaction,
      // Do not guess Deal Dump classifications or populate absent append fields from the HTML samples.
      source: '', product: [fx.ProductType, productText].filter(Boolean).join(' · '),
      blotter: day(app?.BlotterDate), trade: day(fx.ContractDate), value: day(fx.ValueDate),
      bs1: firstBuy ? 'Buy' : 'Sell', c1: firstCurrency, a1: number(firstBuy ? fx.BuyAmount : fx.SellAmount, true),
      bs2: firstBuy ? 'Sell' : 'Buy', c2: (firstBuy ? fx.SellCurrency : fx.BuyCurrency) || '', a2: number(firstBuy ? fx.SellAmount : fx.BuyAmount, true),
      rate: number(fx.ForwardRate), spot: number(fx.SpotRate), swap: number(fx.SwapRate),
      quotation: [fx.LeadCurrency || fx.BuyCurrency, fx.FollowCurrency || fx.SellCurrency].filter(Boolean).join(' / '),
      ndfDate: day(raw['NDF_DATE']), ndfRef: txt(raw, 'NDF_REF'),
      partner: fx.Partner, partnerName: txt(raw, 'BP_NAME') || fx.Partner,
      bankRef: fx.ExternalReference ?? txt(raw, 'NORDEXT'),
      statusCode, status: reversed ? 'Deleted / reversed' : fxTxnStatusLabel(statusCode), reversed,
      businessArea: [txt(raw, 'RBUSA'), txt(raw, 'BA_NAME')].filter(Boolean).join(' · '), profitCenter: '',
      txnType: [fx.TransactionType, txt(raw, 'XTEXT')].filter(Boolean).join(' · '),
      pair: [firstCurrency, firstBuy ? fx.SellCurrency : fx.BuyCurrency].filter(Boolean).join(':'),
      traderGroup: '', tradeCategory: '', requestor: '', traderCode,
      trader: lookups.traders.find((t) => t.code === traderCode)?.name || traderCode,
      tsf: '', tradeCatCode: '', acctCat: '',
      intExt: /\binternal\b/i.test(productText) ? 'Internal' : /\bexternal\b/i.test(productText) ? 'External' : '',
      dealId: String(app?.ZtsfDealID ?? '').trim(),
      remark: String(app?.FoRemark ?? app?.NdfFoRem ?? '').trim(),
    }]
  })
}

export async function loadReport(selection: Selection, lookups: Lookups, signal?: AbortSignal, deps: ReportDeps = defaultDeps): Promise<{ rows: Row[]; notice: string }> {
  const companies = lookups.companies.map((c) => c.code)
  const error = selectionError(selection, companies)
  if (error) throw new Error(error)
  const source = await deps.transactions(selection, companies, signal)
  if (!source.length) return { rows: [], notice: lookups.notice }
  let notice = lookups.notice
  const view = await deps.details(source, signal).catch((error: unknown) => {
    if (isAbort(error)) throw error
    notice = [notice, 'Counterparty descriptions, business areas and NDF details could not be loaded. Treasury transactions are still shown.'].filter(Boolean).join(' ')
    return [] as FxRow[]
  })
  return { rows: buildRows(source, view, lookups).filter((row) => matchesSelection(row, selection, companies)), notice }
}
