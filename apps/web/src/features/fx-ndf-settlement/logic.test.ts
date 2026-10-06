import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AS_OF, DEFAULTS, LAYOUT_VARIANTS, monthOf } from './data.ts'
import { formatAmount, formatRate, isoToDmy, parseDateInput } from './format.ts'
import {
  ACCOUNT_WAITING,
  ADDRESS_WAITING,
  NO_SORT,
  POST_ALL_WAITING,
  POST_WAITING,
  TEST_RUN_WAITING,
  alphaRfha,
  buildLetterModel,
  calendarCells,
  cellValue,
  commitTypedDate,
  companyLabel,
  companySummary,
  defaultCriteria,
  emptyText,
  getData,
  getVisibleRows,
  keyDateOf,
  layoutItems,
  letterDealTable,
  nextSort,
  pageSlice,
  pdfView,
  postAllView,
  rfhaItems,
  rfhaMatches,
  rowId,
  runSummary,
  shiftMonth,
  singlePostView,
  singleTestView,
  sortMark,
  statusClass,
  toggleCompany,
  validateCriteria,
  viewForDate,
} from './logic.ts'
import type { CompanyOption, Criteria, Deal } from './types.ts'

/* Test fixtures only: ZSGTSFV_FX-shaped rows (no sample data reaches the runtime). */
function deal(over: Partial<Deal>): Deal {
  return {
    bukrs: 'IN11', rfha: '5000004101', refnr: '', saktiv: '1', sgsart: '12D', rfhazul: '00001',
    butxt: 'IN11 - OLAM Agri India Pvt Ltd', ltx: '12D - FX NDF: External', sfhaart: '631', xtext: '631 - NDF - TSF',
    kontrh: '0400000002', bp_name: '0400000002 - HSBC', gsppart: '', blotter_date: '', prctr: '', pc_name: '',
    rbusa: '', ba_name: '', rportb: '', xportb: '', refer: '', nordext: '', dblfz: '2026-07-03', delfz: '2026-10-05',
    zcom_id: 'OSIPL', rdealer: 'C14', txn_status: '13', ztsf_deal_id: '', ztsf_mc_ref_no: '', ndf_date: '2026-10-01',
    ndf_ref: 'RBI', ndf_rate: 90.88, fo_remark: '', mo_remark: '', ndf_fo_rem: '', ndf_mo_rem: '', bs: '1', bs_1: 'Buy',
    bs_2: 'Sell', curr1: 'USD', amt1: 2500000, curr2: 'INR', amt2: -225537500, ospot: 90, oswap: 0.215, otot_rate: 90.215,
    spot: 90, swap: 0.215, tot_rate: 90.215, t_rate: 90.215, cpair: 'USD:INR', zwaers: 'INR', cash_curr: 'USD',
    zcash_amt: 18293.35, cruser: 'FS_DEV', dcrdat: '2026-07-03', upuser: '', dupdat: '', fi_doc: '', fi_gjahr: '',
    ...over,
  }
}

const crit: Criteria = { bukrs: ['IN11', 'SG03'], dateFrom: '2026-10-01', dateTo: '2026-10-31', rfha: '' }
const rows: Deal[] = [
  deal({ rfha: '5000004101' }),
  deal({ rfha: '5000004102', bukrs: 'SG03', bp_name: '0400000005 - Citibank', zcash_amt: -8238.33, delfz: '2026-10-12', rdealer: 'C20' }),
  deal({ rfha: '5000004103', delfz: '2026-09-30' }), // before the value dates
  deal({ rfha: '5000004104', bukrs: 'TH10' }), // company not selected
  deal({ rfha: '5000004105', sgsart: '12B' }), // forward, not NDF
  deal({ rfha: '5000004106', saktiv: '3' }), // reversed
  deal({ rfha: '5000004107', txn_status: '05' }), // < 07
  deal({ rfha: '5000004108', txn_status: '08' }),
  deal({ rfha: '5000004109', txn_status: '07' }), // NDF not at 13
  deal({ rfha: '5000004110', txn_status: '50' }), // already posted
]
const listed = getData(rows, crit)
const ids = (list: Deal[]) => list.map((r) => r.rfha.slice(-4))
const companies: CompanyOption[] = [
  { code: 'IN11', name: 'OLAM Agri India Pvt Ltd' },
  { code: 'SG03', name: 'OLAM GlobalAgri Pte. Ltd' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd' },
]

describe('format', () => {
  it('formats amounts, rates and dates', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatRate(90.215), '90.215000')
    strictEqual(isoToDmy('2026-10-05'), '05-10-2026')
    strictEqual(parseDateInput('5/10/2026'), '2026-10-05')
    strictEqual(parseDateInput('31-02-2026'), null)
  })
})

describe('GET_DATA (ZSGTSFV_FX selection and the report DELETEs)', () => {
  it('keeps company, sgsart 12D, value date, saktiv <> 3 and, for NDF, status 13 only', () => {
    deepStrictEqual(ids(listed), ['4101', '4102'])
  })
  it('treats an empty To date as the From date only', () => {
    deepStrictEqual(ids(getData(rows, { ...crit, dateFrom: '2026-10-12', dateTo: '' })), ['4102'])
  })
  it('S_RFHA is EQ (with ALPHA leading zeros) or CP with * / +', () => {
    deepStrictEqual(ids(getData(rows, { ...crit, rfha: '5000004102' })), ['4102'])
    deepStrictEqual(ids(getData(rows, { ...crit, rfha: '4102' })), []) // EQ, not "contains"
    deepStrictEqual(ids(getData(rows, { ...crit, rfha: '*4102' })), ['4102'])
    strictEqual(alphaRfha('42'), '0000000000042')
    strictEqual(rfhaMatches('0000000000042', '42'), true)
    strictEqual(rfhaMatches('5000004101', '500000410+'), true)
    strictEqual(rfhaMatches('5000004101', ''), true)
  })
  it('does not mutate the rows it reads', () => {
    listed[0]!.fi_doc = 'x'
    strictEqual(rows[0]!.fi_doc, '')
  })
  it('identifies a row by BUKRS + RFHA + REFNR', () => {
    strictEqual(rowId(listed[1]!), 'SG03|5000004102|')
  })
})

describe('validation', () => {
  const none = { from: false, to: false }
  it('requires a company code and the From date (S_BUKRS / S_DATE are OBLIGATORY)', () => {
    deepStrictEqual(validateCriteria(crit, none), [])
    deepStrictEqual(validateCriteria({ ...crit, bukrs: [] }, none), [{ key: 'bukrs', msg: 'Company Code is required.' }])
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '' }, none), [{ key: 'dateFrom', msg: 'Value Date From is required.' }])
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '' }, { from: true, to: false }), [
      { key: 'dateFrom', msg: 'Value Date From: enter a valid date (dd-mm-yyyy).' },
    ])
  })
  it('rejects a From later than the To date', () => {
    deepStrictEqual(validateCriteria({ ...crit, dateFrom: '2026-11-01', dateTo: '2026-10-01' }, none), [
      { key: 'dateTo', msg: 'Value Date: "From" must not be later than "To".' },
    ])
  })
  it('explains an empty list, including the reason the deals cannot be read', () => {
    strictEqual(emptyText(true, ''), 'Complete the required selection criteria to list NDF deals.')
    strictEqual(emptyText(false, '', 'WAITING FOR API — x'), 'WAITING FOR API — x')
    strictEqual(emptyText(false, '', null, true), 'Loading NDF deals from SAP…')
    strictEqual(emptyText(false, 'zzz'), 'No NDF deals match your search.')
    strictEqual(emptyText(false, ''), 'No NDF deals match the current selection.')
  })
  it('typed dates commit only when complete, and flag bad text when final', () => {
    deepStrictEqual(commitTypedDate('', false), { kind: 'clear' })
    deepStrictEqual(commitTypedDate('5/10/2026', true), { kind: 'set', iso: '2026-10-05', text: '05-10-2026' })
    deepStrictEqual(commitTypedDate('99-99-2026', false), { kind: 'none' })
    deepStrictEqual(commitTypedDate('99-99-2026', true), { kind: 'error' })
  })
})

describe('company multi-select (T001)', () => {
  it('summarises the choice in T001 order', () => {
    strictEqual(companySummary([], companies), null)
    strictEqual(companySummary(['IN11', 'SG03', 'TH10'], companies), 'All (3)')
    strictEqual(companySummary(['TH10', 'IN11'], companies), 'IN11, TH10')
  })
  it('ticks and unticks in the panel order', () => {
    deepStrictEqual(toggleCompany(['TH10'], 'IN11', true, companies), ['IN11', 'TH10'])
    deepStrictEqual(toggleCompany(['IN11', 'TH10'], 'IN11', false, companies), ['TH10'])
  })
  it('labels an entry "code - name"', () => {
    strictEqual(companyLabel(companies[0]!), 'IN11 - OLAM Agri India Pvt Ltd')
    strictEqual(companyLabel({ code: '0001', name: '' }), '0001')
  })
})

describe('table: search, sort, layout', () => {
  const layout = '/DEFAULT'
  it('searches every column of the layout, all terms together', () => {
    deepStrictEqual(ids(getVisibleRows(listed, layout, 'citibank sg03', NO_SORT)), ['4102'])
    strictEqual(getVisibleRows(listed, layout, 'citibank zzz', NO_SORT).length, 0)
  })
  it('only searches the columns the layout shows', () => {
    strictEqual(getVisibleRows(listed, '/DEFAULT', 'c20', NO_SORT).length, 0)
    strictEqual(getVisibleRows(listed, '/AUDIT', 'c20', NO_SORT).length, 1)
  })
  it('sorts amounts numerically', () => {
    deepStrictEqual(ids(getVisibleRows(listed, layout, '', { field: 'zcash_amt', dir: 'asc' })), ['4102', '4101'])
  })
  it('cycles the sort like the header click', () => {
    deepStrictEqual(nextSort(NO_SORT, 'delfz'), { field: 'delfz', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'delfz', dir: 'asc' }, 'delfz'), { field: 'delfz', dir: 'desc' })
    strictEqual(sortMark({ field: 'delfz', dir: 'asc' }, 'delfz'), '▲')
    strictEqual(sortMark({ field: 'delfz', dir: 'desc' }, 'bp_name'), '')
  })
  it('shows the TXN_STATUS code as the ALV does', () => {
    const r = listed[1]!
    strictEqual(cellValue('txn_status', r), '13')
    strictEqual(statusClass('13'), 'status-text-fixed')
    strictEqual(statusClass('99'), 'status-text-draft')
    strictEqual(cellValue('delfz', r), '12-10-2026')
    strictEqual(cellValue('zcash_amt', r), '-8,238.33')
  })
  it('keeps the four static layouts, all leading with the transaction number', () => {
    strictEqual(LAYOUT_VARIANTS.length, 4)
    strictEqual(LAYOUT_VARIANTS.every((l) => l.cols[0] === 'rfha'), true)
    deepStrictEqual(layoutItems('/RATES').filter((i) => i.selected).map((i) => i.value), ['/RATES'])
  })
  it('pages the list', () => {
    const many = Array.from({ length: 25 }, (_, i) => deal({ rfha: String(5000005000 + i) }))
    strictEqual(pageSlice(many, 1, 20).text, 'Showing 1–20 of 25')
    strictEqual(pageSlice(many, 9, 20).page, 2)
    strictEqual(pageSlice([], 1, 20).text, 'Showing 0 of 0')
  })
})

describe('Transaction No value help', () => {
  it('lists the RFHAs GET_DATA returns for the company / dates, ignoring S_RFHA itself', () => {
    deepStrictEqual(rfhaItems(rows, { ...crit, rfha: '5000004102' }, false, '').map((i) => [i.value, i.selected]), [
      ['5000004101', false],
      ['5000004102', true],
    ])
    deepStrictEqual(rfhaItems(rows, crit, false, 'citi').map((i) => i.value), ['5000004102'])
    deepStrictEqual(rfhaItems(rows, crit, true, ''), [])
  })
})

describe('calendar', () => {
  it('opens on the field date, else today', () => {
    deepStrictEqual(viewForDate('2026-03-15'), { y: 2026, m: 2 })
    deepStrictEqual(viewForDate(''), viewForDate(AS_OF))
    deepStrictEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 })
  })
  it('fills whole weeks around the month', () => {
    const cells = calendarCells({ y: 2026, m: 9 }, '2026-10-01', '2026-10-05')
    strictEqual(cells.length, 35)
    strictEqual(cells[0]!.iso, '2026-09-27')
    strictEqual(cells.find((c) => c.today)?.iso, '2026-10-05')
  })
})

describe('actions: WAITING FOR ACTION API, nothing posted', () => {
  const row = listed[0]!
  it('TBB1 Test Run names RFTBBB00 and lists no results', () => {
    const v = singleTestView(row)
    strictEqual(v.notes, TEST_RUN_WAITING)
    deepStrictEqual(v.results, [])
    deepStrictEqual(v.params[2], ['Key Date (Value Date)', '05-10-2026'])
    strictEqual(TEST_RUN_WAITING.startsWith('WAITING FOR ACTION API — '), true)
    strictEqual(TEST_RUN_WAITING.endsWith('Nothing was posted to SAP.'), true)
  })
  it('TBB1 Post names the posting and the VTBFHA status update', () => {
    const v = singlePostView(row)
    strictEqual(v.notes, POST_WAITING)
    strictEqual(POST_WAITING.includes("txn_status = '50'"), true)
    deepStrictEqual(runSummary(v.results), { would: 0, posted: 0, already: 0 })
  })
  it('Execute with Posting covers the listed deals with s_date-high as key date', () => {
    strictEqual(keyDateOf(crit), '2026-10-31')
    strictEqual(keyDateOf({ ...crit, dateTo: '' }), '')
    const v = postAllView(listed, crit, keyDateOf(crit))
    strictEqual(v.notes, POST_ALL_WAITING)
    deepStrictEqual(v.params, [
      ['Company Code', 'IN11, SG03'],
      ['Value Date', '01-10-2026 to 31-10-2026'],
      ['Key Date', '31-10-2026'],
      ['Run mode', 'Update run – 2 deal(s) in selection'],
    ])
  })
  it('PDF shows the L003 form name and generates nothing', () => {
    const v = pdfView(row, 'ZSGTSFAF_NDF_BANK')
    deepStrictEqual(v.params[2], ['Form (ZSGTSFTR_BS_PDF L003)', 'ZSGTSFAF_NDF_BANK'])
    strictEqual(v.notes.includes('ZSGTSFAF_NDF_BANK'), true)
    strictEqual(pdfView(row, '').notes.includes('L003 not found'), true)
  })
})

describe('bank settlement letter (screen 9001)', () => {
  it('signs with butxt+7(31) and waits for the bank address / account lines', () => {
    const m = buildLetterModel(listed[0]!)
    strictEqual(m.company, 'OLAM Agri India Pvt Ltd')
    strictEqual(m.reg, 'NDF Bank Settlement')
    strictEqual(m.addr.zbank, ADDRESS_WAITING)
    deepStrictEqual(m.lines, [ACCOUNT_WAITING])
  })
  it('lays out the deal table with the amount and rate columns right-aligned', () => {
    const t = letterDealTable(buildLetterModel(listed[0]!))
    strictEqual(t.vals.length, 11)
    deepStrictEqual(t.numIdx, [8, 10])
    strictEqual(t.vals[8], '90.880000')
    strictEqual(t.vals[10], '18,293.35')
  })
})

describe('defaults', () => {
  it('starts with no company (OBLIGATORY, no default) and the current month', () => {
    deepStrictEqual(defaultCriteria(), { bukrs: [], dateFrom: monthOf(AS_OF).from, dateTo: monthOf(AS_OF).to, rfha: '' })
    deepStrictEqual(monthOf('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' })
    strictEqual(DEFAULTS.layout, '/DEFAULT')
  })
})
