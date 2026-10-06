import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FX_LEG_COLUMNS,
  entityHelp,
  indicatorRows,
  isoDay,
  legsNotice,
  missingFxColumns,
  statusHelp,
  toDeal,
  toFxLeg,
  toMasterContract,
} from './api.ts'
import { COMP_ROWS, DEAL_ROWS, MC_ROWS, SET_TYP_ROWS, STATUS_ROWS } from './fixtures.ts'

// ZSGTSFV_FX columns as the middleware served them on 2026-10-06 (no TSF link columns).
const SERVED_FX = [
  'MANDT', 'BUKRS', 'RFHA', 'SAKTIV', 'SGSART', 'BUTXT', 'LTX', 'SFHAART', 'XTEXT', 'BP_NAME', 'NDF_DATE', 'NDF_REF',
  'CURR1', 'CURR2', 'AMT1', 'AMT2', 'ZCOM_ID',
]

describe('value helps', () => {
  it("Status: ZSGTSFTR_DEAL_ST WHERE zsub_type = 'FX1' (the <= '02' limit is commented out)", () => {
    deepStrictEqual(statusHelp(STATUS_ROWS), [
      { code: '01', sdesc: 'FO: FX Deals Created' },
      { code: '05', sdesc: 'Invoice Created in TRM' },
      { code: '07', sdesc: 'Partial Invoice Created iin TRM' },
      { code: '30', sdesc: 'Deal ID Cancelled' },
    ])
  })

  it('Origin Entity: ZSGTSFTR_COMP by code, with its region', () => {
    deepStrictEqual(entityHelp(COMP_ROWS).map((e) => `${e.code}/${e.regionId}`), ['DMCC/R01', 'OSIPL/R02', 'OSL/', 'OTL/R01'])
  })

  it('heads-up indicators: SET_TYP WHERE zhead_fx <> space OR zhead_opt <> space', () => {
    deepStrictEqual(indicatorRows(SET_TYP_ROWS), [
      { modelId: 'M033', headFx: 'X', headOpt: '' },
      { modelId: 'M03402', headFx: '', headOpt: 'X' },
    ])
  })
})

describe('row mappings', () => {
  it('maps a ZSGTSFTR_DEALID row; initial dates become blank', () => {
    const d = toDeal(DEAL_ROWS[1] ?? {})
    strictEqual(d.dealId, '7000000007')
    strictEqual(d.maturityDate, '2026-10-05')
    strictEqual(d.confirmed, true)
    strictEqual(d.plRate, 90.4)
    strictEqual(d.changedDate, '')
    strictEqual(isoDay('0000-00-00'), '')
    strictEqual(isoDay(null), '')
  })

  it('maps a ZSGTSFTR_MAS_CON row', () => {
    const mc = toMasterContract(MC_ROWS[0] ?? {})
    deepStrictEqual([mc.ref, mc.origin, mc.modelId, mc.amt], ['2000000005', 'OSIPL', 'M032', 100000])
  })

  it('maps a ZSGTSFCDS_FX row', () => {
    const l = toFxLeg({ ZTSF_DEAL_ID: '7', ZTSF_DEAL_TYPE: 'D1', ZTSF_MC_REF_NO: '2', CURR1: 'USD', CURR2: 'INR', AMT1: '-5.00', AMT2: '9', SGSART: '12D', BP_NAME: 'HSBC', NDF_DATE: '2026-10-03' })
    deepStrictEqual(l, { dealId: '7', type: 'D1', mcRef: '2', curr1: 'USD', curr2: 'INR', amt1: -5, amt2: 9, sgsart: '12D', bp: 'HSBC', ndfDate: '2026-10-03' })
  })
})

describe('FX / option leg gate', () => {
  it('names the ZSGTSFCDS_FX columns the served view lacks', () => {
    deepStrictEqual(missingFxColumns(SERVED_FX), ['ZTSF_DEAL_ID', 'ZTSF_DEAL_TYPE', 'ZTSF_MC_REF_NO'])
    deepStrictEqual(missingFxColumns([...FX_LEG_COLUMNS]), [])
  })

  it('says WAITING FOR API while either view is missing', () => {
    strictEqual(
      legsNotice(['ZTSF_DEAL_ID'], false),
      'WAITING FOR API — ZSGTSFCDS_FX (middleware "tsfvFx") does not serve ZTSF_DEAL_ID; ZSGTSFCDS_OPTION is not served by the middleware. FX Utilisation Amount, Fixing Day and Bank name stay blank.',
    )
    strictEqual(legsNotice([], false), 'WAITING FOR API — ZSGTSFCDS_OPTION is not served by the middleware. FX Utilisation Amount stays blank.')
    strictEqual(legsNotice([], true), null)
  })
})
