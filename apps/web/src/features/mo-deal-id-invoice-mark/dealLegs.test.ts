import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { loadDealFxRows, toFxRow } from './dealLegs.ts'

const fx = {
  CompanyCode: 'SG03', FinancialTransaction: '5000456830', ProductType: '12D', TransactionType: '100', Partner: 'BARC',
  ContractDate: '2026-09-15', ValueDate: '2027-09-18', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD',
  FollowCurrency: 'INR', BuyAmount: '1000', SellAmount: '90000', SpotRate: '89.5', ForwardRate: '90', ActiveStatus: '0',
}
const app = { CompanyCode: 'SG03', FinancialTransaction: '5000456830', ZtsfDealID: '7000000011', ZtsfDealType: 'D1', ZtsfMcRefNo: '2000000008', TxnStatus: '07' }

describe('View Deal ID FX legs', () => {
  const real = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = real
  })

  it('maps one transaction: deal type / MC / status from APP_STR, the rest from FxTransaction; options blank', () => {
    const r = toFxRow({ fx, app })
    deepStrictEqual([r.bukrs, r.dealType, r.rfha, r.mcRef, r.txnStatus], ['SG03', 'D1', '5000456830', '2000000008', '07'])
    deepStrictEqual([r.side1, r.curr1, r.amt1, r.side2, r.curr2, r.amt2], ['Buy', 'USD', 1000, 'Sell', 'INR', -90000])
    deepStrictEqual([r.start, r.end, r.spot, r.swap, r.allIn, r.strike, r.premium], ['15-09-2026', '18-09-2027', 89.5, '', 90, '', ''])
  })

  it('asks TrmFxApp for the Deal ID, joins FxTransaction, and drops a reversed transaction', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(decodeURIComponent(url.replaceAll('+', ' ')))
      const value = url.includes('trmfxapp')
        ? [app, { ...app, FinancialTransaction: '2', ZtsfDealType: 'D2' }]
        : [fx, { ...fx, FinancialTransaction: '2', ActiveStatus: '3' }]
      return new Response(JSON.stringify({ value }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const rows = await loadDealFxRows('7000000011')
    deepStrictEqual(rows.map((r) => r.rfha), ['5000456830'])
    ok(urls.some((u) => u.includes("ZtsfDealID eq '7000000011'")))
    strictEqual(urls.filter((u) => u.includes('/api/fx/')).length, 1)
  })
})
