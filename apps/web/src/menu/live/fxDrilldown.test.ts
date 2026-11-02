import { strictEqual, deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detailFor } from './fxDrilldown.ts'
import type { FxOverviewRaw } from './fxOverview.ts'
const today = new Date(2026, 9, 19)
const raw: FxOverviewRaw = {
  fxDeals: [
    { RFHA: '1', ZCOM_ID: 'SG03', SAKTIV: '0', SGSART: '12B', CURR1: 'USD', CURR2: 'INR', AMT1: '100', DCRDAT: '2026-10-18', DELFZ: '2026-10-22' },
    { RFHA: '2', ZCOM_ID: 'SG03', SAKTIV: '0', SGSART: '12A', CURR1: 'USD', CURR2: 'INR', AMT1: '200', DCRDAT: '2026-10-10', DELFZ: '2026-11-10' },
    { RFHA: '3', ZCOM_ID: 'AE13', SAKTIV: '0', SGSART: '12B', CURR1: 'USD', CURR2: 'EUR', AMT1: '300', DCRDAT: '2026-09-10', DELFZ: '2026-11-10' },
    { RFHA: '4', ZCOM_ID: 'SG03', SAKTIV: '3', SGSART: '12B', AMT1: '999' },
  ],
  mcs: [{ ZMC_REF_NO: '1', ZMC_STAT: '04', ZCURR: 'USD', ZMOD_DESC: 'Forward' }, { ZMC_REF_NO: '2', ZMC_STAT: '03', ZCURR: 'EUR' }],
  dealIds: [{ ZDEAL_ID: '1', ZDEAL_STAT: '21' }, { ZDEAL_ID: '2', ZDEAL_STAT: '30' }],
  bls: [], invoices: [], spots: [], dealStatuses: [], mcStatuses: [{ ZMC_ID: '04', ZMC_STAT: 'In Use' }], blStatuses: [], models: [], problems: [], loadedAt: today,
}
const ids = (title: string, mark = '') => detailFor(raw, 'SG03', today, title, mark).rows.map(r => r.RFHA)
describe('dashboard contributing records', () => {
  it('retains company filter and excludes reversals from KPI records', () => { deepStrictEqual(ids('FX Deals'), ['1', '2']) })
  it('selects product, exposure and maturity marks', () => {
    deepStrictEqual(ids('Deals by product', 'Forward'), ['1'])
    deepStrictEqual(ids('Exposure by company and pair (USD)', 'SG03|USD/INR'), ['1', '2'])
    deepStrictEqual(ids('Maturity ladder by product (USD)', 'Within 7 days|Forward'), ['1'])
    deepStrictEqual(ids('Maturity ladder by product (USD)', '8 – 30 days|Spot'), ['2'])
  })
  it('matches KPI USD contract inclusion and status labels', () => {
    strictEqual(detailFor(raw, 'All', today, 'Master Contract Value').rows.length, 1)
    strictEqual(detailFor(raw, 'All', today, 'Contracts by status', 'In Use').rows[0]?.ZMC_REF_NO, '1')
  })
  it('retains activity date range and selects one day', () => {
    const d = detailFor(raw, 'SG03', today, 'FX deals created per day, last 14 days', '18/10', 'deals', 14)
    deepStrictEqual(d.rows.map(r => r.RFHA), ['1'])
  })
  it('includes prior transactions in cumulative point details', () => { deepStrictEqual(ids('Cumulative FX notional booked (USD), last 60 days', '10/10'), ['2']) })
  it('distinguishes unavailable source from empty records', () => {
    strictEqual(detailFor({ ...raw, mcs: null }, 'All', today, 'Master Contract Value').unavailable, true)
    strictEqual(detailFor(raw, 'All', today, 'Trade Flow Value').unavailable, false)
  })
})
