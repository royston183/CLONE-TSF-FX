import { deepStrictEqual, notDeepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIXED_DEAL_IDS, RANDOM_DEAL_COUNT, STATUS, createRng, generateDeals } from './data.ts'
import { addDays, fmtAmount, fmtDate, fmtRate, parseDDMMYYYY } from './format.ts'
import {
  COMPANY_OPTIONS,
  EMPTY_FILTERS,
  EMPTY_SELECTION,
  TRADER_OPTIONS,
  applyDragRange,
  applySelection,
  calendarCells,
  companyCodesInRange,
  correctionMessage,
  dealCountLabel,
  dealSummary,
  dragModeFor,
  filterComboOptions,
  filterDeals,
  filterOptions,
  isBlotterDateValid,
  isCorrectionValid,
  markCorrectionRequired,
  matchReleaseDeals,
  matchReleaseMessage,
  nextSort,
  pageOf,
  pagerWindow,
  paginationInfo,
  rowClickSelection,
  selectedDeals,
  shiftMonth,
  sortDeals,
  statusClass,
} from './logic.ts'
import type { AppliedSelection, Deal, Sort } from './types.ts'

const FX: AppliedSelection = applySelection(EMPTY_SELECTION)
const OPTIONS: AppliedSelection = { ...FX, displayType: 'Options' }
const NO_SORT: Sort = { key: null, dir: 'asc' }
const ids = (list: readonly Deal[]) => list.map((d) => d.id)

/** A deal with every field defaulted, for hand-built filter and sort cases. */
function deal(patch: Partial<Deal>): Deal {
  return {
    id: '1',
    // Like the sample rows, whose id is their Deal ID, unless a case sets one.
    dealId: patch.dealId ?? patch.id ?? '1',
    dealType: 'FX',
    coCode: 'SG03',
    transaction: '6205000000001',
    partnerCode: '0660000645',
    partnerName: '0660000645 - DBS BANK LTD',
    txnTypeCode: '619',
    txnTypeDesc: '619 - Forward-TSF',
    tradeDate: new Date(2025, 0, 1),
    buySell1: 'Buy',
    currency1: 'USD',
    amount1: 100,
    buySell2: 'Sell',
    currency2: 'INR',
    amount2: -8000,
    fixingDate: new Date(2025, 3, 1),
    valueDate: new Date(2025, 3, 2),
    allInRate: 80,
    status: STATUS.UNMATCHED,
    txnStatus: '03',
    traderCode: 'C27',
    traderName: 'C27 - Akshay Mohnot',
    traderShort: 'Akshay M',
    groupDesc: '',
    companyName: '',
    profitCenterDesc: '',
    businessAreaDesc: '',
    accounting: '1000 - Trade',
    assignment: '',
    fixRefId: '',
    foRemark: '',
    moRemark: '',
    ...patch,
  }
}

describe('format', () => {
  it('formats amounts with grouping and a trailing minus, rates to six places', () => {
    strictEqual(fmtAmount(1234567.891), '1,234,567.89')
    strictEqual(fmtAmount(-5), '5.00-')
    strictEqual(fmtAmount(-1234.5), '1,234.50-')
    strictEqual(fmtAmount(0), '0.00')
    strictEqual(fmtRate(33.1), '33.100000')
  })

  it('formats and parses DD-MM-YYYY like the page', () => {
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05-01-2026')
    strictEqual(parseDDMMYYYY('05-01-2026')?.getTime(), new Date(2026, 0, 5).getTime())
    strictEqual(parseDDMMYYYY(' 05-01-2026 ')?.getDate(), 5)
    strictEqual(parseDDMMYYYY('5-1-2026'), null)
    strictEqual(parseDDMMYYYY('2026-01-05'), null)
    strictEqual(parseDDMMYYYY(''), null)
    // The Date constructor rolls an impossible day over, as the original accepted it.
    strictEqual(fmtDate(parseDDMMYYYY('31-02-2026') ?? new Date(0)), '03-03-2026')
    strictEqual(fmtDate(addDays(new Date(2026, 0, 30), 3)), '02-02-2026')
  })

  it('requires a readable Upto Blotter Date', () => {
    strictEqual(isBlotterDateValid(''), false)
    strictEqual(isBlotterDateValid('26/09/2026'), false)
    strictEqual(isBlotterDateValid('26-09-2026'), true)
  })
})

describe('generateDeals', () => {
  const deals = generateDeals()

  it('is deterministic for a seed, and a different seed gives different rows', () => {
    deepStrictEqual(generateDeals(), deals)
    notDeepStrictEqual(ids(generateDeals(7)), ids(deals))
    const a = createRng(1)
    const b = createRng(1)
    for (let i = 0; i < 5; i++) {
      const v = a()
      strictEqual(v, b())
      ok(v >= 0 && v < 1)
    }
  })

  it('has the 17 fixed deal IDs then 38 random ones, every fifth fixed ID an Option', () => {
    strictEqual(deals.length, FIXED_DEAL_IDS.length + RANDOM_DEAL_COUNT)
    deepStrictEqual(ids(deals.slice(0, 17)), FIXED_DEAL_IDS)
    deals.slice(0, 17).forEach((d, i) => strictEqual(d.dealType, i % 5 === 0 ? 'Options' : 'FX'))
    for (const d of deals.slice(17)) ok(/^11\d{8}$/.test(d.id))
    deepStrictEqual(
      deals.slice(0, 3).map((d) => d.transaction),
      ['6205000000001', '6205000000002', '6205000000003'],
    )
  })

  it('builds each deal as the page did', () => {
    for (const d of deals) {
      ok(d.status === STATUS.UNMATCHED || d.status === STATUS.CORRECTION, 'new deals start in the open queue')
      strictEqual(d.moRemark !== '', d.status === STATUS.CORRECTION)
      if (d.dealType === 'Options') strictEqual(d.txnTypeCode, '604')
      else ok(d.txnTypeCode !== '604')
      strictEqual(d.buySell2, d.buySell1 === 'Buy' ? 'Sell' : 'Buy')
      strictEqual(d.amount1 < 0, d.buySell1 === 'Sell')
      strictEqual(d.amount2 < 0, d.buySell2 === 'Sell')
      ok(Math.abs(Math.abs(d.amount2) - Math.abs(d.amount1) * d.allInRate) < 1e-6)
      ok(d.fixingDate > d.tradeDate)
      ok(d.valueDate >= d.fixingDate)
      ok(d.assignment === '' || d.assignment === 'FXALL')
      ok(d.partnerName.startsWith(`${d.partnerCode} - `))
    }
    ok(deals.some((d) => d.status === STATUS.CORRECTION))
    ok(deals.some((d) => d.dealType === 'Options'))
  })
})

describe('selection screen', () => {
  it('filters combobox options on their code and name, case-insensitively', () => {
    deepStrictEqual(
      filterComboOptions(COMPANY_OPTIONS, 'india').map((o) => o.code),
      ['AE11'],
    )
    strictEqual(filterComboOptions(COMPANY_OPTIONS, '').length, 3)
    deepStrictEqual(
      filterComboOptions(TRADER_OPTIONS, 'c2').map((o) => o.display),
      ['C27 - Akshay Mohnot', 'C28 - Nidhi Singh'],
    )
    strictEqual(filterComboOptions(TRADER_OPTIONS, 'zzz').length, 0)
  })

  it('takes a company code range in code order', () => {
    deepStrictEqual(companyCodesInRange('AE11', 'AE13'), ['AE13', 'AE11'])
    deepStrictEqual(companyCodesInRange('AE11', 'SG03'), ['SG03', 'AE13', 'AE11'])
    deepStrictEqual(companyCodesInRange('SG03', 'AE11'), [])
  })
})

describe('filterDeals', () => {
  const list = [
    deal({ id: 'a', coCode: 'SG03', traderCode: 'C27' }),
    deal({ id: 'b', coCode: 'AE13', traderCode: 'C33', currency1: 'SGD', currency2: 'USD' }),
    deal({ id: 'c', coCode: 'AE11', status: STATUS.CORRECTION, txnTypeCode: '631', partnerCode: '0660000806' }),
    deal({ id: 'd', dealType: 'Options', txnTypeCode: '604' }),
    deal({ id: 'e', status: STATUS.MATCHED }),
  ]

  it('shows only the chosen display type and never a Matched & Released deal', () => {
    deepStrictEqual(ids(filterDeals(list, FX, EMPTY_FILTERS, '', NO_SORT)), ['a', 'b', 'c'])
    deepStrictEqual(ids(filterDeals(list, OPTIONS, EMPTY_FILTERS, '', NO_SORT)), ['d'])
  })

  it('applies the company code (single or range) and trader criteria', () => {
    deepStrictEqual(ids(filterDeals(list, { ...FX, companyCode: 'AE13' }, EMPTY_FILTERS, '', NO_SORT)), ['b'])
    deepStrictEqual(ids(filterDeals(list, { ...FX, companyCode: 'AE11', companyCodeTo: 'AE13' }, EMPTY_FILTERS, '', NO_SORT)), ['b', 'c'])
    // A To without a From is ignored.
    deepStrictEqual(ids(filterDeals(list, { ...FX, companyCodeTo: 'AE11' }, EMPTY_FILTERS, '', NO_SORT)), ['a', 'b', 'c'])
    deepStrictEqual(ids(filterDeals(list, { ...FX, trader: 'C33' }, EMPTY_FILTERS, '', NO_SORT)), ['b'])
  })

  it('applies every filter-panel dropdown', () => {
    const run = (patch: Partial<typeof EMPTY_FILTERS>) => ids(filterDeals(list, FX, { ...EMPTY_FILTERS, ...patch }, '', NO_SORT))
    deepStrictEqual(run({ coCode: 'SG03' }), ['a'])
    deepStrictEqual(run({ txnType: '631' }), ['c'])
    deepStrictEqual(run({ partner: '0660000806' }), ['c'])
    deepStrictEqual(run({ trader: 'C27' }), ['a', 'c'])
    deepStrictEqual(run({ ccy1: 'SGD' }), ['b'])
    deepStrictEqual(run({ ccy2: 'INR' }), ['a', 'c'])
    deepStrictEqual(run({ status: STATUS.CORRECTION }), ['c'])
  })

  it('searches ID, transaction, partner, trader, status, company code and type', () => {
    const run = (q: string) => ids(filterDeals(list, FX, EMPTY_FILTERS, q, NO_SORT))
    deepStrictEqual(run('correction'), ['c'])
    deepStrictEqual(run('ae1'), ['b', 'c'])
    deepStrictEqual(run('POOJA'), [])
    deepStrictEqual(run('forward-tsf'), ['a', 'b', 'c'])
    deepStrictEqual(run('b'), ['a', 'b', 'c']) // "DBS BANK" is in every partner name
  })

  it('sorts strings case-insensitively, dates by time and amounts numerically', () => {
    const rows = [
      deal({ id: 'x', partnerName: 'beta', tradeDate: new Date(2025, 5, 1), amount1: -50 }),
      deal({ id: 'y', partnerName: 'Alpha', tradeDate: new Date(2024, 0, 1), amount1: 10 }),
      deal({ id: 'z', partnerName: 'gamma', tradeDate: new Date(2026, 0, 1), amount1: 5 }),
    ]
    deepStrictEqual(ids(sortDeals(rows, { key: 'partnerName', dir: 'asc' })), ['y', 'x', 'z'])
    deepStrictEqual(ids(sortDeals(rows, { key: 'tradeDate', dir: 'desc' })), ['z', 'x', 'y'])
    deepStrictEqual(ids(sortDeals(rows, { key: 'amount1', dir: 'asc' })), ['x', 'z', 'y'])
    deepStrictEqual(ids(sortDeals(rows, NO_SORT)), ['x', 'y', 'z'])
  })

  it('flips the direction on the same header and starts a new one ascending', () => {
    deepStrictEqual(nextSort(NO_SORT, 'dealId'), { key: 'dealId', dir: 'asc' })
    deepStrictEqual(nextSort({ key: 'dealId', dir: 'asc' }, 'dealId'), { key: 'dealId', dir: 'desc' })
    deepStrictEqual(nextSort({ key: 'dealId', dir: 'desc' }, 'dealId'), { key: 'dealId', dir: 'asc' })
    deepStrictEqual(nextSort({ key: 'dealId', dir: 'desc' }, 'coCode'), { key: 'coCode', dir: 'asc' })
  })

  it('offers currencies from all deals and every status but Matched & Released', () => {
    const opts = filterOptions(list)
    deepStrictEqual(
      opts.ccy1.map((o) => o.value),
      ['INR', 'SGD', 'USD'],
    )
    deepStrictEqual(
      opts.status.map((o) => o.value),
      [STATUS.UNMATCHED, STATUS.CORRECTION, STATUS.CORRECTED],
    )
    strictEqual(opts.txnType[0]?.label, '619 - Forward-TSF')
    strictEqual(opts.partner[0]?.label, '0660000645 - DBS BANK LTD')
  })

  it('labels the count and status like the page', () => {
    strictEqual(dealCountLabel(1), '1 deal')
    strictEqual(dealCountLabel(0), '0 deals')
    strictEqual(statusClass(STATUS.UNMATCHED), 'status-unmatched')
    strictEqual(statusClass(STATUS.CORRECTION), 'status-correction')
    strictEqual(statusClass(STATUS.MATCHED), 'status-matched')
  })
})

describe('paging', () => {
  const list = Array.from({ length: 45 }, (_, i) => i)

  it('slices the page and clamps one past the end', () => {
    const p = pageOf(list, 3, 20)
    deepStrictEqual(p.rows, [40, 41, 42, 43, 44])
    strictEqual(p.totalPages, 3)
    strictEqual(pageOf(list, 9, 20).page, 3)
    strictEqual(pageOf([], 1, 20).totalPages, 1)
  })

  it('describes the rows shown', () => {
    strictEqual(paginationInfo(0, 0, 0), 'Showing 0-0 of 0 deals')
    strictEqual(paginationInfo(45, 40, 5), 'Showing 41-45 of 45 deals')
  })

  it('shows up to five page buttons around the current page', () => {
    deepStrictEqual(pagerWindow(1, 1), [1])
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3, 4, 5])
    deepStrictEqual(pagerWindow(6, 10), [4, 5, 6, 7, 8])
    deepStrictEqual(pagerWindow(10, 10), [6, 7, 8, 9, 10])
    deepStrictEqual(pagerWindow(2, 3), [1, 2, 3])
  })
})

describe('row selection', () => {
  const page = ['a', 'b', 'c', 'd', 'e']

  it('a row click selects only that row, or clears it when it was the only one', () => {
    deepStrictEqual([...rowClickSelection(new Set(['a', 'b']), 'c')], ['c'])
    deepStrictEqual([...rowClickSelection(new Set(['c']), 'c')], [])
    deepStrictEqual([...rowClickSelection(new Set(['c', 'd']), 'c')], ['c'])
  })

  it('a checkbox drag selects or clears the swept range, never un-sweeping', () => {
    strictEqual(dragModeFor(new Set(), 'b'), 'select')
    strictEqual(dragModeFor(new Set(['b']), 'b'), 'deselect')

    // A plain click is the one-row range: a toggle.
    deepStrictEqual([...applyDragRange(new Set(), page, 1, 1, 'select')], ['b'])
    deepStrictEqual([...applyDragRange(new Set(['b']), page, 1, 1, 'deselect')], [])

    let s = applyDragRange(new Set(['e']), page, 1, 1, 'select')
    s = applyDragRange(s, page, 1, 3, 'select')
    s = applyDragRange(s, page, 1, 2, 'select') // back toward the anchor keeps d
    deepStrictEqual([...s].sort(), ['b', 'c', 'd', 'e'])
    deepStrictEqual([...applyDragRange(s, page, 3, 0, 'deselect')].sort(), ['e'])
    // Upward drags and indices off the page are handled.
    deepStrictEqual([...applyDragRange(new Set(), page, 4, 3, 'select')].sort(), ['d', 'e'])
    deepStrictEqual([...applyDragRange(new Set(), page, 4, 9, 'select')], ['e'])
  })
})

describe('match & release / correction', () => {
  const list = [deal({ id: 'a', transaction: 'T1' }), deal({ id: 'b', transaction: 'T2', partnerName: 'P2' }), deal({ id: 'c' })]

  it('summarises one deal or several', () => {
    deepStrictEqual(dealSummary([list[1] as Deal]), { dealId: 'b', partner: 'P2', coverNo: 'T2' })
    deepStrictEqual(dealSummary(list.slice(0, 2)), { dealId: '2 deals selected', partner: 'a, b', coverNo: '2 deals selected' })
  })

  it('picks the selected deals in list order, including ones not on screen', () => {
    deepStrictEqual(ids(selectedDeals(list, new Set(['c', 'a']))), ['a', 'c'])
  })

  it('releases the selected deals with the MO remark, so they leave the queue', () => {
    const out = matchReleaseDeals(list, new Set(['a', 'c']), 'ok ')
    deepStrictEqual(
      out.map((d) => [d.id, d.status, d.moRemark]),
      [
        ['a', STATUS.MATCHED, 'ok '],
        ['b', STATUS.UNMATCHED, ''],
        ['c', STATUS.MATCHED, 'ok '],
      ],
    )
    deepStrictEqual(ids(filterDeals(out, FX, EMPTY_FILTERS, '', NO_SORT)), ['b'])
    strictEqual(list[0]?.status, STATUS.UNMATCHED, 'the input list is not mutated')
  })

  it('requires a remark to send deals back, and stores it trimmed', () => {
    strictEqual(isCorrectionValid('   '), false)
    strictEqual(isCorrectionValid(' x '), true)
    const out = markCorrectionRequired(list, new Set(['b']), '  Wrong value date ')
    strictEqual(out[1]?.status, STATUS.CORRECTION)
    strictEqual(out[1]?.moRemark, 'Wrong value date')
    strictEqual(out[0], list[0])
  })

  it('updates every deal carrying a selected ID (the seed repeats 1100000916)', () => {
    const seeded = generateDeals()
    const out = matchReleaseDeals(seeded, new Set(['1100000916']), '')
    strictEqual(out.filter((d) => d.id === '1100000916' && d.status === STATUS.MATCHED).length, 2)
  })

  it('words the toasts like the page', () => {
    strictEqual(matchReleaseMessage(list.slice(0, 1)), 'Deal a matched and released successfully.')
    strictEqual(matchReleaseMessage(list), '3 deals matched and released successfully.')
    strictEqual(correctionMessage(list.slice(0, 1)), 'Deal a was sent back to FO for correction.')
    strictEqual(correctionMessage(list.slice(0, 2)), '2 deals were sent back to FO for correction.')
  })
})

describe('calendar', () => {
  it('lays out the month with muted neighbours, today and the selected day', () => {
    // September 2026 starts on a Tuesday and has 30 days.
    const cells = calendarCells(2026, 8, new Date(2026, 8, 26), new Date(2026, 8, 26))
    strictEqual(cells.length % 7, 0)
    deepStrictEqual(
      cells.slice(0, 3).map((c) => [c.day, c.muted]),
      [
        [30, true],
        [31, true],
        [1, false],
      ],
    )
    const day26 = cells.find((c) => !c.muted && c.day === 26)
    deepStrictEqual(day26, { day: 26, muted: false, today: true, selected: true })
    strictEqual(cells.filter((c) => !c.muted).length, 30)
    deepStrictEqual(
      cells.slice(-3).map((c) => [c.day, c.muted]),
      [
        [1, true],
        [2, true],
        [3, true],
      ],
    )
  })

  it('moves by month across year ends', () => {
    deepStrictEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 })
    deepStrictEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 })
  })
})
