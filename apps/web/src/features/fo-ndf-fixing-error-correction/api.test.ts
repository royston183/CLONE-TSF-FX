import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { VIEW_REQUIRED_COLUMNS, eligible, missingColumns, rowFromView } from './api.ts'
import { calcSettlement, filterRows } from './logic.ts'

const near = (a: number | null, b: number) => ok(a !== null && Math.abs(a - b) < 1e-6, `${a} != ${b}`)

describe('GET_DATA (ZSGTSF_RFX_NDF_FIX_FO)', () => {
  it('keeps TXN_STATUS 11 on the NDF date with an NDF product type — not 07, not V_DATE', () => {
    const rows = [
      { RFHA: '1', TXN_STATUS: '11', NDF_DATE: '2026-10-12', V_DATE: '2026-10-14', SGSART: '12D', SAKTIV: '3' }, // no SAKTIV rule here
      { RFHA: '2', TXN_STATUS: '07', NDF_DATE: '2026-10-12', SGSART: '12D' }, // normal fixing queue
      { RFHA: '3', TXN_STATUS: '12', NDF_DATE: '2026-10-12', SGSART: '12D' }, // already corrected
      { RFHA: '4', TXN_STATUS: '11', NDF_DATE: '2026-10-14', SGSART: '12D' }, // other NDF date
      { RFHA: '5', TXN_STATUS: '11', NDF_DATE: '2026-10-12', SGSART: '12B' }, // forward, not NDF
    ]
    deepStrictEqual(eligible(rows, '2026-10-12').map((r) => r.RFHA), ['1'])
  })

  it('names the ZSGTSFV_FX fields the middleware view does not serve (as registered on 2026-10-01)', () => {
    // prettier-ignore
    const served = ['BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','KONTRH','NDF_DATE','NDF_REF','BS','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','OSPOT','OSWAP','OTOT_RATE']
    deepStrictEqual(missingColumns(served, VIEW_REQUIRED_COLUMNS), ['TXN_STATUS', 'NDF_RATE', 'TRD_NAME', 'EXT_STAT_DESC'])
  })
})

describe('row mapping and screen 9001', () => {
  const row = rowFromView(
    {
      BUKRS: 'IN11', RFHA: '0000005100844', BUTXT: 'Olam Agri India', SGSART: '12D', BS_1: 'Sell', CURR1: 'USD', CURR2: 'INR',
      AMT1: '-1200000.00', AMT2: '100200000.00', NDF_DATE: '2026-10-12', NDF_REF: 'RBI', NDF_RATE: '83.5000', TRD_NAME: 'Ashon V',
      BP_NAME: 'DBS BANK INDIA', TXN_STATUS: '11', EXT_STAT_DESC: 'FO Correction Required',
    },
    { RBI: 'RBI USD/INR Reference Rate' },
  )

  it('Old Fixing Rate is the row NDF_RATE; reference text from FTRT_FIX_DEF_T; RFHA zeros kept', () => {
    deepStrictEqual([row.rfha, row.fixDate, row.fixRef, row.fixRefName, row.oldRate, row.status], ['0000005100844', '12-10-2026', 'RBI', 'RBI USD/INR Reference Rate', 83.5, '11'])
  })

  it('settles in the following currency, the ABAP formula with the rate unscaled (no TCURF here)', () => {
    deepStrictEqual([row.settleCurr, row.foreignFirst], ['INR', false])
    // curr1 (USD) is not the follow -> amt1 + amt2 / rate
    near(calcSettlement(row, 84.25), -1_200_000 + 100_200_000 / 84.25)
    const vnd = rowFromView({ CURR1: 'VND', CURR2: 'USD', AMT1: '2500000000', AMT2: '-100000', TXN_STATUS: '11' }, {})
    deepStrictEqual([vnd.settleCurr, vnd.foreignFirst], ['VND', true])
    near(calcSettlement(vnd, 25000), -100_000 + (2_500_000_000 * 100) / 25000) // VND quoted per 100
  })

  it('the queue only ever shows status 11 rows for the chosen NDF date', () => {
    deepStrictEqual(filterRows([row, { ...row, rfha: 'x', status: '12' }], '', '', '12-10-2026').map((r) => r.rfha), ['0000005100844'])
    strictEqual(filterRows([row], '', '', '13-10-2026').length, 0)
  })
})
