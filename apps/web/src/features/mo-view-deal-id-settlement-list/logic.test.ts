import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INVOICES_WAITING, LIST_WAITING, loadSettlementList } from './api.ts'
import { buildDeals, buildMasterContracts, invoiceLegs } from './fixtures.ts'
import { fmtCompactUsd, fmtDate, fmtNum, parseDate } from './format.ts'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  computeKpis,
  daysInMonth,
  keyDateNote,
  leadingBlanks,
  matchesFilters,
  nextKpiFilter,
  pageRows,
  pageWindow,
  pagerRange,
  regionName,
  resultCountLabel,
  shiftMonth,
  sortArrow,
  sortDeals,
  statusIsSettled,
  toggleSort,
  totalPages,
  visibleDeals,
} from './logic.ts'

const mcs = buildMasterContracts()
const deals = buildDeals(mcs)
const ids = (list: readonly { dealId: string }[]) => list.map((d) => d.dealId)
const deal = (id: string) => {
  const d = deals.find((x) => x.dealId === id)
  if (!d) throw new Error(`no seed deal ${id}`)
  return d
}

describe('formatting', () => {
  it('groups thousands and keeps two decimals', () => {
    strictEqual(fmtNum(1234567.891), '1,234,567.89')
    strictEqual(fmtNum(0), '0.00')
    strictEqual(fmtNum(-1234.5), '-1,234.50')
  })
  it('compacts USD', () => {
    strictEqual(fmtCompactUsd(15_000_000), '$15.00M')
    strictEqual(fmtCompactUsd(2_500_000_000), '$2.50B')
    strictEqual(fmtCompactUsd(4200), '$4.2K')
    strictEqual(fmtCompactUsd(950), '$950')
  })
  it('round-trips DD.MM.YYYY', () => {
    strictEqual(fmtDate(parseDate('05.02.2026')), '05.02.2026')
    strictEqual(fmtDate(null), '')
  })
})

describe('seed data', () => {
  it('derives Master Contracts from their FX model', () => {
    strictEqual(mcs.length, 6)
    const mc = mcs.find((m) => m.mcRef === 'MC-7001')
    strictEqual(mc?.originEntity, 'OSIPL')
    strictEqual(mc?.region, 'R01')
    strictEqual(fmtDate(mc?.shipStart), '06.02.2026') // 02.01 + 35 days
    strictEqual(fmtDate(mc?.shipEnd), '08.03.2026') // + 30 days
  })
  it('derives Deal IDs from their Master Contract and status', () => {
    strictEqual(deals.length, 11)
    const d = deal('TSF-9081')
    strictEqual(d.dealDesc, 'SOYABEAN OIL deal under MC-7001 (M021)')
    strictEqual(d.shortDesc, 'SOYABEAN OIL 9081')
    strictEqual(d.statusDesc, 'Invoiced')
    strictEqual(d.revisedEndDate, null)
    strictEqual(d.confirm, true)
    strictEqual(deal('TSF-9118').confirm, false)
    strictEqual(deal('TSF-9118').changedBy, '')
    strictEqual(fmtDate(deal('TSF-9095').revisedEndDate), '22.02.2026')
  })
})

describe('KPIs', () => {
  it('counts settled (21/22) against pending, and totals utilised amount', () => {
    strictEqual(statusIsSettled('21'), true)
    strictEqual(statusIsSettled('22'), true)
    strictEqual(statusIsSettled('07'), false)
    const k = computeKpis(deals)
    deepStrictEqual([k.total, k.pending, k.settled], [11, 7, 4])
    strictEqual(k.utiTotal, deals.reduce((s, d) => s + d.utiAmt, 0))
  })
  it('toggles a KPI card filter off when clicked again', () => {
    strictEqual(nextKpiFilter('ALL', 'OPEN'), 'OPEN')
    strictEqual(nextKpiFilter('OPEN', 'OPEN'), 'ALL')
    strictEqual(nextKpiFilter('OPEN', 'DONE'), 'DONE')
  })
})

describe('filtering', () => {
  it('starts with no CO Area filter (there is no CO Area master to default from)', () => {
    strictEqual(DEFAULT_FILTERS.co, '')
    strictEqual(visibleDeals(deals, DEFAULT_FILTERS, DEFAULT_SORT).length, 11)
    strictEqual(visibleDeals(deals, { ...DEFAULT_FILTERS, co: '1000' }, DEFAULT_SORT).length, 7)
  })
  it('searches Deal ID, MC ref, partner and description, ignoring case', () => {
    const f = { ...DEFAULT_FILTERS, co: '' }
    deepStrictEqual(ids(deals.filter((d) => matchesFilters(d, { ...f, search: ' mc-7022 ' }))), ['TSF-9110', 'TSF-9127'])
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, search: 'barclays' })).length, 2)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, search: 'sugar deal' })).length, 2)
  })
  it('matches the Deal ID box as a substring', () => {
    const f = { ...DEFAULT_FILTERS, co: '', deal: '913' }
    deepStrictEqual(ids(deals.filter((d) => matchesFilters(d, f))), ['TSF-9131', 'TSF-9138'])
  })
  it('filters by status, region, origin entity and CO Area', () => {
    const f = { ...DEFAULT_FILTERS, co: '' }
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, status: '22' })).length, 2)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, region: 'R01' })).length, 11)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, region: 'R02' })).length, 0)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, entity: 'OVL' })).length, 2)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, co: '2000' })).length, 4)
  })
  it('applies the KPI card filter', () => {
    const f = { ...DEFAULT_FILTERS, co: '' }
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, kpi: 'OPEN' })).length, 7)
    strictEqual(deals.filter((d) => matchesFilters(d, { ...f, kpi: 'DONE' })).length, 4)
  })
  it('applies an inclusive Value Date range', () => {
    const f = { ...DEFAULT_FILTERS, co: '', dateFrom: '13.03.2026', dateTo: '13.04.2026' }
    deepStrictEqual(ids(visibleDeals(deals, f, DEFAULT_SORT)), ['TSF-9121', 'TSF-9138', 'TSF-9102', 'TSF-9110'])
    strictEqual(visibleDeals(deals, { ...f, dateTo: '' }, DEFAULT_SORT).length, 8)
  })
  it('narrows to one Master Contract', () => {
    const f = { ...DEFAULT_FILTERS, co: '', contextMc: 'MC-7048' }
    strictEqual(visibleDeals(deals, f, DEFAULT_SORT).length, 3)
  })
})

describe('sorting', () => {
  it('sorts by value date ascending by default', () => {
    const sorted = sortDeals(deals, DEFAULT_SORT)
    strictEqual(sorted[0]?.dealId, 'TSF-9081')
    strictEqual(sorted[sorted.length - 1]?.dealId, 'TSF-9150')
  })
  it('does not mutate its input', () => {
    const before = ids(deals)
    sortDeals(deals, { key: 'utiAmt', dir: -1 })
    deepStrictEqual(ids(deals), before)
  })
  it('sorts text case-insensitively and numbers numerically, in either direction', () => {
    strictEqual(sortDeals(deals, { key: 'dealId', dir: 1 })[0]?.dealId, 'TSF-9081')
    strictEqual(sortDeals(deals, { key: 'dealId', dir: -1 })[0]?.dealId, 'TSF-9150')
    strictEqual(sortDeals(deals, { key: 'utiAmt', dir: -1 })[0]?.dealId, 'TSF-9081')
    strictEqual(sortDeals(deals, { key: 'statusDesc', dir: 1 })[0]?.statusDesc, 'BL Attached')
  })
  it('flips direction on the same column, resets on a new one', () => {
    deepStrictEqual(toggleSort({ key: 'valueDate', dir: 1 }, 'valueDate'), { key: 'valueDate', dir: -1 })
    deepStrictEqual(toggleSort({ key: 'valueDate', dir: -1 }, 'valueDate'), { key: 'valueDate', dir: 1 })
    deepStrictEqual(toggleSort({ key: 'valueDate', dir: -1 }, 'dealId'), { key: 'dealId', dir: 1 })
  })
  it('shows the arrow only on the sorted column', () => {
    strictEqual(sortArrow({ key: 'dealId', dir: 1 }, 'dealId'), '▲')
    strictEqual(sortArrow({ key: 'dealId', dir: -1 }, 'dealId'), '▼')
    strictEqual(sortArrow({ key: 'dealId', dir: 1 }, 'mcRef'), '')
  })
})

describe('paging', () => {
  it('computes pages and slices', () => {
    strictEqual(totalPages(0, 15), 1)
    strictEqual(totalPages(16, 15), 2)
    deepStrictEqual(pageRows([1, 2, 3, 4, 5], 2, 2), [3, 4])
  })
  it('shows every page when there are seven or fewer', () => {
    deepStrictEqual(
      pageWindow(7, 4).map((i) => (i.kind === 'page' ? i.page : '…')),
      [1, 2, 3, 4, 5, 6, 7],
    )
  })
  it('collapses distant pages into gaps beyond seven', () => {
    const show = (pages: number, cur: number) => pageWindow(pages, cur).map((i) => (i.kind === 'page' ? i.page : '…'))
    deepStrictEqual(show(10, 1), [1, 2, '…', 10])
    deepStrictEqual(show(10, 5), [1, '…', 4, 5, 6, '…', 10])
    deepStrictEqual(show(10, 10), [1, '…', 9, 10])
  })
  it('reports the visible range', () => {
    deepStrictEqual(pagerRange(0, 1, 15), { start: 0, end: 0 })
    deepStrictEqual(pagerRange(40, 3, 15), { start: 31, end: 40 })
    deepStrictEqual(pagerRange(40, 1, 15), { start: 1, end: 15 })
  })
})

describe('labels', () => {
  it('pluralises the result count', () => {
    strictEqual(resultCountLabel(1), '1 deal ID')
    strictEqual(resultCountLabel(0), '0 deal IDs')
    strictEqual(resultCountLabel(7), '7 deal IDs')
  })
  it('builds the Key Date note', () => {
    strictEqual(keyDateNote('', ''), null)
    strictEqual(keyDateNote('01.03.2026', ''), '01.03.2026')
    strictEqual(keyDateNote('', '31.03.2026'), '… - 31.03.2026')
    strictEqual(keyDateNote('01.03.2026', '31.03.2026'), '01.03.2026 - 31.03.2026')
  })
})

describe('calendar', () => {
  it('wraps months across year ends', () => {
    deepStrictEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 })
    deepStrictEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 })
    deepStrictEqual(shiftMonth(2026, 5, 1), { year: 2026, month: 6 })
  })
  it('knows month length and the first weekday', () => {
    strictEqual(daysInMonth(2026, 1), 28)
    strictEqual(daysInMonth(2028, 1), 29)
    strictEqual(leadingBlanks(2026, 1), 0) // 1 Feb 2026 is a Sunday
    strictEqual(leadingBlanks(2026, 2), 0) // 1 Mar 2026 is a Sunday
    strictEqual(leadingBlanks(2026, 0), 4) // 1 Jan 2026 is a Thursday
  })
})

describe('invoice legs (fixture only: the legacy page invented them)', () => {
  it('invoices the first leg at the utilised amount with no markup', () => {
    const d = deal('TSF-9081')
    const mc = mcs.find((m) => m.mcRef === d.mcRef)
    if (!mc) throw new Error('no mc')
    const legs = invoiceLegs(d, mc)
    strictEqual(legs.length, 2)
    deepStrictEqual(
      legs.map((l) => [l.leg, l.seller, l.buyer, l.curr]),
      [
        ['T1', 'OGA', 'DMCC', 'USD'],
        ['T2 (final)', 'DMCC', 'OSIPL', 'INR'],
      ],
    )
    strictEqual(legs[0]?.amt, 5000000)
    strictEqual(legs[0]?.markup, null)
  })
  it('adds an increasing markup on each onward leg', () => {
    const d = deal('TSF-9081')
    const mc = mcs[0]
    if (!mc) throw new Error('no mc')
    const legs = invoiceLegs(d, mc)
    const markup = 5000000 * 0.0022
    strictEqual(Math.round((legs[1]?.markup ?? 0) * 100), Math.round(markup * 100))
    strictEqual(Math.round((legs[1]?.amt ?? 0) * 100), Math.round((5000000 + markup) * 100))
  })
})

describe('runtime data', () => {
  it('has no worklist and says why', () => {
    const list = loadSettlementList()
    strictEqual(list.state, 'waiting')
    strictEqual(list.deals.length, 0)
    strictEqual(list.masterContracts.length, 0)
    strictEqual(list.reason, LIST_WAITING)
    strictEqual(LIST_WAITING.startsWith('WAITING FOR API — ABAP source for ZSGTSFR106 not exported'), true)
    strictEqual(INVOICES_WAITING.includes('ZSGTSF_RDEAL_TRD_INV'), true)
    strictEqual(computeKpis(list.deals).total, 0)
  })
  it('shows region codes as they are', () => {
    strictEqual(regionName('R01'), 'R01')
  })
})
