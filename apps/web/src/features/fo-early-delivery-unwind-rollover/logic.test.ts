import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fmtAmt, formatDateDMY, isoOf } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  MSG,
  applyEarly,
  applyRollover,
  applyUnwind,
  earlyEvent,
  filterSort,
  gateEarly,
  gateRollover,
  gateUnwind,
  kpis,
  loadToast,
  nextSort,
  normalizeDealId,
  paginate,
  pairCurrencies,
  pairFormFor,
  rolloverEvent,
  sapeventUrl,
  sortIndicator,
  statusOptions,
  statusTextClass,
  toggleSelection,
  txnCount,
  typeFilterOptions,
  typeLabel,
  unwindEvent,
  unwindFormFor,
  validateEarly,
  validateRollover,
  validateUnwind,
  viewTxnEvent,
} from './logic.ts'
import type { Leg, PairForm } from './types.ts'

/*
 * Test fixtures: the legacy page's three sample deals, kept here so the rules stay pinned to
 * the same cases. The screen itself reads SAP (api.ts) and ships no sample legs.
 */
function leg(
  rfha: string, bukrs: string, butxt: string, sfhaart: string, xtext: string, dblfz: string, delfz: string,
  cpair: string, bs1: string, curr1: string, amt1: number, bs2: string, curr2: string, amt2: number, rate: number,
  kontrh: string, bpName: string, txnDesc: string, dealType: string, zroll: string, pm: boolean, unw: boolean,
): Leg {
  return {
    rfha, bukrs, butxt, sfhaart, xtext, dblfz, delfz, cpair, bs1, curr1, amt1, bs2, curr2, amt2,
    otot_rate: rate, kontrh, bpName, txnStatus: '03', txnDesc, dealType, zgrp: 'G02', zuonr: rfha, zroll,
    ztsf_pre_mature: pm, ztsf_unwind: unw,
  }
}

// prettier-ignore
const DEALS: Readonly<Record<string, readonly Leg[]>> = {
  TSF10045: [
    leg('1000004521','IN11','Olam Agri India Pvt Ltd','619','FWD','2026-08-01','2027-02-01','USD-INR','Buy','USD',1000000,'Sell','INR',89650000,89.65,'2001','HSBC Bank','Active','00','',false,false),
    leg('1000004522','IN11','Olam Agri India Pvt Ltd','605','SPOT','2026-08-01','2026-08-05','USD-INR','Sell','USD',250000,'Buy','INR',22400000,89.60,'2002','Citi Bank N.A.','Confirmed','00','',false,false),
  ],
  TSF10078: [
    leg('1000004610','TH10','Olam (Thailand) Ltd','619','FWD','2026-06-15','2026-12-15','USD-INR','Buy','USD',2000000,'Sell','INR',179400000,89.70,'2003','Standard Chartered Bank','Active','00','',false,false),
    leg('1000004611','TH10','Olam (Thailand) Ltd','619','FWD','2026-12-15','2027-06-15','USD-INR','Buy','USD',2000000,'Sell','INR',180200000,90.10,'2003','Standard Chartered Bank','Rolled Over','01','R1-D1',false,false),
    leg('1000004609','TH10','Olam (Thailand) Ltd','619','FWD','2026-01-15','2026-06-15','USD-INR','Buy','USD',2000000,'Sell','INR',178100000,89.05,'2003','Standard Chartered Bank','Pre-Matured','00','',true,false),
  ],
  TSF10112: [
    leg('1000004780','VN10','Olam Vietnam Limited','631','NDF','2026-09-01','2027-03-01','EUR-USD','Buy','EUR',500000,'Sell','USD',542500,1.0850,'2004','JPMorgan Chase Bank','Confirmed','00','',false,false),
    leg('1000004781','VN10','Olam Vietnam Limited','608','TOM','2026-09-25','2026-09-27','EUR-USD','Sell','EUR',120000,'Buy','USD',130200,1.0850,'2005','Deutsche Bank AG','Unwound','00','',false,true),
  ],
}

const legsOf = (id: string): Leg[] => (DEALS[id] ?? []).map((l) => ({ ...l }))
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

describe('deal id', () => {
  it('asks for a Deal ID when blank, else trims and upper-cases it', () => {
    deepStrictEqual(normalizeDealId('   '), { ok: false, message: 'Please enter a Deal ID.' })
    deepStrictEqual(normalizeDealId('  tsf10078 '), { ok: true, dealId: 'TSF10078' })
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

  it('builds the type and status filters from the loaded legs, labelled with their SAP text', () => {
    const all = [...legsOf('TSF10045'), ...legsOf('TSF10078'), ...legsOf('TSF10112')]
    deepStrictEqual(typeFilterOptions(all), [
      { value: '605', label: 'SPOT' },
      { value: '608', label: 'TOM' },
      { value: '619', label: 'FWD' },
      { value: '631', label: 'NDF' },
    ])
    deepStrictEqual(typeFilterOptions([]), [])
    deepStrictEqual(statusOptions(legs), ['Active', 'Pre-Matured', 'Rolled Over'])
    strictEqual(typeLabel({ ...find(legs, '1000004610'), xtext: '' }), '619')
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
