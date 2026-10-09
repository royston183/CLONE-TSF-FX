import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, DEAL_SPECS, INITIAL_NEXT_DOC, LAYOUTS } from './data.ts'
import {
  addDaysISO,
  formatAmount,
  formatDMY,
  formatRate,
  isMonthEnd,
  isoToDMY,
  monthsBetween,
  parseDMY,
  toISO,
} from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  applyCriteria,
  buildPostingItems,
  buildViewRecord,
  calculateValuation,
  calendarDays,
  calendarYears,
  cellText,
  clampPage,
  companyDisplay,
  createMockDb,
  documentView,
  emptyState,
  fetchMtmRows,
  findAccConfig,
  floatingPosition,
  glPad,
  isEligibleForPosting,
  layoutColumns,
  massPost,
  nextSort,
  pageCount,
  planExecution,
  postBlockReason,
  postMtmDocument,
  resultCountText,
  shiftMonth,
  showingText,
  spotFor,
  swapFor,
  toggleCompany,
  transactionView,
  validateCompany,
  validateKeyDate,
  visibleRows,
} from './logic.ts'
import type { MtmRow, SelectionParams } from './types.ts'

const ALL = ['SG11', 'SG12', 'AE10']
const KEY = '2026-09-30'
const db = createMockDb()
const rows = fetchMtmRows(db, { company: ALL, keyDate: KEY })
const byId = (id: string) => rows.find((r) => r.rfha === `FX2026000${id}`) as MtmRow
const ids = (rs: readonly MtmRow[]) => rs.map((r) => r.rfha.slice(-3))
const close = (a: number, b: number) => strictEqual(Math.abs(a - b) < 1e-6, true, `${a} vs ${b}`)
const params = (over: Partial<SelectionParams> = {}): SelectionParams => ({ company: ALL, keyDate: KEY, posting: 'view', ...over })

describe('dates and numbers', () => {
  it('parses dd-mm-yyyy with - . / and rejects impossible days', () => {
    strictEqual(toISO(parseDMY('30-09-2026') as Date), '2026-09-30')
    strictEqual(toISO(parseDMY('1/9/2026') as Date), '2026-09-01')
    strictEqual(toISO(parseDMY(' 30.09.2026 ') as Date), '2026-09-30')
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026-09-30'), null)
    strictEqual(parseDMY(''), null)
  })
  it('formats and shifts dates', () => {
    strictEqual(formatDMY(new Date(2026, 0, 5)), '05-01-2026')
    strictEqual(isoToDMY('2026-09-30'), '30-09-2026')
    strictEqual(addDaysISO('2026-09-30', 1), '2026-10-01')
    strictEqual(addDaysISO('2026-12-31', 1), '2027-01-01')
  })
  it('knows month ends, including leap years', () => {
    strictEqual(isMonthEnd(new Date(2028, 1, 28)), false)
    strictEqual(isMonthEnd(new Date(2028, 1, 29)), true)
    strictEqual(isMonthEnd(new Date(2026, 8, 30)), true)
  })
  it('counts calendar months between key and value date', () => {
    strictEqual(monthsBetween('2026-09-30', '2026-12-15'), 3)
    strictEqual(monthsBetween('2026-09-30', '2026-10-30'), 1)
    strictEqual(monthsBetween('2026-09-30', '2026-08-26'), -1)
  })
  it('formats amounts and rates; tiny values never show -0.00', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatAmount(-1500), '-1,500.00')
    strictEqual(formatAmount(-0.004), '0.00')
    strictEqual(formatAmount(null), '0.00')
    strictEqual(formatRate(1.171), '1.1710')
  })
})

describe('swap and spot lookup', () => {
  it('takes an exact tenor straight from the curve', () => {
    strictEqual(swapFor('USD/INR', 12), 3.8)
    strictEqual(swapFor('EUR/USD', 3), 0.0018)
  })
  it('interpolates linearly between two tenors', () => {
    close(swapFor('USD/INR', 2), 0.625)
    close(swapFor('USD/INR', 4), 1.266667)
    close(swapFor('USD/SGD', 2), -0.0024)
  })
  it('is zero outside 1-60 months or for an unknown pair', () => {
    strictEqual(swapFor('USD/INR', 0), 0)
    strictEqual(swapFor('USD/INR', 61), 0)
    strictEqual(swapFor('USD/JPY', 6), 0)
  })
  it('uses the latest spot date on or before the key date, else the earliest', () => {
    strictEqual(spotFor('2026-09-30', 'USD/INR'), 88.9)
    strictEqual(spotFor('2026-10-31', 'USD/INR'), 88.9)
    strictEqual(spotFor('2026-08-15', 'USD/INR'), 87.62)
    strictEqual(spotFor('2026-05-31', 'USD/INR'), 87.1)
    strictEqual(spotFor('2026-09-30', 'USD/JPY'), 0)
  })
})

describe('valuation', () => {
  it('derives the legs of a Buy USD/INR deal', () => {
    const rec = buildViewRecord(DEAL_SPECS.find((d) => d.rfha === 'FX2026000101')!)
    strictEqual(rec.amt1, 5000000)
    strictEqual(rec.amt2, -446250000)
    strictEqual(rec.bs_1, 'Buy')
    strictEqual(rec.bs_2, 'Sell')
    strictEqual(rec.ztsf_deal_id, 'TSF-2026000101')
    strictEqual(rec.zolam_deal_no, 'OLM-000101')
  })
  it('values a deal: foreign leg, USD at all-in rate, valuation rate = spot + swap', () => {
    const r = byId('101')
    strictEqual(r.f_curr, 'INR')
    strictEqual(r.f_amt, 446250000)
    strictEqual(r.usd_amt, 5000000)
    strictEqual(r.monat, 3)
    strictEqual(r.v_spot, 88.9)
    strictEqual(r.v_swap, 0.95)
    close(r.v_rate, 89.85)
    strictEqual(r.v_amt, 4966611.02)
    strictEqual(r.v_gl, 33388.98)
    strictEqual(r.month, 'Dec 2026')
  })
  it('applies the buy/sell sign rule on both sides of the rate comparison', () => {
    // Shown side Buy: negated when the all-in rate is at or below the valuation rate.
    strictEqual(byId('104').bs_bu, 'Buy')
    strictEqual(byId('104').c_rate > byId('104').v_rate, true)
    strictEqual(byId('104').v_gl, 1680)
    strictEqual(byId('102').bs_bu, 'Buy')
    strictEqual(byId('102').c_rate <= byId('102').v_rate, true)
    strictEqual(byId('102').v_gl, -21475.77)
    // Shown side Sell: negated when the all-in rate is above the valuation rate.
    strictEqual(byId('204').bs_bu, 'Sell')
    strictEqual(byId('204').c_rate > byId('204').v_rate, true)
    strictEqual(byId('204').v_gl, -8320)
    strictEqual(byId('101').bs_bu, 'Sell')
    strictEqual(byId('101').c_rate <= byId('101').v_rate, true)
    strictEqual(byId('101').v_gl, 33388.98)
  })
  it('puts the foreign amount on the non-USD leg when USD is the quote currency', () => {
    const r = byId('104')
    strictEqual(r.f_curr, 'EUR')
    strictEqual(r.f_amt, 2400000)
    strictEqual(r.usd_amt, 2816400)
    strictEqual(r.v_amt, 2814720)
  })
  it('zeroes the swap when the value date is out of the 1-60 month window', () => {
    const rec = buildViewRecord(DEAL_SPECS.find((d) => d.rfha === 'FX2026000101')!)
    const past = calculateValuation(rec, '2027-01-31')
    strictEqual(past.monat, 0)
    strictEqual(past.v_swap, 0)
    close(past.v_rate, past.v_spot)
  })
  it('numbers every row in a stable company then transaction order', () => {
    strictEqual(rows.length, 26)
    strictEqual(rows[0]?.rfha, 'FX2026000101')
    strictEqual(rows[25]?.rfha, 'FX2026000306')
    strictEqual(byId('101').id, 'SG11|FX2026000101')
  })
})

describe('listing a run (GET_DATA)', () => {
  it('keeps trade date on or before and value date after the key date', () => {
    const r = fetchMtmRows(db, { company: ['SG11'], keyDate: '2026-06-30' }).map((x) => x.rfha.slice(-3))
    // 108 trades exactly on the key date (listed); 107 trades later (not).
    strictEqual(r.includes('108'), true)
    strictEqual(r.includes('107'), false)
    strictEqual(fetchMtmRows(db, { company: ['SG11'], keyDate: '2026-12-15' }).some((x) => x.rfha.endsWith('101')), false)
  })
  it('never lists excluded status 40 or inactive (SAKTIV 3) transactions', () => {
    const all = fetchMtmRows(db, { company: ALL, keyDate: '2026-09-30' }).map((x) => x.rfha)
    strictEqual(all.includes('FX2026000401'), false)
    strictEqual(all.includes('FX2026000402'), false)
  })
  it('lists only the chosen company codes', () => {
    deepStrictEqual([...new Set(fetchMtmRows(db, { company: ['AE10'], keyDate: KEY }).map((x) => x.bukrs))], ['AE10'])
    strictEqual(fetchMtmRows(db, { company: [], keyDate: KEY }).length, 0)
  })
  it('joins the posted documents of that exact key date', () => {
    strictEqual(byId('106').mtm_doc, '1900004600')
    strictEqual(byId('106').rev_doc, '1900004601')
    strictEqual(byId('106').msg, 'Document Posted Successfully')
    strictEqual(byId('204').mtm_doc, '1900004602')
    strictEqual(byId('101').mtm_doc, '')
    const august = fetchMtmRows(db, { company: ALL, keyDate: '2026-08-31' })
    strictEqual(august.some((r) => r.mtm_doc !== ''), true)
  })
  it('seeds every second valued deal of the earlier month ends', () => {
    const july = fetchMtmRows(null, { company: ALL, keyDate: '2026-07-31' }, true)
    const posted = july.filter((_, i) => i % 2 === 0 && _.v_gl !== 0)
    const joined = fetchMtmRows(db, { company: ALL, keyDate: '2026-07-31' }).filter((r) => r.mtm_doc)
    deepStrictEqual(ids(joined), ids(posted))
    strictEqual(joined[0]?.mtm_doc, '1900003100')
    strictEqual(joined[0]?.rev_doc, '1900003101')
    strictEqual(joined[1]?.mtm_doc, '1900003102')
    strictEqual(db.nextDoc, INITIAL_NEXT_DOC)
  })
})

describe('criteria, search, sort, paging', () => {
  it('filters by transaction text, partner, pair and NDF / deliverable', () => {
    strictEqual(applyCriteria(rows, { ...DEFAULT_FILTERS, rfha: ' 000101 ' }).length, 1)
    strictEqual(applyCriteria(rows, { ...DEFAULT_FILTERS, pair: 'EUR/USD' }).length, 5)
    strictEqual(applyCriteria(rows, { ...DEFAULT_FILTERS, bp: '0000100359' }).length, 1)
    const ndf = applyCriteria(rows, { ...DEFAULT_FILTERS, deal: 'ndf' })
    const del = applyCriteria(rows, { ...DEFAULT_FILTERS, deal: 'del' })
    strictEqual(ndf.every((r) => r.sgsart.charAt(2) === 'D'), true)
    strictEqual(ndf.length + del.length, rows.length)
    strictEqual(ndf.length, 6)
  })
  it('searches the text of the columns of the current layout, dates as shown', () => {
    const v = (s: string, layout = '') => visibleRows(rows, DEFAULT_FILTERS, s, DEFAULT_SORT, layout)
    deepStrictEqual(ids(v('FX2026000306')), ['306'])
    strictEqual(v('15-12-2026').length, 1)
    // Ext. Reference is only in the All fields layout.
    strictEqual(v('CITI-260612-0418').length, 0)
    strictEqual(v('CITI-260612-0418', 'ALL').length, 1)
    strictEqual(v('nothing like this').length, 0)
  })
  it('sorts text, numbers and Exp Mth-yr (by value date)', () => {
    const by = (field: keyof typeof COLUMNS, dir: 'asc' | 'desc') =>
      visibleRows(rows, DEFAULT_FILTERS, '', { field, dir }, '')
    strictEqual(by('f_amt', 'asc')[0]?.rfha, 'FX2026000304')
    strictEqual(by('f_amt', 'desc')[0]?.rfha, 'FX2026000201')
    strictEqual(by('v_gl', 'asc')[0]?.rfha, 'FX2026000103')
    strictEqual(by('month', 'asc')[0]?.delfz, '2026-10-26')
    strictEqual(by('rfha', 'desc')[0]?.rfha, 'FX2026000306')
  })
  it('flips the sorted column and starts others ascending', () => {
    deepStrictEqual(nextSort(DEFAULT_SORT, 'rfha'), { field: 'rfha', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'rfha', dir: 'asc' }, 'rfha'), { field: 'rfha', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'rfha', dir: 'desc' }, 'cpair'), { field: 'cpair', dir: 'asc' })
  })
  it('pages and describes the page', () => {
    strictEqual(pageCount(26, 20), 2)
    strictEqual(pageCount(0, 20), 1)
    strictEqual(clampPage(5, 26, 20), 2)
    strictEqual(showingText(2, 20, 26, 6), 'Showing 21–26 of 26')
    strictEqual(showingText(1, 20, 0, 0), '')
    strictEqual(resultCountText(1), '1 transaction')
    strictEqual(resultCountText(26), '26 transactions')
  })
  it('chooses the placeholder shown instead of the table', () => {
    strictEqual(emptyState(false, 0, 0)?.title, 'Run the selection to view transactions')
    strictEqual(emptyState(true, 0, 0)?.title, 'No transactions found')
    strictEqual(emptyState(true, 5, 0)?.title, 'No transactions match your search or filters')
    strictEqual(emptyState(true, 5, 3), null)
  })
  it('renders cells as the table shows them', () => {
    const r = byId('101')
    strictEqual(cellText('dblfz', r), '12-06-2026')
    strictEqual(cellText('f_amt', r), '446,250,000.00')
    strictEqual(cellText('v_rate', r), '89.8500')
    strictEqual(cellText('monat', r), '3')
    strictEqual(cellText('mtm_doc', r), '')
    strictEqual(layoutColumns('VALUATION').length, 15)
    strictEqual(layoutColumns('unknown'), LAYOUTS[0]?.cols)
  })
})

describe('selection screen', () => {
  it('requires a Key Date, a real date and a month end, and normalises what it can read', () => {
    deepStrictEqual(validateKeyDate('  '), { ok: false, error: 'Key Date is required.', text: '  ' })
    deepStrictEqual(validateKeyDate('abc'), { ok: false, error: 'Enter a valid date (DD-MM-YYYY).', text: 'abc' })
    deepStrictEqual(validateKeyDate('31-02-2026'), { ok: false, error: 'Enter a valid date (DD-MM-YYYY).', text: '31-02-2026' })
    deepStrictEqual(validateKeyDate('15-9-2026'), { ok: false, error: 'Key Date should be Month End Date only.', text: '15-09-2026' })
    deepStrictEqual(validateKeyDate('30/9/2026'), { ok: true, iso: '2026-09-30', text: '30-09-2026' })
  })
  it('requires at least one company code', () => {
    strictEqual(validateCompany([]), 'Company Code is required.')
    strictEqual(validateCompany(['SG11']), null)
  })
  it('keeps the company list sorted and shows it comma separated', () => {
    deepStrictEqual(toggleCompany(['SG11'], 'AE10', true), ['AE10', 'SG11'])
    deepStrictEqual(toggleCompany(['AE10', 'SG11'], 'AE10', false), ['SG11'])
    deepStrictEqual(toggleCompany(['SG11'], 'SG11', true), ['SG11'])
    strictEqual(companyDisplay(['AE10', 'SG11']).value, 'AE10, SG11')
    strictEqual(companyDisplay(['AE10']).title, 'AE10 · Olam Agri DMCC')
    strictEqual(companyDisplay([]).value, '')
  })
  it('executes straight away for View Only', () => {
    strictEqual(planExecution(rows, params(), DEFAULT_FILTERS).kind, 'commit')
  })
  it('asks first for View With FI Posting when something can be posted', () => {
    const plan = planExecution(rows, params({ posting: 'post' }), DEFAULT_FILTERS)
    strictEqual(plan.kind, 'confirm')
    if (plan.kind === 'confirm') {
      strictEqual(plan.run.listed, 26)
      // Two rows already carry an MTM document.
      strictEqual(plan.run.eligible.length, 24)
      strictEqual(plan.run.eligible.every(isEligibleForPosting), true)
    }
  })
  it('counts only the rows the toolbar criteria leave, and skips the popup when none can be posted', () => {
    const plan = planExecution(rows, params({ posting: 'post' }), { ...DEFAULT_FILTERS, pair: 'USD/SGD' })
    strictEqual(plan.kind === 'confirm' && plan.run.listed, 3)
    strictEqual(plan.kind === 'confirm' && plan.run.eligible.length, 2)
    const posted = rows.filter((r) => r.mtm_doc)
    strictEqual(planExecution(posted, params({ posting: 'post' }), DEFAULT_FILTERS).kind, 'commit')
  })
})

describe('posting (POST_DOCUMNET)', () => {
  it('explains why a row cannot be posted', () => {
    strictEqual(postBlockReason(null), 'Select a transaction first.')
    strictEqual(postBlockReason(byId('106')), 'This transaction already has an MTM document.')
    strictEqual(postBlockReason({ ...byId('101'), v_gl: 0 }), 'This transaction has no valuation gain/loss to post.')
    strictEqual(postBlockReason(byId('101')), '')
  })
  it('picks the account entry by company, gain/loss and NDF', () => {
    strictEqual(findAccConfig('SG11', 'ML', false)?.gl_debit, '7810010')
    strictEqual(findAccConfig('SG11', 'MG', true)?.gl_credit, '8810020')
    strictEqual(findAccConfig('XX99', 'MG', false), null)
    strictEqual(glPad('1410010'), '0001410010')
  })
  it('posts the MTM document and its reversal from the number range', () => {
    const r = byId('101')
    const res = postMtmDocument(db, r, KEY)
    deepStrictEqual(
      res.msgs.map((m) => [m.type, m.rfha, m.doc, m.diff, m.rate, m.message]),
      [
        ['S', 'FX2026000101', '1900004801', 33388.98, 89.25, 'Document Posted Successfully'],
        ['S', 'FX2026000101', '1900004802', 33388.98, 89.25, 'Document Posted Successfully'],
      ],
    )
    strictEqual(res.db.nextDoc, INITIAL_NEXT_DOC + 2)
    // The input tables are untouched; the new ones return the document on the next fetch.
    strictEqual(db.nextDoc, INITIAL_NEXT_DOC)
    const again = fetchMtmRows(res.db, { company: ALL, keyDate: KEY }).find((x) => x.rfha === r.rfha) as MtmRow
    strictEqual(again.mtm_doc, '1900004801')
    strictEqual(again.rev_doc, '1900004802')
    strictEqual(isEligibleForPosting(again), false)
  })
  it('overwrites the entry of a transaction that is posted again for the same key date', () => {
    const once = postMtmDocument(db, byId('101'), KEY).db
    const twice = postMtmDocument(once, byId('101'), KEY).db
    strictEqual(twice.mtmData.length, once.mtmData.length)
    strictEqual(twice.mtmData.find((m) => m.zrfha === 'FX2026000101' && m.zdate === KEY)?.zdoc, '1900004803')
    strictEqual(twice.mtmData.find((m) => m.zrfha === 'FX2026000101' && m.zdate === KEY)?.zrev_doc, '1900004804')
  })
  it('reports a closed posting period as one error and posts nothing', () => {
    const ae = byId('301')
    const res = postMtmDocument(db, ae, KEY)
    deepStrictEqual(res.msgs, [
      {
        type: 'E',
        rfha: 'FX2026000301',
        doc: '',
        diff: ae.v_gl,
        rate: 89.9,
        message: 'Posting period 09/2026 is not open for company code AE10',
      },
    ])
    strictEqual(res.db, db)
  })
  it('posts nothing when no account entry is maintained', () => {
    const res = postMtmDocument(db, { ...byId('101'), bukrs: 'XX99' }, KEY)
    deepStrictEqual(res.msgs, [])
    strictEqual(res.db, db)
  })
  it('mass posts every eligible row in order, errors included', () => {
    const plan = planExecution(rows, params({ posting: 'post' }), DEFAULT_FILTERS)
    if (plan.kind !== 'confirm') throw new Error('expected a confirmation')
    const res = massPost(db, plan.run)
    const errors = res.msgs.filter((m) => m.type === 'E')
    // The six AE10 rows hit the closed period; the 18 others post two documents each.
    strictEqual(errors.length, 6)
    strictEqual(res.msgs.length, 18 * 2 + 6)
    strictEqual(res.db.nextDoc, INITIAL_NEXT_DOC + 36)
    const after = fetchMtmRows(res.db, { company: ALL, keyDate: KEY })
    strictEqual(after.filter((r) => r.mtm_doc).length, 2 + 18)
  })
  it('builds the two line items, flipped for the reversal, falling back to the deal profit centre', () => {
    const r = byId('101')
    const cfg = findAccConfig('SG11', 'MG', false)!
    const mtm = buildPostingItems(r, cfg, false)
    deepStrictEqual(
      mtm.map((i) => [i.item, i.gl, i.amount, i.pc, i.ba, i.text]),
      [
        [1, '0001410010', 33388.98, 'PC-SG11-TRS', 'T110', 'MTM Asset:FX Forward - Deliverable'],
        [2, '0008810010', -33388.98, 'PC-SG11-TRS', 'T110', 'MTM Gain:FX Forward - Deliverable'],
      ],
    )
    deepStrictEqual(
      buildPostingItems(r, cfg, true).map((i) => i.amount),
      [-33388.98, 33388.98],
    )
  })
})

describe('popup views', () => {
  const posted = byId('106')
  it('has no document view for a row without that document', () => {
    strictEqual(documentView(byId('101'), 'MTM', KEY), null)
    strictEqual(documentView(byId('101'), 'REV', KEY), null)
  })
  it('describes the MTM document at the key date', () => {
    const v = documentView(posted, 'MTM', KEY)!
    strictEqual(v.title, 'Accounting Document 1900004600')
    strictEqual(v.banner, 'MTM posting document')
    strictEqual(v.reversal, false)
    strictEqual(v.header.find((h) => h.label === 'Posting Date')?.value, '30-09-2026')
    strictEqual(v.header.find((h) => h.label === 'Fiscal Year')?.value, '2026')
    strictEqual(v.header.find((h) => h.label === 'Header Text')?.full, true)
    strictEqual(v.items.length, 2)
  })
  it('dates the reversal the day after the key date, across a year end', () => {
    const v = documentView(posted, 'REV', KEY)!
    strictEqual(v.title, 'Reversal Document 1900004601')
    strictEqual(v.banner, 'Reversal of MTM document 1900004600 · reason 02')
    strictEqual(v.header.find((h) => h.label === 'Posting Date')?.value, '01-10-2026')
    strictEqual(documentView(posted, 'REV', '2026-12-31')?.header.find((h) => h.label === 'Fiscal Year')?.value, '2027')
  })
  it('describes the transaction legs and accounting assignment', () => {
    const v = transactionView(byId('101'))
    strictEqual(v.title, 'Transaction FX2026000101')
    strictEqual(v.legs[0]?.head, 'Leg 1 · Buy')
    strictEqual(v.legs[0]?.value, 'USD 5,000,000.00')
    strictEqual(v.legs[1]?.head, 'Leg 2 · Sell')
    strictEqual(v.legs[1]?.value, 'INR -446,250,000.00')
    strictEqual(v.assignment[0]?.value, 'PC-SG11-TRS · Treasury Singapore')
    strictEqual(v.general.find((g) => g.label === 'Product Type')?.value, '600 · FX Forward - Deliverable')
  })
})

describe('calendar and floating panels', () => {
  it('rolls the shown month over year ends', () => {
    deepStrictEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
    deepStrictEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
  })
  it('offers six years either side of the shown or current year', () => {
    const ys = calendarYears(2026, 2026)
    strictEqual(ys[0], 2020)
    strictEqual(ys[ys.length - 1], 2032)
    strictEqual(calendarYears(2040, 2026).length, 2040 + 6 - (2026 - 6) + 1)
  })
  it('lays out September 2026 with muted neighbours and finishes the week', () => {
    const days = calendarDays({ year: 2026, month: 8 }, new Date(2026, 8, 30), new Date(2026, 8, 1))
    // 1 Sep 2026 is a Tuesday: two leading days from August (30, 31).
    deepStrictEqual(days.slice(0, 2).map((d) => [d.day, d.muted]), [[30, true], [31, true]])
    strictEqual(days.length % 7, 0)
    strictEqual(days.filter((d) => !d.muted).length, 30)
    strictEqual(days.find((d) => d.selected)?.day, 30)
    strictEqual(days.find((d) => d.today)?.day, 1)
    strictEqual(days[days.length - 1]?.muted, true)
  })
  it('places a floating panel under its trigger, flips above and clamps into the window', () => {
    const trigger = { left: 100, top: 50, right: 200, bottom: 80, width: 100, height: 30 }
    const panel = { width: 268, height: 200 }
    const viewport = { width: 1000, height: 800 }
    deepStrictEqual(floatingPosition(trigger, panel, viewport, { gap: 4 }), { left: 100, top: 84 })
    deepStrictEqual(floatingPosition(trigger, panel, viewport, { alignRight: true, gap: 6 }), { left: 8, top: 86 })
    const low = { left: 900, top: 700, right: 1000, bottom: 730, width: 100, height: 30 }
    deepStrictEqual(floatingPosition(low, panel, viewport, { gap: 4 }), { left: 724, top: 496 })
    const cramped = floatingPosition(low, { width: 268, height: 790 }, viewport)
    strictEqual(cramped.top, 8)
  })
})
