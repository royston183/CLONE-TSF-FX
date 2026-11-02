import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { actionEntryReason, actionItemEntry, blockedWriteReason, computeKpis, defaultPrefs, kpiPresentation, parsePrefs, readState, txnTypeDescription, validatePrefs } from './logic.ts'
import { setLookups } from './data.ts'
import { fixtureData, FIXTURE_LOOKUPS } from './fixtures.ts'
import { buildNdfSpot, calcNdfSettlement, fixingBookingSummary, recalcSpotAmounts, settlementBookingSummary, spotBookingSummary } from './logic.ts'
import { formatAmount, formatDMY, moveCalendarDate, optionIndex } from './format.ts'

describe('transaction type descriptions', () => {
  it('preserves master descriptions before using known FX labels', () => {
    setLookups({ ...FIXTURE_LOOKUPS, txnTypes: { '605': 'Spot - TSF' } })
    strictEqual(txnTypeDescription('605'), 'Spot - TSF')
    setLookups({ ...FIXTURE_LOOKUPS, txnTypes: {} })
    for (const [sfhaart, text] of Object.entries({ '604': 'FX Spot', '605': 'FX Spot', '609': 'FX Spot', '619': 'FX Forward', '631': 'NDF', '632': 'DNDF', '999': '' })) {
      strictEqual(txnTypeDescription(sfhaart), text)
    }
    setLookups(FIXTURE_LOOKUPS)
  })
})

describe('action availability', () => {
  const txn = { sgsart: '12B', etag: 'W/"1"', rfha: '123' }
  it('keeps live settlement paths available and explains selection and product prerequisites', () => {
    strictEqual(actionEntryReason('settlementSpot', txn, null, 'Missing'), '')
    strictEqual(actionEntryReason('ndf', undefined, true, 'Missing'), 'Select a transaction first.')
    strictEqual(actionEntryReason('ndf', { ...txn, sgsart: '14A' }, true, 'Missing'), 'Please select the NDF/DNDF deal')
  })
  it('distinguishes checking, unavailable and missing TSF records for fixing', () => {
    match(actionEntryReason('ndf', txn, null, 'Missing'), /Checking/)
    strictEqual(actionEntryReason('ndf', txn, false, 'Missing'), 'Missing')
    match(actionEntryReason('ndf', { ...txn, etag: '' }, true, 'Missing'), /reload the workbench/)
    strictEqual(actionEntryReason('ndf', txn, true, 'Missing'), '')
  })
  it('uses the posting guard reason for blocked option and opposite-spot entry', () => {
    strictEqual(actionEntryReason('rate', { ...txn, sgsart: '14A' }, true, ''), blockedWriteReason('exercise'))
    strictEqual(actionEntryReason('spotOrder', txn, true, ''), blockedWriteReason('spotOrder'))
  })
  it('routes action items through the same entry determination as their handlers', () => {
    const item = { sfhaart: '619', status: '05' }
    deepStrictEqual([
      actionItemEntry(item, { ss: '' }, { dealType: 'D1' }),
      actionItemEntry(item, { ss: 'X' }, { dealType: '00' }),
      actionItemEntry({ ...item, sfhaart: '631' }, { ss: '' }, { dealType: 'D1' }),
      actionItemEntry({ sfhaart: '645', status: '24' }, { ss: '' }, { dealType: 'D1' }),
      actionItemEntry({ sfhaart: '645', status: '05' }, { ss: '' }, { dealType: 'D1' }),
    ], ['settlementSpot', 'spotOrder', 'ndf', 'settlementSpot', 'rate'])
  })
})

describe('workbench data coverage', () => {
  it('distinguishes loading, failure, empty and ready, even when a previous count remains', () => {
    deepStrictEqual([readState(true, '', 4), readState(false, 'Failed', 4), readState(false, '', 0), readState(false, '', 4)], ['loading', 'failed', 'empty', 'ready'])
  })
  it('never shows a workload zero while transactions failed or are loading', () => {
    setLookups(FIXTURE_LOOKUPS)
    const data = fixtureData(), k = computeKpis(data, data.deals, '2026-10-21')
    for (const id of ['pending', 'progress'] as const) {
      const failed = kpiPresentation(id, k, false, '', 'Failed')
      strictEqual(failed.value, 'Unavailable')
      strictEqual(failed.retry, true)
      strictEqual(failed.blocked, true)
      strictEqual(kpiPresentation(id, k, true, '', '').value, 'Loading…')
    }
    strictEqual(kpiPresentation('due', k, false, 'Failed', '').value, 'Unavailable')
  })
  it('shows the computed FX workload and enables breakdowns while options are deferred', () => {
    setLookups(FIXTURE_LOOKUPS)
    const data = fixtureData()
    data.txns = data.txns.filter((t) => t.sgsart.startsWith('12'))
    const k = computeKpis(data, data.deals, '2026-10-21')
    const before = structuredClone(k)
    const pending = kpiPresentation('pending', k, false, '', '')
    const progress = kpiPresentation('progress', k, false, '', '')
    strictEqual(pending.value, String(k.pendingItems.length))
    strictEqual(progress.value, `${k.progressPct}%`)
    for (const view of [pending, progress]) {
      match(view.description, /^FX only · /)
      strictEqual(view.blocked, false)
      strictEqual(view.retry, false)
    }
    deepStrictEqual(k, before)
  })
  it('labels missing USD conversions without changing the computed numbers', () => {
    setLookups({ ...FIXTURE_LOOKUPS, marketRates: {} })
    const data = fixtureData()
    const deals = [{ ...data.deals[0]!, plCurr: 'INR' }]
    const k = computeKpis(data, deals, '2026-10-21')
    const before = structuredClone(k)
    match(kpiPresentation('deals', k, false, '', '').description, /Incomplete USD notional.*INR/)
    strictEqual(kpiPresentation('pl', k, false, '', '').value, 'Incomplete')
    deepStrictEqual(k, before)
    setLookups(FIXTURE_LOOKUPS)
  })
  it('allows genuine empty and fully covered results', () => {
    setLookups(FIXTURE_LOOKUPS)
    const data = fixtureData(), k = computeKpis(data, [], '2026-10-21')
    strictEqual(kpiPresentation('pending', k, false, '', '').value, '0')
    strictEqual(kpiPresentation('pl', k, false, '', '').blocked, false)
  })
})

describe('saved workbench preferences', () => {
  const options = { models: ['M032'], statuses: ['20'], deals: ['D1'] }
  it('restores valid preferences against current options', () => {
    const prefs = { filters: { from: '01-10-2026', to: '21-10-2026', model: 'M032', status: '20', deal: 'D1' }, search: 'rice', sort: { field: 'mcAmt', dir: 'desc' }, pageSize: 50 }
    deepStrictEqual(parsePrefs(JSON.stringify(prefs), options), prefs)
  })
  it('falls back safely for corrupt JSON, null, arrays and incorrectly typed values', () => {
    for (const text of ['{', 'null', '[]', '"bad"', '{"pageSize":"50","search":3,"sort":{"field":"id","dir":"wrong"}}']) deepStrictEqual(parsePrefs(text, options), defaultPrefs())
  })
  it('rejects removed filters, unsupported columns and page sizes', () => {
    deepStrictEqual(validatePrefs({ filters: { model: 'old', status: '30', deal: 'deleted' }, pageSize: 999, sort: { field: 'not-a-column', dir: 'asc' } }, options), defaultPrefs())
  })
  it('rejects impossible and reversed date ranges without losing valid independent preferences', () => {
    for (const from of ['31-02-2026', '22-10-2026']) {
      const prefs = validatePrefs({ filters: { from, to: '21-10-2026', model: 'M032' }, pageSize: 8 }, options)
      deepStrictEqual(prefs.filters, { ...defaultPrefs().filters, model: 'M032' })
      strictEqual(prefs.pageSize, 8)
    }
  })
})

describe('inline booking summaries', () => {
  const fields = (summary: ReturnType<typeof fixingBookingSummary>) => Object.fromEntries(summary.map((f) => [f.label, f.value]))
  it('shows linked NDF hidden trade-date defaults and the source value date', () => {
    setLookups(FIXTURE_LOOKUPS)
    const data = fixtureData(), txn = data.txns.find((t) => t.sfhaart === '631')!
    const draft = recalcSpotAmounts({ ...buildNdfSpot(txn, data.inSpot.find((s) => s.dealId === txn.dealId)!), rate: 95.5 })
    const summary = fields(spotBookingSummary(txn, draft, 'IN11', txn.cpty, null, 'ndf'))
    strictEqual(summary['Trade Date'], '12-10-2026')
    strictEqual(summary['Value Date'], '14-10-2026')
    strictEqual(summary['Buy'], '985,000.00 USD')
    strictEqual(fields(spotBookingSummary({ ...txn, ndfDate: '' }, draft, 'IN11', txn.cpty, null, 'ndf'))['Trade Date'], '19-09-2026')
  })
  it('honours entered dates and highlights rate and dependent-amount changes', () => {
    const data = fixtureData(), txn = data.txns.find((t) => t.sfhaart === '631')!
    const draft = recalcSpotAmounts({ ...buildNdfSpot(txn, data.inSpot.find((s) => s.dealId === txn.dealId)!), rate: 95 })
    const baseline = spotBookingSummary(txn, draft, 'IN11', txn.cpty, '13-10-2026', 'ndf')
    const summary = spotBookingSummary(txn, recalcSpotAmounts({ ...draft, rate: 95.5 }), 'IN11', txn.cpty, '13-10-2026', 'ndf', baseline)
    strictEqual(fields(summary)['Trade Date'], '13-10-2026')
    deepStrictEqual(summary.filter((f) => f.changed).map((f) => f.label), ['Sell', 'Rate'])
  })
  it('uses existing NDF and DNDF settlement results without mutating source transactions', () => {
    for (const txn of fixtureData().txns.filter((t) => t.sfhaart === '631' || t.sfhaart === '632')) {
      const before = structuredClone(txn), out = calcNdfSettlement(txn, 95.5)
      const expected = txn.sfhaart === '632' ? `${formatAmount(out.dndf)} ${out.scurr2}` : `${formatAmount(out.ndf)} ${out.scurr}`
      strictEqual(fields(fixingBookingSummary(txn, 95.5))['Settlement'], expected)
      deepStrictEqual(txn, before)
    }
  })
  it('uses the settlement booking payload rounding and supplied effective dates', () => {
    const row = { currency: 'USD', diffAmt: 15000 } as Parameters<typeof settlementBookingSummary>[0]
    const ctx = { companyCode: 'IN11', txnType: '605', direction: 'Buy', otherCurrency: 'INR', valueDate: new Date(2026, 9, 14) } as Parameters<typeof settlementBookingSummary>[1]
    const summary = fields(settlementBookingSummary(row, ctx, '1000124', '12-10-2026', 95.5))
    strictEqual(summary.Buy, '15,000.00 USD')
    strictEqual(summary.Sell, '1,432,500.00 INR')
    strictEqual(summary['Trade Date'], '12-10-2026')
    strictEqual(summary['Value Date'], '14-10-2026')
  })
})

describe('keyboard navigation', () => {
  it('moves through options without choosing a different value or going out of bounds', () => {
    deepStrictEqual([optionIndex(-1, 'ArrowDown', 3), optionIndex(-1, 'ArrowUp', 3), optionIndex(2, 'ArrowDown', 3), optionIndex(0, 'ArrowUp', 3), optionIndex(1, 'Home', 3), optionIndex(0, 'End', 3), optionIndex(0, 'ArrowDown', 0)], [0, 2, 2, 0, 0, 2, -1])
  })
  it('moves calendar focus across weeks and year boundaries without mutating its date', () => {
    const date = new Date(2026, 11, 31)
    strictEqual(formatDMY(moveCalendarDate(date, 'ArrowRight')!), '01-01-2027')
    strictEqual(formatDMY(moveCalendarDate(date, 'ArrowUp')!), '24-12-2026')
    strictEqual(formatDMY(date), '31-12-2026')
    strictEqual(moveCalendarDate(date, 'Enter'), null)
  })
  it('clamps month and year navigation to valid dates, including leap years', () => {
    strictEqual(formatDMY(moveCalendarDate(new Date(2024, 0, 31), 'PageDown')!), '29-02-2024')
    strictEqual(formatDMY(moveCalendarDate(new Date(2024, 1, 29), 'PageDown', true)!), '28-02-2025')
    strictEqual(formatDMY(moveCalendarDate(new Date(2026, 0, 31), 'PageUp')!), '31-12-2025')
  })
  it('uses Home and End for the focused calendar week', () => {
    const date = new Date(2026, 9, 21)
    strictEqual(formatDMY(moveCalendarDate(date, 'Home')!), '18-10-2026')
    strictEqual(formatDMY(moveCalendarDate(date, 'End')!), '24-10-2026')
  })
})
