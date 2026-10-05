import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMPANY_NAMES, INITIAL_COUNTERS, INITIAL_KEY_DATE, INITIAL_ROWS } from './data.ts'
import { addDays, formatDate, formatNumber, isMonthEnd, parseDisplayDate } from './format.ts'
import {
  DEFAULT_SORT,
  buildCsv,
  calendarCells,
  cellText,
  clampPage,
  defaultFilters,
  deriveRow,
  deriveRows,
  documentDetails,
  expiryMonthBucket,
  filterOptions,
  filterRows,
  isEligible,
  nextSort,
  pageCount,
  pagerWindow,
  shiftMonth,
  showingText,
  simulatePosting,
  sortMark,
  sortRows,
  validKeyDate,
  withKeyDate,
} from './logic.ts'

const rows = deriveRows(INITIAL_ROWS)
const byId = (id: string) => {
  const r = rows.find((x) => x.rfha === id)
  if (!r) throw new Error(`no row ${id}`)
  return r
}
const keyDate = validKeyDate('30-09-2026')
const ids = (rs: { rfha: string }[]) => rs.map((r) => r.rfha)
const close = (a: number, b: number, eps = 1e-6) => strictEqual(Math.abs(a - b) < eps, true, `${a} vs ${b}`)

describe('format', () => {
  it('formats numbers with grouping and keeps the sign', () => {
    strictEqual(formatNumber(1234567.891, 2), '1,234,567.89')
    strictEqual(formatNumber(-1234.5, 2), '-1,234.50')
    strictEqual(formatNumber(83.1, 4), '83.1000')
    strictEqual(formatNumber(null, 2), '')
    strictEqual(formatNumber('', 2), '')
  })
  it('parses only real DD-MM-YYYY dates', () => {
    strictEqual(parseDisplayDate('31-02-2026'), null)
    strictEqual(parseDisplayDate('2026-09-30'), null)
    strictEqual(parseDisplayDate('30-09-2026')?.getMonth(), 8)
  })
  it('detects month ends, including leap years', () => {
    strictEqual(isMonthEnd(parseDisplayDate('30-09-2026')!), true)
    strictEqual(isMonthEnd(parseDisplayDate('29-02-2028')!), true)
    strictEqual(isMonthEnd(parseDisplayDate('28-02-2028')!), false)
  })
  it('formats and shifts ISO dates', () => {
    strictEqual(formatDate('2026-09-30'), '30-09-2026')
    strictEqual(addDays('2026-09-30', 1), '2026-10-01')
  })
})

describe('key date', () => {
  it('accepts a month end and rejects other days or junk', () => {
    strictEqual(validKeyDate('30-09-2026') !== null, true)
    strictEqual(validKeyDate('15-09-2026'), null)
    strictEqual(validKeyDate('nonsense'), null)
  })
  it('buckets the expiry month against the key date, never below 1', () => {
    strictEqual(expiryMonthBucket('2026-10-30', INITIAL_KEY_DATE), 1)
    strictEqual(expiryMonthBucket('2027-01-29', INITIAL_KEY_DATE), 4)
    strictEqual(expiryMonthBucket('2026-09-30', INITIAL_KEY_DATE), 1)
    strictEqual(expiryMonthBucket('2027-01-29', 'bad'), 0)
  })
  it('re-buckets every row for a new key date', () => {
    const moved = withKeyDate(rows, '2026-10-31')
    strictEqual(moved.find((r) => r.rfha === '0000041000873')?.monat, 3)
    strictEqual(byId('0000041000873').monat, 4)
  })
})

describe('row derivation', () => {
  it('takes the foreign amount from the leg that is not the local currency', () => {
    const r = byId('0000041000873') // USD/SGD, local SGD
    strictEqual(r.fAmt, 1200000)
    strictEqual(r.fCurr, 'USD')
    const flipped = deriveRow({ ...INITIAL_ROWS[0]!, curr1: 'SGD', curr2: 'USD', amt1: -1557600, amt2: 1200000 })
    strictEqual(flipped.fAmt, 1200000)
    strictEqual(flipped.fCurr, 'USD')
  })
  it('derives company code, valuation amount and rate', () => {
    const r = byId('0000041000873')
    close(r.ccAmt, 1200000 * 1.298)
    close(r.vRate, 1.276 + 0.0042)
    close(r.vAmt, 1200000 * (1.276 + 0.0042))
    strictEqual(r.valMer, 1.276)
  })
  it('signs the local G/L by Buy/Sell and which rate is higher', () => {
    // Sell, contract rate above valuation rate: gain
    strictEqual(byId('0000041000871').vCgl > 0, false) // contract 83.95 < valuation 84.69 -> loss for a Sell
    strictEqual(byId('0000041000873').vCgl > 0, true) // contract 1.298 >= 1.2802 -> gain for a Sell
    // Buy, contract rate above valuation rate: loss
    strictEqual(byId('0000041000872').vCgl < 0, true)
    // Buy, contract rate below valuation rate: gain
    strictEqual(byId('0000041000870').vCgl > 0, true)
  })
  it('computes USD G/L from the valuation MER and zeroes a complete payment', () => {
    const none = byId('0000041000871')
    close(none.vGl!, none.vCgl / none.valMer)
    strictEqual(none.totGl, none.vGl)
    const complete = byId('0000041000869') // pc C
    strictEqual(complete.vGl, null)
    strictEqual(complete.uinvAmt, 0)
    strictEqual(complete.totGl !== 0, true)
  })
  it('scales a partial payment by the uninvoiced share', () => {
    const r = byId('0000041000873') // USD 1.2m, T1 510,000
    strictEqual(r.uinvAmt, 690000)
    close(r.uinvPer, 57.5)
    close(r.vGl!, r.totGl * 0.575)
    close(r.locUninv, r.vCgl * 0.575)
  })
  it('sets the invoice status only for rows with a deal id', () => {
    strictEqual(byId('0000041000873').invStat, 'Yes')
    strictEqual(byId('0000041000869').invStat, 'Yes')
    strictEqual(byId('0000041000872').invStat, 'No')
    strictEqual(byId('0000041000871').invStat, '')
  })
  it('labels the expiry month-year and carries the posted message', () => {
    strictEqual(byId('0000041000873').month, 'Jan 2027')
    strictEqual(byId('0000041000872').msg, 'Document Posted Sucessfully')
    strictEqual(byId('0000041000871').msg, '')
  })
})

describe('filtering', () => {
  const f = defaultFilters()
  it('shows nothing without a valid key date', () => {
    deepStrictEqual(filterRows(rows, f, null), [])
  })
  it('keeps only transactions traded on or before the key date and still open after it', () => {
    strictEqual(filterRows(rows, f, keyDate).length, rows.length)
    const early = validKeyDate('31-07-2026')
    deepStrictEqual(ids(filterRows(rows, f, early)), ['0000041000873'])
    const late = validKeyDate('31-12-2026')
    strictEqual(filterRows(rows, f, late).some((r) => r.rfha === '0000041000866'), true) // matures 2027-09-30
    strictEqual(filterRows(rows, f, late).some((r) => r.rfha === '0000041000872'), false) // matured 30-12, before the key date
  })
  it('filters by company, partner, pair, transaction and deal type', () => {
    strictEqual(filterRows(rows, { ...f, company: 'SG03' }, keyDate).every((r) => r.bukrs === 'SG03'), true)
    strictEqual(filterRows(rows, { ...f, partner: '0400000003' }, keyDate).length, 4)
    strictEqual(filterRows(rows, { ...f, currency: 'USD/AED' }, keyDate).length, 6)
    deepStrictEqual(ids(filterRows(rows, { ...f, transaction: '0000041000860' }, keyDate)), ['0000041000860'])
    strictEqual(filterRows(rows, { ...f, deal: 'WITHOUT' }, keyDate).length, 4)
    strictEqual(filterRows(rows, { ...f, deal: 'WITH' }, keyDate).length, rows.length - 4)
  })
  it('searches every column, including formatted dates, ignoring case and padding', () => {
    strictEqual(filterRows(rows, { ...f, search: '  ext-872 ' }, keyDate).length, 1)
    strictEqual(filterRows(rows, { ...f, search: 'barclays' }, keyDate).length, 4)
    strictEqual(filterRows(rows, { ...f, search: '29-01-2027' }, keyDate).length, 2)
    strictEqual(filterRows(rows, { ...f, search: 'nothing-matches' }, keyDate).length, 0)
  })
  it('builds the lookup lists from the rows', () => {
    const o = filterOptions(rows, COMPANY_NAMES)
    deepStrictEqual(
      o.companies.map((c) => c.value),
      ['AE13', 'IN11', 'SG03'],
    )
    strictEqual(o.companies[0]?.label, 'AE13 — Olam International DMCC')
    strictEqual(o.partners.some((p) => p.label === '0400000003 — BARCLAYS BANK PLC'), true)
    strictEqual(o.currencies.length, 3)
  })
})

describe('sorting', () => {
  it('sorts text and numbers in either direction', () => {
    const desc = sortRows(rows, DEFAULT_SORT)
    strictEqual(desc[0]?.rfha, '0000041000873')
    const asc = sortRows(rows, { field: 'rfha', dir: 1 })
    strictEqual(asc[0]?.rfha, '0000041000856')
    const byAmt = sortRows(rows, { field: 'fAmt', dir: 1 })
    strictEqual(byAmt[0]?.fAmt, 300000)
    strictEqual(byAmt[byAmt.length - 1]?.fAmt, 2000000)
  })
  it('flips the direction on the same column and starts ascending on a new one', () => {
    deepStrictEqual(nextSort({ field: 'rfha', dir: -1 }, 'rfha'), { field: 'rfha', dir: 1 })
    deepStrictEqual(nextSort({ field: 'rfha', dir: 1 }, 'rfha'), { field: 'rfha', dir: -1 })
    deepStrictEqual(nextSort({ field: 'rfha', dir: -1 }, 'bukrs'), { field: 'bukrs', dir: 1 })
  })
  it('marks only the sorted column', () => {
    strictEqual(sortMark({ field: 'rfha', dir: 1 }, 'rfha'), '▲')
    strictEqual(sortMark({ field: 'rfha', dir: -1 }, 'rfha'), '▼')
    strictEqual(sortMark({ field: 'rfha', dir: 1 }, 'bukrs'), '')
  })
  it('sorts a complete-payment row (null G/L) among the others without throwing', () => {
    const sorted = sortRows(rows, { field: 'vGl', dir: 1 })
    strictEqual(sorted.length, rows.length)
  })
})

describe('paging', () => {
  it('counts, clamps and windows pages', () => {
    strictEqual(pageCount(0, 8), 1)
    strictEqual(pageCount(18, 8), 3)
    strictEqual(clampPage(9, 18, 8), 3)
    strictEqual(clampPage(0, 18, 8), 1)
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(5, 9), [3, 4, 5, 6, 7])
    deepStrictEqual(pagerWindow(9, 9), [5, 6, 7, 8, 9])
  })
  it('words the footer', () => {
    strictEqual(showingText(1, 8, 18), 'Showing 1–8 of 18')
    strictEqual(showingText(3, 8, 18), 'Showing 17–18 of 18')
    strictEqual(showingText(1, 8, 0), 'Showing 0 of 0')
  })
})

describe('posting', () => {
  it('is eligible only with no MTM document and a non-zero G/L', () => {
    strictEqual(isEligible(byId('0000041000871')), true)
    strictEqual(isEligible(byId('0000041000872')), false) // already posted
    strictEqual(isEligible(byId('0000041000869')), false) // complete, G/L null
    strictEqual(isEligible(null), false)
    strictEqual(isEligible({ ...byId('0000041000871'), vGl: 0 }), false)
  })
  it('takes the next document numbers from the injected counters and logs both documents', () => {
    const r = byId('0000041000871')
    const out = simulatePosting(r, INITIAL_COUNTERS)
    strictEqual(out.row.mtmDoc, '1900048201')
    strictEqual(out.row.revDoc, '2900026301')
    strictEqual(out.row.msg, 'Document Posted Sucessfully')
    deepStrictEqual(out.counters, { doc: 1900048201, rev: 2900026301 })
    deepStrictEqual(
      out.logs.map((l) => [l.kind, l.doc, l.ok, l.diff, l.rate]),
      [
        ['MTM', '1900048201', true, r.vGl, r.cRate],
        ['Reversal', '2900026301', true, r.vGl, r.cRate],
      ],
    )
    strictEqual(r.mtmDoc, '') // input untouched
    strictEqual(isEligible(out.row), false)
    const again = simulatePosting(byId('0000041000870'), out.counters)
    strictEqual(again.row.mtmDoc, '1900048202')
  })
})

describe('cells, csv and details', () => {
  it('formats cells by column type and uses null for blanks', () => {
    strictEqual(cellText('2027-01-29', 'date'), '29-01-2027')
    strictEqual(cellText(1200000, 'amount'), '1,200,000.00')
    strictEqual(cellText(1.298, 'rate'), '1.2980')
    strictEqual(cellText(57.5, 'percent'), '57.50%')
    strictEqual(cellText(4, 'number'), '4')
    strictEqual(cellText(0, 'amount'), '0.00')
    strictEqual(cellText('', 'text'), null)
    strictEqual(cellText(null, 'amount'), null)
  })
  it('builds a quoted CSV without the select column', () => {
    const csv = buildCsv([byId('0000041000873'), byId('0000041000869')])
    const lines = csv.split('\r\n')
    strictEqual(lines.length, 3)
    strictEqual(lines[0]?.startsWith('"Transaction","Company Code","Company Name"'), true)
    strictEqual(lines[1]?.includes('"29-01-2027"'), true)
    strictEqual(lines[1]?.includes('"57.50%"'), true)
    // complete payment: Valuation G/L (USD) is blank
    strictEqual(lines[2]?.includes(',"",'), true)
  })
  it('escapes embedded quotes', () => {
    const csv = buildCsv([{ ...byId('0000041000873'), bpName: 'A "B" C' }])
    strictEqual(csv.includes('"A ""B"" C"'), true)
  })
  it('dates the reversal document the day after the key date', () => {
    const r = byId('0000041000872')
    const mtm = documentDetails(r, 'mtmDoc')
    const rev = documentDetails(r, 'revDoc')
    strictEqual(mtm.find((d) => d.k === 'Posting Date')?.v, '30-09-2026')
    strictEqual(rev.find((d) => d.k === 'Posting Date')?.v, '01-10-2026')
    strictEqual(mtm.find((d) => d.k === 'Document Number')?.v, '1900051172')
    strictEqual(rev.find((d) => d.k === 'Document Number')?.v, '2900029172')
    strictEqual(mtm.find((d) => d.k === 'Fiscal Year')?.v, '2026')
  })
})

describe('calendar', () => {
  it('rolls the year over when stepping past December or January', () => {
    deepStrictEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 })
    deepStrictEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 })
    deepStrictEqual(shiftMonth({ y: 2026, m: 8 }, 1), { y: 2026, m: 9 })
  })
  it('always shows six Sunday-first weeks with the month in the right place', () => {
    const cells = calendarCells({ y: 2026, m: 8 }) // 1 Sep 2026 is a Tuesday
    strictEqual(cells.length, 42)
    strictEqual(cells[0]?.out, true)
    strictEqual(cells[0]?.day, 30)
    strictEqual(cells[2]?.day, 1)
    strictEqual(cells[2]?.out, false)
    strictEqual(cells.filter((c) => !c.out).length, 30)
    strictEqual(cells[0]?.weekend, true) // Sunday
    strictEqual(cells[1]?.weekend, false)
  })
})
