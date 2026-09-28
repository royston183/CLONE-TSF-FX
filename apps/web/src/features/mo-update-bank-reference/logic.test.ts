import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FX_COLUMNS, OP_COLUMNS } from './data.ts'
import { fmtNum, parseDMY } from './format.ts'
import {
  DEFAULT_SORT,
  EMPTY_COL_FILTERS,
  EMPTY_SELECTION,
  buildCsv,
  companiesInRange,
  csvFileName,
  filterSortRows,
  generateDeals,
  hashCode,
  isValid,
  mulberry32,
  nextSort,
  pageCountOf,
  recordCountText,
  updateToastText,
  validateSelection,
} from './logic.ts'

describe('seeded generator', () => {
  it('hashCode and mulberry32 match the original', () => {
    strictEqual(hashCode(''), 0)
    strictEqual(hashCode('a'), 97)
    strictEqual(hashCode('abc'), 96354)
    const rng = mulberry32(1)
    const first = rng()
    strictEqual(first >= 0 && first < 1, true)
    strictEqual(mulberry32(1)(), first)
  })

  it('companiesInRange swaps a reversed range and needs a From', () => {
    deepStrictEqual(companiesInRange('', 'VN10'), [])
    deepStrictEqual(
      companiesInRange('SG10', 'ES12').map((c) => c.code),
      ['ES12', 'IN11', 'SG10'],
    )
    deepStrictEqual(
      companiesInRange('TH10', '').map((c) => c.code),
      ['TH10'],
    )
  })

  it('is deterministic for the same selection', () => {
    const a = generateDeals('FX', 'AE13', 'IN11', '2026-09-28', true)
    const b = generateDeals('FX', 'AE13', 'IN11', '2026-09-28', true)
    deepStrictEqual(a, b)
    strictEqual(a.length >= 6 && a.length <= 15, true)
    for (const r of a) {
      strictEqual(r.DELFZ, '28-09-2026')
      strictEqual(r.NORDEXT.startsWith(`EXT-${r.BUKRS}-`), true)
      strictEqual(r._checked, false)
      strictEqual(typeof r.SPOT, 'number')
      strictEqual(r.BS_2, r.BS_1 === 'Buy' ? 'Sell' : 'Buy')
    }
  })

  it('builds option rows without external reference when asked', () => {
    const rows = generateDeals('OP', 'US15', 'US15', '2026-09-28', false)
    strictEqual(rows.length > 0, true)
    for (const r of rows) {
      strictEqual(r.NORDEXT, '')
      strictEqual(r.SPOT, undefined)
      strictEqual(typeof r.STRIKE_RATE, 'number')
      strictEqual(r.OPTION_TYPE, r.XTEXT)
    }
  })

  it('returns nothing without a key date', () => {
    deepStrictEqual(generateDeals('FX', 'AE13', 'AE13', '', true), [])
  })
})

describe('validation', () => {
  it('requires Company Code (From) and a valid Key Date', () => {
    deepStrictEqual(validateSelection(EMPTY_SELECTION), { coFrom: true, keyDate: true })
    const ok = validateSelection({ ...EMPTY_SELECTION, coFrom: 'AE13', keyDate: '28-09-2026' })
    strictEqual(isValid(ok), true)
    strictEqual(validateSelection({ ...EMPTY_SELECTION, coFrom: 'AE13', keyDate: '31-02-2026' }).keyDate, true)
    strictEqual(parseDMY('2026-09-28'), null)
  })
})

describe('table', () => {
  const rows = generateDeals('FX', 'AE13', 'VN10', '2026-09-28', true)

  it('filters by type, status, trader and search across visible columns', () => {
    const first = rows[0]
    if (!first) throw new Error('no rows')
    const byType = filterSortRows(rows, FX_COLUMNS, '', { ...EMPTY_COL_FILTERS, type: first.SFHAART }, DEFAULT_SORT)
    strictEqual(byType.every((r) => r.SFHAART === first.SFHAART), true)
    const byTrader = filterSortRows(rows, FX_COLUMNS, '', { ...EMPTY_COL_FILTERS, trader: first.RDEALER }, DEFAULT_SORT)
    strictEqual(byTrader.every((r) => r.RDEALER === first.RDEALER), true)
    const bySearch = filterSortRows(rows, FX_COLUMNS, first.RFHA.toLowerCase(), EMPTY_COL_FILTERS, DEFAULT_SORT)
    strictEqual(bySearch.some((r) => r._id === first._id), true)
    // Option-only fields are not searched on the Forex column set.
    strictEqual(filterSortRows(rows, OP_COLUMNS, 'zzz-none', EMPTY_COL_FILTERS, DEFAULT_SORT).length, 0)
  })

  it('sorts numbers numerically and text with localeCompare, both directions', () => {
    const asc = filterSortRows(rows, FX_COLUMNS, '', EMPTY_COL_FILTERS, { field: 'AMT1', dir: 'asc' })
    for (let i = 1; i < asc.length; i++) strictEqual((asc[i - 1]?.AMT1 ?? 0) <= (asc[i]?.AMT1 ?? 0), true)
    const desc = filterSortRows(rows, FX_COLUMNS, '', EMPTY_COL_FILTERS, { field: 'BUTXT', dir: 'desc' })
    for (let i = 1; i < desc.length; i++) strictEqual((desc[i - 1]?.BUTXT ?? '').localeCompare(desc[i]?.BUTXT ?? '') >= 0, true)
    deepStrictEqual(nextSort(DEFAULT_SORT, 'AMT1'), { field: 'AMT1', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'AMT1', dir: 'asc' }, 'AMT1'), { field: 'AMT1', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'AMT1', dir: 'desc' }, 'BUKRS'), { field: 'BUKRS', dir: 'asc' })
  })

  it('pages and counts like the original', () => {
    strictEqual(pageCountOf(0, 15), 1)
    strictEqual(pageCountOf(31, 15), 3)
    strictEqual(recordCountText(1), '1 record')
    strictEqual(recordCountText(0), '0 records')
  })
})

describe('text and CSV', () => {
  it('formats numbers with grouping', () => {
    strictEqual(fmtNum(1234567.891, 2), '1,234,567.89')
    strictEqual(fmtNum(-0.5, 4), '-0.5000')
    strictEqual(fmtNum(undefined), '')
  })

  it('words the update toast', () => {
    strictEqual(updateToastText(1), 'External Reference Updated Successfully (1 transaction)')
    strictEqual(updateToastText(3), 'External Reference Updated Successfully (3 transactions)')
  })

  it('builds the CSV with quoted cells and names the file', () => {
    const row = generateDeals('FX', 'ES12', 'ES12', '2026-09-28', true)[0]
    if (!row) throw new Error('no rows')
    const csv = buildCsv(FX_COLUMNS, [{ ...row, BUTXT: 'A, "B"' }])
    const [head, line] = csv.split('\n')
    strictEqual(head, FX_COLUMNS.map((c) => c.label).join(','))
    strictEqual(line?.includes('"A, ""B"""'), true)
    strictEqual(line?.startsWith(row.RFHA + ',ES12,'), true)
    strictEqual(csvFileName('FX', '2026-09-28'), 'external_deals_FX_2026-09-28.csv')
    strictEqual(csvFileName('OP', ''), 'external_deals_OP_export.csv')
  })
})
