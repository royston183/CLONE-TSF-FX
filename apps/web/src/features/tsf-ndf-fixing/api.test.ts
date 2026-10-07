import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ndfRecord } from '../../shared/fx/ndf.ts'
import { companyOptions, dealFromRecord, invertedDate, traderNames, traderOptions } from './api.ts'
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

describe('GET_DATA', () => {
  it('names the trader from the value help and labels the status from ZSGTSFTR_TXNSTAT', () => {
    const rec = ndfRecord(
      {
        CompanyCode: 'SG03', FinancialTransaction: '2000000000011', ProductType: '12D', BuyCurrency: 'USD', SellCurrency: 'INR',
        LeadCurrency: 'USD', FollowCurrency: 'INR', BuyAmount: 10000, SellAmount: 900000, ValueDate: '2026-10-08', ForwardRate: 90, ActiveStatus: '0',
      },
      { CompanyCode: 'SG03', FinancialTransaction: '2000000000011', TxnStatus: '07', Ztrcode: 'C14', NdfFoRem: 'rbi' },
    )
    const names = traderNames([{ value: 'C14', label: 'C14 - Ashon V' }])
    const d = dealFromRecord(rec, names, { '07': 'MO: Match & Release for Settlement' })
    deepStrictEqual(
      [d.id, d.trader, d.side, d.amt1, d.amt2, d.cpair, d.date, d.vDate, d.status, d.foRemarks],
      ['2000000000011', 'Ashon V', 'Buy', 10000, -900000, 'USD:INR', '08-10-2026', '08-10-2026', '07 - MO: Match & Release for Settlement', 'rbi'],
    )
  })

  it('reads TCURR by inverted date', () => {
    strictEqual(invertedDate('2026-10-01'), '79738998') // 99999999 - 20261001
  })
})

const deal = (o: Partial<NdfDeal>): NdfDeal => ({
  id: '1', company: 'IN11', trader: '', traderCode: '', side: 'Buy', pair: 'USD/INR', amt1: 0, c1: 'USD', amt2: 0, c2: 'INR',
  spot: 0, swap: 0, fwd: 0, date: '', vDate: '', ndf: 0, cashCurr: '', cpair: '', ref: '', status: '', txnStatus: '07',
  partner: '', valueDate: '', foRemarks: '', etag: '', ...o,
})

describe('FORM cash_settelment (screen 9001)', () => {
  it('settles the following-currency leg at the fixing rate against the other leg', () => {
    // USD/INR: INR follows, curr1 (USD) is not the follow -> amt1 + amt2 / rate
    near(calcCashSettlement(deal({ amt1: 1_000_000, amt2: -96_200_000 }), 95.8425), 1_000_000 + -96_200_000 / 95.8425)
    // USD/VND: VND follows (CURR2), quoted per 100 -> amt1 + amt2 * 100 / rate
    near(calcCashSettlement(deal({ c1: 'USD', c2: 'VND', amt1: -100_000, amt2: 2_500_000_000 }), 25_000), -100_000 + (2_500_000_000 * 100) / 25_000)
    strictEqual(calcCashSettlement(deal({ amt1: 1, amt2: 1 }), 0), 0)
  })

  it('scales the rate with TCURF kurst MTM when the factors differ (CHECK_RATE)', () => {
    strictEqual(checkRate({ c1: 'VND', c2: 'USD' }, 250, { 'VND>USD': { ffact: 100, tfact: 1 } }), 25000)
    strictEqual(checkRate({ c1: 'USD', c2: 'INR' }, 95, {}), 95)
    deepStrictEqual(leadCurr('USD', 'INR'), { lead: 'USD', follow: 'INR' })
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
