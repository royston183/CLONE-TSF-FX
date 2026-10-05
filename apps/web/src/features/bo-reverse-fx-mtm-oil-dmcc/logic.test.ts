import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INITIAL_DOC_COUNTER, INITIAL_KEY_DATE, INITIAL_REV_COUNTER, seedRows } from './data.ts'
import { formatDate, formatNumber, isMonthEnd, parseDisplayDate } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  applyKeyDate,
  buildCsv,
  buildRows,
  calendarCells,
  cellText,
  clampPage,
  deriveRow,
  documentDetails,
  expiryMonthBucket,
  filterRows,
  isEligible,
  nextSort,
  pageSlice,
  pagerWindow,
  shiftMonth,
  showingText,
  simulatePosting,
  sortMark,
  sortRows,
  totalPages,
  validKeyDate,
} from './logic.ts'

const rows = buildRows(seedRows())
const byId = (id: string) => rows.find((r) => r.rfha.endsWith(id))!
const close = (a: number, b: number) => strictEqual(Math.abs(a - b) < 1e-6, true, `${a} vs ${b}`)
const KEY = '30-09-2026'
const ids = (rs: { rfha: string }[]) => rs.map((r) => r.rfha.slice(-3))

describe('format', () => {
  it('groups digits and keeps the sign', () => {
    strictEqual(formatNumber(1234567.891, 2), '1,234,567.89')
    strictEqual(formatNumber(-1500, 2), '-1,500.00')
    strictEqual(formatNumber(1.298, 4), '1.2980')
    strictEqual(formatNumber(null, 2), '')
  })
  it('validates real month-end dates', () => {
    strictEqual(parseDisplayDate('31-02-2026'), null)
    strictEqual(parseDisplayDate('2026-09-30'), null)
    strictEqual(isMonthEnd(parseDisplayDate('28-02-2028')!), false)
    strictEqual(isMonthEnd(parseDisplayDate('29-02-2028')!), true)
    strictEqual(validKeyDate('30-09-2026') !== null, true)
    strictEqual(validKeyDate('29-09-2026'), null)
    strictEqual(validKeyDate('abc'), null)
    strictEqual(formatDate('2026-09-30'), '30-09-2026')
  })
})

describe('row derivation', () => {
  it('USD as currency 1: foreign amount is leg 2, divided by the rates', () => {
    const r = byId('772')
    strictEqual(r.fAmt, 71357500)
    strictEqual(r.fCurr, 'INR')
    close(r.usdAmt, 71357500 / 83.95)
    close(r.vRate, 84.48 + 0.21)
    close(r.vAmt, 71357500 / 84.69)
  })
  it('USD as currency 2: foreign amount is leg 1, multiplied by the rates', () => {
    const r = byId('769')
    strictEqual(r.fAmt, 900000)
    strictEqual(r.fCurr, 'EUR')
    close(r.usdAmt, 900000 * 1.112)
    close(r.vAmt, 900000 * (1.104 + 0.0025))
  })
  it('G/L sign follows side and contract vs valuation rate', () => {
    const buy = byId('772') // Buy, contract below valuation: negative
    strictEqual((buy.vGl as number) < 0, true)
    close(Math.abs(buy.vGl as number), Math.abs(buy.vAmt - buy.usdAmt))
    const sell = byId('767') // Sell, contract above valuation: negative
    strictEqual(sell.cRate > sell.vRate, true)
    strictEqual((sell.vGl as number) < 0, true)
    const flipped = deriveRow({ ...seedRows()[0]!, buySell: 'Sell', cRate: 1.2, vSpot: 1.3, vSwap: 0 })
    strictEqual((flipped.vGl as number) > 0, true) // Sell, contract at or below valuation: positive
  })
  it('a complete payment has no G/L', () => {
    const r = byId('769')
    strictEqual(r.pc, 'C')
    strictEqual(r.vGl, null)
    strictEqual(r.totGl, null)
    strictEqual(r.uinvAmt, 0)
  })
  it('a partial payment scales the G/L by the uninvoiced share of the USD leg', () => {
    const r = byId('770') // USD leg 1,000,000, T1 350,000
    strictEqual(r.uinvAmt, 650000)
    close(r.uinvPer, 65)
    const full = deriveRow({ ...seedRows().find((x) => x.rfha.endsWith('770'))!, pc: '' })
    close(r.vGl as number, (full.vGl as number) * 0.65)
    strictEqual(r.totGl, r.vGl)
  })
  it('the USD leg is leg 2 when currency 1 is not USD', () => {
    strictEqual(byId('764').uinvAmt, 1229800 - 400000)
  })
  it('invoice status needs a deal id and a T1 amount', () => {
    strictEqual(byId('773').invStat, 'Yes')
    strictEqual(byId('765').invStat, 'No')
    strictEqual(byId('771').invStat, '')
  })
  it('expiry month bucket counts months from the key date, at least 1', () => {
    strictEqual(expiryMonthBucket('2027-01-29', '2026-09-30'), 4)
    strictEqual(expiryMonthBucket('2026-10-30', '2026-09-30'), 1)
    strictEqual(expiryMonthBucket('2026-09-15', '2026-09-30'), 1)
    strictEqual(expiryMonthBucket('nope', '2026-09-30'), 0)
    strictEqual(byId('773').month, 'Jan 2027')
    strictEqual(byId('773').monat, 4)
  })
  it('re-measures the buckets for another key date', () => {
    const moved = applyKeyDate(rows, '2026-10-31')
    strictEqual(moved.find((r) => r.rfha.endsWith('773'))!.monat, 3)
  })
  it('carries the posted message for rows that already have an MTM document', () => {
    strictEqual(byId('772').msg, 'Document Posted Sucessfully')
    strictEqual(byId('771').msg, '')
  })
})

describe('filtering', () => {
  it('shows rows traded on or before and valued after the key date', () => {
    strictEqual(filterRows(rows, DEFAULT_FILTERS, KEY).length, 18)
    // 10-30 is not after 10-31, so the two October expiries drop out.
    const oct = filterRows(rows, DEFAULT_FILTERS, '31-10-2026')
    strictEqual(oct.some((r) => r.rfha.endsWith('769')), false)
    strictEqual(oct.some((r) => r.rfha.endsWith('764')), false)
    strictEqual(oct.some((r) => r.rfha.endsWith('773')), true)
  })
  it('the trade date must not be after the key date', () => {
    deepStrictEqual(ids(filterRows(rows, DEFAULT_FILTERS, '31-07-2026')), ['773'])
  })
  it('an invalid or non-month-end key date shows nothing', () => {
    strictEqual(filterRows(rows, DEFAULT_FILTERS, '15-09-2026').length, 0)
    strictEqual(filterRows(rows, DEFAULT_FILTERS, 'x').length, 0)
  })
  it('filters by company, transaction, partner, currency pair and deal type', () => {
    strictEqual(filterRows(rows, { ...DEFAULT_FILTERS, company: 'IN11' }, KEY).every((r) => r.bukrs === 'IN11'), true)
    deepStrictEqual(ids(filterRows(rows, { ...DEFAULT_FILTERS, transaction: '0000040000770' }, KEY)), ['770'])
    strictEqual(filterRows(rows, { ...DEFAULT_FILTERS, partner: '0400000003' }, KEY).length, 4)
    strictEqual(filterRows(rows, { ...DEFAULT_FILTERS, currency: 'EUR/USD' }, KEY).length, 3)
    const withDeal = filterRows(rows, { ...DEFAULT_FILTERS, deal: 'WITH' }, KEY)
    const without = filterRows(rows, { ...DEFAULT_FILTERS, deal: 'WITHOUT' }, KEY)
    strictEqual(withDeal.length + without.length, 18)
    strictEqual(without.length, 4)
  })
  it('searches across displayed columns, case-insensitively and trimmed', () => {
    const hit = (q: string) => ids(filterRows(rows, { ...DEFAULT_FILTERS, search: q }, KEY))
    deepStrictEqual(hit('  EXT-757 '), ['757'])
    strictEqual(hit('barclays').length, 4)
    deepStrictEqual(hit('29-01-2027').sort(), ['758', '773'])
    strictEqual(hit('zzz').length, 0)
  })
})

describe('sorting and paging', () => {
  it('defaults to transaction descending and toggles', () => {
    strictEqual(ids(sortRows(rows, DEFAULT_SORT))[0], '773')
    const asc = nextSort(DEFAULT_SORT, 'rfha')
    strictEqual(asc.dir, 1)
    strictEqual(ids(sortRows(rows, asc))[0], '756')
    deepStrictEqual(nextSort(asc, 'bukrs'), { field: 'bukrs', dir: 1 })
    strictEqual(sortMark(asc, 'rfha'), '▲')
    strictEqual(sortMark(DEFAULT_SORT, 'rfha'), '▼')
    strictEqual(sortMark(DEFAULT_SORT, 'bukrs'), '')
  })
  it('sorts numbers numerically and tolerates null G/L', () => {
    const s = sortRows(rows, { field: 'fAmt', dir: 1 })
    strictEqual(s[0]!.fAmt <= s[1]!.fAmt, true)
    strictEqual(sortRows(rows, { field: 'vGl', dir: 1 }).length, rows.length)
  })
  it('pages by eight', () => {
    strictEqual(totalPages(18, 8), 3)
    strictEqual(totalPages(0, 8), 1)
    strictEqual(clampPage(9, 18, 8), 3)
    strictEqual(pageSlice(rows, 3, 8).length, 2)
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(6, 9), [4, 5, 6, 7, 8])
    deepStrictEqual(pagerWindow(9, 9), [5, 6, 7, 8, 9])
    strictEqual(showingText(3, 8, 18), 'Showing 17–18 of 18')
    strictEqual(showingText(1, 8, 0), 'Showing 0 of 0')
  })
})

describe('cells', () => {
  it('formats by column type and dashes blanks', () => {
    strictEqual(cellText('2026-09-30', 'date'), '30-09-2026')
    strictEqual(cellText(1234.5, 'amount'), '1,234.50')
    strictEqual(cellText(83.95, 'rate'), '83.9500')
    strictEqual(cellText(65, 'percent'), '65.00%')
    strictEqual(cellText(0, 'amount'), '0.00')
    strictEqual(cellText(4, 'number'), '4')
    strictEqual(cellText(null, 'amount'), null)
    strictEqual(cellText('', 'text'), null)
  })
})

describe('posting', () => {
  const counters = { doc: INITIAL_DOC_COUNTER, rev: INITIAL_REV_COUNTER }
  it('eligibility: no MTM document and a non-zero G/L', () => {
    strictEqual(isEligible(byId('773')), true)
    strictEqual(isEligible(byId('772')), false)
    strictEqual(isEligible(byId('769')), false)
    strictEqual(isEligible(null), false)
    strictEqual(isEligible({ ...byId('773'), vGl: 0 }), false)
  })
  it('assigns the next MTM and reversal numbers from the injected counters', () => {
    const r = simulatePosting(rows, byId('773').rfha, counters)
    deepStrictEqual(r.counters, { doc: 1900048201, rev: 2900026301 })
    const posted = r.rows.find((x) => x.rfha === byId('773').rfha)!
    strictEqual(posted.mtmDoc, '1900048201')
    strictEqual(posted.revDoc, '2900026301')
    strictEqual(posted.msg, 'Document Posted Sucessfully')
    deepStrictEqual(
      r.logs.map((l) => [l.kind, l.doc, l.ok]),
      [
        ['MTM', '1900048201', true],
        ['Reversal', '2900026301', true],
      ],
    )
    strictEqual(r.logs[0]!.diff, posted.vGl)
    strictEqual(r.logs[0]!.rate, posted.cRate)
    strictEqual(isEligible(posted), false)
    strictEqual(byId('773').mtmDoc, '') // input untouched
  })
  it('numbers keep running across posts and an ineligible row changes nothing', () => {
    const one = simulatePosting(rows, byId('770').rfha, counters)
    const two = simulatePosting(one.rows, byId('765').rfha, one.counters)
    strictEqual(two.rows.find((x) => x.rfha.endsWith('765'))!.mtmDoc, '1900048202')
    const none = simulatePosting(rows, byId('772').rfha, counters)
    strictEqual(none.logs.length, 0)
    deepStrictEqual(none.counters, counters)
  })
  it('document details use the initial key date; the reversal posts a day later', () => {
    const r = byId('772')
    const mtm = documentDetails(r, 'mtmDoc')
    const rev = documentDetails(r, 'revDoc')
    strictEqual(mtm[0]!.value, '1900048172')
    strictEqual(rev[0]!.value, '2900026272')
    strictEqual(mtm.find((c) => c.label === 'Posting Date')!.value, '30-09-2026')
    strictEqual(rev.find((c) => c.label === 'Posting Date')!.value, '01-10-2026')
    strictEqual(mtm.find((c) => c.label === 'Fiscal Year')!.value, INITIAL_KEY_DATE.slice(0, 4))
  })
})

describe('csv', () => {
  it('quotes every cell, skips the select column, formats by type', () => {
    const lines = buildCsv([byId('773'), byId('769')]).split('\r\n')
    strictEqual(lines.length, 3)
    strictEqual(lines[0]!.startsWith('"Transaction","Company Code","Company Name"'), true)
    strictEqual(lines[1]!.includes('"29-07-2026","29-01-2027"'), true)
    strictEqual(lines[1]!.includes('"1,200,000.00"') || lines[1]!.includes('"1,557,600.00"'), true)
    strictEqual(lines[1]!.includes('"1.2980"'), true)
    // complete payment: the blank G/L is an empty cell, not "null"
    strictEqual(lines[2]!.includes('null'), false)
    strictEqual(lines[2]!.includes(',"",'), true)
  })
})

describe('calendar', () => {
  it('always lays out 42 cells with the neighbouring days greyed', () => {
    const cells = calendarCells({ year: 2026, month: 8 }, parseDisplayDate('30-09-2026'), new Date(2026, 8, 5))
    strictEqual(cells.length, 42)
    strictEqual(cells.filter((c) => !c.out).length, 30)
    strictEqual(cells.filter((c) => c.selected).length, 1)
    strictEqual(cells.find((c) => c.selected)!.day, 30)
    strictEqual(cells.find((c) => c.today)!.day, 5)
    strictEqual(cells[0]!.out, true)
    strictEqual(cells.find((c) => !c.out && c.day === 5)!.weekend, true)
  })
  it('wraps across years', () => {
    deepStrictEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
    deepStrictEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
  })
})
