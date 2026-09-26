import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fmtDate, fmtNum, fmtRate } from './format.ts'
import {
  DEFAULT_FILTERS,
  applyEditPair,
  applyPremium,
  buildDeals,
  cancelDeal,
  confirmDeal,
  currStr,
  editPairCandidates,
  entStr,
  filterDeals,
  gapNote,
  modelOptions,
  originOptions,
  pageOf,
  pagerWindow,
  plTable,
  recalcInvoices,
  reverseConfirm,
  setInvRate,
  statusValClass,
} from './logic.ts'
import type { Deal, Filters } from './types.ts'

const TODAY = new Date(2026, 8, 26, 10, 30)
const deals = () => buildDeals(TODAY)
const deal = (id: string) => deals().find((d) => d.dealId === id)!
const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch })
const close = (a: number, b: number) => ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`)

describe('format', () => {
  it('groups amounts, fixes rates at seven decimals, and shows 0 for non-numbers', () => {
    strictEqual(fmtNum(-1234567.891), '-1,234,567.89')
    strictEqual(fmtNum(Number.NaN), '0.00')
    strictEqual(fmtRate(88.475), '88.4750000')
    strictEqual(fmtRate(null), '0.0000000')
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05.01.2026')
  })
})

describe('reference strings', () => {
  it('joins entity and currency strings, with dashes for unknown ids', () => {
    strictEqual(entStr('E015'), 'OGA → DMCC → OSIPL')
    strictEqual(entStr('E999'), '- → - → -')
    strictEqual(currStr('C002'), 'USD-USD-INR')
  })

  it('lists models sorted with plain "&" descriptions, and the origins in use', () => {
    const models = modelOptions()
    deepStrictEqual(models.map((m) => m.value), ['M032', 'M033', 'M034', 'M035', 'M036', 'M037', 'M041'])
    strictEqual(models[2]?.label, 'M034 – INR – INR Staggered Call & Put Option')
    deepStrictEqual(originOptions(deals()), [{ value: 'OSIPL', label: 'OSIPL – Olam Agri India Pvt Ltd' }])
  })
})

describe('buildDeal', () => {
  it('dates the sample rows relative to today', () => {
    const d = deal('1100000564')
    strictEqual(fmtDate(d.dealStart), '17.08.2026')
    strictEqual(fmtDate(d.shipStart), '26.10.2026')
    strictEqual(d.modelDesc, 'INR – INR Staggered Call & Put Option')
    deepStrictEqual(d.entChain, ['OGA', 'OSIPL', 'DMCC'])
  })

  it('books D1 in the first entity and D2 in the third, options as txn type 649', () => {
    const [d1, d2] = deal('1100000564').fxLegs
    strictEqual(d1?.coCode, 'SG03')
    strictEqual(d2?.coCode, 'AE13')
    deepStrictEqual([d1?.buy1, d1?.buy2, d2?.buy1, d2?.buy2], ['Buy', 'Sell', 'Sell', 'Buy'])
    strictEqual(d1?.amt1, 20000000)
    close(d1?.amt2 ?? 0, 20000000 / 88.475)
    strictEqual(d1?.txnType, '619 – Forward-TSF')
    strictEqual(d2?.txnType, '649 – Option - TSF')
    strictEqual(deal('1100000565').fxLegs[1]?.txnType, '619 – Forward-TSF')
  })

  it('swaps the amounts when the deal is not quoted in USD first', () => {
    const d1 = deal('1100000570').fxLegs[0]
    close(d1?.amt1 ?? 0, 18335000 / 83.2)
    strictEqual(d1?.amt2, 18335000)
  })

  it('derives T1..T3 along the Entity String with the markup on T2 / T3', () => {
    const d = deal('1100000565')
    const local = 5000000 / 90.7112
    deepStrictEqual(
      d.invLegs.map((l) => [l.ref, l.dealType, l.sell, l.buy, l.mcSell, l.mcBuy, l.curr]),
      [
        ['1100000565-T1', 'D1', 'OGA', 'DMCC', 'OGA-DMCC-S', 'DMCC-OGA-P', 'INR'],
        ['1100000565-T2', 'D2', 'DMCC', 'OSIPL', 'DMCC-OSIPL-S', 'OSIPL-DMCC-P', 'INR'],
        ['1100000565-T3', 'D2', 'OSIPL', 'OGA', 'OSIPL-OGA-S', 'OGA-OSIPL-P', 'INR'],
      ],
    )
    close(d.invLegs[0]?.amt ?? 0, local)
    close(d.invLegs[1]?.amt ?? 0, local * 1.002)
    close(d.invLegs[2]?.invAmt ?? 0, local * 1.002 * 90.7112)
    // Invoiced in the first currency when neither side is INR-second.
    strictEqual(deal('1100000570').invLegs[0]?.curr, 'INR')
  })
})

describe('list screen', () => {
  it('filters by status, model, origin and free text over the joined fields', () => {
    strictEqual(filterDeals(deals(), DEFAULT_FILTERS).length, 10)
    deepStrictEqual(filterDeals(deals(), f({ status: '01' })).map((d) => d.dealId), ['1100000564', '1100000567', '1100000569', '1100000572'])
    strictEqual(filterDeals(deals(), f({ model: 'M032' })).length, 4)
    strictEqual(filterDeals(deals(), f({ origin: 'OGA' })).length, 0)
    strictEqual(filterDeals(deals(), f({ search: '  k_ramasamy ' })).length, 2)
    strictEqual(filterDeals(deals(), f({ search: 'usd-inr-inr' })).length, 1) // the currency string
    strictEqual(filterDeals(deals(), f({ search: 'put & call' })).length, 1)
  })

  it('clamps the page and reports the shown range', () => {
    const rows = Array.from({ length: 20 }, (_, i) => i)
    deepStrictEqual(pageOf(rows, 2, 15), { rows: [15, 16, 17, 18, 19], page: 2, totalPages: 2, start: 15, end: 20 })
    strictEqual(pageOf(rows, 9, 15).page, 2)
    deepStrictEqual(pageOf([], 1, 15), { rows: [], page: 1, totalPages: 1, start: 0, end: 0 })
  })

  it('numbers every page up to 7, then elides runs away from the current one', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3, 'gap', 10])
    deepStrictEqual(pagerWindow(5, 10), [1, 'gap', 3, 4, 5, 6, 7, 'gap', 10])
    deepStrictEqual(pagerWindow(10, 10), [1, 'gap', 8, 9, 10])
  })
})

describe('detail screen', () => {
  it('notes the wait for shipment, or readiness, only while Not Confirmed', () => {
    deepStrictEqual(gapNote(deal('1100000564'), TODAY), { kind: 'waiting', days: 30 })
    const opened: Deal = { ...deal('1100000564'), shipStart: new Date(2026, 8, 20) }
    deepStrictEqual(gapNote(opened, TODAY), { kind: 'ready' })
    strictEqual(gapNote(deal('1100000565'), TODAY), null)
  })

  it('colours the status value', () => {
    deepStrictEqual((['01', '02', '03', '30'] as const).map(statusValClass), ['muted', 'green', 'green', ''])
  })

  it('accepts positive typed rates without recalculating until Calculate', () => {
    const d = deal('1100000564')
    strictEqual(setInvRate(d, 0, '0'), null)
    strictEqual(setInvRate(d, 0, 'abc'), null)
    const changed = setInvRate(d, 0, '1,000.5')!
    strictEqual(changed.invLegs[0]?.rate, 1000.5)
    strictEqual(changed.invLegs[0]?.invAmt, d.invLegs[0]?.invAmt)
    close(recalcInvoices(changed).invLegs[0]?.invAmt ?? 0, (d.invLegs[0]?.amt ?? 0) * 1000.5)
  })

  it('sums each later leg over T1 as the P&L markup', () => {
    const d = deal('1100000565')
    const pl = plTable(d)
    deepStrictEqual(pl.labels, ['OGA→DMCC', 'DMCC→OSIPL', 'OSIPL→OGA'])
    strictEqual(pl.purchase[1]?.lamt, -(d.invLegs[1]?.invAmt ?? 0))
    const t1 = d.invLegs[0]?.invAmt ?? 0
    close(pl.totalMarkup, (d.invLegs[1]?.invAmt ?? 0) - t1 + (d.invLegs[2]?.invAmt ?? 0) - t1)
  })
})

describe('actions', () => {
  it('confirms only a Not Confirmed Deal ID', () => {
    strictEqual(confirmDeal(deal('1100000564'))?.status, '02')
    strictEqual(confirmDeal(deal('1100000565')), null)
  })

  it('re-prices only T2 with the premium rate', () => {
    const d = deal('1100000564')
    strictEqual(applyPremium(d, ''), null)
    strictEqual(applyPremium(d, '-1'), null)
    const adj = applyPremium(d, '90')!
    strictEqual(adj.premiumRate, 90)
    strictEqual(adj.invLegs[1]?.rate, 90)
    close(adj.invLegs[1]?.invAmt ?? 0, (d.invLegs[1]?.amt ?? 0) * 90)
    deepStrictEqual(adj.invLegs[0], d.invLegs[0])
  })

  it('cancels, and reverses back to 01 dropping the premium rate', () => {
    strictEqual(cancelDeal(deal('1100000565')).status, '30')
    const rev = reverseConfirm(applyPremium(deal('1100000565'), '90')!)
    strictEqual(rev.status, '01')
    strictEqual(rev.premiumRate, null)
  })

  it('records an Edit Deal Pair against the chosen leg', () => {
    const d = deal('1100000564')
    deepStrictEqual(editPairCandidates(d.fxLegs[1]).map((c) => c.rfha), ['0500011455', '0500011488'])
    strictEqual(applyEditPair(d, 0, '', TODAY), null)
    const at = new Date(2026, 8, 26)
    deepStrictEqual(applyEditPair(d, 1, '0500011455', at)?.editHistory, [{ leg: 'D2', newRfha: '0500011455', at }])
  })
})
