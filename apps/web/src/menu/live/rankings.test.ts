import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rankRecords, type RankingFilter } from './rankings.ts'
import type { FxOverviewRaw } from './fxOverview.ts'
const raw: FxOverviewRaw = { fxDeals: [], mcs: [], dealIds: [], bls: [], invoices: [], spots: [], dealStatuses: [], mcStatuses: [], blStatuses: [], models: [], problems: [], loadedAt: new Date() }
const filter: RankingFilter = { limit: 5, category: 'USD', openOnly: false, company: 'All' }
const today = new Date(2026, 9, 19)
describe('ranked dashboard charts', () => {
  it('ranks master contracts within one currency and applies top N and in-use filters', () => {
    const source = { ...raw, mcs: [{ ZMC_REF_NO: '1', ZCURR: 'USD', ZAMT: '100', ZMC_STAT: '04' }, { ZMC_REF_NO: '2', ZCURR: 'USD', ZAMT: '500', ZMC_STAT: '03' }, { ZMC_REF_NO: '3', ZCURR: 'INR', ZAMT: '99999', ZMC_STAT: '04' }] }
    deepStrictEqual(rankRecords(source, 'contracts', { ...filter, limit: 1 }, today).map(i => i.label), ['2'])
    deepStrictEqual(rankRecords(source, 'contracts', { ...filter, openOnly: true }, today).map(i => i.label), ['1'])
    strictEqual(rankRecords(source, 'contracts', { ...filter, category: 'INR' }, today)[0]?.value, 99999)
  })
  it('ranks FX by USD leg, respecting company, product, maturity and reversals', () => {
    const base = { BUKRS: 'SG03', RFHA: '1', ZCOM_ID: 'OGA', CURR1: 'USD', AMT1: '-100', SGSART: '12B', DELFZ: '2026-10-22' }
    const source = { ...raw, fxDeals: [base, { ...base, RFHA: '2', SAKTIV: '3' }, { ...base, RFHA: '3', CURR1: 'EUR', AMT1: '10000' }, { ...base, RFHA: '4', ZCOM_ID: 'OTHER' }, { ...base, RFHA: '5', DELFZ: '2026-10-01' }, { ...base, RFHA: '6', SGSART: '12A' }, { ...base, RFHA: '7', CURR1: 'EUR', USD_NOTIONAL: '200' }] }
    const ranked = rankRecords(source, 'fx', { ...filter, company: 'OGA', category: '12B', openOnly: true }, today)
    deepStrictEqual(ranked.map(i => i.label), ['SG03 / 7', 'SG03 / 1'])
    strictEqual(ranked[1]?.row.USD_NOTIONAL, '100')
  })
  it('filters trade flows by unit, preserves splits, excludes invalid amounts and ranks highest first', () => {
    const source = { ...raw, bls: [{ ZBL_NO: '1', ZBL_SPLIT: '01', ZTF_NO: '10', ZBU: 'COFFEE', ZTTV: '100' }, { ZBL_NO: '1', ZBL_SPLIT: '02', ZTF_NO: '10', ZBU: 'COFFEE', ZTTV: '200' }, { ZBL_NO: '2', ZBU: 'RICE', ZTTV: '500' }, { ZBL_NO: '3', ZBU: 'COFFEE', ZTTV: 'invalid' }] }
    deepStrictEqual(rankRecords(source, 'trade', { ...filter, category: 'COFFEE' }, today).map(i => i.value), [200, 100])
    strictEqual(new Set(rankRecords(source, 'trade', { ...filter, category: 'COFFEE' }, today).map(i => i.label)).size, 2)
  })
  it('handles missing sources and empty selections', () => { deepStrictEqual(rankRecords({ ...raw, mcs: null }, 'contracts', filter, today), []) })
})
