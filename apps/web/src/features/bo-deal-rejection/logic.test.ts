import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AUTHORIZED_COMPANY_CODES, DEMO_TODAY, FIXTURE_SELECTION, loadAllDeals, makeRng } from './fixtures.ts'
import { dateOffset, formatAmount, formatDMY, formatRate, parseDMY } from './format.ts'
import {
  DEFAULT_SORT,
  calendarCells,
  calendarYears,
  cellText,
  clampPage,
  columnDef,
  dealKey,
  dragGhostText,
  fetchDeals,
  markedItems,
  nextSort,
  pageCount,
  pageSlice,
  pruneMarks,
  emptyText,
  rejectNote,
  rejectWaitingText,
  resultCountText,
  selectedStatuses,
  setMarks,
  shiftMonth,
  showingText,
  sortDeals,
  statusOptions,
  str,
  targetStatusFor,
  toggleMark,
  typedDate,
  visibleDeals,
  type ViewQuery,
} from './logic.ts'
import type { Deal, Flags } from './types.ts'

// Fixture deals only (fixtures.ts): the page itself never lists sample data.
const deals = loadAllDeals()
const sel = FIXTURE_SELECTION
const codes = AUTHORIZED_COMPANY_CODES
const query = (over: Partial<ViewQuery> = {}): ViewQuery => ({
  type: 'FX',
  companyCodes: codes,
  uptoDate: DEMO_TODAY,
  uptoDateValid: true,
  sel,
  statusFilter: '',
  search: '',
  sort: DEFAULT_SORT,
  ...over,
})
const keysOf = (list: Deal[], type: 'FX' | 'OP' = 'FX') => list.map((d) => dealKey(type, d))

describe('format', () => {
  it('parses and formats dd-mm-yyyy', () => {
    const d = parseDMY('05-10-2026')
    ok(d)
    strictEqual(formatDMY(d), '05-10-2026')
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('5-10-2026'), null)
    strictEqual(parseDMY(''), null)
  })
  it('offsets dates across month ends', () => {
    strictEqual(dateOffset('05-10-2026', -5), '30-09-2026')
    strictEqual(dateOffset('05-10-2026', 30), '04-11-2026')
  })
  it('formats amounts to 2 dp and rates to 6 dp', () => {
    strictEqual(formatAmount(1250000), '1,250,000.00')
    strictEqual(formatRate(88.5), '88.500000')
  })
})

describe('seeded fixtures', () => {
  it('is identical on every load', () => {
    deepStrictEqual(loadAllDeals(), loadAllDeals())
  })
  it('has the original 28 FX and 16 Option deals', () => {
    strictEqual(deals.FX.length, 28)
    strictEqual(deals.OP.length, 16)
  })
  it('uses the original generator stream', () => {
    const r = makeRng(20261005)
    strictEqual(r.next(), (20261005 * 1664525 + 1013904223) % 4294967296 / 4294967296)
  })
  it('starts both result sets with the original first deals', () => {
    strictEqual(str(deals.FX[0] ?? {}, 'rfha'), '1000004100')
    strictEqual(str(deals.OP[0] ?? {}, 'rfha'), '1000005200')
    strictEqual(str(deals.FX[2] ?? {}, 'txn_status'), '13')
    strictEqual(str(deals.FX[2] ?? {}, 'ext_stat_desc'), 'Pending Settlement')
  })
})

describe('fetchDeals (GET_DATA WHERE)', () => {
  const p = (over: Partial<{ companyCodes: string[]; uptoDate: string }> = {}) => ({ companyCodes: codes, uptoDate: DEMO_TODAY, sel, ...over })
  it('FX: txn_status IN (param statuses) AND rfhazul >= gv_actvt; Options: 07/13 AND rfhazul >= 3', () => {
    const fx = fetchDeals(deals.FX, 'FX', p())
    ok(fx.length > 0 && fx.length <= 28)
    for (const d of fx) {
      ok(sel.fx.includes(str(d, 'txn_status')))
      ok(parseInt(str(d, 'rfhazul'), 10) >= sel.actvt)
    }
    const op = fetchDeals(deals.OP, 'OP', p())
    for (const d of op) {
      ok(['07', '13'].includes(str(d, 'txn_status')))
      ok(parseInt(str(d, 'rfhazul'), 10) >= 3)
    }
    const rows: Deal[] = [
      { bukrs: 'IN11', rfha: '1', blotter_date: '01-10-2026', txn_status: '59', rfhazul: '00002' },
      { bukrs: 'IN11', rfha: '2', blotter_date: '01-10-2026', txn_status: '08', rfhazul: '00004' },
      { bukrs: 'IN11', rfha: '3', blotter_date: '01-10-2026', txn_status: '07', rfhazul: '00001' },
      { bukrs: 'IN11', rfha: '4', blotter_date: '01-10-2026', txn_status: '07', rfhazul: '00002' },
    ]
    deepStrictEqual(fetchDeals(rows, 'FX', p()).map((d) => d.rfha), ['1', '4'])
    deepStrictEqual(fetchDeals(rows, 'OP', p()).map((d) => d.rfha), [])
  })
  it('selects nothing when ZGTCATR_PARAM had no MAPID A row (blank statuses)', () => {
    strictEqual(fetchDeals(deals.FX, 'FX', { companyCodes: codes, uptoDate: DEMO_TODAY, sel: { fx: ['', '', ''], actvt: 0, found: false } }).length, 0)
  })
  it('applies the company codes and the upto date', () => {
    const all = fetchDeals(deals.FX, 'FX', p())
    const in11 = fetchDeals(deals.FX, 'FX', p({ companyCodes: ['IN11'] }))
    ok(in11.length > 0 && in11.length < all.length)
    for (const d of in11) strictEqual(str(d, 'bukrs'), 'IN11')
    strictEqual(fetchDeals(deals.FX, 'FX', p({ uptoDate: '01-01-2020' })).length, 0)
    strictEqual(fetchDeals(deals.FX, 'FX', p({ uptoDate: '' })).length, 0)
    strictEqual(fetchDeals(deals.FX, 'FX', p({ companyCodes: ['XX99'] })).length, 0)
  })
})

describe('rejection (USER_COMMAND REVERSE)', () => {
  it('FX: gv_txn_status2 / gv_txn_status1 -> 08, 13 -> 11, else no target', () => {
    strictEqual(targetStatusFor('FX', '07', sel), '08')
    strictEqual(targetStatusFor('FX', '59', sel), '08')
    strictEqual(targetStatusFor('FX', '13', sel), '11')
    strictEqual(targetStatusFor('FX', '99', sel), '')
  })
  it('Options: 07 -> 08, 13 -> 11', () => {
    strictEqual(targetStatusFor('OP', '07', sel), '08')
    strictEqual(targetStatusFor('OP', '13', sel), '11')
    strictEqual(targetStatusFor('OP', '59', sel), '')
  })
  it('names the BAPIs and posts nothing', () => {
    strictEqual(
      rejectWaitingText(2, 'FX'),
      'WAITING FOR ACTION API — BO rejection of 2 FX deals (TXN_STATUS 08/11 + BO remark, change and reverse) (ZSGTRMFM_VTBFHA_EXPORT, BAPI_FTR_FXT_CHANGE, BAPI_FTR_FXT_REVERSE (reason 04), BAPI_TRANSACTION_COMMIT / BAPI_TRANSACTION_ROLLBACK) has no API yet. Nothing was posted to SAP.',
    )
    ok(rejectWaitingText(1, 'OP').includes('BAPI_FTR_CHANGE_FXOPTIONS, BAPI_FTR_REVERSE_FXOPTIONS'))
  })
  it('collects the marked items with their remark', () => {
    const list = visibleDeals(deals.FX, {}, query())
    const picked = list.slice(0, 2)
    const marks = setMarks({}, keysOf(picked), true)
    const remarks = { [dealKey('FX', picked[0] ?? {})]: 'wrong rate' }
    const items = markedItems(list, marks, remarks, 'FX')
    deepStrictEqual(items.map((i) => i.remark), ['wrong rate', ''])
  })
})

describe('status filter', () => {
  it('offers the statuses GET_DATA selects, labelled from EXT_STAT_DESC', () => {
    deepStrictEqual(selectedStatuses('FX', sel), ['59', '07', '13'])
    deepStrictEqual(selectedStatuses('OP', sel), ['07', '13'])
    deepStrictEqual(statusOptions('OP', sel, [{ txn_status: '13', ext_stat_desc: 'Offset' }]), [
      { value: '07', label: '07' },
      { value: '13', label: '13 - Offset' },
    ])
  })
  it('the empty state shows the API notice', () => {
    strictEqual(emptyText(true, 'WAITING FOR API — x'), 'WAITING FOR API — x')
    strictEqual(emptyText(true), 'No deals found for the selection.')
    strictEqual(emptyText(false, 'x'), 'Enter a valid Upto Blotter Date to list deals.')
  })
})

describe('visibleDeals', () => {
  it('filters by txn status', () => {
    const list = visibleDeals(deals.FX, {}, query({ statusFilter: '13' }))
    ok(list.length > 0)
    for (const d of list) strictEqual(str(d, 'txn_status'), '13')
  })
  it('searches the displayed cell text, including typed remarks', () => {
    const base = visibleDeals(deals.FX, {}, query())
    const target = base[3]
    ok(target)
    const key = dealKey('FX', target)
    const hit = visibleDeals(deals.FX, { [key]: 'zzqx remark' }, query({ search: ' ZZQX ' }))
    strictEqual(hit.length, 1)
    strictEqual(dealKey('FX', hit[0] ?? {}), key)
    strictEqual(visibleDeals(deals.FX, {}, query({ search: 'no such text anywhere' })).length, 0)
  })
  it('returns nothing for an invalid date', () => {
    strictEqual(visibleDeals(deals.FX, {}, query({ uptoDateValid: false })).length, 0)
  })
  it('sorts by blotter date descending by default, and by amount / text on request', () => {
    const list = visibleDeals(deals.FX, {}, query())
    const dates = list.map((d) => parseDMY(str(d, 'blotter_date'))?.getTime() ?? 0)
    deepStrictEqual(dates, [...dates].sort((a, b) => b - a))
    const byAmt = sortDeals(list, 'FX', { field: 'amt1', dir: 'asc' }).map((d) => Number(d.amt1))
    deepStrictEqual(byAmt, [...byAmt].sort((a, b) => a - b))
    const byName = sortDeals(list, 'FX', { field: 'bp_name', dir: 'desc' }).map((d) => str(d, 'bp_name').toLowerCase())
    deepStrictEqual(byName, [...byName].sort().reverse())
  })
  it('nextSort starts ascending, then flips', () => {
    const a = nextSort(DEFAULT_SORT, 'amt1')
    deepStrictEqual(a, { field: 'amt1', dir: 'asc' })
    deepStrictEqual(nextSort(a, 'amt1'), { field: 'amt1', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'amt1', dir: 'desc' }, 'amt1'), { field: 'amt1', dir: 'asc' })
  })
})

describe('marks', () => {
  it('toggles and sets marks without mutating', () => {
    const m0: Flags = {}
    const m1 = toggleMark(m0, 'a')
    deepStrictEqual(m1, { a: true })
    deepStrictEqual(m0, {})
    deepStrictEqual(toggleMark(m1, 'a'), {})
    deepStrictEqual(setMarks(m1, ['b', 'c'], true), { a: true, b: true, c: true })
    deepStrictEqual(setMarks({ a: true, b: true }, ['a'], false), { b: true })
  })
  it('drops marks on rows that left the result and keeps the object when nothing changed', () => {
    const list = visibleDeals(deals.FX, {}, query())
    const keep = dealKey('FX', list[0] ?? {})
    const marks: Flags = { [keep]: true, 'FX:IN11:gone': true }
    deepStrictEqual(pruneMarks(marks, list, 'FX'), { [keep]: true })
    const clean: Flags = { [keep]: true }
    strictEqual(pruneMarks(clean, list, 'FX'), clean)
  })
})

describe('cells and columns', () => {
  it('blanks zero amounts and rates, formats the others', () => {
    const d = { amt1: 1250000, spot: 0, t_rate: 88.5, rfha: '1' }
    const amt = columnDef('FX', 'amt1')
    const spot = columnDef('FX', 'spot')
    const rate = columnDef('FX', 't_rate')
    ok(amt && spot && rate)
    strictEqual(cellText(d, amt, 'FX', {}), '1,250,000.00')
    strictEqual(cellText(d, spot, 'FX', {}), '')
    strictEqual(cellText(d, rate, 'FX', {}), '88.500000')
  })
  it('the Remarks column reads the typed remark', () => {
    const d = { bukrs: 'IN11', rfha: '9' }
    const rem = columnDef('FX', 'bo_rem')
    ok(rem)
    strictEqual(cellText(d, rem, 'FX', { 'FX:IN11:9': 'hello' }), 'hello')
    strictEqual(cellText(d, rem, 'FX', {}), '')
  })
})

describe('paging and texts', () => {
  it('pages the list', () => {
    strictEqual(pageCount(0, 20), 1)
    strictEqual(pageCount(21, 20), 2)
    strictEqual(clampPage(5, 21, 20), 2)
    deepStrictEqual(pageSlice([1, 2, 3, 4, 5], 2, 2), [3, 4])
    strictEqual(showingText(2, 20, 28), 'Showing 21–28 of 28')
    strictEqual(showingText(1, 20, 0), '')
    strictEqual(resultCountText(1), '1 deal')
    strictEqual(resultCountText(2), '2 deals')
  })
  it('words the reject confirmation and toast for one and many', () => {
    strictEqual(
      rejectNote(1, 'FX'),
      'Reject 1 FX deal and return it to Front Office for correction? The transaction is reversed and no longer appears in this list.',
    )
    strictEqual(
      rejectNote(3, 'OP'),
      'Reject 3 Options deals and return them to Front Office for correction? The transactions are reversed and no longer appear in this list.',
    )
    strictEqual(dragGhostText(1, 'FX:IN11:1000004100'), 'Deal 1000004100')
    strictEqual(dragGhostText(4, 'FX:IN11:1000004100'), '4 deals')
  })
})

describe('Upto Blotter Date entry', () => {
  it('accepts a complete real date and normalises it', () => {
    deepStrictEqual(typedDate(' 06-10-2026 ', false), { kind: 'valid', text: '06-10-2026' })
  })
  it('waits while the entry is incomplete, flags it once complete or on blur', () => {
    deepStrictEqual(typedDate('06-10', false), { kind: 'pending' })
    deepStrictEqual(typedDate('06-10', true), { kind: 'invalid' })
    deepStrictEqual(typedDate('31-02-2026', false), { kind: 'invalid' })
    deepStrictEqual(typedDate('', true), { kind: 'invalid' })
  })
})

describe('calendar', () => {
  it('shifts months across years', () => {
    deepStrictEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
    deepStrictEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
  })
  it('offers the viewed year plus and minus ten', () => {
    const years = calendarYears(2026)
    strictEqual(years.length, 21)
    strictEqual(years[0], 2016)
    strictEqual(years[20], 2036)
  })
  it('lays out October 2026 (starts Thursday) with muted lead and trail days', () => {
    const cells = calendarCells({ year: 2026, month: 9 }, new Date(2026, 9, 5), new Date(2026, 9, 7))
    strictEqual(cells.length % 7, 0)
    strictEqual(cells.filter((c) => c.muted && c.day > 20).length, 4) // 27..30 Sep
    const days = cells.filter((c) => !c.muted)
    strictEqual(days.length, 31)
    strictEqual(days.filter((c) => c.selected).map((c) => c.day).join(), '5')
    strictEqual(days.filter((c) => c.today).map((c) => c.day).join(), '7')
    strictEqual(cells[0]?.muted, true)
    strictEqual(cells[0]?.day, 27)
  })
})
