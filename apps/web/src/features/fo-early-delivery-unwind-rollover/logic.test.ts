import { deepStrictEqual, notDeepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEAL_DIRECTORY, genDealLegs, seedFromString } from './data.ts'
import { fmtAmt, formatDateDMY, isoOf } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  MSG,
  TYPE_FILTER_OPTIONS,
  applyEarly,
  applyRollover,
  applyUnwind,
  earlyEvent,
  filterSort,
  gateEarly,
  gateRollover,
  gateUnwind,
  kpis,
  loadDeal,
  loadToast,
  nextSort,
  paginate,
  pairCurrencies,
  pairFormFor,
  rolloverEvent,
  sapeventUrl,
  sortIndicator,
  statusTextClass,
  toggleSelection,
  txnCount,
  unwindEvent,
  unwindFormFor,
  validateEarly,
  validateRollover,
  validateUnwind,
  viewTxnEvent,
} from './logic.ts'
import type { Leg, PairForm } from './types.ts'

const legsOf = (id: string): Leg[] => {
  const res = loadDeal(id)
  if (!res.ok) throw new Error(res.message)
  return res.legs
}
const find = (list: readonly Leg[], rfha: string): Leg => {
  const l = list.find((x) => x.rfha === rfha)
  if (!l) throw new Error(`no leg ${rfha}`)
  return l
}
const rfhas = (list: readonly Leg[]) => list.map((l) => l.rfha)

/** A fully filled pair form for leg 1000004521, with the given value dates. */
const filledPair = (newV: string, cancelV: string): PairForm => {
  const f = pairFormFor(find(legsOf('TSF10045'), '1000004521'))
  return {
    ...f,
    newTxn: { ...f.newTxn, type: 'FWD', tdate: '2026-08-01', vdate: newV, rate: ' 89.7 ' },
    cancel: { ...f.cancel, type: 'SPOT', vdate: cancelV },
  }
}

describe('format', () => {
  it('shows ISO dates as dd-mm-yyyy and amounts with two decimals', () => {
    strictEqual(formatDateDMY('2026-08-01'), '01-08-2026')
    strictEqual(formatDateDMY(''), '')
    strictEqual(formatDateDMY(null), '')
    strictEqual(formatDateDMY('bad'), 'bad')
    strictEqual(fmtAmt(89650000), '89,650,000.00')
    strictEqual(fmtAmt(0), '0.00')
    strictEqual(isoOf(2026, 0, 5), '2026-01-05')
  })
})

describe('data', () => {
  it('generates the same legs for the same Deal ID, case-insensitively', () => {
    deepStrictEqual(genDealLegs('ABC123'), genDealLegs('abc123'))
    notDeepStrictEqual(genDealLegs('ABC123'), genDealLegs('ABC124'))
    const legs = genDealLegs('ZZ999')
    ok(legs.length >= 1 && legs.length <= 3)
    strictEqual(legs[0]?.sfhaart, '619')
    strictEqual(legs[0]?.txnDesc, 'Active')
    ok(legs.every((l) => /^10000\d{4}$/.test(l.rfha) && l.zuonr === l.rfha))
  })

  it('keeps the legacy PRNG sequence byte-identical', () => {
    const r = seedFromString('TSF1')
    const seq = [r(), r(), r()]
    const again = seedFromString('TSF1')
    deepStrictEqual([again(), again(), again()], seq)
    ok(seq.every((n) => n >= 0 && n < 1))
    strictEqual(seedFromString('TSF1')().toFixed(12), legacySeed('TSF1')().toFixed(12))
  })
})

/** Verbatim port of the legacy function, as an independent oracle. */
function legacySeed(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

describe('loadDeal', () => {
  it('asks for a Deal ID when blank', () => {
    deepStrictEqual(loadDeal('   '), { ok: false, message: 'Please enter a Deal ID.' })
  })

  it('trims, upper-cases and copies directory legs', () => {
    const res = loadDeal('  tsf10078 ')
    ok(res.ok)
    strictEqual(res.dealId, 'TSF10078')
    strictEqual(res.legs.length, 3)
    const first = res.legs[0]
    ok(first)
    first.txnDesc = 'mutated'
    strictEqual(DEAL_DIRECTORY.TSF10078?.[0]?.txnDesc, 'Active')
  })

  it('builds the load texts', () => {
    strictEqual(loadToast(2, 'TSF10045'), '2 transaction(s) loaded for Deal TSF10045.')
    strictEqual(txnCount(1), '1 transaction')
    strictEqual(txnCount(0), '0 transactions')
  })
})

describe('kpis', () => {
  it('counts eligible forwards, pre-matured and unwound legs', () => {
    deepStrictEqual(kpis(legsOf('TSF10078')), { total: 3, eligible: 2, pm: 1, unw: 0 })
    deepStrictEqual(kpis(legsOf('TSF10112')), { total: 2, eligible: 0, pm: 0, unw: 1 })
    deepStrictEqual(kpis([]), { total: 0, eligible: 0, pm: 0, unw: 0 })
  })
})

describe('table', () => {
  const legs = legsOf('TSF10078')

  it('sorts by rfha ascending by default and flips on the same column', () => {
    deepStrictEqual(rfhas(filterSort(legs, '', DEFAULT_FILTERS, DEFAULT_SORT)), ['1000004609', '1000004610', '1000004611'])
    const desc = nextSort(DEFAULT_SORT, 'rfha')
    deepStrictEqual(desc, { field: 'rfha', dir: 'desc' })
    deepStrictEqual(rfhas(filterSort(legs, '', DEFAULT_FILTERS, desc)), ['1000004611', '1000004610', '1000004609'])
    deepStrictEqual(nextSort(desc, 'otot_rate'), { field: 'otot_rate', dir: 'asc' })
    deepStrictEqual(rfhas(filterSort(legs, '', DEFAULT_FILTERS, { field: 'otot_rate', dir: 'asc' })), [
      '1000004609',
      '1000004610',
      '1000004611',
    ])
    strictEqual(sortIndicator(DEFAULT_SORT, 'rfha'), '▲')
    strictEqual(sortIndicator(desc, 'rfha'), '▼')
    strictEqual(sortIndicator(desc, 'bukrs'), '')
  })

  it('searches rfha / partner / pair / company and filters by type and status', () => {
    deepStrictEqual(rfhas(filterSort(legs, '4611', DEFAULT_FILTERS, DEFAULT_SORT)), ['1000004611'])
    strictEqual(filterSort(legs, 'standard', DEFAULT_FILTERS, DEFAULT_SORT).length, 3)
    strictEqual(filterSort(legs, 'eur', DEFAULT_FILTERS, DEFAULT_SORT).length, 0)
    deepStrictEqual(rfhas(filterSort(legs, '', { type: '', status: 'Pre-Matured' }, DEFAULT_SORT)), ['1000004609'])
    strictEqual(filterSort(legs, '', { type: '605', status: '' }, DEFAULT_SORT).length, 0)
  })

  it('orders the type filter like the legacy Object.keys walk', () => {
    deepStrictEqual(
      TYPE_FILTER_OPTIONS.map((o) => o.value),
      ['605', '607', '608', '619', '631'],
    )
  })

  it('paginates and clamps the page to the last one', () => {
    const items = Array.from({ length: 12 }, (_, i) => i)
    deepStrictEqual(paginate(items, 2, 5), { page: 2, pageCount: 3, rows: [5, 6, 7, 8, 9] })
    deepStrictEqual(paginate(items, 9, 10), { page: 2, pageCount: 2, rows: [10, 11] })
    deepStrictEqual(paginate([], 1, 10), { page: 1, pageCount: 1, rows: [] })
  })

  it('toggles selection and maps statuses to classes', () => {
    strictEqual(toggleSelection(null, 'a'), 'a')
    strictEqual(toggleSelection('a', 'a'), null)
    strictEqual(toggleSelection('a', 'b'), 'b')
    strictEqual(statusTextClass('Rolled Over'), 'status-text-rolled')
    strictEqual(statusTextClass('whatever'), 'status-text-confirmed')
  })
})

describe('gating', () => {
  const l78 = legsOf('TSF10078')
  const l112 = legsOf('TSF10112')

  it('Early / Rollover need an un-matured Forward', () => {
    strictEqual(gateEarly(find(l78, '1000004610')), null)
    strictEqual(gateEarly(find(l78, '1000004609')), 'Premature Settlement Already Done..')
    strictEqual(gateEarly(find(l112, '1000004780')), 'Please select the FX txn to do a Early Delivery.')
    strictEqual(gateRollover(find(l78, '1000004609')), MSG.alreadyPm)
    strictEqual(gateRollover(find(l112, '1000004780')), MSG.notForward)
    strictEqual(gateRollover(find(l78, '1000004611')), null)
  })

  it('Unwind works on any leg not already unwound', () => {
    strictEqual(gateUnwind(find(l112, '1000004780')), null)
    strictEqual(gateUnwind(find(l112, '1000004781')), 'Unwinding Already Done..')
  })
})

describe('prefill', () => {
  const l = find(legsOf('TSF10045'), '1000004521')

  it('fills the cancellation side from the leg with sides swapped', () => {
    const f = pairFormFor(l)
    deepStrictEqual(f.newTxn, { type: '', tdate: null, vdate: null, bp: '2001', rate: '', buyAmt: '', sellAmt: '' })
    deepStrictEqual(f.cancel, {
      type: '',
      tdate: '2026-08-01',
      vdate: '2027-02-01',
      bp: '2001',
      rate: '89.6500',
      buyAmt: '89,650,000.00',
      sellAmt: '1,000,000.00',
    })
    deepStrictEqual(pairCurrencies(l), { newBuy: 'Buy USD', newSell: 'Sell INR', cancelBuy: 'Sell INR', cancelSell: 'Buy USD' })
  })

  it('fills the unwind form from the leg', () => {
    deepStrictEqual(unwindFormFor(l), {
      remark: '',
      tdate: '2026-08-01',
      vdate: '2027-02-01',
      bp: '2001',
      rate: '89.6500',
      buyAmt: '89,650,000.00',
      sellAmt: '1,000,000.00',
    })
  })
})

describe('validation', () => {
  it('checks new-booking then cancellation date order first', () => {
    const f = filledPair('2026-09-01', '2026-09-01')
    strictEqual(validateEarly({ ...f, newTxn: { ...f.newTxn, tdate: '2026-10-01' } }), MSG.newTradeAfterValue)
    strictEqual(validateEarly({ ...f, cancel: { ...f.cancel, tdate: '2026-10-01' } }), MSG.cancelTradeAfterValue)
    strictEqual(validateRollover({ ...f, cancel: { ...f.cancel, tdate: '2026-10-01' } }), MSG.cancelTradeAfterValue)
  })

  it('Early: cancellation value date may not be earlier than the new one', () => {
    strictEqual(validateEarly(filledPair('2026-12-01', '2026-11-01')), 'Cancellation Value Date cannot be earlier than the New Booking Value Date.')
    strictEqual(validateEarly(filledPair('2026-11-01', '2026-12-01')), null)
    strictEqual(validateEarly(filledPair('2026-11-01', '2026-11-01')), null)
  })

  it('Rollover: cancellation value date may not be later than the new one', () => {
    strictEqual(validateRollover(filledPair('2026-11-01', '2026-12-01')), 'Cancellation Value Date cannot be later than the New Booking Value Date.')
    strictEqual(validateRollover(filledPair('2026-12-01', '2026-11-01')), null)
    strictEqual(validateRollover(filledPair('2026-11-01', '2026-11-01')), null)
  })

  it('requires type, dates and rate on both sides (blank rate after trim counts as missing)', () => {
    const f = filledPair('2027-03-01', '2027-03-01')
    strictEqual(validateEarly({ ...f, newTxn: { ...f.newTxn, type: '' } }), MSG.mandatory)
    strictEqual(validateEarly({ ...f, cancel: { ...f.cancel, rate: '   ' } }), MSG.mandatory)
    strictEqual(validateRollover({ ...f, newTxn: { ...f.newTxn, vdate: null } }), MSG.mandatory)
    strictEqual(validateEarly({ ...f, newTxn: { ...f.newTxn, bp: '' } }), null) // Bank BP is optional here
  })

  it('Unwind checks mandatory fields before date order', () => {
    const u = unwindFormFor(find(legsOf('TSF10045'), '1000004521'))
    strictEqual(validateUnwind(u), null)
    strictEqual(validateUnwind({ ...u, bp: '' }), 'Please fill all mandatory fields.')
    strictEqual(validateUnwind({ ...u, rate: ' ' }), MSG.mandatory)
    strictEqual(validateUnwind({ ...u, tdate: '2027-03-01' }), 'Trade date is greater than the Value date.')
    strictEqual(validateUnwind({ ...u, tdate: '2027-03-01', rate: '' }), MSG.mandatory)
  })
})

describe('sap events', () => {
  const l = find(legsOf('TSF10045'), '1000004521')

  it('builds view_txn and wraps it as a sapevent href', () => {
    strictEqual(viewTxnEvent(l), 'view_txn?bukrs=IN11&rfha=1000004521')
    strictEqual(sapeventUrl(viewTxnEvent(l)), 'sapevent:view_txn?bukrs=IN11&rfha=1000004521')
  })

  it('builds create_early_delivery / create_rollover with the legacy key order', () => {
    const f = { ...filledPair('2026-11-01', '2027-02-01'), remark: 'a&b c' }
    const tail =
      '?bukrs=IN11&rfha=1000004521&newTxnType=FWD&newTradeDate=2026-08-01&newValueDate=2026-11-01&newBp=2001&newRate=89.7' +
      '&newBuyAmt=&newSellAmt=&cancelTxnType=SPOT&cancelTradeDate=2026-08-01&cancelValueDate=2027-02-01&cancelBp=2001' +
      '&cancelRate=89.6500&remarks=a%26b%20c'
    strictEqual(earlyEvent(l, f), `create_early_delivery${tail}`)
    strictEqual(rolloverEvent(l, f), `create_rollover${tail}`)
  })

  it('builds create_unwinding', () => {
    strictEqual(
      unwindEvent(l, { ...unwindFormFor(l), rate: ' 89.7 ' }),
      'create_unwinding?bukrs=IN11&rfha=1000004521&tradeDate=2026-08-01&valueDate=2027-02-01&bp=2001&rate=89.7' +
        '&buyAmt=89%2C650%2C000.00&sellAmt=1%2C000%2C000.00&remarks=',
    )
  })
})

describe('state after submit', () => {
  const legs = legsOf('TSF10045')

  it('marks the leg and leaves the others untouched', () => {
    const e = find(applyEarly(legs, '1000004521'), '1000004521')
    strictEqual(e.ztsf_pre_mature, true)
    strictEqual(e.txnDesc, 'Pre-Matured')
    const u = find(applyUnwind(legs, '1000004521'), '1000004521')
    strictEqual(u.ztsf_unwind, true)
    strictEqual(u.txnDesc, 'Unwound')
    const r = find(applyRollover(legs, '1000004521'), '1000004521')
    strictEqual(r.zroll, 'R1-D1')
    strictEqual(r.txnDesc, 'Rolled Over')
    strictEqual(r.ztsf_pre_mature, false)
    deepStrictEqual(find(applyEarly(legs, '1000004521'), '1000004522'), find(legs, '1000004522'))
    strictEqual(find(legs, '1000004521').txnDesc, 'Active')
  })
})
