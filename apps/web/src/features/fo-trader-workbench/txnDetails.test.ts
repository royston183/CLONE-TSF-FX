import { afterEach, describe, it } from 'node:test'
import { deepStrictEqual, strictEqual, ok, rejects } from 'node:assert/strict'
import { detailRate, loadTransactionDetails, transactionSections, type FxDetail, type TransactionDetails } from './txnDetails.ts'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
const ndf: FxDetail = {
  CompanyCode: 'SG03', FinancialTransaction: '2000000000079', ProductType: '12D', TransactionType: '631', Partner: '400000002',
  ContractDate: '2026-10-21', BuyCurrency: 'INR', SellCurrency: 'USD', LeadCurrency: 'USD', FollowCurrency: 'INR', TradedCurrency: 'USD',
  BuyAmount: 364000, SellAmount: 4000, ValueDate: '2026-11-24', SpotRate: 91, SwapRate: 0, ForwardRate: 91,
  NdfFixingCurrency: 'INR', NdfFixingDate: '2026-11-20', ActivityCategory: '65',
}
const detail = (fx: FxDetail = ndf): TransactionDetails => ({ fx, app: null, view: null, names: { partners: new Map(), txnTypes: new Map() }, productName: '', warnings: [] })
const fields = (d: TransactionDetails, section: string) => Object.fromEntries(transactionSections(d, 'Company').structure.find((s) => s.title === section)!.fields.map((f) => [f.label, f.value]))
function stub(handler: (url: URL) => unknown, status = 200): URL[] {
  const seen: URL[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    strictEqual(init?.method, 'GET')
    const url = new URL(String(input), 'http://gateway'); seen.push(url)
    return new Response(JSON.stringify(handler(url)), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return seen
}

describe('transaction detail mapping', () => {
  it('matches the NDF screenshot, including sell direction and distinct fixing/value dates', () => {
    const d = detail(), f = fields(d, 'FX Structure')
    strictEqual(f['Traded Amount'], 'USD 4,000.00')
    strictEqual(f['Opposite Amount'], 'INR 364,000.00')
    strictEqual(f['Buy/Sell'], 'S · Sell USD')
    strictEqual(f['Fixing Date'], '20.11.2026')
    strictEqual(f['Value Date'], '24.11.2026')
    strictEqual(f['Swap Rate'], '0.000000000')
    strictEqual(f['Settlement Crcy'], 'INR')
    const s = fields(d, 'Settlement')
    strictEqual(s['Contract Amount · Traded'], 'USD -4,000.00')
    strictEqual(s['Contract Amount · Opposite'], 'INR 364,000.00')
    strictEqual(s['Rate'], '')
    strictEqual(s['Cash Settlement'], '')
    strictEqual(s['Settlement Amount · Buy'], '')
  })
  it('matches the forward screenshot without NDF settlement fields', () => {
    const d = detail({ ...ndf, CompanyCode: 'IN11', FinancialTransaction: '3000000000051', ProductType: '12B', TransactionType: '619', BuyCurrency: 'USD', SellCurrency: 'INR', BuyAmount: 80000000, SellAmount: 6400000000, ForwardRate: 80, SpotRate: 80, ContractDate: '2026-10-19', ValueDate: '2026-11-20', ActivityCategory: '30' })
    const f = fields(d, 'FX Structure')
    strictEqual(f['Traded Amount'], 'USD 80,000,000.00')
    strictEqual(f['Opposite Amount'], 'INR 6,400,000,000.00')
    strictEqual(f['Buy/Sell'], 'B · Buy USD')
    strictEqual(f['Fixing Date'], undefined)
    strictEqual(transactionSections(d, '').structure.some((s) => s.title === 'Settlement'), false)
  })
  it('uses the traded currency even when it differs from the lead currency', () => {
    const f = fields(detail({ ...ndf, TradedCurrency: 'INR' }), 'FX Structure')
    strictEqual(f['Traded Amount'], 'INR 364,000.00')
    strictEqual(f['Opposite Amount'], 'USD 4,000.00')
    strictEqual(f['Buy/Sell'], 'B · Buy INR')
  })
  it('preserves served zero and signed cash amounts and prefers OData over supplementary values', () => {
    const d = detail({ ...ndf, NdfFixingRate: 92.34, CashSettlementAmount: 0, CashSettlementCurrency: 'INR' })
    d.view = { NDF_RATE: '90', ZCASH_AMT: '-5360', CASH_CURR: 'INR' }
    strictEqual(fields(d, 'Settlement')['Rate'], '92.340000000')
    strictEqual(fields(d, 'Settlement')['Cash Settlement'], 'INR 0.00')
    delete d.fx.CashSettlementAmount
    strictEqual(fields(d, 'Settlement')['Cash Settlement'], 'INR -5,360.00')
    strictEqual(detailRate(undefined), '')
    strictEqual(detailRate(''), '')
    strictEqual(detailRate('invalid'), '')
  })
  it('supports spot and DNDF product variants and leaves unserved conclusion fields empty', () => {
    const spot = detail({ ...ndf, ProductType: '12A', TransactionType: '604' })
    strictEqual(transactionSections(spot, '').structure.some((s) => s.title === 'Settlement'), false)
    ok(transactionSections(detail({ ...ndf, TransactionType: '632' }), '').structure.some((s) => s.title === 'Settlement'))
    strictEqual(fields(detail(), 'Contract Conclusion')['Contract Time'], '')
    strictEqual(fields(detail(), 'Contract Conclusion')['Contract Date'], '21.10.2026')
  })
})

describe('transaction detail reads', () => {
  it('fetches by both SAP keys, reads fresh on reopen and filters supplementary data by the same key', async () => {
    const seen = stub((u) => {
      if (u.pathname.startsWith('/api/fx/')) return ndf
      if (u.pathname.startsWith('/api/trmfxapp/')) return { CompanyCode: 'SG03', FinancialTransaction: ndf.FinancialTransaction, ZtsfDealID: 'D1' }
      if (u.pathname.includes('/tsfvFx')) return { rows: [{ BUKRS: 'IN11', RFHA: ndf.FinancialTransaction, NDF_RATE: '999' }, { BUKRS: 'SG03', RFHA: ndf.FinancialTransaction, NDF_RATE: '92.34' }] }
      return { value: [] }
    })
    const key = { CompanyCode: ndf.CompanyCode, FinancialTransaction: ndf.FinancialTransaction }
    const d = await loadTransactionDetails(key)
    strictEqual(d.view?.NDF_RATE, '92.34')
    strictEqual(d.app?.ZtsfDealID, 'D1')
    deepStrictEqual(d.warnings, [])
    await loadTransactionDetails(key)
    const reads = seen.filter((u) => u.pathname.startsWith('/api/fx/'))
    strictEqual(reads.length, 2)
    ok(decodeURIComponent(reads[0]!.pathname).includes("CompanyCode='SG03',FinancialTransaction='2000000000079'"))
    const view = seen.find((u) => u.pathname.includes('/tsfvFx'))!
    strictEqual(view.searchParams.get('BUKRS'), 'SG03')
    strictEqual(view.searchParams.get('RFHA'), ndf.FinancialTransaction)
  })
  it('rejects a mismatched SAP response and propagates errors instead of displaying cached detail', async () => {
    stub(() => ({ ...ndf, CompanyCode: 'IN11' }))
    await rejects(loadTransactionDetails({ CompanyCode: 'SG03', FinancialTransaction: ndf.FinancialTransaction }), /different transaction/)
    stub(() => ({ error: { message: 'Unavailable' } }), 503)
    await rejects(loadTransactionDetails({ CompanyCode: 'SG03', FinancialTransaction: ndf.FinancialTransaction }), /Unavailable/)
  })
  it('keeps the primary record usable when optional sources fail', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input).startsWith('/api/fx/')
      ? new Response(JSON.stringify(ndf), { status: 200 })
      : new Response(JSON.stringify({ error: { message: 'Offline' } }), { status: 503 })) as typeof fetch
    const d = await loadTransactionDetails({ CompanyCode: 'SG03', FinancialTransaction: ndf.FinancialTransaction })
    strictEqual(d.fx.FinancialTransaction, ndf.FinancialTransaction)
    strictEqual(d.view, null)
    strictEqual(d.app, null)
    strictEqual(d.warnings.length, 3)
  })
})
