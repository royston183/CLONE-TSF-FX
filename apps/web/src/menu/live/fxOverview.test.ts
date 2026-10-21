import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { buildFxOverview, compact, lastDays, overviewDeal, loadFxOverviewRaw, type FxOverviewRaw } from './fxOverview.ts'
import type { FxRow } from '../../shared/fx/mw.ts'

const today = new Date(2026, 9, 16)
const fx = (o: FxRow): FxRow => ({ SAKTIV: '0', SGSART: '12B', ZCOM_ID: 'OGA', CURR1: 'USD', CURR2: 'INR', BS_1: 'Buy', AMT1: '1000000', T_RATE: '84', DELFZ: '2026-11-17', DCRDAT: '2026-10-05', ...o })

const raw = (o: Partial<FxOverviewRaw> = {}): FxOverviewRaw => ({
  fxDeals: [],
  mcs: [],
  dealIds: [],
  bls: [],
  invoices: [],
  spots: [],
  dealStatuses: [],
  mcStatuses: [],
  blStatuses: [],
  models: [],
  problems: [],
  loadedAt: today,
  ...o,
})

describe('buildFxOverview', () => {
  it('counts open deals and USD notional per company, and drops reversed deals', () => {
    const data = buildFxOverview(
      raw({
        fxDeals: [
          fx({ RFHA: '1' }),
          fx({ RFHA: '2', ZCOM_ID: 'DMCC', AMT1: '500000', DELFZ: '2026-10-01' }),
          fx({ RFHA: '3', SAKTIV: '3', AMT1: '9000000' }),
        ],
      }),
      'All',
      today,
    )
    strictEqual(data.kpis[0]?.value, '2')
    strictEqual(data.kpis[1]?.value, 'USD 1.00m')
    deepStrictEqual(data.exposureByCompany, [{ label: 'OGA', value: 1_000_000 }])
    deepStrictEqual(data.companies, ['DMCC', 'OGA'])
    strictEqual(data.upcoming[0]?.cells[0], '17-11-2026')
  })

  it('applies the company filter to the deal figures only', () => {
    const data = buildFxOverview(
      raw({ fxDeals: [fx({}), fx({ ZCOM_ID: 'DMCC' })], mcs: [{ ZMC_REF_NO: '1', ZAMT: '1000', ZCURR: 'USD', ZMC_STAT: '04', ZMC_DATE: '2026-10-02' }] }),
      'DMCC',
      today,
    )
    strictEqual(data.kpis[0]?.value, '1')
    strictEqual(data.kpis[3]?.value, 'USD 1.0k')
  })

  it('shows — for a source that could not be read instead of zero', () => {
    const data = buildFxOverview(raw({ fxDeals: null, mcs: null, dealIds: null, bls: null, invoices: null }), 'All', today)
    strictEqual(data.kpis[0]?.value, '—')
    strictEqual(data.kpis[3]?.value, '—')
    strictEqual(data.kpis[4]?.value, '—')
  })

  it('names statuses from their master and buckets the maturity ladder', () => {
    const data = buildFxOverview(
      raw({
        fxDeals: [fx({ DELFZ: '2026-10-20' }), fx({ DELFZ: '2027-03-01' })],
        mcs: [{ ZMC_REF_NO: '1', ZAMT: '10', ZMC_STAT: '04' }],
        mcStatuses: [{ ZMC_ID: '04', ZMC_STAT: 'In Use' }],
      }),
      'All',
      today,
    )
    deepStrictEqual(data.mcStatus, [{ label: 'In Use', value: 1 }])
    strictEqual(data.maturity[0]?.value, 1_000_000)
    strictEqual(data.maturity[2]?.value, 0)
    strictEqual(data.maturity[3]?.value, 1_000_000)
  })
})

describe('helpers', () => {
  it('formats compact amounts and lists the last days oldest first', () => {
    strictEqual(compact(1_420_000_000), '1.42bn')
    strictEqual(compact(56_000), '56.0k')
    deepStrictEqual(lastDays(today, 3), ['2026-10-14', '2026-10-15', '2026-10-16'])
  })
})


describe('live sources', () => {
  it('uses the USD sell leg and excludes cross currencies from USD totals', () => {
    const base = { CompanyCode: 'SG03', FinancialTransaction: '1', TransactionType: '619', Partner: 'B', ProductType: '12B', BuyCurrency: 'EUR', SellCurrency: 'USD', BuyAmount: '100', SellAmount: '120', ValueDate: '2026-10-20', ContractDate: '2026-10-01' }
    const dollar = overviewDeal(base)
    const cross = overviewDeal({ ...base, FinancialTransaction: '2', SellCurrency: 'INR', SellAmount: '10000' })
    const data = buildFxOverview(raw({ fxDeals: [dollar, cross] }), 'All', today)
    strictEqual(data.kpis[1]?.value, 'USD 120')
    strictEqual(data.kpis[0]?.value, '2')
    strictEqual(data.companies[0], 'SG03')
  })

  it('pages SAP transactions and keeps FS Cloud failures isolated', async () => {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/api/fx/')) {
        const skip = new URL(url, 'http://localhost').searchParams.get('$skip')
        return Response.json({ value: skip === '0' ? Array.from({ length: 500 }, (_, i) => ({ CompanyCode: 'SG03', FinancialTransaction: String(i) })) : [{ CompanyCode: 'SG03', FinancialTransaction: '501' }] })
      }
      if (url.includes('/masterContract?')) return Response.json({ error: { message: 'Unavailable' } }, { status: 500 })
      return Response.json({ rows: [] })
    }
    try {
      const result = await loadFxOverviewRaw()
      strictEqual(result.fxDeals?.length, 501)
      strictEqual(result.mcs, null)
      strictEqual(result.problems.length, 1)
      strictEqual(calls.some(url => url.includes('tsfvFx')), false)
      strictEqual(buildFxOverview(result, 'All', today).kpis[3]?.deltaNote, 'Source unavailable')
    } finally { globalThis.fetch = original }
  })
})
