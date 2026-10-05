import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOUSE_BANKS, TRANSFER_TYPES, seedDeals } from './data.ts'
import { fmtDate, fmtNum, fmtRate, parseDMY } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  accountOptions,
  applyBankUpdate,
  bankCandidates,
  bankUpdateToast,
  ccyPairs,
  computeKpis,
  dealCountLabel,
  filterDeals,
  newDocNo,
  nextSort,
  pageOf,
  pagerWindow,
  postDeal,
  postGuard,
  pruneSelection,
  selectedLabel,
  sortDeals,
  testRunMessage,
  toggleBukrs,
  toggleSelected,
  transferTypeOf,
} from './logic.ts'
import type { Deal } from './types.ts'

const find = (list: Deal[], id: string) => {
  const d = list.find((x) => x.dealId === id)
  if (!d) throw new Error(`no deal ${id}`)
  return d
}
const ids = (list: Deal[]) => list.map((d) => d.dealId)

describe('format', () => {
  it('formats numbers, rates and dates', () => {
    strictEqual(fmtNum(5000000), '5,000,000.00')
    strictEqual(fmtNum(null), '—')
    strictEqual(fmtRate(83), '83.00')
    strictEqual(fmtRate(15542.5), '15,542.50')
    strictEqual(fmtRate(1.075), '1.075')
    strictEqual(fmtDate('2026-10-15'), '15-10-2026')
    strictEqual(fmtDate(null), '—')
    strictEqual(fmtDate('garbage'), '—')
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05-01-2026')
  })
  it('parses dd-mm-yyyy only', () => {
    strictEqual(parseDMY('01-09-2026')?.getMonth(), 8)
    strictEqual(parseDMY('2026-09-01'), null)
    strictEqual(parseDMY(''), null)
  })
})

describe('filters', () => {
  const deals = seedDeals()
  it('default filters keep the deals inside 01-09-2026..31-12-2026', () => {
    strictEqual(filterDeals(deals, DEFAULT_FILTERS).length, 10)
  })
  it('value date range is inclusive and drops outside deals', () => {
    const f = { ...DEFAULT_FILTERS, dateFrom: '01-10-2026', dateTo: '31-10-2026' }
    deepStrictEqual(
      ids(filterDeals(deals, f)).sort(),
      ['TSF-20261001', 'TSF-20261002', 'TSF-20261005', 'TSF-20261009'],
    )
    const edge = { ...DEFAULT_FILTERS, dateFrom: '15-10-2026', dateTo: '15-10-2026' }
    deepStrictEqual(ids(filterDeals(deals, edge)), ['TSF-20261001'])
  })
  it('company code chips', () => {
    deepStrictEqual(toggleBukrs(['ALL'], 'OIL1'), ['OIL1'])
    deepStrictEqual(toggleBukrs(['OIL1'], 'DMCC'), ['OIL1', 'DMCC'])
    deepStrictEqual(toggleBukrs(['OIL1'], 'OIL1'), ['ALL'])
    deepStrictEqual(toggleBukrs(['OIL1', 'DMCC'], 'ALL'), ['ALL'])
    const f = { ...DEFAULT_FILTERS, bukrs: ['OAIP'] }
    deepStrictEqual(ids(filterDeals(deals, f)).sort(), ['TSF-20261003', 'TSF-20261006', 'TSF-20261009'])
  })
  it('bank, status and ccy pair filters', () => {
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, bank: 'NOT_ASSIGNED' }).length, 4)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, status: 'Settled' }).length, 2)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, status: 'Matured' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, ccy: 'GBP/USD' }).length, 1)
  })
  it('search matches deal id, txn no, counterparty, trader and MC ref, case-insensitively', () => {
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'tsf-20261004' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: '5001234507' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'a. mehta' }).length, 3)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: '2000002708' }).length, 1)
    strictEqual(filterDeals(deals, { ...DEFAULT_FILTERS, search: 'zzz' }).length, 0)
  })
  it('lists distinct sorted currency pairs and a count label', () => {
    deepStrictEqual(ccyPairs(deals), ['EUR/USD', 'GBP/USD', 'USD/IDR', 'USD/INR', 'USD/MYR'])
    strictEqual(dealCountLabel(1), '1 deal')
    strictEqual(dealCountLabel(0), '0 deals')
    strictEqual(dealCountLabel(10), '10 deals')
  })
})

describe('kpis', () => {
  it('counts the full dataset', () => {
    deepStrictEqual(computeKpis(seedDeals()), { total: 10, awaiting: 4, ready: 4, settled: 2 })
  })
})

describe('sort', () => {
  const deals = seedDeals()
  it('defaults to value date ascending and flips on the same key', () => {
    strictEqual(ids(sortDeals(deals, DEFAULT_SORT))[0], 'TSF-20261008')
    const desc = nextSort(DEFAULT_SORT, 'valueDate')
    strictEqual(desc.dir, -1)
    strictEqual(ids(sortDeals(deals, desc))[0], 'TSF-20261007')
    deepStrictEqual(nextSort(desc, 'dealId'), { key: 'dealId', dir: 1 })
  })
  it('does not mutate its input', () => {
    const before = ids(deals)
    sortDeals(deals, { key: 'valueDate', dir: -1 })
    deepStrictEqual(ids(deals), before)
  })
})

describe('paging', () => {
  const deals = seedDeals()
  it('slices pages and clamps the requested page', () => {
    const p1 = pageOf(deals, 1, 8)
    strictEqual(p1.rows.length, 8)
    strictEqual(p1.totalPages, 2)
    strictEqual(`${p1.start}-${p1.end}`, '1-8')
    const p9 = pageOf(deals, 9, 8)
    strictEqual(p9.page, 2)
    strictEqual(`${p9.start}-${p9.end}`, '9-10')
    const empty = pageOf([], 1, 15)
    strictEqual(empty.totalPages, 1)
    strictEqual(`${empty.start}-${empty.end}`, '0-0')
  })
  it('pager window shows everything up to 7 pages, then first/last and current +-2', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(1, 7), [1, 2, 3, 4, 5, 6, 7])
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3, 10])
    deepStrictEqual(pagerWindow(5, 10), [1, 3, 4, 5, 6, 7, 10])
  })
})

describe('selection', () => {
  it('is single-row and toggles', () => {
    strictEqual(toggleSelected(null, 'A'), 'A')
    strictEqual(toggleSelected('A', 'B'), 'B')
    strictEqual(toggleSelected('A', 'A'), null)
    strictEqual(selectedLabel(null), '0 selected')
    strictEqual(selectedLabel('A'), '1 selected · drag the row to an action')
  })
  it('is dropped when its row leaves the filtered result', () => {
    const deals = seedDeals()
    strictEqual(pruneSelection('TSF-20261001', deals), 'TSF-20261001')
    strictEqual(pruneSelection('TSF-20261001', deals.slice(1)), null)
    strictEqual(pruneSelection(null, deals), null)
  })
})

describe('house bank / account options', () => {
  it('offers banks with an account in the leg currency, else all of the company banks', () => {
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'GBP').map((b) => b.id), ['SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'USD').map((b) => b.id), ['CITISG', 'SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'OIL1', 'JPY').map((b) => b.id), ['CITISG', 'SCBSG'])
    deepStrictEqual(bankCandidates(HOUSE_BANKS, 'XXXX', 'USD'), [])
  })
  it('lists every account of the chosen bank', () => {
    deepStrictEqual(accountOptions(HOUSE_BANKS, 'DMCC', 'MASHQ').map((a) => a.id), ['USD11', 'AED01'])
    deepStrictEqual(accountOptions(HOUSE_BANKS, 'DMCC', ''), [])
  })
  it('maps transfer types', () => {
    strictEqual(transferTypeOf(TRANSFER_TYPES, 'INR'), 'T2-NEFT')
    strictEqual(transferTypeOf(TRANSFER_TYPES, 'JPY'), '—')
  })
})

describe('bank update', () => {
  const deals = seedDeals()
  it('assigns both legs and marks the deal ASSIGNED', () => {
    const d = find(deals, 'TSF-20261001')
    const r = applyBankUpdate(d, { hb1: 'CITISG', acc1: 'USD01', hb2: 'SCBSG', acc2: 'USD02' })
    strictEqual(r.deal.bankStatus, 'ASSIGNED')
    strictEqual(r.deal.hb2, 'SCBSG')
    deepStrictEqual(r.logs.map((l) => `${l.leg}:${l.ok}`), ['Incoming:true', 'Outgoing:true'])
    strictEqual(d.bankStatus, 'NOT_ASSIGNED')
  })
  it('requires bank and account on an open leg, and stays NOT_ASSIGNED', () => {
    const d = find(deals, 'TSF-20261001')
    const r = applyBankUpdate(d, { hb1: 'CITISG', acc1: '', hb2: '', acc2: '' })
    deepStrictEqual(r.logs.map((l) => l.ok), [false, false])
    strictEqual(r.deal.hb1, null)
    strictEqual(r.deal.bankStatus, 'NOT_ASSIGNED')
    strictEqual(bankUpdateToast(r.logs).kind, 'error')
  })
  it('partial success keeps the deal unassigned but reports success', () => {
    const d = find(deals, 'TSF-20261001')
    const r = applyBankUpdate(d, { hb1: 'CITISG', acc1: 'USD01', hb2: '', acc2: '' })
    deepStrictEqual(r.logs.map((l) => l.ok), [true, false])
    strictEqual(r.deal.hb1, 'CITISG')
    strictEqual(r.deal.bankStatus, 'NOT_ASSIGNED')
    deepStrictEqual(bankUpdateToast(r.logs), { message: 'House Bank and Acc ID Successfully updated', kind: 'success' })
  })
  it('leaves an already assigned leg alone and logs nothing when both are set', () => {
    const d = find(deals, 'TSF-20261002')
    const r = applyBankUpdate(d, { hb1: 'ENBD', acc1: 'USD12', hb2: 'ENBD', acc2: 'USD12' })
    deepStrictEqual(r.logs, [])
    strictEqual(r.deal.hb1, 'MASHQ')
  })
})

describe('test run and post', () => {
  const deals = seedDeals()
  it('test run message names the deal and txn', () => {
    strictEqual(
      testRunMessage(find(deals, 'TSF-20261001')),
      'Test run completed for TSF-20261001 (Txn 5001234501). RFTBBB00 ran in test mode — no documents were posted.',
    )
  })
  it('post is blocked until bank details are assigned and when already settled', () => {
    const open = postGuard(find(deals, 'TSF-20261001'))
    strictEqual(open.ok, false)
    if (!open.ok) strictEqual(open.kind, 'error')
    const settled = postGuard(find(deals, 'TSF-20261003'))
    strictEqual(settled.ok, false)
    if (!settled.ok) {
      strictEqual(settled.message, 'TSF-20261003 is already settled.')
      strictEqual(settled.kind, '')
    }
    strictEqual(postGuard(find(deals, 'TSF-20261002')).ok, true)
  })
  it('post settles the deal with both document numbers', () => {
    const posted = postDeal(find(deals, 'TSF-20261002'), '191', '192')
    strictEqual(posted.status, 'Settled')
    strictEqual(posted.fiDoc, '191')
    strictEqual(posted.doc2, '192')
    strictEqual(find(deals, 'TSF-20261002').status, 'Unmatured')
  })
  it('document numbers are 19 + 7 digits', () => {
    strictEqual(newDocNo(() => 0), '191000000')
    strictEqual(/^19\d{7}$/.test(newDocNo()), true)
  })
})
