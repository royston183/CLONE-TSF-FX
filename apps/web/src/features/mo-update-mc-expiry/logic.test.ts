import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedContracts } from './data.ts'
import { parseDMY } from './format.ts'
import {
  KEY_DATE_INVALID,
  KEY_DATE_REQUIRED,
  batchConfirm,
  dragLabel,
  eligibilityLabel,
  eligibleIds,
  expireContracts,
  expiredToast,
  filterSortRows,
  isEligibleForExpiry,
  loadScreen,
  manualConfirm,
  maskKeyDate,
  pageWindow,
  postingBannerText,
  setPageSelection,
  statusClass,
  toggleSelection,
  validateKeyDate,
} from './logic.ts'
import type { MasterContract } from './types.ts'

const date = (dmy: string) => {
  const d = parseDMY(dmy)
  if (!d) throw new Error(`bad test date ${dmy}`)
  return d
}
const contract = (mcNumber: string) => {
  const c = seedContracts().find((x) => x.mcNumber === mcNumber)
  if (!c) throw new Error(`no seed contract ${mcNumber}`)
  return c
}

describe('key date', () => {
  it('masks typing into DD-MM-YYYY', () => {
    strictEqual(maskKeyDate('2'), '2')
    strictEqual(maskKeyDate('251'), '25-1')
    strictEqual(maskKeyDate('25a09x2026'), '25-09-2026')
    strictEqual(maskKeyDate('250920261234'), '25-09-2026')
  })

  it('requires a date and rejects impossible ones', () => {
    deepStrictEqual(validateKeyDate('   '), { ok: false, error: KEY_DATE_REQUIRED })
    deepStrictEqual(validateKeyDate('31-02-2026'), { ok: false, error: KEY_DATE_INVALID })
    const ok = validateKeyDate(' 25-09-2026 ')
    strictEqual(ok.ok && ok.date.getTime(), new Date(2026, 8, 25).getTime())
  })
})

describe('eligibility', () => {
  it('needs In Use and a shipment end on or before the Key Date', () => {
    const c = contract('2000001235') // In Use, shipment end 01-01-2026
    strictEqual(isEligibleForExpiry(c, date('01-01-2026')), true)
    strictEqual(isEligibleForExpiry(c, date('31-12-2025')), false)
    strictEqual(isEligibleForExpiry({ ...c, status: 'Confirmed' }, date('01-01-2026')), false)
    strictEqual(isEligibleForExpiry({ ...c, shipmentEnd: '' }, date('01-01-2026')), false)
  })

  it('finds only In Use contracts among the seed rows', () => {
    const all = seedContracts()
    const ids = eligibleIds(all, date('31-12-2030'))
    strictEqual(ids.length, all.filter((c) => c.status === 'In Use').length)
  })

  it('reports eligibility in the details popup', () => {
    const c = contract('2000001235')
    strictEqual(eligibilityLabel(c, null), '—')
    strictEqual(eligibilityLabel(c, date('31-12-2025')), 'No')
    strictEqual(eligibilityLabel(c, date('01-01-2026')), 'Yes')
    strictEqual(eligibilityLabel({ ...c, status: 'Expired' }, date('31-12-2025')), 'Yes')
  })
})

describe('loadScreen', () => {
  const keyDate = date('01-01-2026')

  it('MC View Only lists the eligible contracts without changing them', () => {
    const all = seedContracts()
    const { contracts, rowIds, posted } = loadScreen(all, keyDate, 'view')
    strictEqual(posted, 0)
    strictEqual(rowIds.length > 0, true)
    deepStrictEqual(contracts, all)
  })

  it('MC View with Expiry Posting expires every eligible contract and lists them', () => {
    const all = seedContracts()
    const { contracts, rowIds, posted } = loadScreen(all, keyDate, 'post')
    strictEqual(posted, rowIds.length)
    for (const id of rowIds) strictEqual(contracts.find((c) => c.mcNumber === id)?.status, 'Expired')
    // Nothing is left to post a second time.
    deepStrictEqual(loadScreen(contracts, keyDate, 'post').rowIds, [])
  })

  it('never mutates the contracts it is given', () => {
    const all = seedContracts()
    loadScreen(all, keyDate, 'post')
    strictEqual(all.some((c) => c.status === 'Expired'), false)
  })

  it('words the posting banner', () => {
    strictEqual(postingBannerText(keyDate, 1), 'for Key Date 01-01-2026. 1 Master Contract expired successfully.')
    strictEqual(postingBannerText(keyDate, 3), 'for Key Date 01-01-2026. 3 Master Contracts expired successfully.')
  })
})

describe('expiry', () => {
  it('expires only the listed contracts', () => {
    const all = seedContracts()
    const next = expireContracts(all, ['2000001235'])
    strictEqual(next.find((c) => c.mcNumber === '2000001235')?.status, 'Expired')
    strictEqual(next.filter((c) => c.status === 'Expired').length, 1)
  })

  it('words the confirm popup and toast for one or several contracts', () => {
    strictEqual(manualConfirm(['2000001235']).subtext, 'Master Contract 2000001235 will be updated from In Use to Expired.')
    strictEqual(manualConfirm(['1', '2']).subtext, '2 selected Master Contracts will be updated from In Use to Expired.')
    strictEqual(batchConfirm(['1']).heading, 'Expire eligible Master Contract?')
    strictEqual(batchConfirm(['1', '2']).heading, 'Expire all eligible Master Contracts?')
    strictEqual(batchConfirm(['1', '2']).mode, 'batch')
    strictEqual(expiredToast(['2000001235']), 'Master Contract 2000001235 expired successfully.')
    strictEqual(expiredToast(['1', '2']), '2 Master Contracts expired successfully.')
  })
})

describe('selection', () => {
  it('toggles only In Use rows', () => {
    const c = contract('2000001235')
    const on = toggleSelection(new Set(), c)
    deepStrictEqual([...on], ['2000001235'])
    deepStrictEqual([...toggleSelection(on, c)], [])
    const expired: MasterContract = { ...c, status: 'Expired' }
    const none = new Set<string>()
    strictEqual(toggleSelection(none, expired), none)
    strictEqual(toggleSelection(none, undefined), none)
  })

  it('selects or clears a whole page from the header checkbox', () => {
    const page = seedContracts().slice(0, 3)
    const all = setPageSelection(new Set(['x']), page, true)
    strictEqual(all.size, 4)
    deepStrictEqual([...setPageSelection(all, page, false)], ['x'])
  })

  it('labels the drag ghost', () => {
    strictEqual(dragLabel(1, '2000001235'), 'MC 2000001235')
    strictEqual(dragLabel(3, '2000001235'), '3 Master Contracts selected')
  })
})

describe('filterSortRows', () => {
  const rows = seedContracts()

  it('sorts by MC number ascending by default', () => {
    const list = filterSortRows(rows, '', { field: 'mcNumber', dir: 'asc' })
    strictEqual(list[0]?.mcNumber, '2000001235')
  })

  it('sorts DD-MM-YYYY dates chronologically, not as text', () => {
    const list = filterSortRows(rows, '', { field: 'shipmentEnd', dir: 'asc' })
    strictEqual(list[0]?.shipmentEnd, '25-11-2025')
    strictEqual(list.at(-1)?.shipmentEnd, '27-12-2026')
  })

  it('sorts amounts numerically', () => {
    const list = filterSortRows(rows, '', { field: 'mcAmount', dir: 'desc' })
    strictEqual(list.every((r, i) => i === 0 || (list[i - 1]?.mcAmount ?? 0) >= r.mcAmount), true)
  })

  it('searches number, reference, entity, commodity, description and status', () => {
    strictEqual(filterSortRows(rows, '2000001235', { field: 'mcNumber', dir: 'asc' }).length, 1)
    const settled = filterSortRows(rows, 'settled', { field: 'mcNumber', dir: 'asc' })
    strictEqual(settled.length, 2)
    strictEqual(filterSortRows(rows, 'WHEAT', { field: 'mcNumber', dir: 'asc' }).length > 0, true)
  })
})

describe('table helpers', () => {
  it('keeps up to six page buttons around the current page', () => {
    deepStrictEqual(pageWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pageWindow(1, 10), [1, 2, 3, 4, 5, 6])
    deepStrictEqual(pageWindow(6, 10), [4, 5, 6, 7, 8, 9])
    deepStrictEqual(pageWindow(10, 10), [5, 6, 7, 8, 9, 10])
  })

  it('maps statuses to their colour class', () => {
    strictEqual(statusClass('In Use'), 'status-inuse')
    strictEqual(statusClass('Expired'), 'status-expired')
    strictEqual(statusClass('Unknown'), '')
  })
})
