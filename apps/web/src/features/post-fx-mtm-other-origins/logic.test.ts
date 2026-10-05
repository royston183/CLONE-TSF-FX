import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, DEAL_SEEDS } from './data.ts'
import { dmyToISO, formatNumber, isMonthEndISO, isoToDMY, maskKeyDate } from './format.ts'
import {
  buildDocumentView,
  buildMtmMonths,
  calculateSwap,
  calendarCells,
  cellText,
  clampPage,
  convertToUsd,
  countPostable,
  createMockDb,
  criteriaOf,
  documentHeaderItems,
  emptyMessage,
  executeState,
  gainLoss,
  getAccountingConfig,
  getFxTransactions,
  getViewRows,
  isPostable,
  matchesRfha,
  nextSort,
  pageCount,
  pagerItems,
  parseRfhaFilter,
  postAll,
  postButtonTitle,
  postMtmDocument,
  shiftMonth,
  showingText,
  sortForColumns,
  spotAt,
  transactionSections,
  validateKeyDate,
  visibleColumns,
} from './logic.ts'
import type { DealType, Row } from './types.ts'

const KEY = '2026-09-30'
const ALL = ['IN11', 'TH10', 'VN10']

function load(over: { keyIso?: string; companies?: string[]; rfhaText?: string; bp?: string; pair?: string; dealType?: DealType } = {}) {
  const db = createMockDb()
  const rows = getFxTransactions(
    db,
    criteriaOf({ keyIso: KEY, companies: ALL, rfhaText: '', bp: '', pair: '', dealType: 'ALL', ...over }),
  )
  return { db, rows }
}
const rowOf = (rows: readonly Row[], rfha: string): Row => {
  const r = rows.find((x) => x.rfha === rfha)
  if (!r) throw new Error(`no row ${rfha}`)
  return r
}

describe('dates and numbers', () => {
  it('reads and writes DD-MM-YYYY', () => {
    strictEqual(isoToDMY('2026-09-30'), '30-09-2026')
    strictEqual(dmyToISO('30-09-2026'), '2026-09-30')
    strictEqual(dmyToISO(' 29-02-2028 '), '2028-02-29')
    strictEqual(dmyToISO('29-02-2027'), null)
    strictEqual(dmyToISO('31-04-2026'), null)
    strictEqual(dmyToISO('00-01-2026'), null)
    strictEqual(dmyToISO('1-1-2026'), null)
  })

  it('knows month ends, including leap February', () => {
    ok(isMonthEndISO('2026-09-30'))
    ok(isMonthEndISO('2028-02-29'))
    ok(!isMonthEndISO('2028-02-28'))
    ok(!isMonthEndISO('2026-09-29'))
  })

  it('groups thousands and fixes decimals', () => {
    strictEqual(formatNumber(1234.5, 2), '1,234.50')
    strictEqual(formatNumber(130000000000, 0), '130,000,000,000')
    strictEqual(formatNumber(-5.5, 6), '-5.500000')
  })

  it('turns eight typed digits into DD-MM-YYYY', () => {
    strictEqual(maskKeyDate('30092026'), '30-09-2026')
    strictEqual(maskKeyDate('3009'), '3009')
    strictEqual(maskKeyDate('30-09-2026'), '30-09-2026')
  })
})

describe('key date validation', () => {
  it('accepts a month end', () => {
    deepStrictEqual(validateKeyDate('30-09-2026'), { raw: '30-09-2026', error: '', iso: '2026-09-30' })
  })
  it('requires a value, a real date and a month end, in that order', () => {
    strictEqual(validateKeyDate('  ').error, 'Key Date is required.')
    strictEqual(validateKeyDate('30-13-2026').error, 'Enter a valid date (DD-MM-YYYY).')
    strictEqual(validateKeyDate('15-09-2026').error, 'Key Date should be Month End Date only.')
    strictEqual(validateKeyDate('15-09-2026').iso, null)
  })
})

describe('transaction filter', () => {
  it('parses singles, ranges and lists', () => {
    deepStrictEqual(parseRfhaFilter('1200003100-1200003130, 1200003151;1200003154'), [
      { from: '1200003100', to: '1200003130' },
      { from: '1200003151', to: '1200003151' },
      { from: '1200003154', to: '1200003154' },
    ])
    deepStrictEqual(parseRfhaFilter(''), [])
  })
  it('matches everything when empty, otherwise any range', () => {
    ok(matchesRfha('1200003100', []))
    const r = parseRfhaFilter('1200003100-1200003106')
    ok(matchesRfha('1200003103', r))
    ok(!matchesRfha('1200003109', r))
  })
})

describe('mock data', () => {
  it('seeds every deal and the postings recorded for them', () => {
    const db = createMockDb()
    strictEqual(db.deals.length, DEAL_SEEDS.length)
    strictEqual(db.mtmData.length, 13)
    strictEqual(db.docSeq, 4900001200 + 26)
    strictEqual(db.accConfig.length, 12)
  })
  it('anchors the spot model on the demo key date and has no rate outside the table', () => {
    const { db } = load()
    strictEqual(spotAt(db, 'USD-INR', KEY), 90.4)
    strictEqual(spotAt(db, 'USD-INR', '2030-01-31'), 0)
    strictEqual(spotAt(db, 'XXX-YYY', KEY), 0)
  })
  it('derives a transaction number, deal id and text per deal', () => {
    const { db } = load()
    const d = db.deals[0]
    strictEqual(d?.rfha, '1200003100')
    strictEqual(d?.ztsfDealId, 'D26IN001')
    strictEqual(d?.zolamDealNo, 'OLM2600410')
    strictEqual(d?.xtext, 'USD-INR NDF Oct-26')
  })
})

describe('selection (GET_DATA)', () => {
  it('keeps deals traded on or before the key date and still open after it, minus the excluded ones', () => {
    const { rows } = load()
    strictEqual(rows.length, 33)
    ok(rows.every((r) => r.dblfz <= KEY && r.delfz > KEY))
    ok(rows.every((r) => r.saktiv !== '3' && r.txnStatus !== '40'))
    // matured before the key date, and traded after it
    ok(!rows.some((r) => r.rfha === '1200003145'))
    ok(!rows.some((r) => r.rfha === '1200003142'))
  })
  it('filters by company, partner, pair, transaction range and deal type', () => {
    strictEqual(load({ companies: ['VN10'] }).rows.length, 9)
    strictEqual(load({ companies: [] }).rows.length, 0)
    ok(load({ pair: 'EUR-USD' }).rows.every((r) => r.cpair === 'EUR-USD'))
    ok(load({ bp: '0000510021' }).rows.every((r) => r.kontrh === '0000510021'))
    deepStrictEqual(
      load({ rfhaText: '1200003100-1200003106' }).rows.map((r) => r.rfha),
      ['1200003100', '1200003103', '1200003106'],
    )
    const ndf = load({ dealType: 'NDF' }).rows
    ok(ndf.length > 0 && ndf.every((r) => r.sgsart.charAt(2) === 'D'))
    const del = load({ dealType: 'DELIVERABLE' }).rows
    ok(del.length > 0 && del.every((r) => r.sgsart.charAt(2) !== 'D'))
    strictEqual(ndf.length + del.length, 33)
  })
  it('picks up a different set of deals and postings for another key date', () => {
    const aug = load({ keyIso: '2026-08-31' }).rows
    strictEqual(aug.length, 31)
    ok(aug.some((r) => r.mtmDoc))
    ok(!load().rows.some((r) => r.rfha === '1200003118' && r.mtmDoc))
  })
})

describe('valuation', () => {
  it('values a USD/INR sell with the swap interpolated into the first month bucket', () => {
    const { rows } = load()
    const r = rowOf(rows, '1200003100')
    strictEqual(r.fAmt, 450000000)
    strictEqual(r.fCurr, 'INR')
    strictEqual(r.bsBu, 'Sell')
    strictEqual(r.vSpot, 90.4)
    strictEqual(r.monat, 1)
    strictEqual(r.vSwap, 0.145029)
    strictEqual(r.vRate, 90.545029)
    strictEqual(r.ccAmt, 5033731.59)
    strictEqual(r.vAmt, 4969902.88)
    strictEqual(r.vGl, -63828.71)
    strictEqual(r.month, 'Oct 2026')
  })
  it('divides by the rate when USD is the first currency and multiplies when it is the second', () => {
    strictEqual(convertToUsd(450000000, 89.3969, 'INR'), 5033731.59)
    strictEqual(convertToUsd(2400000, 1.17437, 'USD'), 2818488)
    strictEqual(convertToUsd(100, 0, 'USD'), 0)
  })
  it('gives a loss to a Buy at or above the valuation rate and a Sell below it, and gains the other way', () => {
    strictEqual(gainLoss('Buy', 91, 90, 10, 5), -5)
    strictEqual(gainLoss('Buy', 90, 90, 10, 5), -5)
    strictEqual(gainLoss('Buy', 89, 90, 10, 5), 5)
    strictEqual(gainLoss('Sell', 89, 90, 10, 5), -5)
    strictEqual(gainLoss('Sell', 91, 90, 10, 5), 5)
    strictEqual(gainLoss('Sell', 90, 90, 10, 5), 5)
    strictEqual(gainLoss('Sell', 89, 90, 5, 5), 0)
  })
  it('signs the sample rows by those rules', () => {
    const { rows } = load()
    ok(rowOf(rows, '1200003109').vGl > 0) // Buy, contract rate below valuation rate
    ok(rowOf(rows, '1200003100').vGl < 0) // Sell, contract rate below valuation rate
    ok(rowOf(rows, '1200003133').vGl > 0) // Sell, contract rate above valuation rate
  })
  it('puts posted documents on the row only for the key date they were posted for', () => {
    const { rows } = load()
    const posted = rowOf(rows, '1200003106')
    strictEqual(posted.mtmDoc, '4900001206')
    strictEqual(posted.revDoc, '4900001207')
    strictEqual(posted.msg, 'Document Posted Successfully')
    strictEqual(rowOf(rows, '1200003100').mtmDoc, '')
    strictEqual(rowOf(rows, '1200003100').msg, '')
  })
})

describe('swap calculation', () => {
  const months = buildMtmMonths(KEY)
  it('builds 60 month ends after the key date with a 15 day window', () => {
    strictEqual(months.length, 60)
    deepStrictEqual(months[0], { zmonth: 1, zmonthDate: '2026-10-31', lowDate: '2026-10-16', highDate: '2026-11-15' })
    strictEqual(months[3]?.zmonthDate, '2027-01-31')
    strictEqual(months[59]?.zmonthDate, '2031-09-30')
  })
  it('gives nothing for a maturity outside the 60 months', () => {
    deepStrictEqual(calculateSwap('USD-INR', KEY, '2036-01-31', months), { swap: 0, month: 0 })
  })
  it('interpolates between the bracketing tenors', () => {
    const near = calculateSwap('USD-INR', KEY, '2026-10-30', months)
    const far = calculateSwap('USD-INR', KEY, '2027-04-30', months)
    strictEqual(near.month, 1)
    strictEqual(far.month, 7)
    ok(far.swap > near.swap && near.swap > 0)
    const mid = calculateSwap('USD-INR', KEY, '2026-12-30', months)
    ok(mid.swap > near.swap && mid.swap < far.swap)
  })
  it('keeps the sign of the pair swap points', () => {
    ok(calculateSwap('USD-THB', KEY, '2026-12-30', months).swap < 0)
    ok(calculateSwap('EUR-USD', KEY, '2026-12-30', months).swap > 0)
  })
})

describe('posting', () => {
  it('only offers rows with no MTM document and a non-zero gain/loss', () => {
    const { rows } = load()
    ok(isPostable(rowOf(rows, '1200003100')))
    ok(!isPostable(rowOf(rows, '1200003106')))
    ok(!isPostable(null))
    ok(!isPostable({ ...rowOf(rows, '1200003100'), vGl: 0 }))
    strictEqual(postButtonTitle(rowOf(rows, '1200003100')), '')
    strictEqual(postButtonTitle(null), 'Select a transaction first')
    ok(postButtonTitle(rowOf(rows, '1200003106')).startsWith('Only transactions without an MTM document'))
  })
  it('posts the MTM document and its reversal from the document number range', () => {
    const { db, rows } = load()
    const r = rowOf(rows, '1200003100')
    const res = postMtmDocument(db, r, KEY)
    strictEqual(res.msgs.length, 2)
    deepStrictEqual(
      res.msgs.map((m) => [m.ok, m.doc, m.message, m.diff, m.cRate]),
      [
        [true, '4900001226', 'Document Posted Successfully', -63828.71, 89.3969],
        [true, '4900001227', 'Document Posted Successfully', -63828.71, 89.3969],
      ],
    )
    strictEqual(res.db.docSeq, db.docSeq + 2)
    strictEqual(db.docSeq, 4900001226) // the previous database is untouched
    const again = getFxTransactions(res.db, criteriaOf({ keyIso: KEY, companies: ALL, rfhaText: '', bp: '', pair: '', dealType: 'ALL' }))
    const posted = rowOf(again, '1200003100')
    strictEqual(posted.mtmDoc, '4900001226')
    strictEqual(posted.revDoc, '4900001227')
    ok(!isPostable(posted))
  })
  it('reports a BAPI error without posting anything', () => {
    const { db, rows } = load()
    const r = rowOf(rows, '1200003196')
    const res = postMtmDocument(db, r, KEY)
    deepStrictEqual(res.msgs, [
      { ok: false, rfha: '1200003196', doc: '', diff: r.vGl, message: 'Profit center PC_VN10_03 is locked for posting', cRate: r.cRate },
    ])
    strictEqual(res.db, db)
  })
  it('swallows a missing posting configuration, as the source does', () => {
    const { db, rows } = load()
    const bare = { ...db, accConfig: [] }
    const res = postMtmDocument(bare, rowOf(rows, '1200003100'), KEY)
    deepStrictEqual(res.msgs, [])
    strictEqual(res.db, bare)
  })
  it('chooses the loss or gain configuration by sign and NDF flag', () => {
    const { db, rows } = load()
    const ndfLoss = getAccountingConfig(db, rowOf(rows, '1200003100'))
    strictEqual(ndfLoss?.type, 'ML')
    strictEqual(ndfLoss?.zndf, 'X')
    strictEqual(ndfLoss?.glDebit, '5210011')
    const gain = getAccountingConfig(db, rowOf(rows, '1200003109'))
    strictEqual(gain?.type, 'MG')
    strictEqual(gain?.docHeader, 'FX MTM Gain NDF')
    const delivLoss = getAccountingConfig(db, rowOf(rows, '1200003112'))
    strictEqual(delivLoss?.zndf, '')
    strictEqual(delivLoss?.glCredit, '2290010')
  })
  it('Execute Posting posts every unposted row, in order, and records the BAPI error row too', () => {
    const { db, rows } = load()
    const before = countPostable(rows)
    strictEqual(before, 33 - 6)
    const res = postAll(db, rows, KEY)
    strictEqual(res.msgs.length, (before - 1) * 2 + 1)
    strictEqual(res.msgs.filter((m) => !m.ok).length, 1)
    strictEqual(res.db.docSeq, db.docSeq + (before - 1) * 2)
    const again = getFxTransactions(res.db, criteriaOf({ keyIso: KEY, companies: ALL, rfhaText: '', bp: '', pair: '', dealType: 'ALL' }))
    strictEqual(countPostable(again), 1) // only the row the BAPI refused
  })
  it('counts postable rows for the Execute button, shown only in posting mode', () => {
    const { rows } = load()
    deepStrictEqual(executeState(rows, 'VIEW'), {
      visible: false,
      disabled: true,
      label: 'Execute Posting',
      title: 'Posts all unposted transactions in the current selection',
    })
    const post = executeState(rows, 'POST')
    ok(post.visible && !post.disabled)
    strictEqual(post.label, 'Execute Posting (27)')
    const none = executeState([], 'POST')
    ok(none.disabled)
    strictEqual(none.title, 'No unposted transactions in the selection')
  })
})

describe('documents and details', () => {
  it('lays out the MTM document: debit then credit, dated the key date', () => {
    const { db, rows } = load()
    const r = rowOf(rows, '1200003106')
    const v = buildDocumentView(db, r, 'mtm', KEY)
    strictEqual(v.docNo, '4900001206')
    strictEqual(v.postingDate, KEY)
    strictEqual(v.fiscalYear, '2026')
    strictEqual(v.reversalOf, '')
    strictEqual(v.headerText, 'FX MTM Loss')
    deepStrictEqual(
      v.items.map((i) => [i.item, i.gl, i.pc, i.ba, i.text, i.amount]),
      [
        [1, '0005210010', 'PC_IN11_01', 'OAI1', `MTM Loss:${r.xtext}`, 112622.68],
        [2, '0002290010', 'PC_IN11_01', 'OAI1', `MTM Provision:${r.xtext}`, -112622.68],
      ],
    )
  })
  it('flips the signs and dates the reversal the day after the key date', () => {
    const { db, rows } = load()
    const r = rowOf(rows, '1200003106')
    const v = buildDocumentView(db, r, 'rev', KEY)
    strictEqual(v.docNo, '4900001207')
    strictEqual(v.postingDate, '2026-10-01')
    strictEqual(v.reversalOf, '4900001206')
    deepStrictEqual(
      v.items.map((i) => i.amount),
      [-112622.68, 112622.68],
    )
    const labels = documentHeaderItems(v, r).map((i) => i.label)
    ok(labels.includes('Reversal Of Document'))
    ok(!documentHeaderItems(buildDocumentView(db, r, 'mtm', KEY), r).some((i) => i.label === 'Reversal Of Document'))
  })
  it('crosses the fiscal year for a December key date', () => {
    const { db, rows } = load({ keyIso: '2026-12-31' })
    const r = rows.find((x) => x.mtmDoc)
    if (r) strictEqual(buildDocumentView(db, r, 'rev', '2026-12-31').fiscalYear, '2027')
    strictEqual(buildDocumentView(db, rowOf(rows, rows[0]?.rfha ?? ''), 'rev', '2026-12-31').postingDate, '2027-01-01')
  })
  it('describes a transaction in three sections', () => {
    const { rows } = load()
    const secs = transactionSections(rowOf(rows, '1200003100'), KEY)
    deepStrictEqual(
      secs.map((s) => s.title),
      ['Transaction', 'Deal Terms', 'MTM Valuation (Key Date 30-09-2026)'],
    )
    const terms = secs[1]?.items ?? []
    strictEqual(terms.find((i) => i.label === 'Foreign Amount')?.value, '450,000,000.00 INR')
    strictEqual(terms.find((i) => i.label === 'Amount (USD)')?.value, '5,033,731.59 USD')
    strictEqual(secs[0]?.items.find((i) => i.label === 'Business Partner')?.full, true)
  })
  it('writes VND without decimals', () => {
    const { rows } = load()
    const vnd = rowOf(rows, '1200003184')
    strictEqual(
      transactionSections(vnd, KEY)[1]?.items.find((i) => i.label === 'Foreign Amount')?.value,
      '130,000,000,000 VND',
    )
    const col = COLUMNS.find((c) => c.key === 'fAmt')
    strictEqual(col && cellText(col, vnd), '130,000,000,000')
  })
})

describe('table', () => {
  const { rows } = load()
  const all = visibleColumns('')

  it('shows every column by default and a subset for a layout variant', () => {
    strictEqual(all.length, COLUMNS.length)
    deepStrictEqual(
      visibleColumns('/FI_POSTING').map((c) => c.key),
      ['bukrs', 'rfha', 'ztsfDealId', 'cpair', 'bsBu', 'vGl', 'mtmDoc', 'revDoc', 'msg'],
    )
  })
  it('drops a sort on a column the layout hides', () => {
    const cols = visibleColumns('/FI_POSTING')
    deepStrictEqual(sortForColumns({ field: 'vSpot', dir: 'desc' }, cols), { field: '', dir: 'desc' })
    deepStrictEqual(sortForColumns({ field: 'vGl', dir: 'desc' }, cols), { field: 'vGl', dir: 'desc' })
  })
  it('formats cells per column', () => {
    const r = rowOf(rows, '1200003100')
    const text = (key: string) => {
      const c = COLUMNS.find((x) => x.key === key)
      return c ? cellText(c, r) : ''
    }
    strictEqual(text('dblfz'), '17-02-2026')
    strictEqual(text('cRate'), '89.396900')
    strictEqual(text('ccAmt'), '5,033,731.59')
    strictEqual(text('vGl'), '-63,828.71')
    strictEqual(text('mtmDoc'), '')
    strictEqual(text('monat'), '1')
  })
  it('searches the text of the visible columns, case-insensitively', () => {
    const hit = getViewRows(rows, all, 'hsbc', { field: '', dir: 'asc' })
    ok(hit.length > 0 && hit.every((r) => r.bpName.toLowerCase().includes('hsbc') || JSON.stringify(r).toLowerCase().includes('hsbc')))
    strictEqual(getViewRows(rows, all, '30-10-2026', { field: '', dir: 'asc' }).length > 0, true)
    strictEqual(getViewRows(rows, all, 'zzzz', { field: '', dir: 'asc' }).length, 0)
    // a hidden column is not searched
    strictEqual(getViewRows(rows, visibleColumns('/FI_POSTING'), 'oai1', { field: '', dir: 'asc' }).length, 0)
  })
  it('sorts numbers numerically and text alphabetically, both ways', () => {
    const asc = getViewRows(rows, all, '', { field: 'vGl', dir: 'asc' }).map((r) => r.vGl)
    deepStrictEqual(asc, [...asc].sort((a, b) => a - b))
    const desc = getViewRows(rows, all, '', { field: 'vGl', dir: 'desc' }).map((r) => r.vGl)
    deepStrictEqual(desc, [...asc].reverse())
    const names = getViewRows(rows, all, '', { field: 'bpName', dir: 'asc' }).map((r) => r.bpName.toLowerCase())
    deepStrictEqual(names, [...names].sort())
  })
  it('sorts Exp Mth-yr by the maturity month, not the words', () => {
    const list = getViewRows(rows, all, '', { field: 'month', dir: 'asc' })
    const keys = list.map((r) => r.delfz.slice(0, 7))
    deepStrictEqual(keys, [...keys].sort())
    strictEqual(list[0]?.month, 'Oct 2026')
  })
  it('keeps the incoming order with no sort and ignores a sort on an absent column', () => {
    deepStrictEqual(
      getViewRows(rows, all, '', { field: '', dir: 'asc' }).map((r) => r.rfha),
      rows.map((r) => r.rfha),
    )
    deepStrictEqual(
      getViewRows(rows, visibleColumns('/FI_POSTING'), '', { field: 'vSpot', dir: 'asc' }).map((r) => r.rfha),
      rows.map((r) => r.rfha),
    )
  })
  it('flips the sorted column and starts a new one ascending', () => {
    deepStrictEqual(nextSort({ field: '', dir: 'asc' }, 'vGl'), { field: 'vGl', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'vGl', dir: 'asc' }, 'vGl'), { field: 'vGl', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'vGl', dir: 'desc' }, 'vGl'), { field: 'vGl', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'vGl', dir: 'desc' }, 'rfha'), { field: 'rfha', dir: 'asc' })
  })
  it('explains an empty table', () => {
    strictEqual(emptyMessage('Key Date is required.', 3), 'Enter a valid month-end Key Date to load transactions.')
    strictEqual(emptyMessage('', 0), 'Select at least one company code to load transactions.')
    strictEqual(emptyMessage('', 3), 'No transactions match your search or filters.')
  })
})

describe('paging', () => {
  it('counts pages and clamps the current one', () => {
    strictEqual(pageCount(0, 20), 1)
    strictEqual(pageCount(33, 20), 2)
    strictEqual(pageCount(40, 20), 2)
    strictEqual(clampPage(5, 33, 20), 2)
    strictEqual(clampPage(0, 33, 20), 1)
  })
  it('words the range shown', () => {
    strictEqual(showingText(1, 20, 33, 20), 'Showing 1–20 of 33')
    strictEqual(showingText(2, 20, 33, 13), 'Showing 21–33 of 33')
    strictEqual(showingText(1, 20, 0, 0), '')
  })
  it('lists every page up to seven, then the ends and the current neighbours with gaps', () => {
    deepStrictEqual(pagerItems(1, 1), [1])
    deepStrictEqual(pagerItems(3, 7), [1, 2, 3, 4, 5, 6, 7])
    deepStrictEqual(pagerItems(1, 10), [1, 2, '…', 10])
    deepStrictEqual(pagerItems(5, 10), [1, '…', 4, 5, 6, '…', 10])
    deepStrictEqual(pagerItems(10, 10), [1, '…', 9, 10])
  })
})

describe('calendar', () => {
  it('wraps months across year ends', () => {
    deepStrictEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 })
    deepStrictEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 })
    deepStrictEqual(shiftMonth({ y: 2026, m: 8 }, 1), { y: 2026, m: 9 })
  })
  it('lays out September 2026 with the month end marked', () => {
    // 1 September 2026 is a Tuesday: two muted days before, 30 days, then padding to a full week
    const cells = calendarCells({ y: 2026, m: 8 })
    strictEqual(cells.length % 7, 0)
    deepStrictEqual(
      cells.slice(0, 2).map((c) => [c.kind, c.day]),
      [
        ['muted', 30],
        ['muted', 31],
      ],
    )
    const days = cells.filter((c) => c.kind === 'day')
    strictEqual(days.length, 30)
    deepStrictEqual(
      days.filter((c) => c.eom).map((c) => c.iso),
      ['2026-09-30'],
    )
    strictEqual(cells[cells.length - 1]?.day, 3)
  })
  it('has no padding when a month fills whole weeks', () => {
    // February 2026 starts on a Sunday and has 28 days
    const cells = calendarCells({ y: 2026, m: 1 })
    strictEqual(cells.length, 28)
    ok(cells.every((c) => c.kind === 'day'))
  })
})
