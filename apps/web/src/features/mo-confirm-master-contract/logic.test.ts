import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STATUS, seedContracts } from './data.ts'
import { fmtCompactUsd, fmtDate, fmtNum, parseAmountShorthand, safeParseDate } from './format.ts'
import {
  DEFAULT_FILTERS,
  actionToast,
  applyEdit,
  applyMcAction,
  buildChildLegs,
  candidateModelsForOrigin,
  checkedContracts,
  computeKpis,
  filterContracts,
  isActionValid,
  isActionable,
  nextSort,
  pageOf,
  pagerWindow,
  parseDragPayload,
  setPageChecked,
  toggleChecked,
} from './logic.ts'
import type { MasterContract, Sort } from './types.ts'

const DESC: Sort = { key: 'mcNumber', dir: -1 }
const find = (list: MasterContract[], n: number) => {
  const mc = list.find((c) => c.mcNumber === n)
  if (!mc) throw new Error(`no MC ${n}`)
  return mc
}
const numbers = (list: MasterContract[]) => list.map((c) => c.mcNumber)

describe('format', () => {
  it('formats amounts, dates and the compact KPI value like the page', () => {
    strictEqual(fmtNum(1234567.891), '1,234,567.89')
    strictEqual(fmtNum(-5), '-5.00')
    strictEqual(fmtDate(new Date(2026, 0, 5)), '05-01-2026')
    strictEqual(fmtCompactUsd(607_240_293), '$607.24M')
    strictEqual(fmtCompactUsd(12_500), '$12.5K')
  })

  it('rejects impossible picker dates', () => {
    strictEqual(safeParseDate('31-02-2026'), null)
    strictEqual(safeParseDate('2026-02-01'), null)
    strictEqual(safeParseDate('01-02-2026')?.getMonth(), 1)
  })

  it('reads the SAP M/T amount shorthand and zeroes anything unreadable', () => {
    strictEqual(parseAmountShorthand('5M'), 5_000_000)
    strictEqual(parseAmountShorthand('250t'), 250_000)
    strictEqual(parseAmountShorthand('1,250.50'), 1250.5)
    strictEqual(parseAmountShorthand('abc'), 0)
    strictEqual(parseAmountShorthand(''), 0)
  })
})

describe('seedContracts', () => {
  const list = seedContracts()

  it('derives the reference, origin and dates from the seed row', () => {
    const mc = find(list, 2000002729)
    strictEqual(mc.mcReference, 'MC/OSIPL/2026/729')
    strictEqual(mc.originEntity, 'OSIPL')
    strictEqual(mc.currOrigin, 'INR')
    strictEqual(mc.amtOrigin, 9_000_000_000)
    strictEqual(fmtDate(mc.shipStart), '15-09-2026')
    strictEqual(fmtDate(mc.paymentDate), '12-02-2027')
    strictEqual(mc.entryTime, '08:00:00')
  })

  it('back-fills who returned each Error Correction row', () => {
    const errCorr = list.filter((mc) => mc.status === STATUS.ERRCORR)
    deepStrictEqual(errCorr.map((mc) => mc.changedBy).slice(0, 3), ['TINAKSHAYM', 'AERAHULY', 'TINAKSHAYM'])
    strictEqual(fmtDate(find(list, 2000002729).changedOn ?? new Date(0)), '03-09-2026')
    strictEqual(find(list, 2000002715).changedOn, null)
  })
})

describe('filterContracts', () => {
  const list = seedContracts()

  it('shows the whole queue newest first by default', () => {
    const { rows } = filterContracts(list, DEFAULT_FILTERS, 'ALL', DESC)
    strictEqual(rows.length, 10)
    strictEqual(rows[0]?.mcNumber, 2000002729)
    strictEqual(rows[9]?.mcNumber, 2000002704)
  })

  it('keeps the KPI pool whole when the status filter narrows the table', () => {
    const { kpiScope, rows } = filterContracts(list, DEFAULT_FILTERS, 'RELEASE', DESC)
    strictEqual(rows.length, 4)
    deepStrictEqual(computeKpis(kpiScope).counts, { RELEASE: 4, ERRCORR: 6 })
  })

  it('never shows contracts that have left the queue', () => {
    const acted = applyMcAction(list, [2000002729], 'confirm', '', new Date())
    const { kpiScope } = filterContracts(acted, DEFAULT_FILTERS, 'ALL', DESC)
    strictEqual(kpiScope.some((mc) => mc.mcNumber === 2000002729), false)
    strictEqual(computeKpis(kpiScope).total, 9)
  })

  it('searches the rendered columns, trimmed and case-insensitive', () => {
    deepStrictEqual(numbers(filterContracts(list, { ...DEFAULT_FILTERS, q: '  SUGAR ' }, 'ALL', DESC).rows), [2000002704])
    // The formatted amount, as shown in the table.
    deepStrictEqual(numbers(filterContracts(list, { ...DEFAULT_FILTERS, q: '5,000,000.00' }, 'ALL', DESC).rows), [2000002706])
  })

  it('filters by entity, region, model and MC date range', () => {
    const f = DEFAULT_FILTERS
    deepStrictEqual(numbers(filterContracts(list, { ...f, entity: 'OTL' }, 'ALL', DESC).rows), [2000002706])
    strictEqual(filterContracts(list, { ...f, region: 'R04' }, 'ALL', DESC).rows.length, 0)
    strictEqual(filterContracts(list, { ...f, region: 'R01' }, 'ALL', DESC).rows.length, 10)
    deepStrictEqual(numbers(filterContracts(list, { ...f, model: 'M034' }, 'ALL', DESC).rows), [2000002725, 2000002724])
    deepStrictEqual(
      numbers(filterContracts(list, { ...f, dateFrom: '01-09-2026', dateTo: '05-09-2026' }, 'ALL', DESC).rows),
      [2000002729, 2000002706, 2000002704],
    )
  })

  it('sorts a new column ascending and flips the same column', () => {
    deepStrictEqual(nextSort(DESC, 'amtUSD'), { key: 'amtUSD', dir: 1 })
    deepStrictEqual(nextSort({ key: 'amtUSD', dir: 1 }, 'amtUSD'), { key: 'amtUSD', dir: -1 })
    const { rows } = filterContracts(list, DEFAULT_FILTERS, 'ALL', { key: 'mcDate', dir: 1 })
    strictEqual(rows[0]?.mcNumber, 2000002728)
  })

  it('keeps the previous order for ties after a header click, like the in-place sort', () => {
    const byModel: Sort = { key: 'fxModel', dir: 1 }
    const asc = numbers(filterContracts(list, DEFAULT_FILTERS, 'ALL', { key: 'mcNumber', dir: 1 }).rows)
    const { rows } = filterContracts(list, DEFAULT_FILTERS, 'ALL', byModel, asc)
    deepStrictEqual(numbers(rows.filter((mc) => mc.fxModel === 'M032')), [2000002727, 2000002728, 2000002729])
    const fresh = filterContracts(list, DEFAULT_FILTERS, 'ALL', byModel).rows
    deepStrictEqual(numbers(fresh.filter((mc) => mc.fxModel === 'M032')), [2000002729, 2000002728, 2000002727])
  })
})

describe('paging', () => {
  it('clamps the page and reports the rows shown', () => {
    const p = pageOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, 8)
    strictEqual(p.page, 2)
    strictEqual(p.totalPages, 2)
    deepStrictEqual([p.first, p.last], [9, 10])
    deepStrictEqual([pageOf([], 1, 15).first, pageOf([], 1, 15).last], [0, 0])
  })

  it('offers two page buttons either side', () => {
    deepStrictEqual(pagerWindow(1, 10), [1, 2, 3])
    deepStrictEqual(pagerWindow(5, 10), [3, 4, 5, 6, 7])
  })
})

describe('selection', () => {
  const list = seedContracts()

  it('lists the selection ascending and drops contracts that left the queue', () => {
    let checked = toggleChecked(new Set(), find(list, 2000002729), true)
    checked = toggleChecked(checked, find(list, 2000002704), true)
    deepStrictEqual(numbers(checkedContracts(list, checked)), [2000002704, 2000002729])
    const acted = applyMcAction(list, [2000002704], 'reject', 'x', new Date())
    deepStrictEqual(numbers(checkedContracts(acted, checked)), [2000002729])
  })

  it('never selects a contract outside MO review', () => {
    const confirmed = applyMcAction(list, [2000002715], 'confirm', '', new Date())
    const mc = find(confirmed, 2000002715)
    strictEqual(isActionable(mc), false)
    strictEqual(toggleChecked(new Set(), mc, true).size, 0)
  })

  it('selects and clears only the given page', () => {
    const page = list.slice(0, 3)
    const all = setPageChecked(new Set([2000002706]), page, true)
    strictEqual(all.size, 4)
    deepStrictEqual([...setPageChecked(all, page, false)], [2000002706])
  })

  it('reads the drag payload', () => {
    deepStrictEqual(parseDragPayload('2000002729,2000002704,x'), [2000002729, 2000002704])
    deepStrictEqual(parseDragPayload(''), [])
  })
})

describe('confirm / reject', () => {
  const list = seedContracts()
  const now = new Date(2026, 8, 25)

  it('requires a remark to reject but not to confirm', () => {
    strictEqual(isActionValid('reject', '   '), false)
    strictEqual(isActionValid('reject', 'Wrong port'), true)
    strictEqual(isActionValid('confirm', ''), true)
  })

  it('confirms and keeps the existing MO remark', () => {
    const mc = find(applyMcAction(list, [2000002729], 'confirm', 'ignored', now), 2000002729)
    strictEqual(mc.status, STATUS.CONFIRMED)
    strictEqual(mc.changedBy, 'MO_REVIEWER')
    strictEqual(mc.changedOn, now)
    strictEqual(mc.moRemarks, find(list, 2000002729).moRemarks)
  })

  it('rejects with the trimmed remark recorded as the MO remark', () => {
    const acted = applyMcAction(list, [2000002715, 2000002714], 'reject', '  Wrong port  ', now)
    strictEqual(find(acted, 2000002715).status, STATUS.REJECTED)
    strictEqual(find(acted, 2000002714).moRemarks, 'Wrong port')
    strictEqual(find(acted, 2000002713).status, STATUS.RELEASE)
  })

  it('words the toast for one or many contracts', () => {
    deepStrictEqual(actionToast('confirm', [find(list, 2000002729)]), {
      message: 'Master Contract 2000002729 confirmed successfully.',
      kind: 'success',
    })
    deepStrictEqual(actionToast('reject', list.slice(0, 3)), { message: '3 Master Contracts rejected successfully.', kind: 'error' })
  })
})

describe('edit', () => {
  const list = seedContracts()

  it('offers only FX models configured for the origin entity', () => {
    deepStrictEqual(
      candidateModelsForOrigin('OSIPL').map((m) => m.code),
      ['M021', 'M032', 'M034', 'M041'],
    )
    deepStrictEqual(
      candidateModelsForOrigin('OTL').map((m) => m.code),
      ['M017'],
    )
  })

  it('writes the amount and re-derives everything from the new model', () => {
    const mc = find(list, 2000002729)
    const now = new Date(2026, 8, 25)
    const edited = applyEdit(mc, { amount: '5M', paymentTerms: 'P07', fxModel: 'M041' }, now)
    strictEqual(edited.amtUSD, 5_000_000)
    strictEqual(edited.balUSD, 5_000_000)
    strictEqual(edited.amtOrigin, 450_000_000)
    strictEqual(edited.paymentTerms, 'P07')
    strictEqual(edited.entityId, 'E017')
    strictEqual(edited.entities.join('-'), 'OGAT-DMCC-OSIPL')
    strictEqual(edited.modelDesc, 'INR Short Forward')
    strictEqual(edited.changedBy, 'MO_REVIEWER')
    strictEqual(edited.changedOn, now)
  })

  it('keeps the current model when the picked one is unknown', () => {
    const mc = find(list, 2000002729)
    strictEqual(applyEdit(mc, { amount: '1', paymentTerms: 'P01', fxModel: 'NOPE' }, new Date()).fxModel, 'M032')
  })
})

describe('buildChildLegs', () => {
  it('gives each hop a Sale and a Purchase, the last leg in origin currency', () => {
    const mc = find(seedContracts(), 2000002729)
    const legs = buildChildLegs(mc)
    deepStrictEqual(
      legs.map((l) => [l.t, l.ps, l.desc, l.ref, l.curr]),
      [
        ['T1', 'Sale', 'OGA-DMCC-S', 3100202729, 'USD'],
        ['T1', 'Purchase', 'DMCC-OGA-P', 3100202729, 'USD'],
        ['T2', 'Sale', 'DMCC-OSIPL-S', 3100203729, 'INR'],
        ['T2', 'Purchase', 'OSIPL-DMCC-P', 3100203729, 'INR'],
      ],
    )
    strictEqual(legs.every((l) => l.planned === 0), true)
  })

  it('fills planned amounts once the MC is In Use', () => {
    const mc = { ...find(seedContracts(), 2000002729), status: STATUS.INUSE }
    deepStrictEqual(
      buildChildLegs(mc).map((l) => l.planned),
      [100_000_000, 100_000_000, 9_000_000_000, 9_000_000_000],
    )
  })
})
