import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACTION_WAITING, VIEW_REQUIRED_COLUMNS, companyOptions, missingColumns, unservedColumns, worklistWaitingReason } from './api.ts'
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO, NAMES as RUNTIME_NAMES } from './data.ts'
import { NAMES, seedDeals } from './fixtures.ts'
import { fmtAmt, fmtDMY, fmtRate, parseDMY } from './format.ts'
import {
  DEFAULT_SORT,
  actionState,
  allPageSelected,
  clampPage,
  computeKpis,
  dealCountLabel,
  dealDetailCells,
  defaultFilters,
  effectiveStatus,
  fiDocCells,
  filterDeals,
  monthGrid,
  navMonth,
  nextSort,
  pageRange,
  pageSlice,
  pageWindow,
  selectedDeals,
  setPageSelected,
  sortArrow,
  sortDeals,
  toggleKpi,
  toggleSelected,
  totalPages,
  viewOf,
} from './logic.ts'

const deals = seedDeals()
const base = defaultFilters(DEFAULT_DATE_FROM, DEFAULT_DATE_TO)
const ids = (rows: { rfha: string }[]) => rows.map((d) => d.rfha)

describe('format', () => {
  it('round-trips DD-MM-YYYY', () => {
    strictEqual(fmtDMY(parseDMY('05-10-2026')), '05-10-2026')
    strictEqual(parseDMY('31-12-2026').getMonth(), 11)
  })
  it('formats amounts and rates', () => {
    strictEqual(fmtAmt(5000000), '5,000,000.00')
    strictEqual(fmtRate(83.1), '83.1000')
  })
})

describe('filtering', () => {
  it('the default Value Date range drops deals outside it', () => {
    const rows = filterDeals(deals, base, null, NAMES)
    strictEqual(rows.length, deals.length - 3) // 05-11-2026, 20-12-2026 and 02-01-2027 are out
    strictEqual(rows.some((d) => d.dealId === 'TSF-7702'), false)
  })
  it('an open-ended range keeps everything', () => {
    strictEqual(filterDeals(deals, { ...base, dateFrom: '', dateTo: '' }, null, NAMES).length, deals.length)
  })
  it('date bounds are inclusive', () => {
    const rows = filterDeals(deals, { ...base, dateFrom: '05-10-2026', dateTo: '05-10-2026' }, null, NAMES)
    deepStrictEqual(ids(rows), ['0001345321', '0001345322'])
  })
  it('filters by company, product and status', () => {
    const open = { ...base, dateFrom: '', dateTo: '' }
    strictEqual(filterDeals(deals, { ...open, bukrs: 'DM01' }, null, NAMES).length, 2)
    strictEqual(filterDeals(deals, { ...open, product: 'Spot' }, null, NAMES).every((d) => d.product === 'Spot'), true)
    strictEqual(filterDeals(deals, { ...open, status: 'OVERDUE' }, null, NAMES).length, 3)
  })
  it('searches ids, partner name, trader and currency pair, ignoring case and padding', () => {
    const open = { ...base, dateFrom: '', dateTo: '' }
    const hit = (q: string) => ids(filterDeals(deals, { ...open, search: q }, null, NAMES))
    deepStrictEqual(hit('  tsf-9081 '), ['0001345671'])
    strictEqual(hit('emirates').length, 2)
    strictEqual(hit('priya').length, 2)
    strictEqual(hit('usd/sgd').length, 1)
    strictEqual(hit('nothing-matches').length, 0)
  })
  it('a KPI card filter overrides the Status dropdown', () => {
    strictEqual(effectiveStatus('SETTLED', 'OVERDUE'), 'SETTLED')
    strictEqual(effectiveStatus(null, 'OVERDUE'), 'OVERDUE')
    const open = { ...base, dateFrom: '', dateTo: '', status: 'OVERDUE' as const }
    strictEqual(filterDeals(deals, open, 'SETTLED', NAMES).every((d) => d.status === 'SETTLED'), true)
  })

})

describe('sorting', () => {
  it('opens on Value Date descending', () => {
    deepStrictEqual(DEFAULT_SORT, { key: 'valueDateSort', dir: -1 })
    const rows = sortDeals(deals, DEFAULT_SORT)
    strictEqual(rows[0]?.valueDate, '02-01-2027')
    strictEqual(rows.at(-1)?.valueDate, '30-09-2026')
  })
  it('sorts dates by time, not text', () => {
    const asc = sortDeals(deals, { key: 'valueDateSort', dir: 1 })
    strictEqual(asc[0]?.valueDate, '30-09-2026')
    strictEqual(asc.at(-1)?.valueDate, '02-01-2027')
  })
  it('sorts text keys and does not mutate its input', () => {
    const before = ids(deals)
    const asc = sortDeals(deals, { key: 'dealId', dir: 1 })
    strictEqual(asc[0]?.dealId, 'TSF-7500')
    deepStrictEqual(ids(deals), before)
  })
  it('is stable for equal keys', () => {
    const rows = sortDeals(deals, { key: 'valueDateSort', dir: 1 }).filter((d) => d.valueDate === '15-10-2026')
    deepStrictEqual(ids(rows), ['0001345890', '0001345891'])
  })
  it('same column flips direction, a new column starts ascending', () => {
    deepStrictEqual(nextSort({ key: 'rfha', dir: 1 }, 'rfha'), { key: 'rfha', dir: -1 })
    deepStrictEqual(nextSort({ key: 'rfha', dir: -1 }, 'rfha'), { key: 'rfha', dir: 1 })
    deepStrictEqual(nextSort({ key: 'rfha', dir: -1 }, 'dealId'), { key: 'dealId', dir: 1 })
  })
  it('shows the arrow only on the active column', () => {
    strictEqual(sortArrow({ key: 'rfha', dir: 1 }, 'rfha'), '▲')
    strictEqual(sortArrow({ key: 'rfha', dir: -1 }, 'rfha'), '▼')
    strictEqual(sortArrow({ key: 'rfha', dir: 1 }, 'dealId'), '')
  })
})

describe('KPIs', () => {
  it('counts every deal by status', () => {
    const k = computeKpis(deals)
    deepStrictEqual(k, { total: 14, PENDING: 8, OVERDUE: 3, SETTLED: 2, ERRCORR: 1 })
  })
  it('toggling a card sets, then clears, the filter and syncs the dropdown', () => {
    deepStrictEqual(toggleKpi(null, 'OVERDUE'), { kpi: 'OVERDUE', select: 'OVERDUE' })
    deepStrictEqual(toggleKpi('OVERDUE', 'OVERDUE'), { kpi: null, select: 'ALL' })
    deepStrictEqual(toggleKpi('OVERDUE', 'SETTLED'), { kpi: 'SETTLED', select: 'SETTLED' })
    deepStrictEqual(toggleKpi('OVERDUE', null), { kpi: null, select: 'ALL' })
  })
})

describe('paging', () => {
  it('computes page counts, clamps and slices', () => {
    strictEqual(totalPages(0, 8), 1)
    strictEqual(totalPages(14, 8), 2)
    strictEqual(clampPage(9, 14, 8), 2)
    strictEqual(clampPage(0, 14, 8), 1)
    strictEqual(pageSlice(deals, 2, 8).length, 6)
  })
  it('windows at most five page buttons around the current page', () => {
    deepStrictEqual(pageWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pageWindow(1, 10), [1, 2, 3, 4, 5])
    deepStrictEqual(pageWindow(5, 10), [3, 4, 5, 6, 7])
    deepStrictEqual(pageWindow(10, 10), [6, 7, 8, 9, 10])
  })
  it('labels the shown range and the count', () => {
    deepStrictEqual(pageRange(2, 8, 14), { from: 9, to: 14 })
    deepStrictEqual(pageRange(1, 8, 0), { from: 0, to: 0 })
    strictEqual(dealCountLabel(1), '1 deal')
    strictEqual(dealCountLabel(0), '0 deals')
  })
})

describe('selection', () => {
  it('toggles one row without touching the input set', () => {
    const empty = new Set<string>()
    const one = toggleSelected(empty, 'a')
    strictEqual(one.has('a'), true)
    strictEqual(empty.size, 0)
    strictEqual(toggleSelected(one, 'a').size, 0)
  })
  it('select-all affects only the visible page and leaves other pages alone', () => {
    const page = deals.slice(0, 3)
    const start = new Set(['elsewhere'])
    const on = setPageSelected(start, page, true)
    strictEqual(on.size, 4)
    strictEqual(allPageSelected(on, page), true)
    const off = setPageSelected(on, page, false)
    deepStrictEqual([...off], ['elsewhere'])
    strictEqual(allPageSelected(off, page), false)
    strictEqual(allPageSelected(on, []), false)
  })
  it('returns selected deals in dataset order', () => {
    const picked = selectedDeals(deals, new Set(['0001345322', '0001345671']))
    deepStrictEqual(ids(picked), ['0001345671', '0001345322'])
  })
  it('enables buttons by selection size', () => {
    deepStrictEqual(actionState(0), { label: '0 selected', preview: false, isd: false, test: false, post: false })
    deepStrictEqual(actionState(1), { label: '1 selected', preview: true, isd: true, test: true, post: true })
    deepStrictEqual(actionState(3), { label: '3 selected', preview: false, isd: false, test: true, post: true })
  })
})

describe('modal content', () => {
  const d = deals[0]!
  it('builds the transaction display cells', () => {
    const cells = dealDetailCells(d, NAMES, 'Pending Settlement')
    strictEqual(cells.length, 24)
    strictEqual(cells.find((c) => c.label === 'Company Code')?.value, 'IN01 · Olam Agro India Pvt Ltd')
    strictEqual(cells.find((c) => c.label === 'FI Doc 1')?.value, '–')
    strictEqual(cells.find((c) => c.label === 'Deal ID')?.accent, true)
    strictEqual(cells.find((c) => c.label === 'Leg 1')?.value, 'SELL USD 5,000,000.00')
  })
  it('shows a dash for a zero swap rate', () => {
    const spot = deals.find((x) => x.swap === 0)!
    strictEqual(dealDetailCells(spot, NAMES, '').find((c) => c.label === 'Swap Rate')?.value, '–')
  })
  it('builds the FB03 cells only when the document exists', () => {
    strictEqual(fiDocCells(d, 'doc1'), null)
    const settled = deals.find((x) => x.doc1)!
    const cells = fiDocCells(settled, 'doc2')!
    strictEqual(cells.find((c) => c.label === 'Document No.')?.value, settled.doc2)
    strictEqual(cells.find((c) => c.label === 'Fiscal Year')?.value, String(parseDMY(settled.valueDate).getFullYear()))
    strictEqual(cells.find((c) => c.label === 'Currency')?.value, settled.curr2)
  })
})

describe('calendar', () => {
  it('lays out a month with Sunday-first blanks', () => {
    deepStrictEqual(monthGrid({ y: 2026, m: 9 }), { blanks: 4, days: 31 }) // 1 Oct 2026 is a Thursday
    strictEqual(monthGrid({ y: 2028, m: 1 }).days, 29)
  })
  it('navigates across year boundaries', () => {
    deepStrictEqual(navMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 })
    deepStrictEqual(navMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 })
    deepStrictEqual(navMonth({ y: 2026, m: 5 }, 1), { y: 2026, m: 6 })
  })
  it('centres on the value, or keeps the fallback', () => {
    deepStrictEqual(viewOf('15-03-2027', { y: 2026, m: 8 }), { y: 2027, m: 2 })
    deepStrictEqual(viewOf('', { y: 2026, m: 8 }), { y: 2026, m: 8 })
  })
})

describe('api', () => {
  it('runtime lookups start empty: no seeded companies, partners or transfer texts', () => {
    deepStrictEqual(RUNTIME_NAMES.partner, {})
    deepStrictEqual(RUNTIME_NAMES.transfer, {})
  })
  it('Company Code: T001 "<code> - <name>", leading zeros kept, one per code, sorted', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
        { CompanyCode: '0001', CompanyCodeName: 'dup' },
      ]).map((o) => o.label),
      ['0001 - SAP SE', 'SG03 - OLAM GlobalAgri Pte. Ltd'],
    )
  })
  it('the worklist always waits and names what tsfvFx lacks (as served 2026-10-06)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, VIEW_REQUIRED_COLUMNS).slice(0, 5), ['BLOTTER_DATE', 'PRCTR', 'PC_NAME', 'TXN_STATUS', 'ZTRCODE'])
    const reason = worklistWaitingReason(served)
    strictEqual(reason.startsWith('WAITING FOR API — ZSGTSF_RBANKSETTLE_FX source not exported (only dependency notes)'), true)
    // TrmFxApp serves the VTBFHA append columns, so only what no service has is named.
    strictEqual(reason.includes('ZTSF_DEAL_ID'), false)
    strictEqual(reason.includes('TXN_STATUS'), false)
    strictEqual(reason.includes('PRCTR'), true)
    deepStrictEqual(unservedColumns(served, VIEW_REQUIRED_COLUMNS).slice(0, 3), ['PRCTR', 'PC_NAME', 'TRD_NAME'])
    strictEqual(worklistWaitingReason(VIEW_REQUIRED_COLUMNS).includes('does not serve'), false)
  })
  it('Test Run / Post / forms wait for an action API and post nothing', () => {
    for (const m of Object.values(ACTION_WAITING)) strictEqual(m.endsWith('has no API yet. Nothing was posted to SAP.'), true)
    strictEqual(ACTION_WAITING.post.includes('RFTBBB00 / TBB1'), true)
    strictEqual(ACTION_WAITING.isdPdf.includes('FP_JOB_OPEN'), true)
  })
})
