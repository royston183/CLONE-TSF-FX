import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { leg, makeDealDb, seedDocs } from './data.ts'
import { fmtAmt, round2, todayStr } from './format.ts'
import {
  RBI_RATE,
  buildPlRows,
  cancelDealId,
  collectRates,
  companyCode,
  computePremiumAdjustment,
  confirmInvoicePlan,
  firstUnreadyLeg,
  invoicesVisible,
  removeDoc,
  reverseMoConfirmation,
  saveInvoiceRates,
  searchDeals,
  ssDeallocate,
  toggleLeg,
  toolbarButtons,
  updateDealPair,
  uploadDoc,
} from './logic.ts'
import type { Deal } from './types.ts'

const get = (id: string): Deal => {
  const d = makeDealDb()[id]
  if (!d) throw new Error(`missing seed deal ${id}`)
  return d
}
const SS = '5000010237'

describe('format', () => {
  it('fmtAmt groups, keeps the sign and shows — for NaN', () => {
    strictEqual(fmtAmt(1234.5), '1,234.50')
    strictEqual(fmtAmt(-6400), '-6,400.00')
    strictEqual(fmtAmt(95.5587, 4), '95.5587')
    strictEqual(fmtAmt(Number.NaN), '—')
    strictEqual(fmtAmt(undefined), '—')
  })
  it('todayStr is DD-MM-YYYY', () => {
    strictEqual(todayStr(new Date(2026, 8, 3)), '03-09-2026')
  })
  it('leg() stamps totPl', () => {
    strictEqual(get('5000010235').legs[0]?.totPl, round2(412.5 + 118.2))
    strictEqual(leg({ ...get(SS).legs[0]!, fxPl: 1.005, setPl: 0 }).totPl, 1.01)
  })
})

describe('searchDeals', () => {
  const db = makeDealDb()
  it('lists every deal for an empty term', () => {
    strictEqual(searchDeals(db, '').length, 6)
    strictEqual(searchDeals(db, '   ').length, 6)
  })
  it('matches id, reference, MC ref, trader code/description and model, case-insensitively', () => {
    deepStrictEqual(searchDeals(db, '0237').map((d) => d.dealId), [SS])
    deepStrictEqual(searchDeals(db, 'soyoil').map((d) => d.dealId), [SS])
    deepStrictEqual(searchDeals(db, '2000002691').map((d) => d.dealId), [SS])
    deepStrictEqual(searchDeals(db, 'ovl').map((d) => d.dealId), [SS])
    deepStrictEqual(searchDeals(db, 'vietnam').map((d) => d.dealId), [SS])
    deepStrictEqual(searchDeals(db, 'm035').map((d) => d.dealId), [SS])
    strictEqual(searchDeals(db, 'nothing-like-this').length, 0)
  })
})

describe('computePremiumAdjustment', () => {
  it('uses the D2 strike, the mocked RBI rate and the first leg amount', () => {
    const d = get('5000010235')
    const c = computePremiumAdjustment(d)
    const lnet = round2(412.5 + 118.2 - 186.4 + 44.1)
    const fnet = round2(lnet * RBI_RATE)
    const pnet = round2(fnet / 2059001)
    deepStrictEqual(c, { damt: 2059001, lnet, rbi: 90.42, fnet, pnet, srate: 90.05, irate: round2(90.05 + pnet) })
  })
  it('falls back to the first leg all-in rate without a D2 leg', () => {
    const c = computePremiumAdjustment(get('5000010234'))
    strictEqual(c.srate, 90)
    strictEqual(c.pnet, 0)
    strictEqual(c.irate, 90)
  })
  it('falls back to the D2 all-in rate when it has no strike', () => {
    const d = get('5000010235')
    const legs = d.legs.map((l) => (l.dealType === 'D2' ? { ...l, strike: 0, allInRate: 88.5 } : l))
    strictEqual(computePremiumAdjustment({ ...d, legs }).srate, 88.5)
  })
})

describe('buildPlRows', () => {
  it('adds the SS premium income and expense rows ahead of the P&L rows', () => {
    deepStrictEqual(buildPlRows(get(SS)), [
      { type: 'Option Premium Income', amtLocal: 15250, amtUsd: 15250 },
      { type: 'Option Premium Expense', amtLocal: -6400, amtUsd: -6400 },
      { type: 'FX Deal P&L', amtLocal: 0, amtUsd: 0 },
      { type: 'Settlement P&L', amtLocal: 0, amtUsd: 0 },
      { type: 'Total P&L', amtLocal: 8850, amtUsd: 8850, total: true },
    ])
  })
  it('converts to USD at /90 for a non-SS deal', () => {
    const rows = buildPlRows(get('5000010235'))
    strictEqual(rows.length, 3)
    const fx = round2(412.5 - 186.4)
    const set = round2(118.2 + 44.1)
    deepStrictEqual(rows[0], { type: 'FX Deal P&L', amtLocal: fx, amtUsd: round2(fx / 90) })
    deepStrictEqual(rows[2], {
      type: 'Total P&L',
      amtLocal: round2(fx + set),
      amtUsd: round2(round2(fx / 90) + round2(set / 90)),
      total: true,
    })
  })
})

describe('toolbarButtons', () => {
  it('SS deal in 01: all 01 functions plus SS Deallocation and Save P&L; Edit needs a leg', () => {
    deepStrictEqual(toolbarButtons(get(SS), null), ['UPD', 'PRE', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(get(SS), '5000456830'), [
      'UPD', 'PRE', 'DEAL_EDIT', 'CAN', 'SS_DEALLOC', 'SS_DEAL', 'DMS', 'REF',
    ])
  })
  it('non-SS deal in 01 has no SS functions', () => {
    deepStrictEqual(toolbarButtons(get('5000010234'), null), ['UPD', 'PRE', 'CAN', 'DMS', 'REF'])
  })
  it('Reverse only for 02/03 with authorisation', () => {
    deepStrictEqual(toolbarButtons(get('5000010235'), 'x'), ['PRE', 'REV', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(get('5000010236'), null), ['PRE', 'REV', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons({ ...get('5000010235'), reversalAuthorized: false }, null), ['PRE', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(get('5000010238'), null), ['PRE', 'DMS', 'REF'])
    deepStrictEqual(toolbarButtons(ssDeallocate(get(SS)), 'x'), ['PRE', 'DMS', 'REF'])
  })
})

describe('invoicesVisible', () => {
  it('hides for no-invoice models and statuses 30/50', () => {
    strictEqual(invoicesVisible(get(SS)), true)
    strictEqual(invoicesVisible(get('5000010235')), true)
    strictEqual(invoicesVisible(get('5000010239')), false)
    strictEqual(invoicesVisible(get('5000010238')), false)
    strictEqual(invoicesVisible(ssDeallocate(get(SS))), false)
  })
})

describe('invoice plan', () => {
  it('names the first leg below status 07', () => {
    strictEqual(firstUnreadyLeg(get(SS))?.rfha, '5000456830')
    strictEqual(firstUnreadyLeg(get('5000010235')), undefined)
  })
  it('collects one rate per line, parseFloat or 0', () => {
    const d = get(SS)
    deepStrictEqual(collectRates(d, ['96.1', 'abc']), { '5000456830': 96.1, '5000456831': 0 })
  })
  it('saves rates immutably onto the first invoice of each leg and keeps status 01', () => {
    const d = get(SS)
    const saved = confirmInvoicePlan(saveInvoiceRates(d, { '5000456831': 97.25 }))
    strictEqual(saved.status, '01')
    strictEqual(saved.invoices[0]?.exRate, 95.5587)
    strictEqual(saved.invoices[1]?.exRate, 97.25)
    strictEqual(d.invoices[1]?.exRate, 95.97)
  })
})

describe('status transitions', () => {
  it('reverse returns to 01 and clears invoices', () => {
    const r = reverseMoConfirmation(get('5000010235'))
    strictEqual(r.status, '01')
    deepStrictEqual(r.invoices, [])
  })
  it('cancel -> 30, SS deallocation -> 50', () => {
    strictEqual(cancelDealId(get(SS)).status, '30')
    strictEqual(ssDeallocate(get(SS)).status, '50')
  })
  it('updateDealPair renames only the selected leg', () => {
    const d = get(SS)
    const u = updateDealPair(d, '5000456831', '5000459044')
    deepStrictEqual(u.legs.map((l) => l.rfha), ['5000456830', '5000459044'])
    strictEqual(d.legs[1]?.rfha, '5000456831')
    strictEqual(updateDealPair(d, 'nope', 'x'), d)
    notStrictEqual(u, d)
  })
})

describe('small helpers', () => {
  it('toggleLeg selects and deselects', () => {
    strictEqual(toggleLeg(null, 'a'), 'a')
    strictEqual(toggleLeg('a', 'a'), null)
    strictEqual(toggleLeg('a', 'b'), 'b')
  })
  it('companyCode is the first entity', () => {
    strictEqual(companyCode(get(SS)), 'OGA')
    strictEqual(companyCode({ ...get(SS), entityString: '' }), '—')
  })
  it('DMS seed, upload and remove', () => {
    const seeded = seedDocs('01-01-2026')
    deepStrictEqual(seeded, [{ name: 'Confirmation_Advice.pdf', cat: 'MO Confirmation', by: 'r.dsouza', date: '01-01-2026' }])
    const up = uploadDoc(seeded, '02-01-2026')
    deepStrictEqual(up[1], { name: 'Supporting_Doc_2.pdf', cat: 'Supporting', by: 'you', date: '02-01-2026' })
    deepStrictEqual(removeDoc(up, 0).map((d) => d.name), ['Supporting_Doc_2.pdf'])
  })
})
