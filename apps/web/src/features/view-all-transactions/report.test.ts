import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildRows, defaultDeps, loadReport, reportFilter } from './api.ts'
import { COLUMNS, EMPTY_FILTERS, csvOutput, filterSortRows, initialSelection, matchesSelection, selectionError } from './logic.ts'
import type { Lookups, ReportDeps, Selection, Source } from './types.ts'

const lookups: Lookups = { companies: [{ code: 'SG03', name: 'Singapore' }, { code: 'AE13', name: 'Dubai' }], traders: [{ code: 'NID', name: 'Nidhi Singh' }], notice: '' }
const selection: Selection = { company: 'ALL', from: '2026-10-01', to: '2026-10-21', basis: 'blotter' }
const source = (): Source => ({
  fx: { CompanyCode: 'SG03', FinancialTransaction: '0000001234567', ProductType: '12B', TransactionType: '619', Partner: '0400000002',
    ContractDate: '2026-09-30', ValueDate: '2026-12-20', BuyCurrency: 'EUR', SellCurrency: 'USD', LeadCurrency: 'EUR', FollowCurrency: 'USD',
    BuyAmount: '1000', SellAmount: '1200', ForwardRate: '1.2', SpotRate: '1.19', SwapRate: '0.01', ActiveStatus: '0' },
  app: { CompanyCode: 'SG03', FinancialTransaction: '0000001234567', BlotterDate: '2026-10-19', TxnStatus: '03', Ztrcode: 'NID', ZtsfDealID: '' },
})
const view = [{ BUKRS: 'SG03', RFHA: '0000001234567', BP_NAME: 'Bank <script>', LTX: 'FX Forwards: External', RBUSA: '0615', BA_NAME: 'Treasury', NORDEXT: 'EXT-1', NDF_DATE: '20261020', NDF_REF: 'FBIL' }]
const row = () => buildRows([source()], view, lookups)[0]!
const deps = (): ReportDeps => ({ transactions: async () => [source()], details: async () => view })
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe('Deal Dump scope and mapping', () => {
  it('retains transactions without TSF Deal IDs or append records', () => {
    strictEqual(row().dealId, '')
    const r = buildRows([{ fx: source().fx }], [], lookups)[0]!
    strictEqual(r.deal, '0000001234567')
    strictEqual(r.blotter, '')
    strictEqual(r.status, '')
    strictEqual(r.rate, 1.2)
  })
  it('keeps original lead-currency order, amount/side pairing and rate quotation', () => {
    const r = row()
    deepStrictEqual([r.c1, r.a1, r.bs1, r.c2, r.a2, r.bs2], ['EUR', 1000, 'Buy', 'USD', 1200, 'Sell'])
    deepStrictEqual([r.rate, r.spot, r.swap, r.quotation], [1.2, 1.19, .01, 'EUR / USD'])
    const s = source()
    const sellFirst = buildRows([{ ...s, fx: { ...s.fx, LeadCurrency: 'USD', FollowCurrency: 'EUR' } }], [], lookups)[0]!
    deepStrictEqual([sellFirst.bs1, sellFirst.a1, sellFirst.c1, sellFirst.bs2, sellFirst.a2], ['Sell', 1200, 'USD', 'Buy', 1000])
  })
  it('joins descriptions by company AND transaction, deduplicates and preserves zero values', () => {
    const s = source()
    const other = { fx: { ...s.fx, CompanyCode: 'AE13', BuyAmount: '0' } }
    const rows = buildRows([s, other, s], view, lookups)
    strictEqual(rows.length, 2)
    strictEqual(rows[0]!.partnerName, 'Bank <script>')
    strictEqual(rows[1]!.partnerName, '0400000002')
    strictEqual(rows[1]!.a1, 0)
    strictEqual(rows[0]!.ndfDate, '2026-10-20')
    strictEqual(rows[0]!.intExt, 'External')
    strictEqual(rows[0]!.bankRef, 'EXT-1')
  })
  it('does not infer absent classifications from a TSF link, product code or sample data', () => {
    const s = source()
    const r = buildRows([{ ...s, app: { ...s.app!, ZtsfDealID: '123' } }], [], lookups)[0]!
    deepStrictEqual([r.intExt, r.source, r.tsf, r.traderGroup, r.profitCenter, r.acctCat], ['', '', '', '', '', ''])
    strictEqual(r.dealId, '123')
  })
  it('retains reversed transactions with a visible reversal status', () => {
    const s = source()
    const r = buildRows([{ ...s, fx: { ...s.fx, ActiveStatus: '3' } }], view, lookups)[0]!
    strictEqual(r.reversed, true)
    strictEqual(r.status, 'Deleted / reversed')
  })
})

describe('date selection and filtering', () => {
  it('uses the chosen date field and never introduces a TSF-only filter', () => {
    for (const [basis, field] of [['blotter', 'BlotterDate'], ['trade', 'ContractDate'], ['value', 'ValueDate']] as const) {
      const query = reportFilter({ ...selection, basis }, ["A'B"])
      ok(query.includes("CompanyCode eq 'A''B'"))
      ok(query.includes(`${field} ge 2026-10-01`))
      strictEqual(query.includes('ZtsfDealID'), false)
    }
  })
  it('rejects invalid dates, reversed ranges, unknown companies and date bases', () => {
    for (const bad of [{ from: '2026-02-30' }, { from: '2026-11-01' }, { company: 'UNKNOWN' }, { basis: 'invalid' as Selection['basis'] }]) {
      ok(selectionError({ ...selection, ...bad }, ['SG03']))
      throws(() => reportFilter({ ...selection, ...bad }, ['SG03']))
    }
    deepStrictEqual(initialSelection(new Date(2026, 9, 21)), selection)
  })
  it('reapplies company and selected-date bounds locally and excludes missing selected dates', () => {
    strictEqual(matchesSelection(row(), selection, ['SG03']), true)
    strictEqual(matchesSelection(row(), { ...selection, basis: 'trade' }, ['SG03']), false)
    strictEqual(matchesSelection(row(), { ...selection, company: 'AE13' }, ['SG03', 'AE13']), false)
    strictEqual(matchesSelection(row(), selection, ['AE13']), false)
    strictEqual(matchesSelection({ ...row(), blotter: '' }, selection, ['SG03']), false)
  })
  it('filters status, trader, partner and formatted dates, with numeric sorting and nulls last', () => {
    const a = row(), b = { ...a, id: 'B', a1: 20 }, c = { ...a, id: 'C', a1: null }
    deepStrictEqual(filterSortRows([a, b, c], EMPTY_FILTERS, { field: 'a1', direction: 'asc' }).map((r) => r.id), ['B', a.id, 'C'])
    strictEqual(filterSortRows([a], { ...EMPTY_FILTERS, search: '19-10-2026', trader: 'NID', status: '03', partner: 'bank' }, { field: 'deal', direction: 'asc' }).length, 1)
    strictEqual(filterSortRows([a], { ...EMPTY_FILTERS, type: 'TSF-linked' }, { field: 'deal', direction: 'asc' }).length, 0)
  })
  it('exports every supplied row and selected column, quotes commas and neutralises spreadsheet formulas', () => {
    const csv = csvOutput([{ ...row(), partnerName: '=HYPERLINK("bad")' }, { ...row(), deal: '0000000000001', partnerName: 'Bank, Ltd' }], COLUMNS.filter((c) => ['deal', 'a1', 'partnerName'].includes(c.field)))
    ok(csv.includes('"0000000000001"'))
    ok(csv.includes('"1000"'))
    ok(csv.includes('"\'=HYPERLINK(""bad"")"'))
    ok(csv.includes('"Bank, Ltd"'))
    strictEqual(csv.includes('Company Code'), false)
    strictEqual(csv.split('\r\n').length, 3)
  })
})

describe('live reads and failure handling', () => {
  it('fails on Treasury errors and degrades only supplementary descriptions', async () => {
    await rejects(loadReport(selection, lookups, undefined, { ...deps(), transactions: async () => { throw new Error('SAP unavailable') } }), /SAP unavailable/)
    const result = await loadReport(selection, lookups, undefined, { ...deps(), details: async () => { throw new Error('View unavailable') } })
    strictEqual(result.rows.length, 1)
    ok(result.notice.includes('could not be loaded'))
    strictEqual(result.rows[0]!.partnerName, '0400000002')
    await rejects(loadReport(selection, lookups, undefined, { ...deps(), details: async () => { throw new DOMException('cancelled', 'AbortError') } }), { name: 'AbortError' })
  })
  it('returns empty results without loading descriptions and rejects backend-widened rows', async () => {
    deepStrictEqual(await loadReport(selection, lookups, undefined, { transactions: async () => [], details: async () => { throw new Error('Unexpected read') } }), { rows: [], notice: '' })
    strictEqual((await loadReport({ ...selection, company: 'AE13' }, lookups, undefined, deps())).rows.length, 0)
  })
  it('pages Treasury for trade dates and retains all 501 transactions without append records', async () => {
    const requests: URL[] = []
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...source().fx, FinancialTransaction: String(i).padStart(13, '0') }))
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://gateway')
      requests.push(url)
      const value = url.pathname.includes('/trmfxapp/') ? [] : rows.slice(Number(url.searchParams.get('$skip')), Number(url.searchParams.get('$skip')) + Number(url.searchParams.get('$top')))
      return new Response(JSON.stringify({ value }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const result = await defaultDeps.transactions({ ...selection, basis: 'trade' }, ['SG03'])
    strictEqual(result.length, 501)
    ok(result.every((r) => !r.app))
    const treasury = requests.filter((u) => u.pathname.includes('/fx/'))
    strictEqual(treasury.length, 2)
    ok(treasury[0]!.searchParams.get('$filter')?.includes('ContractDate ge'))
    strictEqual(treasury[1]!.searchParams.get('$skip'), '500')
  })
  it('starts blotter-date selection from append rows, including those with no TSF Deal ID', async () => {
    const urls: URL[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://gateway'); urls.push(url)
      return new Response(JSON.stringify({ value: url.pathname.includes('/trmfxapp/') ? [source().app] : [source().fx] }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const result = await defaultDeps.transactions(selection, ['SG03'])
    strictEqual(result.length, 1)
    strictEqual(result[0]!.app?.ZtsfDealID, '')
    ok(urls[0]!.searchParams.get('$filter')?.includes('BlotterDate ge'))
  })
})

it('registers the Deal Dump in Reporting / FX Structure / FX Front-Office', () => {
  const menu = JSON.parse(readFileSync(new URL('../../../../../config/reporting-menu.json', import.meta.url), 'utf8'))
  const apps = JSON.parse(readFileSync(new URL('../../../../../config/apps.json', import.meta.url), 'utf8')).apps
  const tile = menu.find((n: { label: string }) => n.label === 'FX Structure').subgroups.find((n: { label: string }) => n.label === 'FX Front-Office').items.find((n: { title: string }) => n.title === 'View List of All Transactions')
  const app = apps.find((a: { code: string }) => a.code === tile.code)
  strictEqual(app.route, '/apps/view-all-transactions')
  strictEqual(app.id, 'view-all-transactions')
  ok(readFileSync(new URL('../registry.ts', import.meta.url), 'utf8').includes("'view-all-transactions': lazy"))
})
