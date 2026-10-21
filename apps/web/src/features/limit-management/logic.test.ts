import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildBankSummary, canSetAdditional, dealsForLimit, deriveLimit, limitOverlaps, normalisePair, parseLimitAmount, splitDeal, STATUS_TEXT } from './logic.ts'
import type { LimitDeal, RawLimit } from './types.ts'

const raw = (o: Partial<RawLimit> = {}): RawLimit => ({
  id: 'USD-INR|2026-01-01|2026-02-28',
  pair: 'USD-INR',
  year: 2026,
  startDt: '2026-01-01',
  endDt: '2026-02-28',
  curr: 'USD',
  zini: 100,
  zad: 100,
  zunaprov: 0,
  utl: 0,
  app: true,
  rej: false,
  addlim: false,
  ...o,
})

const deal = (o: Partial<LimitDeal> = {}): LimitDeal => {
  const base = { pair: 'USD-INR', bs1: 'Sell', curr1: 'USD', amt1: 10, curr2: 'INR', amt2: 830 }
  return {
    dealId: 'D1',
    desc: '',
    bpNo: '501',
    bpName: 'HSBC',
    model: 'M032',
    dealType: 'D1',
    rate: 83,
    tradeDate: '2026-01-15',
    valueDate: '',
    startDate: '',
    endDate: '',
    mcRef: '',
    mcDate: '',
    mcAmt: 0,
    region: '',
    statusDesc: '',
    txnNo: '',
    ...base,
    ...splitDeal(base),
    ...o,
  }
}

describe('amounts and pairs', () => {
  it('reads plain, comma and M amounts; NaN otherwise', () => {
    strictEqual(parseLimitAmount('5,000,000'), 5_000_000)
    strictEqual(parseLimitAmount('5M'), 5_000_000)
    strictEqual(parseLimitAmount('2.5m'), 2_500_000)
    strictEqual(Number.isNaN(parseLimitAmount('abc')), true)
    strictEqual(Number.isNaN(parseLimitAmount('')), true)
  })
  it('normalises pairs', () => {
    strictEqual(normalisePair('usd/inr'), 'USD-INR')
    strictEqual(normalisePair('USDINR'), 'USD-INR')
  })
})

describe('deal volume', () => {
  it('counts the USD leg whichever side it is on', () => {
    strictEqual(deal().usdAmt, 10)
    const buy = deal({ ...splitDeal({ pair: 'USD-INR', bs1: 'Buy', curr1: 'USD', amt1: 7, curr2: 'INR', amt2: 581 }) })
    strictEqual(buy.usdAmt, 7)
    const reversed = splitDeal({ pair: 'USD-INR', bs1: 'Sell', curr1: 'INR', amt1: 830, curr2: 'USD', amt2: 10 })
    strictEqual(reversed.usdAmt, 10)
  })
  it('keeps only D1 deals of the pair traded inside the validity (inclusive)', () => {
    const deals = [
      deal({ dealId: 'in' }),
      deal({ dealId: 'edge', tradeDate: '2026-02-28' }),
      deal({ dealId: 'late', tradeDate: '2026-03-01' }),
      deal({ dealId: 'other', pair: 'USD-THB' }),
      deal({ dealId: 'd2', dealType: 'D2' }),
    ]
    deepStrictEqual(dealsForLimit(raw(), deals).map((d) => d.dealId), ['in', 'edge'])
  })
})

describe('deriveLimit', () => {
  it('takes utilisation from ZUTL_AMT and derives the balance', () => {
    const l = deriveLimit(raw({ zad: 100, utl: 20 }))
    strictEqual(l.utl, 20)
    strictEqual(l.balance, 80)
    strictEqual(l.statusText, STATUS_TEXT.approvedInitial)
    strictEqual(deriveLimit(raw({ zad: 100, utl: 130 })).balance, -30)
  })
  it('derives the status in the program order', () => {
    strictEqual(deriveLimit(raw({ addlim: true })).statusText, STATUS_TEXT.approvedAdditional)
    strictEqual(deriveLimit(raw({ app: false, rej: true })).statusText, STATUS_TEXT.rejectedAdd)
    strictEqual(deriveLimit(raw({ app: false, rej: true, zad: 0, zini: 0, zunaprov: 5 })).statusText, STATUS_TEXT.rejectedInitial)
    strictEqual(deriveLimit(raw({ app: false, addlim: true })).statusText, STATUS_TEXT.revised)
    strictEqual(deriveLimit(raw({ app: false, zini: 0, zad: 0, zunaprov: 5 })).statusText, STATUS_TEXT.awaiting)
  })
  it('splits initial and additional amounts', () => {
    const l = deriveLimit(raw({ zini: 80, zad: 120 }))
    strictEqual(l.zin, 80)
    strictEqual(l.zadd, 40)
    const pending = deriveLimit(raw({ app: false, zini: 0, zad: 0, zunaprov: 90 }))
    strictEqual(pending.zin, 90)
    strictEqual(pending.zadd, 0)
  })
  it('allows an additional limit only on an approved limit', () => {
    strictEqual(canSetAdditional(deriveLimit(raw())), true)
    strictEqual(canSetAdditional(deriveLimit(raw({ app: false, addlim: true }))), false)
    strictEqual(canSetAdditional(null), false)
  })
})

describe('overlap and bank summary', () => {
  it('detects an overlapping period for the same currency and year', () => {
    const all = [raw()]
    strictEqual(limitOverlaps(all, 'USD', 2026, '2026-02-28', '2026-03-31'), true)
    strictEqual(limitOverlaps(all, 'USD', 2026, '2026-03-01', '2026-03-31'), false)
    strictEqual(limitOverlaps(all, 'EUR', 2026, '2026-01-01', '2026-02-28'), false)
    strictEqual(limitOverlaps(all, 'USD', 2027, '2026-01-01', '2026-02-28'), false)
  })
  it('groups by partner, ranks by number and totals 100 %', () => {
    const s = buildBankSummary([deal({ bpNo: '502', bpName: 'B', amt1: 30, usdAmt: 30 }), deal({ bpNo: '501', usdAmt: 10 }), deal({ bpNo: '501', usdAmt: 10 })])
    deepStrictEqual(s.rows.map((r) => [r.bpNo, r.usd, r.txn, r.rank]), [['501', 20, 2, 1], ['502', 30, 1, 2]])
    strictEqual(s.rows[0]?.pct, 40)
    strictEqual(s.total.pct, 100)
    strictEqual(s.total.txn, 3)
  })
})
