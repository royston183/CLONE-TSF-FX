import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FO_REVIEWER, STATUS, buildTransactions } from './data.ts'
import { fmtDate, fmtNum, parseAmountShorthand, safeParseDate } from './format.ts'
import {
  DEFAULT_FILTERS,
  applyCorrection,
  buildCsv,
  checkedTxns,
  correctionTarget,
  csvEsc,
  deriveAmount2,
  deriveProfitCenter,
  dragPayload,
  dropOutcome,
  filterTxns,
  formFromTxn,
  isActionable,
  nextSort,
  normaliseRate,
  pageOf,
  pagerWindow,
  resolveReverseScope,
  reverseSubtitle,
  reverseToast,
  reverseTxns,
  selectAllState,
  setPageChecked,
  toggleChecked,
} from './logic.ts'
import type { Sort, Txn } from './types.ts'

const DESC: Sort = { key: 'rfha', dir: -1 }
const find = (list: Txn[], rfha: string) => {
  const t = list.find((m) => m.rfha === rfha)
  if (!t) throw new Error(`no txn ${rfha}`)
  return t
}
const rfhas = (list: Txn[]) => list.map((t) => t.rfha)

describe('format', () => {
  it('formats amounts and dates like the page', () => {
    strictEqual(fmtNum(1234567.891), '1,234,567.89')
    strictEqual(fmtNum(-5), '-5.00')
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05-01-2026')
  })

  it('parses dd-mm-yyyy and rejects impossible or other-format dates', () => {
    strictEqual(safeParseDate('31-02-2026'), null)
    strictEqual(safeParseDate('2026-02-01'), null)
    strictEqual(safeParseDate(''), null)
    strictEqual(safeParseDate(' 01-02-2026 ')?.getMonth(), 1)
  })

  it('reads the SAP M/T amount shorthand and zeroes anything unreadable', () => {
    strictEqual(parseAmountShorthand('5M'), 5_000_000)
    strictEqual(parseAmountShorthand('250t'), 250_000)
    strictEqual(parseAmountShorthand('1.5 m'), 1_500_000)
    strictEqual(parseAmountShorthand('1,250.50'), 1250.5)
    strictEqual(parseAmountShorthand('abc'), 0)
    strictEqual(parseAmountShorthand(''), 0)
  })
})

describe('buildTransactions', () => {
  const list = buildTransactions()

  it('derives descriptions, amounts and dates from the seed row', () => {
    const t = find(list, '6005000001714')
    strictEqual(t.dealIdDesc, 'Nidhi S._OGA_2026/OGA-DMCC-OSIPL')
    strictEqual(t.companyName, 'Olam Global Agri Pte. Ltd')
    strictEqual(t.amt2, 91_500)
    strictEqual(fmtDate(t.valueDate), '02-04-2026')
    strictEqual(t.profitCenterDesc, 'SG032003 - TSF-FX')
    strictEqual(find(list, '6005000000056').dealIdDesc, 'Nidhi S._DMCC_2026/DMCC-OGA-OSIPL')
  })

  it('stamps worked rows only', () => {
    strictEqual(find(list, '6005000001714').changedOn, null)
    const resub = find(list, '6005000001680')
    strictEqual(resub.changedBy, FO_REVIEWER)
    strictEqual(fmtDate(resub.changedOn ?? new Date(0)), '09-09-2026')
  })
})

describe('filterTxns', () => {
  const list = buildTransactions()

  it('shows all 14 rows by default, newest transaction first', () => {
    const rows = filterTxns(list, DEFAULT_FILTERS, 'ALL', DESC)
    strictEqual(rows.length, 14)
    strictEqual(rows[0]?.rfha, '6205000003910')
  })

  it('narrows by status, company code, trader and blotter date', () => {
    strictEqual(filterTxns(list, DEFAULT_FILTERS, 'ERRCORR', DESC).length, 10)
    strictEqual(filterTxns(list, DEFAULT_FILTERS, 'REVERSED', DESC).length, 2)
    strictEqual(filterTxns(list, { ...DEFAULT_FILTERS, coCode: 'IN11' }, 'ALL', DESC).length, 3)
    strictEqual(filterTxns(list, { ...DEFAULT_FILTERS, trader: 'C14' }, 'ALL', DESC).length, 1)
    const sept = filterTxns(list, { ...DEFAULT_FILTERS, dateFrom: '01-09-2026' }, 'ALL', DESC)
    strictEqual(sept.length, 8)
  })

  it('searches every column as rendered, ignoring case and surrounding space', () => {
    const q = (text: string) => rfhas(filterTxns(list, { ...DEFAULT_FILTERS, q: text }, 'ALL', DESC))
    deepStrictEqual(q('  bank holiday '), ['6205000003772'])
    deepStrictEqual(q('3.6733'), ['6205000003890'])
    deepStrictEqual(q('750,000.00'), ['6205000003890'])
    deepStrictEqual(q('loans'), ['6005000001820']) // the Account Cat description
    strictEqual(q('released to mo').length, 2)
    strictEqual(q('TH102003').length, 4)
    strictEqual(q('akshay').length, 3)
  })

  it('sorts ascending on a new column and keeps ties in the prior order', () => {
    const byDate = filterTxns(list, DEFAULT_FILTERS, 'ALL', { key: 'tradeDate', dir: 1 })
    strictEqual(byDate[0]?.rfha, '6205000003772')
    const prior = rfhas(filterTxns(list, DEFAULT_FILTERS, 'ALL', DESC))
    const byDeal = filterTxns(list, DEFAULT_FILTERS, 'ALL', { key: 'dealId', dir: 1 }, prior)
    // Deal 1100002617's two legs keep the descending rfha order they were sorted from.
    const pair = rfhas(byDeal).filter((r) => r.startsWith('62050000036'))
    deepStrictEqual(pair, ['6205000003602', '6205000003601'])
    deepStrictEqual(nextSort(DESC, 'rfha'), { key: 'rfha', dir: 1 })
    deepStrictEqual(nextSort(DESC, 'dealId'), { key: 'dealId', dir: 1 })
  })
})

describe('paging', () => {
  it('slices a page and clamps past the end', () => {
    const p = pageOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, 8)
    deepStrictEqual(p.rows, [9, 10])
    strictEqual(p.page, 2)
    strictEqual(p.first, 9)
    strictEqual(p.last, 10)
    strictEqual(pageOf([], 1, 15).first, 0)
    deepStrictEqual(pagerWindow(1, 1), [1])
    deepStrictEqual(pagerWindow(5, 9), [3, 4, 5, 6, 7])
  })
})

describe('selection', () => {
  const list = buildTransactions()
  const errcorr = find(list, '6005000001714')
  const reversed = find(list, '6205000003550')

  it('only ever selects Correction Required rows, in the order ticked', () => {
    strictEqual(isActionable(reversed), false)
    deepStrictEqual(toggleChecked([], reversed, true), [])
    const two = toggleChecked(toggleChecked([], find(list, '6205000003910'), true), errcorr, true)
    deepStrictEqual(rfhas(checkedTxns(list, two)), ['6205000003910', '6005000001714'])
    deepStrictEqual(toggleChecked(two, errcorr, false), ['6205000003910'])
  })

  it('select-all covers the actionable rows of the current page only', () => {
    const page = filterTxns(list, DEFAULT_FILTERS, 'ALL', DESC).slice(0, 8)
    const all = setPageChecked([], page, true)
    strictEqual(all.length, page.filter(isActionable).length)
    deepStrictEqual(selectAllState(page, all), { checked: true, disabled: false })
    deepStrictEqual(setPageChecked(all, page, false), [])
    deepStrictEqual(selectAllState([reversed], []), { checked: false, disabled: true })
  })

  it('opens the correction action for exactly one selected row', () => {
    deepStrictEqual(correctionTarget([]), { error: 'Select one Correction Required transaction first.' })
    deepStrictEqual(correctionTarget([errcorr]), { rfha: errcorr.rfha })
    deepStrictEqual(correctionTarget([errcorr, errcorr]), {
      error: 'FX Error Correction can be opened for one transaction at a time.',
    })
  })
})

describe('drag and drop', () => {
  const list = buildTransactions()
  const a = find(list, '6005000001714')
  const b = find(list, '6005000000056')
  const c = find(list, '6205000003772')
  const checked = [a.rfha, b.rfha]
  const selected = checkedTxns(list, checked)

  it('a selected row carries the selection, an unselected one only itself', () => {
    deepStrictEqual(dragPayload(a, checked, selected), [a.rfha, b.rfha])
    deepStrictEqual(dragPayload(c, checked, selected), [c.rfha])
    deepStrictEqual(dragPayload(find(list, '6205000003550'), checked, selected), [])
  })

  it('correction takes a single row; reverse takes any number', () => {
    deepStrictEqual(dropOutcome('correction', [a.rfha]), { kind: 'correct', rfha: a.rfha })
    deepStrictEqual(dropOutcome('correction', [a.rfha, b.rfha]), {
      kind: 'error',
      message: 'Drag exactly one transaction onto FX Error Correction - 2 were selected.',
    })
    deepStrictEqual(dropOutcome('reverse', [a.rfha, b.rfha]), { kind: 'reverse', rfhas: [a.rfha, b.rfha] })
    deepStrictEqual(dropOutcome('reverse', []), { kind: 'none' })
  })
})

describe('FX Error Correction', () => {
  const list = buildTransactions()
  const t = find(list, '6205000003601')
  const now = new Date(2026, 8, 26)

  it('pre-fills New Details from the transaction', () => {
    const f = formFromTxn(t)
    strictEqual(f.amount1, '1,000,000.00')
    strictEqual(f.spotRate, '34.0000')
    strictEqual(f.valueDate, '31-12-2026')
    strictEqual(f.profitCenter, 'TH102003 - TSF-FX')
  })

  it('derives Amount 2, the rates and Profit Center as the popup does', () => {
    strictEqual(deriveAmount2('5M', '34.5'), '172,500,000.00')
    strictEqual(deriveAmount2('250T', 'x'), '0.00')
    strictEqual(normaliseRate('1,234.5'), '1234.5000')
    strictEqual(normaliseRate('abc'), '0.0000')
    strictEqual(deriveProfitCenter('0615'), 'AE1340 - TSF-FX')
    strictEqual(deriveProfitCenter('9999'), '')
  })

  it('writes the New Details back and releases the transaction to MO', () => {
    const form = {
      ...formFromTxn(t),
      partner: '0660012173',
      amount1: '2M',
      spotRate: '35',
      allInRate: '0',
      swapRate: 'abc',
      busArea: '0615',
      valueDate: '15-01-2027',
      tradeDate: 'not a date',
      dealId: '1100009999',
    }
    const u = applyCorrection(t, form, now)
    strictEqual(u.status, STATUS.RESUB)
    strictEqual(u.partnerName, 'JPMORGAN CHASE BANK NA SINGAPORE')
    strictEqual(u.amt1, 2_000_000)
    strictEqual(u.amt2, 70_000_000)
    strictEqual(u.allInRate, 34) // 0 keeps the old rate
    strictEqual(u.swapRate, 0)
    strictEqual(u.profitCenterDesc, 'AE1340 - TSF-FX')
    strictEqual(u.busAreaDesc, 'OLAM INTERNATIONAL DMCC')
    strictEqual(fmtDate(u.valueDate), '15-01-2027')
    strictEqual(u.tradeDate, t.tradeDate) // unreadable date keeps the old one
    strictEqual(u.dealId, '1100009999')
    strictEqual(u.changedBy, FO_REVIEWER)
    strictEqual(u.changedOn, now)
    strictEqual(isActionable(u), false)
  })
})

describe('reverse', () => {
  const list = buildTransactions()
  const now = new Date(2026, 8, 26)
  const checked = ['6005000001714', '6005000000056']

  it('resolves bulk, single and dragged scopes', () => {
    deepStrictEqual(rfhas(resolveReverseScope(list, 'bulk', checked)), checked)
    deepStrictEqual(rfhas(resolveReverseScope(list, '6205000003772', checked)), ['6205000003772'])
    deepStrictEqual(rfhas(resolveReverseScope(list, ['6205000003772', 'nope'], checked)), ['6205000003772'])
    strictEqual(reverseSubtitle(resolveReverseScope(list, '6205000003772', [])), 'Transaction 6205000003772 – Deal 1100002761')
    strictEqual(reverseSubtitle(resolveReverseScope(list, 'bulk', checked)), '2 transactions selected')
  })

  it('reverses, appends the optional remark and stamps the change', () => {
    const out = reverseTxns(list, checked, '  duplicate booking ', now)
    const a = find(out, '6005000001714')
    strictEqual(a.status, STATUS.REVERSED)
    strictEqual(a.moRemark.endsWith(' [FO: duplicate booking]'), true)
    strictEqual(a.changedOn, now)
    strictEqual(find(reverseTxns(list, ['6205000003772'], '', now), '6205000003772').moRemark, find(list, '6205000003772').moRemark)
    strictEqual(find(out, '6205000003772').status, STATUS.ERRCORR)
    strictEqual(reverseToast([a]), 'Transaction 6005000001714 reversed.')
    strictEqual(reverseToast([a, a]), '2 transactions reversed.')
  })
})

describe('buildCsv', () => {
  it('writes the header, raw values, status and dates, quoting where needed', () => {
    const list = buildTransactions()
    const lines = buildCsv([find(list, '6005000001714')]).split('\n')
    strictEqual(lines.length, 2)
    strictEqual(lines[0]?.split(',').length, 35)
    strictEqual(lines[0]?.startsWith('Transaction,Deal ID,Deal ID Description'), true)
    const row = lines[1] ?? ''
    strictEqual(row.startsWith('6005000001714,1100002634,Nidhi S._OGA_2026/OGA-DMCC-OSIPL,2000002317,SG03,'), true)
    strictEqual(row.includes(',USD,1000,INR,91500,91.5000,0.0000,91.5000,'), true)
    strictEqual(row.endsWith(',Correction Required,31-03-2026,02-04-2026,31-03-2026,,,'), true)
    strictEqual(csvEsc('a "b", c'), '"a ""b"", c"')
    strictEqual(csvEsc(null), '')
  })
})
