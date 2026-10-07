import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { companyOptions, dealFromApp, eligible, invertedDate, loadWorklist, traderOptions } from './api.ts'
import { applyFilters, calcCashSettlement, checkRate, leadCurr } from './logic.ts'
import type { NdfDeal } from './types.ts'

const near = (a: number, b: number) => ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

describe('screen 1000 value helps', () => {
  it('Trader: ZSGTRMTR_TRD_GRP sorted, one row per ZTCODE, "<code> - <name>"', () => {
    // As served on 2026-10-01: a trader repeats once per trader group.
    const rows = [
      { ZTCODE: 'C20', ZTRADER: 'Nidhi S', ZGRP: 'G02' },
      { ZTCODE: 'C14', ZTRADER: 'Ashon V', ZGRP: 'G00' },
      { ZTCODE: 'C14', ZTRADER: 'Ashon V', ZGRP: 'G01' },
      { ZTCODE: '', ZTRADER: 'blank code', ZGRP: 'G01' },
    ]
    deepStrictEqual(traderOptions(rows), [
      { value: 'C14', label: 'C14 - Ashon V' },
      { value: 'C20', label: 'C20 - Nidhi S' },
    ])
  })

  it('Company Code: T001 keys as SAP holds them, by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
      ]).map((o) => o.value),
      ['0001', 'SG03'],
    )
  })
})

const fx = (o: Partial<FxTransaction> = {}): FxTransaction => ({
  CompanyCode: 'SG03', FinancialTransaction: '2000000000020', ProductType: '12D', TransactionType: '100', Partner: '1',
  BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 1000000, SellAmount: 96200000,
  ValueDate: '2026-10-14', SpotRate: 96.1, SwapRate: 0.1, ForwardRate: 96.2, ActiveStatus: '0', ActivityCategory: '20', ...o,
})
const app = (o: Partial<TrmFxApp> = {}): TrmFxApp => ({ CompanyCode: 'SG03', FinancialTransaction: '2000000000020', TxnStatus: '07', Ztrcode: 'C14', ...o })

describe('GET_DATA', () => {
  it('keeps TXN_STATUS 07, SAKTIV <> 3, NDF product types (sgsart+2(1) = D), V_DATE and the trader', () => {
    const rows = [
      { fx: fx({ FinancialTransaction: '1' }), app: app() },
      { fx: fx({ FinancialTransaction: '2' }), app: app({ TxnStatus: '10' }) }, // already fixed
      { fx: fx({ FinancialTransaction: '3', ActiveStatus: '3' }), app: app() }, // reversed
      { fx: fx({ FinancialTransaction: '4', ProductType: '12B' }), app: app() }, // forward, not NDF
      { fx: fx({ FinancialTransaction: '5' }), app: app({ Ztrcode: 'C20' }) },
      { fx: fx({ FinancialTransaction: '6', ValueDate: '2026-10-15' }), app: app() }, // other Fixing Date
    ]
    deepStrictEqual(eligible(rows, '2026-10-14').map((r) => r.fx.FinancialTransaction), ['1', '5'])
    deepStrictEqual(eligible(rows, '2026-10-14', 'C14').map((r) => r.fx.FinancialTransaction), ['1'])
  })

  it('maps a transaction + TrmFxApp row, signing the legs and leaving unserved NDF fields blank', () => {
    const d = dealFromApp(fx(), app({ NdfFoRem: 'fo', NdfMoRem: 'mo' }), { C14: 'Ashon V' })
    deepStrictEqual(
      [d.id, d.company, d.traderCode, d.trader, d.side, d.pair, d.amt1, d.amt2, d.fwd, d.vDate, d.cpair, d.txnStatus, d.status, d.foRemarks, d.moRemarks],
      ['2000000000020', 'SG03', 'C14', 'Ashon V', 'Buy', 'USD/INR', 1000000, -96200000, 96.2, '14-10-2026', 'USD:INR', '07', 'MO: Match & Release for Settlement', 'fo', 'mo'],
    )
    deepStrictEqual([d.date, d.ref, d.ndf, d.cashCurr], ['', '', 0, ''])
    // selling the lead currency: leg 1 is negative
    const s = dealFromApp(fx({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 96200000, SellAmount: 1000000 }), app())
    deepStrictEqual([s.side, s.amt1, s.amt2], ['Sell', -1000000, 96200000])
  })

  it('reads TCURR by inverted date', () => {
    strictEqual(invertedDate('2026-10-01'), '79738998') // 99999999 - 20261001
  })
})

describe('loadWorklist (TrmFxApp + FxTransaction, no network)', () => {
  it('queries status 07, joins on company code + transaction and applies the Fixing Date', async () => {
    const urls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      urls.push(url)
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('trmfxapp')) return json({ value: [app(), app({ FinancialTransaction: '9' })] })
      if (url.includes('/fx/')) return json({ value: [fx(), fx({ FinancialTransaction: '9', ValueDate: '2026-10-20' })] })
      return json({ rows: [] })
    }) as typeof fetch
    try {
      const res = await loadWorklist('14-10-2026')
      strictEqual(res.state, 'ok')
      if (res.state === 'ok') deepStrictEqual(res.value.map((d) => d.id), ['2000000000020'])
      ok(urls.some((u) => u.includes('trmfxapp') && decodeURIComponent(u.replaceAll('+', ' ')).includes("TxnStatus eq '07'")))
    } finally {
      globalThis.fetch = real
    }
  })
})

const deal = (o: Partial<NdfDeal>): NdfDeal => ({
  id: '1', company: 'IN11', trader: '', traderCode: '', side: 'Buy', pair: 'USD/INR', amt1: 0, c1: 'USD', amt2: 0, c2: 'INR',
  spot: 0, swap: 0, fwd: 0, date: '', vDate: '', ndf: 0, cashCurr: '', cpair: '', ref: '', status: '', txnStatus: '07', remarks: '', moRemarks: '', ...o,
})

describe('FORM cash_settelment (screen 9001)', () => {
  it('settles the following-currency leg at the fixing rate against the other leg', () => {
    // USD/INR: INR follows, curr1 (USD) is not the follow -> amt1 + amt2 / rate
    near(calcCashSettlement(deal({ amt1: 1_000_000, amt2: -96_200_000 }), 95.8425), 1_000_000 + -96_200_000 / 95.8425)
    // VND/USD: VND follows and is curr1, quoted per 100 -> amt2 + amt1 * 100 / rate
    near(calcCashSettlement(deal({ c1: 'VND', c2: 'USD', amt1: 2_500_000_000, amt2: -100_000 }), 25_000), -100_000 + (2_500_000_000 * 100) / 25_000)
    strictEqual(calcCashSettlement(deal({ amt1: 1, amt2: 1 }), 0), 0)
  })

  it('scales the rate with TCURF kurst MTM when the factors differ (CHECK_RATE)', () => {
    strictEqual(checkRate({ c1: 'VND', c2: 'USD' }, 250, { 'VND>USD': { ffact: 100, tfact: 1 } }), 25000)
    strictEqual(checkRate({ c1: 'USD', c2: 'INR' }, 95, {}), 95)
    deepStrictEqual(leadCurr('INR', 'USD'), { lead: 'USD', follow: 'INR' })
  })
})

describe('worklist filters', () => {
  it('compares the Fixing Date with V_DATE and the trader with ZTRCODE', () => {
    const list = [deal({ id: 'a', vDate: '14-10-2026', date: '12-10-2026', traderCode: 'C14' }), deal({ id: 'b', vDate: '15-10-2026', traderCode: 'C20' })]
    const f = { search: '', company: '', trader: '', fixingDate: '14-10-2026' }
    deepStrictEqual(applyFilters(list, f, true).map((d) => d.id), ['a'])
    deepStrictEqual(applyFilters(list, { ...f, fixingDate: '', trader: 'C20' }, true).map((d) => d.id), ['b'])
  })
})
