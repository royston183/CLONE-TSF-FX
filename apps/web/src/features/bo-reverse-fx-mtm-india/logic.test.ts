import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMPANY_NAMES, INITIAL_COUNTERS, INITIAL_KEY_DATE, INITIAL_RAW_ROWS, seedRows } from './data.ts'
import { addDays, formatDate, formatNumber, isMonthEnd, parseDisplayDate } from './format.ts'
import {
  ALL,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  buildCsv,
  cellText,
  clampPage,
  companyOptions,
  csvQuote,
  deriveRow,
  docInfo,
  expiryMonthBucket,
  filterRows,
  isEligible,
  nextSort,
  pageCount,
  pageSlice,
  pagerWindow,
  partnerOptions,
  showingText,
  simulatePosting,
  sortRows,
  validKeyDate,
  withMonat,
} from './logic.ts'
import type { RawRow, Row } from './types.ts'

const KEY = '30-09-2026'
const raw = (rfha: string): RawRow => {
  const r = INITIAL_RAW_ROWS.find((x) => x.rfha === rfha)
  if (!r) throw new Error(`no demo row ${rfha}`)
  return r
}
const derived = (rfha: string, over: Partial<RawRow> = {}): Row => deriveRow({ ...raw(rfha), ...over }, INITIAL_KEY_DATE)
const near = (a: number | null, b: number, eps = 1e-6) => ok(a !== null && Math.abs(a - b) < eps, `${a} !~ ${b}`)

describe('deriveRow', () => {
  it('takes the USD leg and values it at the contract and valuation INR rates', () => {
    const r = derived('0000050000976') // Sell, no deal, no pc
    strictEqual(r.fAmt, 650000)
    strictEqual(r.fCurr, 'USD')
    near(r.ccAmt, 650000 * 84.45)
    near(r.vRate, 84.6 + 0.12)
    near(r.vAmt, 650000 * 84.72)
  })

  it('uses the second amount when the first currency is not USD', () => {
    const r = derived('0000050000976', { curr1: 'INR', amt1: 1, amt2: -300000 })
    strictEqual(r.fAmt, 300000)
  })

  it('signs the G/L by buy/sell direction', () => {
    // contract rate below valuation rate: a Buy gains, a Sell loses
    const buy = derived('0000050000965') // Buy 84.45 vs 84.64
    const sell = derived('0000050000976') // Sell 84.45 vs 84.72
    ok((buy.vGl ?? 0) > 0)
    ok((sell.vGl ?? 0) < 0)
    // contract rate at or above valuation rate flips both
    ok((derived('0000050000965', { cRate: 90 }).vGl ?? 0) < 0)
    ok((derived('0000050000976', { cRate: 90 }).vGl ?? 0) > 0)
  })

  it('gives a complete payment no G/L', () => {
    const r = derived('0000050000974') // pc = C
    strictEqual(r.vGl, null)
    strictEqual(r.totGl, null)
    strictEqual(r.uinvAmt, 0)
    strictEqual(r.uinvPer, 0)
  })

  it('scales a partial payment by the uninvoiced share', () => {
    const full = derived('0000050000978', { pc: '' })
    const part = derived('0000050000978') // pc = P, T1 450,000 of 1,200,000
    strictEqual(part.uinvAmt, 750000)
    near(part.uinvPer, 62.5)
    near(part.vGl, (full.vGl ?? 0) * 0.625)
    strictEqual(part.totGl, part.vGl)
  })

  it('derives the invoice status only when a Deal ID exists', () => {
    strictEqual(derived('0000050000976').invStat, '')
    strictEqual(derived('0000050000978').invStat, 'Yes')
    strictEqual(derived('0000050000970').invStat, 'No')
  })

  it('derives the valuation MER only for a Deal ID whose T1 amount is zero', () => {
    strictEqual(derived('0000050000970').valMer, 84.56)
    strictEqual(derived('0000050000978').valMer, null)
    strictEqual(derived('0000050000976').valMer, null)
  })

  it('builds the expiry month label and bucket', () => {
    const r = derived('0000050000978')
    strictEqual(r.month, 'Jan 2027')
    strictEqual(r.monat, 4)
  })

  it('carries the posted message only for rows that already have a document', () => {
    strictEqual(raw('0000050000977').msg, 'Document Posted Sucessfully')
    strictEqual(raw('0000050000978').msg, '')
  })
})

describe('expiryMonthBucket / withMonat', () => {
  it('counts whole calendar months and never goes below 1', () => {
    strictEqual(expiryMonthBucket('2026-10-30', '2026-09-30'), 1)
    strictEqual(expiryMonthBucket('2026-09-30', '2026-09-30'), 1)
    strictEqual(expiryMonthBucket('2027-09-30', '2026-09-30'), 12)
  })
  it('is 0 for an unparsable date', () => {
    strictEqual(expiryMonthBucket('', '2026-09-30'), 0)
  })
  it('re-measures every row from another key date', () => {
    const rows = withMonat(seedRows(), '2026-08-31')
    strictEqual(rows.find((r) => r.rfha === '0000050000978')?.monat, 5)
  })
})

describe('key date', () => {
  it('accepts a real month end', () => {
    ok(validKeyDate('30-09-2026'))
    ok(validKeyDate('28-02-2027'))
    ok(validKeyDate('29-02-2028'))
  })
  it('rejects mid-month, impossible and malformed dates', () => {
    strictEqual(validKeyDate('15-09-2026'), null)
    strictEqual(validKeyDate('31-09-2026'), null)
    strictEqual(validKeyDate('2026-09-30'), null)
    strictEqual(validKeyDate(''), null)
  })
  it('knows month ends', () => {
    ok(isMonthEnd(new Date(2026, 8, 30)))
    ok(!isMonthEnd(new Date(2026, 8, 29)))
  })
  it('adds days across a month end', () => {
    strictEqual(addDays('2026-09-30', 1), '2026-10-01')
  })
})

describe('filterRows', () => {
  const rows = seedRows()
  const list = (over: Partial<typeof DEFAULT_FILTERS> = {}, key = KEY) =>
    filterRows(rows, { ...DEFAULT_FILTERS, ...over }, key, DEFAULT_SORT)

  it('keeps rows traded on or before the key date and valued after it', () => {
    const all = list()
    strictEqual(all.length, 18)
    ok(all.every((r) => r.tradeDate <= '2026-09-30' && r.valueDate > '2026-09-30'))
    strictEqual(list({}, '31-10-2026').some((r) => r.rfha === '0000050000974'), false) // value 2026-10-30
    strictEqual(list({}, '31-07-2026').length, 2) // only the 24-Jul and 29-Jul trades
  })

  it('lists nothing for a bad key date', () => {
    strictEqual(list({}, '15-09-2026').length, 0)
    strictEqual(list({}, 'abc').length, 0)
  })

  it('filters by company, transaction, partner, currency pair and deal type', () => {
    ok(list({ company: 'IN10' }).every((r) => r.bukrs === 'IN10'))
    deepStrictEqual(list({ transaction: '0000050000978' }).map((r) => r.rfha), ['0000050000978'])
    ok(list({ partner: '0400000645' }).every((r) => r.kontrh === '0400000645'))
    strictEqual(list({ currency: 'USD/INR' }).length, 18)
    strictEqual(list({ currency: 'EUR/INR' }).length, 0)
    ok(list({ dealType: 'WITH' }).every((r) => r.ztsfDealId))
    ok(list({ dealType: 'WITHOUT' }).every((r) => !r.ztsfDealId))
    strictEqual(list({ dealType: 'WITH' }).length + list({ dealType: 'WITHOUT' }).length, 18)
  })

  it('searches every column but the checkbox, case-insensitively, dates as shown', () => {
    deepStrictEqual(list({ search: '  ind-ext-978 ' }).map((r) => r.rfha), ['0000050000978'])
    ok(list({ search: 'hsbc' }).every((r) => r.bpName.includes('HSBC')))
    ok(list({ search: '29-01-2027' }).length === 2)
    strictEqual(list({ search: 'no such text' }).length, 0)
  })

  it('sorts descending by transaction by default', () => {
    const ids = list().map((r) => r.rfha)
    deepStrictEqual(ids, [...ids].sort().reverse())
  })
})

describe('sorting', () => {
  it('flips direction on the same column and starts a new one ascending', () => {
    deepStrictEqual(nextSort({ field: 'rfha', dir: -1 }, 'rfha'), { field: 'rfha', dir: 1 })
    deepStrictEqual(nextSort({ field: 'rfha', dir: 1 }, 'rfha'), { field: 'rfha', dir: -1 })
    deepStrictEqual(nextSort({ field: 'rfha', dir: -1 }, 'fAmt'), { field: 'fAmt', dir: 1 })
  })
  it('compares numbers numerically and text case-insensitively, empties as ""', () => {
    const rows = seedRows()
    const asc = sortRows(rows, { field: 'fAmt', dir: 1 }).map((r) => r.fAmt)
    deepStrictEqual(asc, [...asc].sort((a, b) => a - b))
    const gl = sortRows(rows, { field: 'vGl', dir: 1 })
    strictEqual(gl[0]?.vGl, null) // a missing G/L sorts as an empty string
  })
  it('does not mutate its input', () => {
    const rows = seedRows()
    const before = rows.map((r) => r.rfha)
    sortRows(rows, { field: 'bpName', dir: 1 })
    deepStrictEqual(rows.map((r) => r.rfha), before)
  })
})

describe('paging', () => {
  it('counts and clamps pages', () => {
    strictEqual(pageCount(0, 8), 1)
    strictEqual(pageCount(18, 8), 3)
    strictEqual(clampPage(9, 18, 8), 3)
    strictEqual(clampPage(0, 18, 8), 1)
  })
  it('slices a page and words the footer', () => {
    const s = pageSlice([...Array(18).keys()], 3, 8)
    deepStrictEqual(s.rows, [16, 17])
    strictEqual(showingText(18, s.start, s.end), 'Showing 17–18 of 18')
    strictEqual(showingText(0, 0, 0), 'Showing 0 of 0')
  })
  it('windows up to five page numbers around the current page', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3, 4, 5])
    deepStrictEqual(pagerWindow(5, 10), [3, 4, 5, 6, 7])
    deepStrictEqual(pagerWindow(10, 10), [6, 7, 8, 9, 10])
  })
})

describe('eligibility and posting', () => {
  it('needs no primary MTM document and a non-zero G/L', () => {
    ok(isEligible(derived('0000050000978')))
    ok(!isEligible(derived('0000050000977'))) // already posted
    ok(!isEligible(derived('0000050000974'))) // complete payment, G/L null
    ok(!isEligible(derived('0000050000976', { vSpot: 84.33, vSwap: 0.12 }))) // zero G/L
    ok(!isEligible(null))
  })

  it('numbers two MTM and two reversal documents from the counters and logs four rows', () => {
    const r = derived('0000050000978')
    const out = simulatePosting(r, INITIAL_COUNTERS)
    strictEqual(out.row.mtmDoc, '1900064201')
    strictEqual(out.row.revDoc, '2900032201')
    strictEqual(out.row.mtmDoc2, '1900064202')
    strictEqual(out.row.revDoc2, '2900032202')
    strictEqual(out.row.msg, 'Document Posted Sucessfully')
    deepStrictEqual(out.counters, { doc: 1900064202, rev: 2900032202 })
    deepStrictEqual(out.logs.map((l) => [l.kind, l.doc]), [
      ['MTM Ledger 1', '1900064201'],
      ['Reversal Ledger 1', '2900032201'],
      ['MTM Ledger 2', '1900064202'],
      ['Reversal Ledger 2', '2900032202'],
    ])
    ok(out.logs.every((l) => l.ok && l.rfha === r.rfha && l.diff === r.vGl && l.rate === r.cRate))
    strictEqual(r.mtmDoc, '') // input untouched
    ok(!isEligible(out.row))
  })

  it('keeps counting across postings', () => {
    const a = simulatePosting(derived('0000050000978'), INITIAL_COUNTERS)
    const b = simulatePosting(derived('0000050000976'), a.counters)
    strictEqual(b.row.mtmDoc, '1900064203')
    strictEqual(b.row.revDoc2, '2900032204')
  })

  it('tells which ledger and direction a document column is', () => {
    deepStrictEqual(docInfo('mtmDoc'), { isRev: false, ledger: '1' })
    deepStrictEqual(docInfo('revDoc'), { isRev: true, ledger: '1' })
    deepStrictEqual(docInfo('mtmDoc2'), { isRev: false, ledger: '2' })
    deepStrictEqual(docInfo('revDoc2'), { isRev: true, ledger: '2' })
  })
})

describe('lookups', () => {
  const rows = seedRows()
  it('lists companies and partners with their names, sorted', () => {
    deepStrictEqual(companyOptions(rows, COMPANY_NAMES).map((o) => o.value), ['IN10', 'IN11'])
    strictEqual(companyOptions(rows, COMPANY_NAMES)[0]?.label, 'IN10 — Olam International India Pvt Ltd')
    strictEqual(partnerOptions(rows)[0]?.label, '0400000003 — CITI BANK N.A. INDIA')
    strictEqual(ALL, 'ALL')
  })
})

describe('formatting and CSV', () => {
  it('formats numbers, dates and cells', () => {
    strictEqual(formatNumber(1234567.891, 2), '1,234,567.89')
    strictEqual(formatNumber(-1234.5, 2), '-1,234.50')
    strictEqual(formatNumber(84.2, 4), '84.2000')
    strictEqual(formatNumber(null, 2), '')
    strictEqual(formatDate('2026-09-30'), '30-09-2026')
    strictEqual(parseDisplayDate('31-02-2026'), null)
    strictEqual(cellText(null, 'amount'), null)
    strictEqual(cellText('', 'text'), null)
    strictEqual(cellText(0, 'amount'), '0.00')
    strictEqual(cellText(62.5, 'percent'), '62.50%')
    strictEqual(cellText(84.6, 'rate'), '84.6000')
    strictEqual(cellText('2026-09-30', 'date'), '30-09-2026')
    strictEqual(cellText(4, 'number'), '4')
  })

  it('quotes CSV fields', () => {
    strictEqual(csvQuote('a "b"'), '"a ""b"""')
  })

  it('writes a header plus one CRLF line per row, without the checkbox column', () => {
    const rows = seedRows().slice(0, 2)
    const lines = buildCsv(rows).split('\r\n')
    strictEqual(lines.length, 3)
    ok(lines[0]?.startsWith('"Transaction","Company Code"'))
    ok(lines[0]?.endsWith('"External Reference"'))
    ok(lines[1]?.includes('"30-09-2026"') === false)
    ok(lines[1]?.includes('"24-07-2026"'))
    ok(lines[1]?.includes('"62.50%"'))
    // complete-payment row: empty G/L, not "null"
    const complete = buildCsv([derived('0000050000974')])
    ok(!complete.includes('null'))
  })
})
