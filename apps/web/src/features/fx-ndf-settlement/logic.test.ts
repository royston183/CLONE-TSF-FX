import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULTS, LAYOUT_VARIANTS } from './data.ts'
import { formatAmount, formatRate, isoToDmy, parseDateInput, prevBusinessDay, rollBackWeekend } from './format.ts'
import {
  NO_SORT,
  buildDeal,
  buildLetterModel,
  buildMockDb,
  buildPdfBytes,
  buildPdfString,
  calcNdfCashAmount,
  calendarCells,
  cellValue,
  cloneDb,
  commitTypedDate,
  companySummary,
  defaultCriteria,
  emptyText,
  getBankAddress,
  getBankTransferLines,
  getData,
  getVisibleRows,
  keyDateOf,
  layoutItems,
  letterDealTable,
  letterPdfItems,
  matchesFiDoc,
  nextSort,
  pageSlice,
  pdfEscape,
  pdfFileName,
  postAll,
  rfhaItems,
  rowId,
  runSummary,
  shiftMonth,
  singlePost,
  singleTestView,
  sortMark,
  submitPostingRun,
  toggleCompany,
  updateStatusAfterPosting,
  validateCriteria,
  viewForDate,
} from './logic.ts'
import type { Criteria, Deal } from './types.ts'

const db = buildMockDb()
const crit = defaultCriteria()
const listed = getData(crit, db)
const ids = (rows: Deal[]) => rows.map((r) => r.rfha.slice(-4))
const byRfha = (rows: Deal[], rfha: string) => {
  const r = rows.find((x) => x.rfha === rfha)
  if (!r) throw new Error(`no deal ${rfha}`)
  return r
}
const dealOf = (rfha: string) => byRfha(db.vtbfha, rfha)

describe('format', () => {
  it('formats amounts and rates', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatAmount(-1500), '-1,500.00')
    strictEqual(formatRate(90.215), '90.215000')
  })
  it('converts ISO to dd-mm-yyyy', () => {
    strictEqual(isoToDmy('2026-10-05'), '05-10-2026')
    strictEqual(isoToDmy(''), '')
  })
  it('parses lenient dates', () => {
    strictEqual(parseDateInput('05-10-2026'), '2026-10-05')
    strictEqual(parseDateInput('5/10/2026'), '2026-10-05')
    strictEqual(parseDateInput('5.1.2026'), '2026-01-05')
    strictEqual(parseDateInput('05102026'), '2026-10-05')
    strictEqual(parseDateInput(' 31-10-2026 '), '2026-10-31')
    strictEqual(parseDateInput('31-02-2026'), null)
    strictEqual(parseDateInput('2026-10-05'), null)
    strictEqual(parseDateInput(''), null)
  })
  it('rolls weekends back and counts business days', () => {
    strictEqual(rollBackWeekend('2026-10-04'), '2026-10-02') // Sunday -> Friday
    strictEqual(rollBackWeekend('2026-10-03'), '2026-10-02') // Saturday -> Friday
    strictEqual(rollBackWeekend('2026-10-05'), '2026-10-05')
    strictEqual(prevBusinessDay('2026-10-05', 2), '2026-10-01') // Mon -> Fri -> Thu
    strictEqual(prevBusinessDay('2026-10-07', 2), '2026-10-05')
  })
})

describe('NDF cash amount', () => {
  it('buy USD settles N*(F-K)/F, rounded to cents', () => {
    strictEqual(calcNdfCashAmount('B', 2500000, 90.215, 90.88), 18293.35)
  })
  it('sell USD is the opposite sign', () => {
    strictEqual(calcNdfCashAmount('S', 1800000, 90.54, 90.1275), 8238.33)
    strictEqual(calcNdfCashAmount('B', 1250000, 90.1, 89.734) < 0, true)
  })
  it('is zero when the fixing equals the contract rate', () => {
    strictEqual(calcNdfCashAmount('B', 1000000, 90, 90), 0)
  })
})

describe('mock database', () => {
  it('derives each deal from its seed', () => {
    const d = dealOf('5000004101')
    strictEqual(d.butxt, 'IN11 - Olam Agri India Pvt Ltd')
    strictEqual(d.bp_name, 'HSBC')
    strictEqual(d.cpair, 'USD/INR')
    strictEqual(d.bs_1, 'Buy')
    strictEqual(d.bs_2, 'Sell')
    strictEqual(d.amt2, 2500000 * 90.215)
    strictEqual(d.ztsf_deal_id, 'D26-IN-0313')
    strictEqual(d.refer, 'TSF-NDF-0001')
    strictEqual(d.nordext, 'HSBC/NDF/26/0127')
    strictEqual(d.ndf_date, '2026-09-29') // two business days before the value date 2026-10-01
    strictEqual(d.dblfz, '2026-07-03') // 90 days back from the value date, a Friday
    strictEqual(d.cruser, 'RPATEL')
    strictEqual(d.upuser, 'SNAIR')
  })
  it('marks the deals with a posted flow as status 50', () => {
    strictEqual(dealOf('5000004101').txn_status, '50')
    strictEqual(dealOf('5000004102').txn_status, '13')
    strictEqual(db.vtbfhapo.length, 6)
  })
  it('builds a deal the same way outside the database', () => {
    strictEqual(buildDeal(['5000004102', 'IN11', 1, 'S', 1800000, 90.54, 90.1275, '2026-10-01', 60, '13', '1', '12D', '2000002727', 1], 1).zcash_amt, 8238.33)
  })
})

describe('GET_DATA selection rules', () => {
  it('lists the open status-13 NDFs of the default selection', () => {
    strictEqual(listed.length, 25)
    strictEqual(listed.every((r) => r.txn_status === '13'), true)
  })
  it('drops deals outside the value date range', () => {
    const rfhas = ids(listed)
    strictEqual(rfhas.includes('4098'), false) // 2026-09-29
    strictEqual(rfhas.includes('4119'), false) // 2026-11-04
    strictEqual(rfhas.includes('4308'), false) // 2026-11-10
  })
  it('drops deals the report removes by status, active flag and product type', () => {
    const rfhas = ids(listed)
    for (const gone of ['4120', '4121', '4122', '4123', '4124', '4125', '4126'])
      strictEqual(rfhas.includes(gone), false, gone)
  })
  it('drops deals already posted (status 50) through their posted flow', () => {
    const rfhas = ids(listed)
    for (const posted of ['4101', '4103', '4106', '4109', '4201', '4301'])
      strictEqual(rfhas.includes(posted), false, posted)
  })
  it('honours the company code selection', () => {
    const only = getData({ ...crit, bukrs: ['TH10'] }, db)
    strictEqual(only.length > 0 && only.every((r) => r.bukrs === 'TH10'), true)
    deepStrictEqual(getData({ ...crit, bukrs: [] }, db), [])
  })
  it('filters by a part of the transaction number', () => {
    deepStrictEqual(ids(getData({ ...crit, rfha: '4207' }, db)), ['4207'])
    strictEqual(getData({ ...crit, rfha: '99999' }, db).length, 0)
  })
  it('treats an empty To date as the From date only', () => {
    const one = getData({ ...crit, dateTo: '' }, db)
    strictEqual(one.length > 0 && one.every((r) => r.delfz === '2026-10-01'), true)
    strictEqual(getData({ ...crit, dateFrom: '2026-10-01', dateTo: '2026-10-02' }, db).every((r) => r.delfz <= '2026-10-02'), true)
  })
  it('does not mutate the database it reads', () => {
    strictEqual(dealOf('5000004102').fi_doc, '')
  })
})

describe('FI document matching', () => {
  const valid = db.bkpf[0]!
  it('accepts a TR / TSF document of the deal in the cash currency and date range', () => {
    strictEqual(matchesFiDoc(valid, '5000004101', 'USD', '2026-10-01', '2026-10-31'), true)
  })
  it('rejects a wrong reference, currency, type, key or date', () => {
    strictEqual(matchesFiDoc(valid, '5000004102', 'USD', '2026-10-01', '2026-10-31'), false)
    strictEqual(matchesFiDoc(valid, '5000004101', 'INR', '2026-10-01', '2026-10-31'), false)
    strictEqual(matchesFiDoc({ ...valid, blart: 'SA' }, '5000004101', 'USD', '2026-10-01', '2026-10-31'), false)
    strictEqual(matchesFiDoc({ ...valid, xref2_hd: 'XXX' }, '5000004101', 'USD', '2026-10-01', '2026-10-31'), false)
    strictEqual(matchesFiDoc(valid, '5000004101', 'USD', '2026-10-02', '2026-10-31'), false)
    strictEqual(matchesFiDoc(valid, '5000004101', 'USD', '2026-09-01', '2026-09-30'), false)
  })
  it('ignores reversed and reversal documents', () => {
    strictEqual(matchesFiDoc({ ...valid, xreversal: '2' }, '5000004101', 'USD', '0000-01-01', '9999-12-31'), false)
    strictEqual(matchesFiDoc({ ...valid, xreversing: 'X' }, '5000004101', 'USD', '0000-01-01', '9999-12-31'), false)
  })
  it('attaches the document number and fiscal year to a listed deal', () => {
    // The seeded documents all belong to deals that are already posted, so give a listed deal one.
    const withDoc = cloneDb(db)
    withDoc.bkpf.push({ ...valid, belnr: '1400009999', xblnr: '5000004102', budat: '2026-10-01' })
    const row = byRfha(getData(crit, withDoc), '5000004102')
    strictEqual(row.fi_doc, '1400009999')
    strictEqual(row.fi_gjahr, '2026')
    strictEqual(byRfha(listed, '5000004102').fi_doc, '')
  })
  it('does not list reversed documents against a deal', () => {
    // 5000004105 only has a reversed document (xreversal 2) and 5000004115 only a reversal (X).
    strictEqual(byRfha(listed, '5000004105').fi_doc, '')
    strictEqual(byRfha(listed, '5000004115').fi_doc, '')
  })
})

describe('validation', () => {
  const none = { from: false, to: false }
  it('passes the default selection', () => {
    deepStrictEqual(validateCriteria(crit, none), [])
  })
  it('requires a company code', () => {
    deepStrictEqual(validateCriteria({ ...crit, bukrs: [] }, none), [{ key: 'bukrs', msg: 'Company Code is required.' }])
  })
  it('requires the From date, or flags text that is not a date', () => {
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '' }, none), [{ key: 'dateFrom', msg: 'Value Date From is required.' }])
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '' }, { from: true, to: false }), [
      { key: 'dateFrom', msg: 'Value Date From: enter a valid date (dd-mm-yyyy).' },
    ])
    deepStrictEqual(validateCriteria({ ...crit, dateTo: '' }, { from: false, to: true }), [
      { key: 'dateTo', msg: 'Value Date To: enter a valid date (dd-mm-yyyy).' },
    ])
  })
  it('rejects a From later than the To date', () => {
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '2026-11-01', dateTo: '2026-10-01' }, none), [
      { key: 'dateTo', msg: 'Value Date: "From" must not be later than "To".' },
    ])
  })
  it('allows an empty To date', () => {
    deepStrictEqual(validateCriteria({ ...crit, dateTo: '' }, none), [])
  })
  it('reports every problem at once', () => {
    strictEqual(validateCriteria({ bukrs: [], dateFrom: '', dateTo: '', rfha: '' }, none).length, 2)
  })
  it('explains an empty list', () => {
    strictEqual(emptyText(true, ''), 'Complete the required selection criteria to list NDF deals.')
    strictEqual(emptyText(false, 'zzz'), 'No NDF deals match your search.')
    strictEqual(emptyText(false, ''), 'No NDF deals match the current selection.')
  })
})

describe('typed dates', () => {
  it('clears on empty text', () => {
    deepStrictEqual(commitTypedDate('  ', true), { kind: 'clear' })
    deepStrictEqual(commitTypedDate('', false), { kind: 'clear' })
  })
  it('commits a valid date, rewriting the text only when final', () => {
    deepStrictEqual(commitTypedDate('05-10-2026', false), { kind: 'set', iso: '2026-10-05', text: null })
    deepStrictEqual(commitTypedDate('5/10/2026', true), { kind: 'set', iso: '2026-10-05', text: '05-10-2026' })
  })
  it('flags bad text only when final', () => {
    deepStrictEqual(commitTypedDate('99-99-2026', false), { kind: 'none' })
    deepStrictEqual(commitTypedDate('99-99-2026', true), { kind: 'error' })
  })
})

describe('company multi-select', () => {
  it('summarises the choice', () => {
    strictEqual(companySummary([]), null)
    strictEqual(companySummary(['IN11', 'TH10', 'VN10']), 'All (3)')
    strictEqual(companySummary(['VN10', 'IN11']), 'IN11, VN10')
  })
  it('ticks and unticks in the panel order', () => {
    deepStrictEqual(toggleCompany(['VN10'], 'IN11', true), ['IN11', 'VN10'])
    deepStrictEqual(toggleCompany(['IN11', 'VN10'], 'IN11', false), ['VN10'])
  })
})

describe('table: search, sort, layout', () => {
  const layout = '/DEFAULT'
  it('searches every column of the layout, all terms together', () => {
    const hits = getVisibleRows(listed, layout, 'hsbc in11', NO_SORT)
    strictEqual(hits.length > 0 && hits.every((r) => r.bp_name === 'HSBC' && r.bukrs === 'IN11'), true)
    strictEqual(getVisibleRows(listed, layout, 'hsbc zzz', NO_SORT).length, 0)
    strictEqual(getVisibleRows(listed, layout, '  ', NO_SORT).length, listed.length)
  })
  it('only searches the columns the layout shows', () => {
    // Trader RPATEL is a column of the audit layout but not of the default one.
    strictEqual(getVisibleRows(listed, '/DEFAULT', 'rpatel', NO_SORT).length, 0)
    strictEqual(getVisibleRows(listed, '/AUDIT', 'rpatel', NO_SORT).length > 0, true)
  })
  it('sorts amounts numerically, dates by value and text case-blind', () => {
    const byAmt = getVisibleRows(listed, layout, '', { field: 'zcash_amt', dir: 'asc' })
    const amts = byAmt.map((r) => r.zcash_amt)
    deepStrictEqual(amts, [...amts].sort((a, b) => a - b))
    const byDateDesc = getVisibleRows(listed, layout, '', { field: 'delfz', dir: 'desc' })
    strictEqual(byDateDesc[0]!.delfz >= byDateDesc[byDateDesc.length - 1]!.delfz, true)
    const names = getVisibleRows(listed, layout, '', { field: 'bp_name', dir: 'asc' }).map((r) => r.bp_name.toLowerCase())
    deepStrictEqual(names, [...names].sort())
  })
  it('cycles the sort like the header click', () => {
    deepStrictEqual(nextSort(NO_SORT, 'delfz'), { field: 'delfz', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'delfz', dir: 'asc' }, 'delfz'), { field: 'delfz', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'delfz', dir: 'desc' }, 'bp_name'), { field: 'bp_name', dir: 'asc' })
    strictEqual(sortMark({ field: 'delfz', dir: 'asc' }, 'delfz'), '▲')
    strictEqual(sortMark({ field: 'delfz', dir: 'desc' }, 'delfz'), '▼')
    strictEqual(sortMark({ field: 'delfz', dir: 'desc' }, 'bp_name'), '')
  })
  it('renders cell text per column type', () => {
    const r = byRfha(listed, '5000004102')
    strictEqual(cellValue('txn_status', r), '13 - Fixed')
    strictEqual(cellValue('delfz', r), '01-10-2026')
    strictEqual(cellValue('zcash_amt', r), '8,238.33')
    strictEqual(cellValue('ndf_rate', r), '90.127500')
    strictEqual(cellValue('fi_doc', r), '')
    strictEqual(cellValue('bs_1', r), 'Sell')
    strictEqual(cellValue('txn_status', { ...r, txn_status: '99' }), '99 - 99')
  })
  it('has four layouts that all lead with the transaction number', () => {
    strictEqual(LAYOUT_VARIANTS.length, 4)
    strictEqual(LAYOUT_VARIANTS.every((l) => l.cols[0] === 'rfha'), true)
  })
  it('pages the list', () => {
    const p1 = pageSlice(listed, 1, 20)
    strictEqual(p1.rows.length, 20)
    strictEqual(p1.pageCount, 2)
    strictEqual(p1.text, 'Showing 1–20 of 25')
    const p2 = pageSlice(listed, 2, 20)
    strictEqual(p2.text, 'Showing 21–25 of 25')
    strictEqual(pageSlice(listed, 9, 20).page, 2)
    strictEqual(pageSlice(listed, 1, 8).pageCount, 4)
    deepStrictEqual(
      { page: pageSlice([], 1, 20).page, pageCount: pageSlice([], 1, 20).pageCount, text: pageSlice([], 1, 20).text },
      { page: 1, pageCount: 1, text: 'Showing 0 of 0' },
    )
  })
})

describe('value helps', () => {
  it('lists the Transaction No candidates of the current selection', () => {
    const all = rfhaItems(crit, false, db, '')
    strictEqual(all.length, listed.length)
    strictEqual(all[0]!.secondary?.includes(' · '), true)
    deepStrictEqual(
      rfhaItems(crit, false, db, '4207').map((i) => i.value),
      ['5000004207'],
    )
    strictEqual(rfhaItems(crit, false, db, 'citibank').every((i) => i.secondary?.includes('Citibank')), true)
  })
  it('lists nothing without a company code, and marks the chosen entry', () => {
    deepStrictEqual(rfhaItems({ ...crit, bukrs: [] }, true, db, ''), [])
    strictEqual(rfhaItems({ ...crit, rfha: '5000004207' }, false, db, '').filter((i) => i.selected).length, 1)
  })
  it('lists the layouts and marks the current one', () => {
    const items = layoutItems('/RATES')
    strictEqual(items.length, 4)
    deepStrictEqual(items.filter((i) => i.selected).map((i) => i.value), ['/RATES'])
    strictEqual(items[0]!.secondary, 'Default layout')
  })
})

describe('calendar', () => {
  it('opens on the field date, else today', () => {
    deepStrictEqual(viewForDate('2026-03-15'), { y: 2026, m: 2 })
    deepStrictEqual(viewForDate(''), { y: 2026, m: 9 })
  })
  it('moves across year ends', () => {
    deepStrictEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 })
    deepStrictEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 })
  })
  it('fills whole weeks around the month and marks selected / today', () => {
    const cells = calendarCells({ y: 2026, m: 9 }, '2026-10-01', '2026-10-05') // October 2026 starts on a Thursday
    strictEqual(cells.length, 35)
    strictEqual(cells.filter((c) => !c.muted).length, 31)
    strictEqual(cells[0]!.iso, '2026-09-27')
    strictEqual(cells[0]!.muted, true)
    strictEqual(cells.find((c) => c.selected)?.iso, '2026-10-01')
    strictEqual(cells.find((c) => c.today)?.iso, '2026-10-05')
    strictEqual(cells[cells.length - 1]!.iso, '2026-10-31')
  })
})

describe('posting run (simulated RFTBBB00)', () => {
  const row = byRfha(listed, '5000004102')
  it('a test run creates nothing', () => {
    const res = submitPostingRun(db, [row], row.delfz, true)
    deepStrictEqual(res.results, [
      { bukrs: 'IN11', rfha: '5000004102', keyDate: '2026-10-01', result: 'Would be posted', cls: 'res-warn', fiDoc: '' },
    ])
    strictEqual(res.db.bkpf.length, db.bkpf.length)
    strictEqual(res.db.vtbfhapo.length, db.vtbfhapo.length)
  })
  it('an update run creates the FI document and the posted flow, numbering from the counter', () => {
    const res = submitPostingRun(db, [row], row.delfz, false)
    strictEqual(res.results[0]!.result, 'Posted')
    strictEqual(res.results[0]!.cls, 'res-ok')
    strictEqual(res.results[0]!.fiDoc, '1400004300')
    strictEqual(res.db.nextDocNo, 1400004301)
    const doc = res.db.bkpf[res.db.bkpf.length - 1]!
    strictEqual(doc.xblnr, '5000004102')
    strictEqual(doc.blart, 'TR')
    strictEqual(doc.xref2_hd, 'TSF')
    strictEqual(doc.budat, '2026-10-01')
    strictEqual(doc.gjahr, '2026')
    strictEqual(res.db.vtbfhapo.some((p) => p.rfha === '5000004102' && p.sbewebe === '2'), true)
  })
  it('leaves the database it was given untouched', () => {
    submitPostingRun(db, [row], row.delfz, false)
    strictEqual(db.nextDocNo, 1400004300)
    strictEqual(db.vtbfhapo.length, 6)
  })
  it('reports a deal that already has a valid FI document, and adds the missing posted flow', () => {
    const d = byRfha(listed, '5000004105') // its only documents are a reversed one and a reversal -> not posted
    strictEqual(submitPostingRun(db, [d], d.delfz, true).results[0]!.result, 'Would be posted')
    const withDoc = cloneDb(db)
    withDoc.bkpf.push({ ...withDoc.bkpf[0]!, belnr: '1400007777', xblnr: '5000004102', budat: '2026-10-01' })
    const test = submitPostingRun(withDoc, [row], row.delfz, true)
    strictEqual(test.results[0]!.result, 'Already posted')
    strictEqual(test.results[0]!.fiDoc, '1400007777')
    strictEqual(test.db.vtbfhapo.length, withDoc.vtbfhapo.length)
    const upd = submitPostingRun(withDoc, [row], row.delfz, false)
    strictEqual(upd.results[0]!.result, 'Already posted')
    strictEqual(upd.db.vtbfhapo.some((p) => p.rfha === '5000004102'), true)
    strictEqual(upd.db.nextDocNo, withDoc.nextDocNo)
  })
  it('sets status 50 only where a posted flow exists', () => {
    const none = updateStatusAfterPosting(db, row)
    strictEqual(none.updated, 0)
    strictEqual(byRfha(none.db.vtbfha, '5000004102').txn_status, '13')
    const posted = submitPostingRun(db, [row], row.delfz, false).db
    const upd = updateStatusAfterPosting(posted, row)
    strictEqual(upd.updated, 1)
    strictEqual(byRfha(upd.db.vtbfha, '5000004102').txn_status, '50')
  })
  it('counts the results', () => {
    deepStrictEqual(
      runSummary([
        { bukrs: 'a', rfha: '1', keyDate: '', result: 'Posted', cls: 'res-ok', fiDoc: '' },
        { bukrs: 'a', rfha: '2', keyDate: '', result: 'Posted', cls: 'res-ok', fiDoc: '' },
        { bukrs: 'a', rfha: '3', keyDate: '', result: 'Already posted', cls: 'res-info', fiDoc: '' },
      ]),
      { would: 0, posted: 2, already: 1 },
    )
  })
  it('builds the test-run view', () => {
    const v = singleTestView(db, row)
    strictEqual(v.title, 'TBB1 Test Run')
    deepStrictEqual(v.params, [
      ['Company Code', 'IN11'],
      ['Transaction No', '5000004102'],
      ['Key Date (Value Date)', '01-10-2026'],
      ['Run mode', 'Test run – no update'],
    ])
    strictEqual(v.notes.includes('No documents are created'), true)
  })
  it('posts one deal: the deal leaves the list and the view says so', () => {
    const res = singlePost(db, row)
    strictEqual(res.view.title, 'TBB1 Post')
    strictEqual(res.view.notes.endsWith('Transaction status set to 50 and removed from the list.'), true)
    strictEqual(res.view.results[0]!.result, 'Posted')
    strictEqual(getData(crit, res.db).some((r) => r.rfha === row.rfha), false)
    strictEqual(getData(crit, db).some((r) => r.rfha === row.rfha), true)
  })
  it('Execute posts every deal of the selection and reloads without them', () => {
    // 5000004112 already has a valid FI document (posted on 29.09.), so it is reported, not posted again.
    const res = postAll(db, listed, crit, keyDateOf(crit))
    strictEqual(res.view.results.length, listed.length)
    deepStrictEqual(runSummary(res.view.results), { would: 0, posted: listed.length - 1, already: 1 })
    strictEqual(res.view.results.find((r) => r.rfha === '5000004112')?.fiDoc, '1400004205')
    strictEqual(new Set(res.view.results.map((r) => r.fiDoc)).size, listed.length)
    deepStrictEqual(getData(crit, res.db), [])
    deepStrictEqual(res.view.params, [
      ['Company Code', 'IN11, TH10, VN10'],
      ['Value Date', '01-10-2026 to 31-10-2026'],
      ['Key Date', '31-10-2026'],
      ['Run mode', 'Update run – all deals in selection'],
    ])
  })
  it('uses the From date as the key date when there is no To date', () => {
    const c: Criteria = { ...crit, dateTo: '' }
    strictEqual(keyDateOf(c), '2026-10-01')
    deepStrictEqual(postAll(db, [], c, keyDateOf(c)).view.params[1], ['Value Date', '01-10-2026'])
  })
})

describe('bank settlement letter', () => {
    it('addresses the bank of the deal', () => {
    const a = getBankAddress('2026-10-02', '0000100231')
    strictEqual(a.zbank, 'The Hongkong and Shanghai Banking Corporation Ltd')
    strictEqual(a.zdate, '05-10-2026')
    strictEqual(a.zvdate, 'Value Date: 02-10-2026')
    strictEqual(getBankAddress('2026-10-02', '0000999999').zbank, a.zbank) // unknown partner falls back to the first
  })
  it('lists the settlement account lines', () => {
    deepStrictEqual(getBankTransferLines('TH10', '0000100245', [{ zcurr: 'USD', zamt: -1234.5 }]), [
      'Settlement amount: USD 1,234.50',
      'Beneficiary: Olam (Thailand) Ltd',
      'Account no. (USD): 0185-402219-310',
      'Account with: Citibank N.A. (CITIINBX)',
    ])
  })
  it('builds the letter model from a deal', () => {
    const m = buildLetterModel(byRfha(listed, '5000004102'))
    strictEqual(m.company, 'Olam Agri India Pvt Ltd')
    strictEqual(m.reg, 'NDF Bank Settlement')
    strictEqual(m.addr.zbank, 'Citibank N.A.')
    strictEqual(m.lines.length, 4)
    strictEqual(m.lines[0], 'Settlement amount: USD 8,238.33')
  })
  it('lays out the deal table with the amount and rate columns right-aligned', () => {
    const t = letterDealTable(buildLetterModel(byRfha(listed, '5000004102')))
    strictEqual(t.heads.length, 11)
    strictEqual(t.vals.length, 11)
    deepStrictEqual(t.numIdx, [8, 10])
    strictEqual(t.vals[0], '5000004102')
    strictEqual(t.vals[8], '90.127500')
    strictEqual(t.vals[10], '8,238.33')
  })
})

describe('PDF builder', () => {
  const model = buildLetterModel(byRfha(listed, '5000004102'))
  const items = letterPdfItems(model)
  it('names the file after the transaction', () => {
    strictEqual(pdfFileName({ rfha: '5000004102' }), 'NDF_Bank_Settlement_5000004102.pdf')
  })
  it('keeps printable ASCII and escapes the string delimiters', () => {
    strictEqual(pdfEscape('a(b)c\\d'), 'a\\(b\\)c\\\\d')
    strictEqual(pdfEscape('Café – ok'), 'Caf- - ok')
  })
  it('lays the letter out top-down from y=790 with two rules', () => {
    strictEqual(items.filter((i) => i.rule).length, 2)
    const first = items[0]!
    strictEqual('t' in first && first.t, '05-10-2026')
    strictEqual(first.y, 790)
    const ys = items.filter((i) => !i.rule).map((i) => i.y)
    strictEqual(ys.every((y) => y > 0), true)
    strictEqual(items.some((i) => 't' in i && i.t === 'Yours Faithfully'), true)
    strictEqual(items.some((i) => 't' in i && i.t === 'Cash Amount:' && i.bold === true), true)
    strictEqual(items.some((i) => 't' in i && i.t === 'USD 8,238.33' && i.x === 170), true)
  })
  it('writes a well-formed single-page PDF whose xref offsets point at each object', () => {
    const pdf = buildPdfString(items)
    strictEqual(pdf.startsWith('%PDF-1.4\n'), true)
    strictEqual(pdf.endsWith('%%EOF'), true)
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(pdf)![1])
    strictEqual(pdf.slice(xrefAt, xrefAt + 4), 'xref')
    const offsets = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    strictEqual(offsets.length, 6)
    offsets.forEach((o, i) => strictEqual(pdf.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`))
    const len = Number(/\/Length (\d+)/.exec(pdf)![1])
    const stream = /stream\n([\s\S]*?)endstream/.exec(pdf)![1]!
    strictEqual(stream.length, len)
    strictEqual(stream.includes('(Yours Faithfully) Tj'), true)
    strictEqual(stream.includes('0.8 G 50 '), true)
  })
  it('turns the text into one byte per character', () => {
    const bytes = buildPdfBytes(items)
    strictEqual(bytes.length, buildPdfString(items).length)
    strictEqual(String.fromCharCode(...bytes.slice(0, 8)), '%PDF-1.4')
  })
})

describe('defaults', () => {
  it('starts on all three companies for October 2026', () => {
    deepStrictEqual(crit, { bukrs: ['IN11', 'TH10', 'VN10'], dateFrom: '2026-10-01', dateTo: '2026-10-31', rfha: '' })
    strictEqual(DEFAULTS.layout, '/DEFAULT')
    strictEqual(rowId(listed[0]!), 'IN11|5000004102')
  })
})
