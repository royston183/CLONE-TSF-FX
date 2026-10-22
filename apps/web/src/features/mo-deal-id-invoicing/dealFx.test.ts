import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { NO_NDF_EXTRAS } from '../../shared/fx/ndf-columns.ts'
import { FX_LEG_FILTER, legsByDeal, loadFxLegsByDeal, toFxLeg } from './dealFx.ts'
import { fxUtilAmt, utilizationKnown } from './logic.ts'
import { buildDeals } from './fixtures.ts'

const fx = (o: Record<string, unknown> = {}) => ({
  CompanyCode: 'SG03', FinancialTransaction: '5000456830', TransactionType: '100', Partner: 'BARC', BuyCurrency: 'USD', SellCurrency: 'INR',
  LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: '1000', SellAmount: '90000', ForwardRate: '90', ActiveStatus: '0', ...o,
})
const app = (o: Record<string, unknown> = {}) => ({ CompanyCode: 'SG03', FinancialTransaction: '5000456830', ZtsfDealID: '7000000011', ZtsfDealType: 'D1', ...o })

describe('D1 / D2 legs from TrmFxApp + FxTransaction', () => {
  const real = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = real
  })

  it('maps a leg with signed amounts and the partner code (the name has no service)', () => {
    deepStrictEqual(toFxLeg({ fx: fx(), app: app() }), {
      type: 'D1', bukrs: 'SG03', rfha: '5000456830', curr1: 'USD', curr2: 'INR', amt1: 1000, amt2: -90000, bp: 'BARC', bpName: '', rate: 90, ndf: NO_NDF_EXTRAS,
    })
  })
  it('carries the NDF columns of an NDF leg: view date / ref, FxTransaction rate and cash; blank when not served', () => {
    const ndf = toFxLeg({ fx: fx({ ProductType: '30D', NdfFixingRate: '94.5', CashSettlementAmount: '120', CashSettlementCurrency: 'USD' }), app: app() }, { NDF_DATE: '2026-10-07', NDF_REF: 'R1' })!.ndf!
    deepStrictEqual(ndf, { ndfDate: '2026-10-07', ndfRef: 'R1', ndfRate: 94.5, cashAmount: 120, cashCurrency: 'USD', ndfFoRem: '', ndfMoRem: '' })
    strictEqual(toFxLeg({ fx: fx({ ProductType: '30D' }), app: app() })!.ndf!.ndfRate, null)
  })
  it('ignores other deal types and reversed transactions; groups by Deal ID, D1 first', () => {
    strictEqual(toFxLeg({ fx: fx(), app: app({ ZtsfDealType: 'D3' }) }), null)
    strictEqual(toFxLeg({ fx: fx({ ActiveStatus: '3' }), app: app() }), null)
    const m = legsByDeal([
      { fx: fx({ FinancialTransaction: '2' }), app: app({ FinancialTransaction: '2', ZtsfDealType: 'D2' }) },
      { fx: fx(), app: app() },
    ])
    deepStrictEqual(m.get('7000000011')?.map((l) => l.type), ['D1', 'D2'])
  })
  it('utilization is the D1 leg\'s USD amount; blank without a D1 leg or a USD side', () => {
    const base = buildDeals()[0]!
    const d1 = toFxLeg({ fx: fx(), app: app() })!
    strictEqual(utilizationKnown({ ...base, fx: [d1] }), true)
    strictEqual(fxUtilAmt({ ...base, fx: [d1] }), 1000)
    strictEqual(utilizationKnown({ ...base, fx: [] }), false)
    strictEqual(utilizationKnown({ ...base, fx: [{ ...d1, curr1: 'EUR' }] }), false)
    strictEqual(utilizationKnown({ ...base, fx: [{ ...d1, type: 'D2' }] }), false)
  })
  it('reads TrmFxApp for D1 / D2 with a Deal ID, then FxTransaction by company + transaction', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(decodeURIComponent(url.replaceAll('+', ' ')))
      const value = url.includes('trmfxapp') ? [app()] : [fx()]
      return new Response(JSON.stringify({ value }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const m = await loadFxLegsByDeal()
    strictEqual(m.get('7000000011')?.length, 1)
    ok(urls.some((u) => u.includes(FX_LEG_FILTER)))
    strictEqual(FX_LEG_FILTER, "(ZtsfDealID ne '') and (ZtsfDealType eq 'D1' or ZtsfDealType eq 'D2')")
  })
})
