import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, defaultKeyDate, generateDeals, loadDeals } from './data.ts'
import { fmtAmount, fmtDate, fmtRate, parseDMY } from './format.ts'
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  EMPTY_QUICK_FILTERS,
  anyQuickFilter,
  applySort,
  buildCsv,
  exportToast,
  filterOptions,
  formatCell,
  getFilteredData,
  isActiveAsOfKeyDate,
  nextSort,
  pageInfo,
  pageWindow,
  recordCount,
  toggleId,
  totalPagesOf,
  visibleColumns,
} from './logic.ts'
import type { Column, Deal, ViewState } from './types.ts'

const deals = loadDeals()
const base: ViewState = {
  keyDate: defaultKeyDate(),
  filters: EMPTY_FILTERS,
  quickFilters: EMPTY_QUICK_FILTERS,
  search: '',
  sort: DEFAULT_SORT,
  layout: 'essential',
}
const col = (key: Column['key']): Column => {
  const c = COLUMNS.find((x) => x.key === key)
  if (!c) throw new Error(key)
  return c
}

describe('generated data', () => {
  it('is the legacy page’s 46 seeded deals, the same on every call', () => {
    strictEqual(deals.length, 46)
    deepStrictEqual(generateDeals(46), deals)
    const first = deals[0] as Deal
    strictEqual(first.zdeal_id, 'FXD1000001')
    strictEqual(first.zdeal_desc, 'USD-INR-Put & Call Option - OTL')
    strictEqual(first.zmc_ref, '2000027001')
    strictEqual(first.zdeal_stat, '02')
    strictEqual(fmtDate(first.zs_date), '15-07-2026')
    strictEqual(first.zpl, -137379)
    strictEqual(first.zpl_rate, 34.4605)
    strictEqual(first.zpl_lamt, -4734149.03)
    strictEqual(first.uti_amt, 4157972.22)
    strictEqual(first.zchanged_time, '08:06:27')
    const last = deals[45] as Deal
    strictEqual(last.zdeal_id, 'FXD1000046')
    strictEqual(fmtDate(last.zrev_dedate), '26-06-2027')
    strictEqual(last.zpl_lamt, 240310.07)
  })
})

describe('format', () => {
  it('parses strict DD-MM-YYYY only', () => {
    strictEqual(fmtDate(parseDMY('28-09-2026')), '28-09-2026')
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026-09-28'), null)
    strictEqual(parseDMY('8-9-2026'), null)
    strictEqual(parseDMY(''), null)
  })
  it('formats amounts and rates', () => {
    strictEqual(fmtAmount(-1234.5), '-1,234.50')
    strictEqual(fmtAmount(null), '')
    strictEqual(fmtRate(3.6), '3.6000')
  })
})

describe('key date rule (SUB_GET_DATA)', () => {
  const mk = (p: Partial<Deal>): Deal => ({ ...(deals[0] as Deal), ...p })
  const k = new Date(2026, 8, 28)
  it('needs a start on or before the key date', () => {
    strictEqual(isActiveAsOfKeyDate(mk({ zs_date: new Date(2026, 8, 29), ze_date: new Date(2027, 0, 1) }), k), false)
    strictEqual(isActiveAsOfKeyDate(mk({ zs_date: k, ze_date: k, zss: '' }), k), true)
  })
  it('uses the end date without short straddle, the ship end with it', () => {
    const ended = { zs_date: new Date(2026, 0, 1), ze_date: new Date(2026, 8, 27), zship_end: new Date(2026, 9, 5) }
    strictEqual(isActiveAsOfKeyDate(mk({ ...ended, zss: '' }), k), false)
    strictEqual(isActiveAsOfKeyDate(mk({ ...ended, zss: 'X' }), k), true)
    strictEqual(isActiveAsOfKeyDate(mk({ ...ended, zss: 'X', zship_end: new Date(2026, 8, 1) }), k), false)
  })
})

describe('getFilteredData', () => {
  it('shows 36 active deals by default, sorted by deal id', () => {
    const f = getFilteredData(deals, base)
    strictEqual(f.length, 36)
    strictEqual(f[0]?.zdeal_id, 'FXD1000001')
  })
  it('applies the quick filters', () => {
    const q = (p: Partial<ViewState['quickFilters']>) =>
      getFilteredData(deals, { ...base, quickFilters: { ...EMPTY_QUICK_FILTERS, ...p } })
    strictEqual(q({ straddleOnly: true }).length, 3)
    strictEqual(q({ confirmedOnly: true }).length, 17)
    strictEqual(q({ revisedOnly: true }).length, 9)
    strictEqual(anyQuickFilter(EMPTY_QUICK_FILTERS), false)
    strictEqual(anyQuickFilter({ ...EMPTY_QUICK_FILTERS, revisedOnly: true }), true)
  })
  it('applies the selection filters', () => {
    const emea = getFilteredData(deals, { ...base, filters: { ...EMPTY_FILTERS, region: ['EMEA'] } })
    strictEqual(emea.length, 12)
    strictEqual(emea.every((d) => d.zreg_id === 'EMEA'), true)
    const pending = getFilteredData(deals, { ...base, filters: { ...EMPTY_FILTERS, status: '01' } })
    strictEqual(pending.every((d) => d.zdeal_stat === '01'), true)
    strictEqual(pending.length, 36 - 17)
  })
  it('searches the formatted text of visible columns only', () => {
    strictEqual(getFilteredData(deals, { ...base, search: '  DMCC ' }).length, 12)
    // Sub Type 'FX1' is only visible in the All Columns layout.
    strictEqual(getFilteredData(deals, { ...base, search: 'fx1' }).length, 0)
    strictEqual(getFilteredData(deals, { ...base, search: 'fx1', layout: 'all' }).length, 36)
    // Status is searched by its description, flags by Yes/No.
    strictEqual(getFilteredData(deals, { ...base, search: 'pending conf' }).length, 19)
  })
})

describe('sorting', () => {
  it('sorts numbers numerically and flips on the same header', () => {
    const s = getFilteredData(deals, { ...base, sort: { key: 'zpl', dir: 'desc' } })
    strictEqual(s[0]?.zdeal_id, 'FXD1000004')
    strictEqual(s[0]?.zpl, 161757)
    deepStrictEqual(nextSort({ key: 'zpl', dir: 'desc' }, 'zpl'), { key: 'zpl', dir: 'asc' })
    deepStrictEqual(nextSort({ key: 'zpl', dir: 'desc' }, 'zamt'), { key: 'zamt', dir: 'asc' })
  })
  it('puts missing dates first ascending', () => {
    const s = applySort(deals, { key: 'zrev_dedate', dir: 'asc' })
    strictEqual(s[0]?.zrev_dedate, null)
    const dated = s.filter((d) => d.zrev_dedate)
    for (let i = 1; i < dated.length; i++)
      strictEqual((dated[i - 1]?.zrev_dedate?.getTime() ?? 0) <= (dated[i]?.zrev_dedate?.getTime() ?? 0), true)
  })
  it('sorts text case-insensitively', () => {
    const s = applySort(deals, { key: 'zdeal_id', dir: 'desc' })
    strictEqual(s[0]?.zdeal_id, 'FXD1000046')
  })
})

describe('cells, paging and export', () => {
  const d = deals[0] as Deal
  it('formats each column type', () => {
    strictEqual(formatCell(d, col('zconfirm')), 'Yes')
    strictEqual(formatCell(d, col('zss')), 'No')
    strictEqual(formatCell(d, col('zrev_dedate')), '–')
    strictEqual(formatCell(d, col('zdeal_stat')), 'Confirmed')
    strictEqual(formatCell(d, col('zamt')), '8,270,000.00')
    strictEqual(formatCell(d, col('zpl_rate')), '34.4605')
  })
  it('shows essential or all columns', () => {
    strictEqual(visibleColumns('essential').length, 14)
    strictEqual(visibleColumns('all').length, COLUMNS.length)
  })
  it('windows at most five page buttons', () => {
    deepStrictEqual(pageWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pageWindow(1, 8), [1, 2, 3, 4, 5])
    deepStrictEqual(pageWindow(6, 8), [4, 5, 6, 7, 8])
    deepStrictEqual(pageWindow(4, 8), [2, 3, 4, 5, 6])
    strictEqual(totalPagesOf(0, 15), 1)
    strictEqual(totalPagesOf(36, 15), 3)
    strictEqual(pageInfo(3, 15, 36), 'Showing 31–36 of 36')
    strictEqual(recordCount(1), '1 record')
    strictEqual(recordCount(36), '36 records')
  })
  it('builds the CSV as the original', () => {
    const csv = buildCsv(visibleColumns('essential'), [d])
    const [head, row] = csv.split('\r\n')
    strictEqual(head?.startsWith('"Deal ID","Type","Deal ID Description"'), true)
    strictEqual(
      row,
      '"FXD1000001","OPTION","USD-INR-Put & Call Option - OTL","Confirmed","Yes","15-07-2026","01-02-2027","2000027001","8,270,000.00","M036","OTL","APAC","4,157,972.22","-137,379.00"',
    )
    strictEqual(buildCsv([col('zdeal_desc')], [{ ...d, zdeal_desc: 'a "b"' }]).split('\r\n')[1], '"a ""b"""')
    strictEqual(exportToast(1), '1 record exported to CSV.')
    strictEqual(exportToast(0), '0 records exported to CSV.')
  })
  it('filters and toggles multiselect options', () => {
    const opts = [
      { id: 'APAC', label: 'Asia Pacific' },
      { id: 'EMEA', label: 'Europe, ME & Africa' },
    ]
    deepStrictEqual(filterOptions(opts, 'pac').map((o) => o.id), ['APAC'])
    deepStrictEqual(filterOptions(opts, 'europe').map((o) => o.id), ['EMEA'])
    deepStrictEqual(filterOptions(opts, ''), opts)
    deepStrictEqual(toggleId(['A'], 'B'), ['A', 'B'])
    deepStrictEqual(toggleId(['A', 'B'], 'A'), ['B'])
  })
})
