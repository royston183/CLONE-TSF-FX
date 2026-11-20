import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arbitrage, dealSummary, entityPnl, fmt, plannedCalc, portfolioTotals, realisedGain, settlementCalc, toUsd } from './calc.ts'
import { MOCK_DEALS } from './fixtures.ts'

const deal = (id: string) => MOCK_DEALS.find((d) => d.id === id)!

describe('planned P&L (the reference deal 1100002739)', () => {
  const p = plannedCalc(deal('1100002739'))
  it('is the arbitrage of the two linked legs', () => {
    strictEqual(p.receivedLocal, 996_000_000)
    strictEqual(p.paidLocal, 990_000_000)
    strictEqual(p.arbitrageLocal, 6_000_000)
    strictEqual(p.arbitrageUsd, 60_000)
    strictEqual(p.rateSpread, 0.6)
  })
  it('is negative when the buy leg costs more than the sell leg returns', () => {
    strictEqual(plannedCalc(deal('1100002737')).arbitrageLocal, -1_500_000)
    strictEqual(plannedCalc(deal('1100002737')).arbitrageUsd, -15_000)
  })
  it('uses the deal\'s own reporting rate, not 100', () => {
    strictEqual(plannedCalc(deal('1100002741')).arbitrageLocal, 160_000)
    strictEqual(plannedCalc(deal('1100002741')).arbitrageUsd, 35_955.06)
  })
  it('works from the legs given', () => {
    strictEqual(arbitrage([], 100).usd, 0)
  })
})

describe('maturity and settlement', () => {
  const s = settlementCalc(deal('1100002739'))
  it('values the NDF leg at its fixing and finds the realised loss', () => {
    const ndf = s.maturity.find((m) => m.legRef === 'D2')!
    strictEqual(ndf.usd, 9_960_000)
    strictEqual(ndf.local, -996_000_000)
    strictEqual(ndf.fixingRate, 100)
    strictEqual(ndf.realised, -40_000)
    strictEqual(s.realisedTotal, -40_000)
  })
  it('leaves a leg with no fixing empty instead of inventing figures', () => {
    const df = s.maturity.find((m) => m.legRef === 'D1')!
    deepStrictEqual([df.usd, df.local, df.fixingRate, df.realised], [null, null, null, null])
  })
  it('nets pay and receive per entity', () => {
    deepStrictEqual(s.flows.map((f) => [f.entity, f.net]), [['OIL-USD', 15_249], ['OFIIPL-INR', 6_010_000], ['DMCC-USD', 24_900]])
    strictEqual(s.flows[1]!.netUsd, 60_100)
  })
  it('gains on a buy leg when the fixing values the counter currency below the USD bought', () => {
    const buy = deal('1100002738').legs.find((l) => l.ref === 'D2')!
    strictEqual(realisedGain(buy, 99.9), 45_045.05)
  })
})

describe('entity P&L and net', () => {
  const p = entityPnl(deal('1100002739'))
  it('gives the figures of the reference table', () => {
    const by = (e: string) => p.entities.find((x) => x.entity === e)!
    strictEqual(by('OIL-USD').settlement, -24_751)
    strictEqual(by('OIL-USD').actualUsd, -24_751)
    strictEqual(by('OFIIPL-INR').planned, 6_000_000)
    strictEqual(by('OFIIPL-INR').settlement, 6_010_000)
    strictEqual(by('OFIIPL-INR').actualUsd, 60_100)
    strictEqual(by('DMCC-USD').actualUsd, 24_900)
    strictEqual(by('DMCC-USD').planned, null)
  })
  it('consolidates the net in USD, 60,249', () => {
    strictEqual(p.consolidatedNetUsd, 60_249)
    strictEqual(p.basis, 'actual')
  })
  it('does not add planned, settlement and actual together', () => {
    const total = p.entities.reduce((s, e) => s + (e.netUsd ?? 0), 0)
    strictEqual(total, 60_249)
    strictEqual(p.entities.reduce((s, e) => s + (e.plannedUsd ?? 0) + (e.settlementUsd ?? 0) + (e.actualUsd ?? 0), 0) === total, false)
  })
  it('uses the planned P&L as the expected net until a deal settles', () => {
    const open = entityPnl(deal('1100002737'))
    strictEqual(open.basis, 'planned')
    strictEqual(open.consolidatedNetUsd, -15_000)
    strictEqual(open.entities.every((e) => e.actualUsd === null), true)
  })
  it('converts a non-USD entity at the deal\'s reporting rate', () => {
    strictEqual(toUsd(8_961_000, 'MYR', 4.45), 2_013_707.87)
    strictEqual(toUsd(5, 'USD', 4.45), 5)
  })
})

describe('portfolio', () => {
  const rows = MOCK_DEALS.map(dealSummary)
  it('summarises each deal in USD', () => {
    const s = rows.find((r) => r.id === '1100002739')!
    deepStrictEqual([s.plannedUsd, s.actualUsd, s.netUsd], [60_000, 60_249, 60_249])
  })
  it('totals only USD amounts and counts profit and loss', () => {
    const t = portfolioTotals(rows)
    strictEqual(t.deals, MOCK_DEALS.length)
    strictEqual(t.profitable + t.losing <= t.deals, true)
    strictEqual(t.netUsd, Math.round(rows.reduce((s, r) => s + (r.netUsd ?? 0), 0) * 100) / 100)
  })
})

describe('format', () => {
  it('uses thousand separators and a minus sign', () => {
    strictEqual(fmt(-24751), '-24,751')
    strictEqual(fmt(1234.5, 2), '1,234.50')
    strictEqual(fmt(null), '—')
    strictEqual(fmt(-0.2), '0')
  })
})

describe('sample deals', () => {
  it('are ten, on FX models the application has, with unique Deal IDs', async () => {
    const { SAMPLE_DEALS } = await import('./sample-deals.ts')
    strictEqual(SAMPLE_DEALS.length, 10)
    strictEqual(new Set(SAMPLE_DEALS.map((d) => d.id)).size, 10)
    deepStrictEqual([...new Set(SAMPLE_DEALS.map((d) => d.model))].sort(), ['M032', 'M033', 'M037'])
  })
  it('calculate: settled deals have an actual P&L, open ones only a planned one', async () => {
    const { SAMPLE_DEALS } = await import('./sample-deals.ts')
    for (const d of SAMPLE_DEALS) {
      const s = dealSummary(d)
      strictEqual(s.plannedUsd !== null, true)
      strictEqual(s.actualUsd !== null, d.status === 'Settled')
      strictEqual(s.basis, d.status === 'Settled' ? 'actual' : 'planned')
    }
  })
})
