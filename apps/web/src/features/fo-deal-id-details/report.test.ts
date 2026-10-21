import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinRows, type Sources } from './api.ts'
import { cellValue, daysToExpiry, filterRows, type Filters } from './logic.ts'
const sources: Sources = {
  deals: [{ ZDEAL_ID: '1', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZMC_REF: '10', ZDEAL_STAT: '01', ZTSF_MODEL: 'M1', ZE_DATE: '2026-11-01', ZBUKRS1: 'SG03', ZRFHA1: '000123', ZPL: '20' }],
  mcs: [{ ZMC_REF_NO: '10', ZORIGIN: 'OGA', ZAMT: '10000', ZCURR: 'USD' }],
  companies: [{ ZCOM_ID: 'OGA', ZREG_ID: 'R01' }],
  models: [{ ZMOD_ID: 'M1', ZSUB_TYPE: 'FX1', ZCO_AREA: 'OL10', ZMOD_DESC: 'Forward' }],
  statuses: [{ ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'Wrong' }, { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'Created' }],
  fx: [{ BUKRS: 'AE13', RFHA: '123', BP_NAME: 'Wrong company' }, { BUKRS: 'SG03', RFHA: '123', BP_NAME: 'Correct bank' }],
}
const filters: Filters = { search: '', keyDate: '2026-10-19', region: '', origin: '', model: '', status: '', co: '' }
describe('Deal ID report', () => {
  it('joins MC origin, model CO area and subtype-specific status; matches partners by company and transaction', () => {
    const row = joinRows(sources)[0]!
    strictEqual(row.statusDesc, 'Created'); strictEqual(row.co, 'OL10'); strictEqual(row.origin, 'OGA'); strictEqual(row.region, 'South-East Asia'); strictEqual(row.d1bp, 'Correct bank'); strictEqual(row.mcAmt, '10000'); strictEqual(row.util, null)
  })
  it('omits unmatched contracts and keeps composite Deal ID keys distinct', () => {
    const d = sources.deals[0]!
    const rows = joinRows({ ...sources, deals: [d, { ...d, ZSUB_TYPE: 'FX2' }, { ...d, ZMC_REF: 'missing' }] })
    deepStrictEqual(rows.map(r => r.id), ['1|FX|FX1', '1|FX|FX2'])
    strictEqual(rows[1]?.d1bp, '')
  })
  it('does not relabel a non-USD contract amount as USD', () => {
    strictEqual(joinRows({ ...sources, mcs: [{ ...sources.mcs[0], ZCURR: 'INR' }] })[0]?.mcAmt, null)
  })
  it('applies expiry and CO area filters with numeric sorting', () => {
    const row = joinRows(sources)[0]!
    const rows = [row, { ...row, id: '2', pl: '100' }, { ...row, id: '3', end: '2026-10-18' }]
    deepStrictEqual(filterRows(rows, { ...filters, co: 'OL10' }, 'pl', true).map(r => r.id), ['2', row.id])
    strictEqual(filterRows(rows, { ...filters, co: 'OTHER' }, 'pl', true).length, 0)
    strictEqual(daysToExpiry(row, '2026-10-19'), 13)
    strictEqual(filterRows(rows, { ...filters, search: '01-11-2026' }, 'pl', false).length, 2)
  })
  it('renders missing amounts as unavailable and formats rates separately', () => {
    const row = joinRows(sources)[0]!
    strictEqual(cellValue(row, 'util', filters.keyDate), '\u2014')
    strictEqual(cellValue({ ...row, plRate: '1.2' }, 'plRate', filters.keyDate), '1.2000')
  })
})
