import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS_COMPACT, COLUMNS_DEFAULT, seedContracts } from './data.ts'
import { formatAmount, parseDMY } from './format.ts'
import {
  BLANK_CRITERIA,
  BLANK_CRITERIA_FORM,
  DEFAULT_SORT,
  NO_FILTERS,
  activeFilterCount,
  applyCriteria,
  buildFilterOptions,
  currentColumns,
  filterDropdownOptions,
  filterSortRows,
  getCriteriaRows,
  getRejectableContracts,
  nextSort,
  pageWindow,
  rejectConfirmText,
  rejectMasterContracts,
  rejectToastText,
  setPageSelection,
  toggleSelection,
  validateCriteria,
} from './logic.ts'
import type { Criteria, MasterContract } from './types.ts'

const range = (from: string, to: string, extra: Partial<Criteria> = {}): Criteria => ({
  ...BLANK_CRITERIA,
  mcDateFrom: parseDMY(from),
  mcDateTo: parseDMY(to),
  ...extra,
})

const find = (list: MasterContract[], mc: string) => list.find((c) => c.mcNumber === mc)!

describe('parseDMY / formatAmount', () => {
  it('rejects impossible dates and keeps the original leniency', () => {
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026/02/01'), null)
    strictEqual(parseDMY('1-8-2026')?.getMonth(), 7)
  })

  it('formats amounts with two decimals and blanks non-numbers', () => {
    strictEqual(formatAmount(421528.93), '421,528.93')
    strictEqual(formatAmount(0), '0.00')
    strictEqual(formatAmount(Number.NaN), '')
  })
})

describe('validateCriteria', () => {
  it('needs both dates', () => {
    const r = validateCriteria('01-01-2026', '')
    strictEqual(r.ok, false)
    if (!r.ok) {
      deepStrictEqual([r.error.from, r.error.to], [false, true])
      strictEqual(r.error.message, 'Please enter a valid Master Contract Date From and To (DD-MM-YYYY).')
    }
  })

  it('rejects From after To and flags both fields', () => {
    const r = validateCriteria('02-01-2026', '01-01-2026')
    strictEqual(r.ok, false)
    if (!r.ok) deepStrictEqual(r.error, { from: true, to: true, message: 'Master Contract Date — From must be on or before the To date.' })
  })

  it('accepts a same-day range', () => {
    strictEqual(validateCriteria(' 04-08-2026 ', '04-08-2026').ok, true)
  })
})

describe('applyCriteria', () => {
  it('keeps known codes case-insensitively and blanks unknown ones', () => {
    const from = parseDMY('01-01-2026')!
    const to = parseDMY('31-12-2026')!
    const { criteria, form } = applyCriteria(
      { ...BLANK_CRITERIA_FORM, originEntity: 'osipl', fxModel: 'M999', mcFrom: ' 2000002700 ', layout: 'compact' },
      from,
      to,
    )
    strictEqual(criteria.originEntity, 'OSIPL')
    strictEqual(criteria.fxModel, '')
    strictEqual(criteria.mcFrom, '2000002700')
    strictEqual(criteria.layout, 'compact')
    strictEqual(form.originEntity, 'osipl')
    strictEqual(form.fxModel, '')
  })
})

describe('getCriteriaRows', () => {
  const all = seedContracts()

  it('selects nothing without both dates', () => {
    deepStrictEqual(getCriteriaRows(all, BLANK_CRITERIA), [])
  })

  it('includes both ends of the MC date range', () => {
    const rows = getCriteriaRows(all, range('04-08-2026', '04-08-2026'))
    strictEqual(rows.length > 0, true)
    strictEqual(rows.every((r) => r.mcDate === '04-08-2026'), true)
    strictEqual(rows.some((r) => r.mcNumber === '2000002715'), true)
  })

  it('applies the MC number range and the optional selections', () => {
    const rows = getCriteriaRows(
      all,
      range('01-01-2000', '31-12-2099', { mcFrom: '2000002705', mcTo: '2000002715', originEntity: 'OTL', mcStatus: 'In Use' }),
    )
    strictEqual(rows.length > 0, true)
    for (const r of rows) {
      strictEqual(Number(r.mcNumber) >= 2000002705 && Number(r.mcNumber) <= 2000002715, true)
      strictEqual(r.originEntity, 'OTL')
      strictEqual(r.status, 'In Use')
    }
  })
})

describe('filterSortRows', () => {
  const all = seedContracts()

  it('sorts by MC number ascending by default', () => {
    const list = filterSortRows(all, NO_FILTERS, '', DEFAULT_SORT)
    const numbers = list.map((r) => r.mcNumber)
    deepStrictEqual(numbers, [...numbers].sort())
  })

  it('sorts DD-MM-YYYY dates chronologically, not as text', () => {
    const list = filterSortRows(all, NO_FILTERS, '', { field: 'mcDate', dir: 'asc' })
    const times = list.map((r) => parseDMY(r.mcDate)!.getTime())
    deepStrictEqual(times, [...times].sort((a, b) => a - b))
  })

  it('sorts amounts numerically', () => {
    const list = filterSortRows(all, NO_FILTERS, '', { field: 'mcAmountUSD', dir: 'desc' })
    strictEqual(list[0]!.mcAmountUSD >= list[list.length - 1]!.mcAmountUSD, true)
    strictEqual(list[0]!.mcAmountUSD, Math.max(...all.map((r) => r.mcAmountUSD)))
  })

  it('matches a business partner filter on either D1 or D2 and combines with search', () => {
    const list = filterSortRows(all, { ...NO_FILTERS, businessPartner: 'HSBC BANK PLC' }, 'sesame', DEFAULT_SORT)
    strictEqual(list.some((r) => r.mcNumber === '2000002715'), true)
    for (const r of list) {
      strictEqual(r.businessPartnerD1 === 'HSBC BANK PLC' || r.businessPartnerD2 === 'HSBC BANK PLC', true)
    }
  })

  it('counts active filters and flips sort direction on the same column', () => {
    strictEqual(activeFilterCount({ ...NO_FILTERS, fxModel: 'M036', commodity: 'RICE' }), 2)
    deepStrictEqual(nextSort(DEFAULT_SORT, 'mcNumber'), { field: 'mcNumber', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'mcNumber', dir: 'desc' }, 'status'), { field: 'status', dir: 'asc' })
  })
})

describe('buildFilterOptions', () => {
  it('offers sorted distinct values, pooling both business partner columns', () => {
    const rows = seedContracts().slice(0, 2)
    const opts = buildFilterOptions(rows)
    deepStrictEqual(opts.originEntity, ['OSIPL', 'OTL'])
    deepStrictEqual(opts.businessPartner, [
      'AUSTRALIA AND NEW ZEALAND BANKING',
      'BARCLAYS BANK PLC',
      'HSBC BANK PLC',
      'STANDARD CHARTERED BANK',
    ])
  })
})

describe('layout, pagination and dropdowns', () => {
  it('picks the compact column set', () => {
    strictEqual(currentColumns('default'), COLUMNS_DEFAULT)
    deepStrictEqual(currentColumns('compact'), COLUMNS_COMPACT)
    strictEqual(COLUMNS_COMPACT.length, 11)
  })

  it('shows at most six page buttons around the current page', () => {
    deepStrictEqual(pageWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pageWindow(5, 10), [3, 4, 5, 6, 7, 8])
    deepStrictEqual(pageWindow(10, 10), [5, 6, 7, 8, 9, 10])
  })

  it('filters dropdown options on code or description', () => {
    const opts = [
      { value: 'M036', code: 'M036', sub: 'USD-INR-Put & Call Option' },
      { value: 'M038', code: 'M038', sub: 'THB Forward' },
    ]
    deepStrictEqual(filterDropdownOptions(opts, 'thb').map((o) => o.code), ['M038'])
    strictEqual(filterDropdownOptions(opts, '').length, 2)
  })
})

describe('selection and rejection', () => {
  const all = seedContracts()
  const rejected = all.find((c) => c.status === 'Rejected')!
  const open = all.find((c) => c.status !== 'Rejected')!

  it('never lets a rejected contract into the selection', () => {
    strictEqual(toggleSelection(new Set(), rejected).size, 0)
    const once = toggleSelection(new Set(), open)
    strictEqual(once.has(open.mcNumber), true)
    strictEqual(toggleSelection(once, open).size, 0)
  })

  it('header checkbox selects and clears only rejectable rows on the page', () => {
    const page = [rejected, open]
    const on = setPageSelection(new Set(['other']), page, true)
    deepStrictEqual([...on].sort(), ['other', open.mcNumber].sort())
    deepStrictEqual([...setPageSelection(on, page, false)], ['other'])
  })

  it('moves the listed contracts to Rejected without touching the rest', () => {
    const after = rejectMasterContracts(all, [open.mcNumber])
    strictEqual(find(after, open.mcNumber).status, 'Rejected')
    strictEqual(find(all, open.mcNumber).status, open.status)
    strictEqual(getRejectableContracts(after).length, getRejectableContracts(all).length - 1)
  })

  it('words the confirmation and toast for one or many', () => {
    deepStrictEqual(rejectConfirmText(['2000002715']), {
      heading: 'Reject selected Master Contract?',
      subtext: 'Master Contract 2000002715 will be rejected.',
    })
    strictEqual(rejectConfirmText(['a', 'b']).subtext, '2 Master Contracts are selected for rejection.')
    strictEqual(rejectToastText(['2000002715']), 'Master Contract 2000002715 rejected successfully.')
    strictEqual(rejectToastText(['a', 'b', 'c']), '3 Master Contracts rejected successfully.')
  })
})
