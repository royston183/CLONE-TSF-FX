import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildRows, loadReport, reportFilter, type Enrichment, type ReportDeps } from './api.ts'
import { cellValue, COLUMNS, exportRecords, filterSortRows, initialSelection, matchesSelection, selectionError, validDate } from './logic.ts'
import type { FxWithApp } from '../../shared/fx/app-str.ts'
import type { Lookups, Selection } from './types.ts'

const lookups: Lookups = { companies: [{ code: 'SG03', name: 'Olam Global Agri' }, { code: 'AE13', name: 'Olam DMCC' }], traders: [{ code: 'NID', name: 'Nidhi Singh' }] }
const selection: Selection = { company: 'ALL', from: '2026-10-01', to: '2026-10-19', trader: '' }
const source = (over: Partial<FxWithApp> = {}): FxWithApp => ({
  fx: { CompanyCode: 'SG03', FinancialTransaction: '0000001234567', ProductType: '12B', TransactionType: '619', Partner: '0400000002',
    ContractDate: '2026-09-30', ValueDate: '2026-12-20', BuyCurrency: 'EUR', SellCurrency: 'USD', LeadCurrency: 'EUR', FollowCurrency: 'USD',
    BuyAmount: '1000.00', SellAmount: '1200.00', SpotRate: '1.19', SwapRate: '0.01', ForwardRate: '1.20', ActiveStatus: '0', ActivityCategory: '20' },
  app: { CompanyCode: 'SG03', FinancialTransaction: '0000001234567', ZtsfDealID: '7000000001', ZtsfDealType: 'D1', ZtsfMcRefNo: '2000000001',
    BlotterDate: '2026-10-19', Ztrcode: 'NID', TxnStatus: '03', ZolamDealNo: 'INT-1' },
  ...over,
})
const enrichment: Enrichment = {
  contracts: [{ ZMC_REF_NO: '2000000001', ZMC_DESC: 'Wheat shipment', ZCOM_DESC: 'WHEAT', ZMOD_ID: 'M032' }],
  deals: [{ ZDEAL_ID: '7000000001', ZTSF_MODEL: 'M033', ZPL: '125.50', ZPL_CURR: 'USD', ZPL_LAMT: '460.69', ZPL_LCURR: 'AED' }],
  rules: [{ ZMOD_ID: 'M033', ZMOD_DESC: 'Long forward', ZSUB_TYPE: 'FX1', ZLINK_MODEL: '' }],
  view: [{ BUKRS: 'SG03', RFHA: '0000001234567', BP_NAME: 'FMC Corporation', LTX: '12B - FX Forwards: External', CRUSER: 'BOOKER', DCRDAT: '2026-09-30' }],
}
const row = () => buildRows([source()], enrichment, lookups)[0]!

describe('TSF report mapping', () => {
  it('puts USD first and moves buy/sell and amounts together, retaining the original rate quotation', () => {
    const r = row()
    deepStrictEqual([r.curr1, r.amt1, r.bs1, r.curr2, r.amt2, r.bs2], ['USD', 1200, 'Sell', 'EUR', 1000, 'Buy'])
    deepStrictEqual([r.spot, r.swap, r.allRate, r.rateBasis], [1.19, .01, 1.2, 'EUR / USD'])
    strictEqual(r.rfha, '0000001234567')
  })

  it('enriches Master Contract, model/sub-type, trader and saved Deal ID P&L without making up a recalculation', () => {
    const r = row()
    deepStrictEqual([r.mcDesc, r.commodity, r.model, r.subType, r.bpName, r.trader], ['Wheat shipment', 'WHEAT', 'M033', 'FX1', 'FMC Corporation', 'NID · Nidhi Singh'])
    deepStrictEqual([r.pnl, r.pnlCurrency, r.localPnl, r.localPnlCurrency], [125.5, 'USD', 460.69, 'AED'])
    strictEqual(r.execution, 'External')
    strictEqual(r.enteredBy, 'BOOKER')
  })

  it('keeps a transaction without a matching Master Contract and leaves unsupported values empty', () => {
    const r = buildRows([source()], { contracts: [], deals: [], rules: [], view: [] }, lookups)[0]!
    strictEqual(r.mcRef, '2000000001')
    strictEqual(r.mcDesc, '')
    strictEqual(r.pnl, null)
    strictEqual(r.localPnl, null)
    strictEqual(r.execution, '')
    strictEqual(r.bpName, '0400000002')
  })

  it('matches transactions on company AND RFHA and removes duplicate source rows', () => {
    const original = source()
    const other = source({ fx: { ...original.fx, CompanyCode: 'AE13' }, app: { ...original.app, CompanyCode: 'AE13' } })
    const rows = buildRows([original, other, original], enrichment, lookups)
    strictEqual(rows.length, 2)
    strictEqual(rows[0]!.bpName, 'FMC Corporation')
    strictEqual(rows[1]!.bpName, '0400000002')
  })

  it('requires a TSF Deal ID and includes deleted/reversed deals with their status', () => {
    const original = source()
    strictEqual(buildRows([source({ app: { ...original.app, ZtsfDealID: '' } })], enrichment, lookups).length, 0)
    const r = buildRows([source({ app: { ...original.app, TxnStatus: '02' } })], enrichment, lookups)[0]!
    strictEqual(r.reversed, true)
    strictEqual(r.status, 'Deleted / reversed')
  })

  it('uses blotter date rather than trade date and applies the selected trader', () => {
    const r = row()
    strictEqual(matchesSelection(r, selection, ['SG03']), true)
    strictEqual(matchesSelection(r, { ...selection, trader: 'OTHER' }, ['SG03']), false)
    strictEqual(matchesSelection(r, { ...selection, company: 'AE13' }, ['SG03', 'AE13']), false)
    strictEqual(matchesSelection(r, selection, ['AE13']), false)
  })
})

describe('selection, table and export', () => {
  it('validates real calendar dates and requires company/date selection before a request', () => {
    strictEqual(validDate('2026-02-30'), false)
    strictEqual(validDate('2028-02-29'), true)
    ok(selectionError({ ...selection, from: '2026-10-20' }, ['SG03']))
    ok(selectionError(selection, []))
    throws(() => reportFilter({ ...selection, company: 'UNKNOWN' }, ['SG03']))
    strictEqual(selectionError(selection, ['SG03']), '')
  })

  it('uses the current month and escapes company codes in the OData filter', () => {
    deepStrictEqual(initialSelection(new Date(2027, 1, 4)), { company: 'ALL', from: '2027-02-01', to: '2027-02-04', trader: '' })
    const filter = reportFilter(selection, ["A'B"])
    ok(filter.includes("CompanyCode eq 'A''B'"))
    ok(filter.includes('BlotterDate ge 2026-10-01'))
    ok(filter.includes("ZtsfDealID ne ''"))
  })

  it('sorts amounts numerically and searches the formatted visible values', () => {
    const a = row(), b = { ...a, id: 'B', amt1: 20 }, c = { ...a, id: 'C', amt1: null }
    deepStrictEqual(filterSortRows([a, b, c], '', { field: 'amt1', direction: 'asc' }).map((r) => r.id), ['B', a.id, 'C'])
    strictEqual(filterSortRows([a], '19-10-2026', { field: 'rfha', direction: 'asc' }).length, 1)
    strictEqual(filterSortRows([a], 'FMC', { field: 'rfha', direction: 'asc' }).length, 1)
  })

  it('exports all supplied rows while preserving identifier leading zeroes, numeric amounts and missing P&L', () => {
    const r = row()
    const records = exportRecords([r, { ...r, id: 'B', rfha: '0000000000001' }])
    strictEqual(records.length, 2)
    strictEqual(records[0]!['Transaction'], '0000001234567')
    strictEqual(records[0]!['Amount 1'], 1200)
    strictEqual(records[0]!['Deal P&L'], '125.50 USD')
    strictEqual(cellValue({ ...r, pnl: null }, COLUMNS.find((c) => c.field === 'pnl')!), '—')
  })
})

describe('live report orchestration', () => {
  const deps = (): ReportDeps => ({
    transactions: async () => [source()],
    table: async (name) => name === 'masterContract' ? enrichment.contracts : name === 'tsfDealId' ? enrichment.deals : enrichment.rules,
    details: async () => enrichment.view,
  })
  it('loads current transactions and the cloud joins with no sample-data fallback', async () => {
    const result = await loadReport(selection, lookups, undefined, deps())
    strictEqual(result.rows.length, 1)
    strictEqual(result.rows[0]!.mcDesc, 'Wheat shipment')
    strictEqual(result.notice, '')
    await rejects(loadReport(selection, lookups, undefined, { ...deps(), transactions: async () => { throw new Error('SAP unavailable') } }), /SAP unavailable/)
  })
  it('does not widen a report when the backend returns a row from an unselected company', async () => {
    const result = await loadReport({ ...selection, company: 'AE13' }, lookups, undefined, deps())
    strictEqual(result.rows.length, 0)
  })
  it('retains core Treasury data with a notice if supplementary view descriptions fail, and propagates aborts', async () => {
    const result = await loadReport(selection, lookups, undefined, { ...deps(), details: async () => { throw new Error('View unavailable') } })
    strictEqual(result.rows.length, 1)
    ok(result.notice)
    const abort = new DOMException('Cancelled', 'AbortError')
    await rejects(loadReport(selection, lookups, undefined, { ...deps(), details: async () => { throw abort } }), { name: 'AbortError' })
  })
  it('returns an empty report without reading unrelated master data when no transactions match', async () => {
    const result = await loadReport(selection, lookups, undefined, { transactions: async () => [], table: async () => { throw new Error('Unexpected read') }, details: async () => { throw new Error('Unexpected read') } })
    deepStrictEqual(result, { rows: [], notice: '' })
  })
})

it('registers the report under Reporting / FX Structure / FX Front-Office with its matching route', () => {
  const menu = JSON.parse(readFileSync(new URL('../../../../../config/reporting-menu.json', import.meta.url), 'utf8'))
  const apps = JSON.parse(readFileSync(new URL('../../../../../config/apps.json', import.meta.url), 'utf8')).apps
  const tile = menu.find((n: { label: string }) => n.label === 'FX Structure').subgroups.find((n: { label: string }) => n.label === 'FX Front-Office').items.find((n: { title: string }) => n.title === 'View List of TSF Deals')
  const app = apps.find((a: { code: string }) => a.code === tile.code)
  strictEqual(app.route, '/apps/view-tsf-deals')
  strictEqual(app.id, 'view-tsf-deals')
})
