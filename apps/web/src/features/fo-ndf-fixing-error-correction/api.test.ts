import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { eligible, loadWorklist, rowFromApp } from './api.ts'
import { oldRateText } from './format.ts'
import { calcSettlement, filterRows } from './logic.ts'

const near = (a: number | null, b: number) => ok(a !== null && Math.abs(a - b) < 1e-6, `${a} != ${b}`)

const fx = (o: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03', FinancialTransaction: '2000000000019', ProductType: '12D', TransactionType: '631', Partner: '1',
  BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 50000, SellAmount: 4530000, ...o,
})
const app = (o: Partial<TrmFxApp> = {}): TrmFxApp => ({ CompanyCode: 'SG03', FinancialTransaction: '2000000000019', TxnStatus: '11', Ztrcode: 'C14', ...o })

describe('GET_DATA (ZSGTSF_RFX_NDF_FIX_FO)', () => {
  it('keeps TXN_STATUS 11 with an NDF product type — not 07, not forwards; no SAKTIV rule', () => {
    const rows = [
      { fx: fx({ FinancialTransaction: '1', ActiveStatus: '3' }), app: app() }, // no SAKTIV rule here
      { fx: fx({ FinancialTransaction: '2' }), app: app({ TxnStatus: '07' }) }, // normal fixing queue
      { fx: fx({ FinancialTransaction: '3' }), app: app({ TxnStatus: '12' }) }, // already corrected
      { fx: fx({ FinancialTransaction: '5', ProductType: '12B' }), app: app() }, // forward, not NDF
    ]
    deepStrictEqual(eligible(rows).map((r) => r.fx.FinancialTransaction), ['1'])
  })
})

describe('row mapping and screen 9001', () => {
  const view = { BUKRS: 'SG03', RFHA: '2000000000019', BUTXT: 'Olam SG', NDF_DATE: '2026-10-12', NDF_REF: 'RBI', BP_NAME: 'DBS BANK' }
  const row = rowFromApp({ fx: fx(), app: app() }, view, { RBI: 'RBI USD/INR Reference Rate' }, { C14: 'Ashon V' })

  it('maps SAP + TrmFxApp + view; the Old Fixing Rate has no source so it is null (WAITING FOR API)', () => {
    deepStrictEqual(
      [row.rfha, row.bukrs, row.company, row.fixDate, row.fixRef, row.fixRefName, row.oldRate, row.status, row.statusText, row.trader, row.partner],
      ['2000000000019', 'SG03', 'Olam SG', '12-10-2026', 'RBI', 'RBI USD/INR Reference Rate', null, '11', 'MO: NDF Fixing Correction Req', 'Ashon V', 'DBS BANK'],
    )
    deepStrictEqual([oldRateText(row.oldRate), oldRateText(83.5)], ['WAITING FOR API', '83.500000'])
  })

  it('signs the legs and settles in the following currency (curr1 = lead, not the follow)', () => {
    deepStrictEqual([row.side, row.amt1, row.amt2, row.settleCurr, row.foreignFirst], ['Buy', 50000, -4530000, 'INR', false])
    near(calcSettlement(row, 84.25), 50_000 + -4_530_000 / 84.25)
    const vnd = rowFromApp({ fx: fx({ LeadCurrency: 'USD', FollowCurrency: 'VND', BuyCurrency: 'VND', SellCurrency: 'USD', BuyAmount: 2_500_000_000, SellAmount: 100_000 }), app: app() }, view, {})
    deepStrictEqual([vnd.side, vnd.amt1, vnd.amt2], ['Sell', -100000, 2_500_000_000])
    near(calcSettlement(vnd, 25000), -100_000 + (2_500_000_000 * 100) / 25000) // VND quoted per 100
  })

  it('the queue only ever shows status 11 rows for the chosen NDF date', () => {
    deepStrictEqual(filterRows([row, { ...row, rfha: 'x', status: '12' }], '', '', '12-10-2026').map((r) => r.rfha), ['2000000000019'])
    strictEqual(filterRows([row], '', '', '13-10-2026').length, 0)
  })
})

describe('loadWorklist (no network)', () => {
  it('reads status 11 from TrmFxApp, joins FxTransaction and keeps the deals the view has for the NDF date', async () => {
    const urls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      urls.push(url)
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('trmfxapp')) return json({ value: [app(), app({ FinancialTransaction: '9' })] })
      if (url.includes('/fx/')) return json({ value: [fx(), fx({ FinancialTransaction: '9' })] })
      if (url.includes('trdGrp')) return json({ rows: [{ ZTCODE: 'C14', ZTRADER: 'Ashon V' }] })
      if (url.includes('tsfvFx'))
        return json({ rows: [{ BUKRS: 'SG03', RFHA: '2000000000019', NDF_DATE: '2026-10-12', NDF_REF: 'RBI', BUTXT: 'Olam SG', BP_NAME: 'DBS' }] })
      return json({ rows: [] })
    }) as typeof fetch
    try {
      const res = await loadWorklist('12-10-2026', {})
      strictEqual(res.state, 'ok')
      if (res.state === 'ok') deepStrictEqual(res.value.map((r) => [r.rfha, r.trader, r.oldRate]), [['2000000000019', 'Ashon V', null]])
      ok(urls.some((u) => u.includes('trmfxapp') && decodeURIComponent(u.replaceAll('+', ' ')).includes("TxnStatus eq '11'")))
    } finally {
      globalThis.fetch = real
    }
  })
})
