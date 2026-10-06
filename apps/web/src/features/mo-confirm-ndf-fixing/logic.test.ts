import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STATUS, STATUSES } from './data.ts'
import { COMPANY_CODES, FIXING_DATE_POOL, createNdfDataset, createRng, ensureDataForCriteria } from './fixtures.ts'
import { formatAmount, formatDMY, parseDMY } from './format.ts'
import {
  EMPTY_FILTERS,
  applyFilterPanel,
  computeResults,
  countActiveFilters,
  filterByCriteria,
  filterDropdownItems,
  isValidDMY,
  filterPanelOptions,
  nextSort,
  pageOf,
  pagerWindow,
  parseAmountInput,
  resultsMeta,
  searchDeals,
  sortDeals,
  statusClass,
  validateSelection,
} from './logic.ts'
import type { NdfDeal, Selection } from './types.ts'

const SEL: Selection = { companyCode: 'SG03', companyCodeTo: '', fixingDate: '28-09-2027', ndfValue: '', trader: '' }
const ids = (list: NdfDeal[]) => list.map((d) => d.id)
const find = (list: NdfDeal[], id: string) => {
  const d = list.find((x) => x.id === id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}

describe('format', () => {
  it('formats amounts and dates like the page', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatAmount(5), '5.00')
    strictEqual(formatDMY(new Date(2027, 8, 5)), '05-09-2027')
    strictEqual(parseDMY('28-09-2027').getTime(), new Date(2027, 8, 28).getTime())
  })
})

describe('inputs', () => {
  it('reads the K / M / CR NDF Value shorthand', () => {
    strictEqual(parseAmountInput('250k'), 250_000)
    strictEqual(parseAmountInput('1.5M'), 1_500_000)
    strictEqual(parseAmountInput('2cr'), 20_000_000)
    strictEqual(parseAmountInput(' 1,250.50 '), 1250.5)
    strictEqual(parseAmountInput('abc'), null)
    strictEqual(parseAmountInput(''), null)
  })

  it('accepts only real dd-mm-yyyy dates', () => {
    ok(isValidDMY('29-02-2028'))
    ok(!isValidDMY('29-02-2027'))
    ok(!isValidDMY('31-04-2027'))
    ok(!isValidDMY('1-09-2027'))
    ok(!isValidDMY('2027-09-01'))
    ok(!isValidDMY('01-13-2027'))
  })

  it('validates the Basic Selection with the page messages', () => {
    deepStrictEqual(validateSelection({ ...SEL, companyCode: ' ', fixingDate: '' }), {
      companyCode: 'Company Code is required.',
      fixingDate: 'Fixing Date is required.',
    })
    deepStrictEqual(validateSelection({ ...SEL, fixingDate: '31-02-2027' }), {
      companyCode: null,
      fixingDate: 'Enter a valid date as dd-mm-yyyy.',
    })
    deepStrictEqual(validateSelection({ ...SEL, fixingDate: ' 28-09-2027 ' }), { companyCode: null, fixingDate: null })
  })

  it('filters dropdown items on either line, ignoring case', () => {
    const items = [{ primary: 'C27 - Akshay Mohnot' }, { primary: 'SG03', secondary: 'Singapore' }]
    deepStrictEqual(filterDropdownItems(items, 'akshay'), [items[0]])
    deepStrictEqual(filterDropdownItems(items, 'singa'), [items[1]])
    strictEqual(filterDropdownItems(items, '  ').length, 2)
    strictEqual(filterDropdownItems(items, 'zzz').length, 0)
  })
})

describe('dummy data', () => {
  it('is deterministic and matches the legacy generator', () => {
    const a = createNdfDataset().deals
    const b = createNdfDataset().deals
    deepStrictEqual(a, b)
    strictEqual(a.length, COMPANY_CODES.length * FIXING_DATE_POOL.length * STATUSES.length + 15)
    const first = find(a, 'd0')
    strictEqual(first.transaction, '5000071657')
    strictEqual(first.dealId, '1197648300')
    strictEqual(first.amount1, 1108890)
    strictEqual(first.allInRate, 84.9036)
    strictEqual(first.tradeDate, '16-10-2026')
    strictEqual(first.traderCode, 'C28')
    strictEqual(find(a, 'd59').mcReference, '2000047942')
  })

  it('covers every company code, fixing date and status', () => {
    const { deals } = createNdfDataset()
    for (const cc of COMPANY_CODES)
      for (const fd of FIXING_DATE_POOL)
        for (const st of STATUSES) ok(deals.some((d) => d.coCode === cc && d.fixingDate === fd && d.txnStatus === st))
    ok(deals.filter((d) => d.txnStatus === STATUS.RELEASED).every((d) => d.externalRef.startsWith('EXT-')))
    ok(deals.filter((d) => d.txnStatus === STATUS.CORRECTION).every((d) => d.moRemark !== ''))
  })

  it('draws the xorshift sequence from a fresh seed per generator', () => {
    const r1 = createRng()
    const r2 = createRng()
    deepStrictEqual([r1.rnd(), r1.rnd(), r1.rnd()], [0.91523, 0.67078, 0.09366])
    strictEqual(r2.rnd(), 0.91523)
  })
})

describe('ensureDataForCriteria', () => {
  it('leaves the list alone when the combination already has deals', () => {
    const { deals, rng } = createNdfDataset()
    strictEqual(ensureDataForCriteria(deals, rng, 'sg03', '28-09-2027'), deals)
  })

  it('adds 3-5 deals cycling through the statuses for a new combination', () => {
    const { deals, rng } = createNdfDataset()
    const next = ensureDataForCriteria(deals, rng, ' in11 ', '01-01-2028')
    const added = next.slice(deals.length)
    ok(added.length >= 3 && added.length <= 5)
    ok(added.every((d) => d.coCode === 'IN11' && d.fixingDate === '01-01-2028'))
    deepStrictEqual(
      added.slice(0, 3).map((d) => d.txnStatus),
      STATUSES,
    )
    strictEqual(new Set(ids(next)).size, next.length)
    // Once topped up, the same combination is not topped up again.
    strictEqual(ensureDataForCriteria(next, rng, 'IN11', '01-01-2028'), next)
    // The same session produces the same top-up.
    const again = createNdfDataset()
    deepStrictEqual(ensureDataForCriteria(again.deals, again.rng, 'IN11', '01-01-2028'), next)
  })
})

describe('filterByCriteria', () => {
  const { deals } = createNdfDataset()

  it('matches one company code (any case) and the fixing date', () => {
    const rows = filterByCriteria(deals, { ...SEL, companyCode: 'sg03' })
    ok(rows.length >= 3)
    ok(rows.every((d) => d.coCode === 'SG03' && d.fixingDate === '28-09-2027'))
  })

  it('treats From / To as a text range', () => {
    const rows = filterByCriteria(deals, { ...SEL, companyCode: 'AE11', companyCodeTo: 'ae13', fixingDate: '' })
    deepStrictEqual([...new Set(rows.map((d) => d.coCode))].sort(), ['AE11', 'AE13'])
  })

  it('keeps NDF values within 15% of the entered amount', () => {
    const target = find(deals, 'd0').ndfValue
    const rows = filterByCriteria(deals, { ...SEL, fixingDate: '', ndfValue: formatAmount(target) })
    ok(rows.some((d) => d.id === 'd0'))
    ok(rows.every((d) => Math.abs(d.ndfValue - target) <= target * 0.15))
    // Unreadable text does not filter.
    strictEqual(filterByCriteria(deals, { ...SEL, ndfValue: 'abc' }).length, filterByCriteria(deals, SEL).length)
  })

  it('filters by trader code', () => {
    const rows = filterByCriteria(deals, { ...SEL, companyCode: '', fixingDate: '', trader: 'C27' })
    ok(rows.length > 0)
    ok(rows.every((d) => d.traderCode === 'C27'))
  })
})

describe('filter panel, search and sort', () => {
  const { deals } = createNdfDataset()

  it('applies every non-empty select and counts them', () => {
    const f = { ...EMPTY_FILTERS, status: STATUS.RELEASED, currency1: 'USD' }
    strictEqual(countActiveFilters(EMPTY_FILTERS), 0)
    strictEqual(countActiveFilters(f), 2)
    const rows = applyFilterPanel(deals, f)
    ok(rows.length > 0)
    ok(rows.every((d) => d.txnStatus === STATUS.RELEASED))
    strictEqual(applyFilterPanel(deals, EMPTY_FILTERS).length, deals.length)
  })

  it('searches the listed fields, ignoring case', () => {
    const d0 = find(deals, 'd0')
    deepStrictEqual(ids(searchDeals(deals, d0.dealId)), ['d0'])
    ok(searchDeals(deals, 'matched & RELEASED').every((d) => d.txnStatus === STATUS.RELEASED))
    strictEqual(searchDeals(deals, '   ').length, deals.length)
  })

  it('sorts numbers, dates and text', () => {
    const byAmt = sortDeals(deals, { field: 'amount1', dir: 'desc' })
    ok(byAmt.every((d, i) => i === 0 || (byAmt[i - 1]?.amount1 ?? 0) >= d.amount1))
    const byDate = sortDeals(deals, { field: 'tradeDate', dir: 'asc' })
    ok(byDate.every((d, i) => i === 0 || parseDMY(byDate[i - 1]?.tradeDate ?? '').getTime() <= parseDMY(d.tradeDate).getTime()))
    const byPartner = sortDeals(deals, { field: 'partnerName', dir: 'asc' })
    strictEqual(byPartner[0]?.partnerName, 'BARCLAYS BANK PLC')
    strictEqual(sortDeals(deals, { field: null, dir: 'asc' }), deals)
  })

  it('flips the same column and starts a new one ascending', () => {
    deepStrictEqual(nextSort({ field: null, dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'desc' }, 'trader'), { field: 'trader', dir: 'asc' })
  })
})

describe('paging', () => {
  const rows = createNdfDataset().deals

  it('slices the page and pulls a page past the end back', () => {
    const p = pageOf(rows, 2, 20)
    deepStrictEqual(ids(p.rows), ids(rows.slice(20, 40)))
    strictEqual(p.totalPages, 3)
    strictEqual(pageOf(rows, 9, 50).page, 2)
    strictEqual(resultsMeta(rows.length, p), 'Showing 21–40 of 60 deals')
    strictEqual(resultsMeta(rows.length, pageOf(rows, 2, 50)), 'Showing 51–60 of 60 deals')
    strictEqual(resultsMeta(0, null), 'Showing 0 of 0 deals')
  })

  it('shows up to five page buttons around the current page', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 9), [1, 2, 3, 4, 5])
    deepStrictEqual(pagerWindow(6, 9), [4, 5, 6, 7, 8])
    deepStrictEqual(pagerWindow(9, 9), [5, 6, 7, 8, 9])
  })
})

describe('actions', () => {
  it('classes each status text', () => {
    strictEqual(statusClass(STATUS.CORRECTION), 'status-correction')
    strictEqual(statusClass(STATUS.RELEASED), 'status-released')
    strictEqual(statusClass(STATUS.UNMATCHED), 'status-unmatched')
  })

  it('offers the filter panel the distinct values of the deals held, and the three statuses', () => {
    const { deals } = createNdfDataset()
    const opts = filterPanelOptions(deals)
    deepStrictEqual(opts.companyCode, [...COMPANY_CODES].sort())
    deepStrictEqual(opts.fixingDate, [...new Set(deals.map((d) => d.fixingDate))].sort())
    deepStrictEqual(opts.status, STATUSES)
    // No deals (the list is WAITING FOR API): every select but status offers only "All".
    const none = filterPanelOptions([])
    deepStrictEqual([none.companyCode, none.partner, none.trader, none.fixingDate], [[], [], [], []])
  })

  it('leaves actioned deals out of the results', () => {
    const { deals } = createNdfDataset()
    const all = computeResults(deals, SEL, new Set(), EMPTY_FILTERS, '', { field: null, dir: 'asc' })
    ok(all.some((d) => d.id === 'd0'))
    const without = computeResults(deals, SEL, new Set(['d0']), EMPTY_FILTERS, '', { field: null, dir: 'asc' })
    deepStrictEqual(ids(without), ids(all).filter((id) => id !== 'd0'))
  })
})
