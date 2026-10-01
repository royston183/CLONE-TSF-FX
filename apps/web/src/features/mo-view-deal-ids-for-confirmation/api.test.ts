import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DealContext } from '../../shared/fx/deal-id.ts'
import { entityHelp, modelHelp, regionHelp, statusHelp, toDeal } from './api.ts'

// Rows as the SLC middleware served them on 2026-10-01.
const statuses = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '03', ZDEAL_SDESC: 'Deal ID marked for Invoicing' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '02', ZDEAL_SDESC: 'MO: FX Deals & MC Assignment Confirmed' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30', ZDEAL_SDESC: 'Deal ID Cancelled' },
]
const comp = [
  { ZCOM_ID: 'OSIPL', ZBUTXT: 'Olam Agri India', ZREG_ID: 'R02', ZWAERS: 'INR' },
  { ZCOM_ID: 'DMCC', ZBUTXT: 'Olam International DMCC', ZREG_ID: 'R01', ZWAERS: 'AED' },
  { ZCOM_ID: 'OSL', ZBUTXT: 'Olam Shanghai', ZREG_ID: '', ZWAERS: 'CNY' },
]

describe('value helps', () => {
  it("Status: ZSGTSFTR_DEAL_ST WHERE zsub_type = 'FX1' AND zdeal_stat <= '02' (FORM modify_drop_down)", () => {
    deepStrictEqual(statusHelp(statuses), [
      { code: '01', desc: 'FO: FX Deals Created' },
      { code: '02', desc: 'MO: FX Deals & MC Assignment Confirmed' },
    ])
  })

  it('Origin Entity from ZSGTSFTR_COMP; Region = the codes COMP carries, with no invented text', () => {
    deepStrictEqual(
      entityHelp(comp).map((e) => e.id),
      ['DMCC', 'OSIPL', 'OSL'],
    )
    deepStrictEqual(regionHelp(comp), [
      { id: 'R01', desc: '' },
      { id: 'R02', desc: '' },
    ])
  })

  it('FX Model from ZSGTSFTR_RULE_BT, typed by sub type', () => {
    deepStrictEqual(
      modelHelp([
        { ZMOD_ID: 'M042', ZMOD_DESC: 'INR Self-Settled Forward', ZSUB_TYPE: 'FX1' },
        { ZMOD_ID: 'M035', ZMOD_DESC: 'INR-INR-Put & Call Option', ZSUB_TYPE: 'FX2' },
      ]),
      [
        { id: 'M035', desc: 'INR-INR-Put & Call Option', type: 'OPTION' },
        { id: 'M042', desc: 'INR Self-Settled Forward', type: 'FORWARD' },
      ],
    )
  })
})

describe('toDeal (FORM sub_get_data join)', () => {
  const ctx: DealContext = {
    comp: new Map(comp.map((r) => [r.ZCOM_ID, r])),
    models: new Map(),
    statuses,
    mcs: new Map([['2000000005', { ZMC_REF_NO: '2000000005', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZORIGIN: 'OSIPL' }]]),
    source: 'mysql',
  }

  it("takes model and origin from the MC and the status text from DEAL_ST at sub type 'FX1'", () => {
    const d = toDeal(
      { ZDEAL_ID: '7000000006', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZMC_REF: '2000000005', ZTSF_MODEL: 'M099', ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30' },
      ctx,
    )
    strictEqual(d.zmod_id, 'M032') // b~zmod_id, not ZTSF_MODEL
    strictEqual(d.zorigin, 'OSIPL')
    strictEqual(d.zreg_id, 'R02')
    strictEqual(d.zdeal_sdesc, 'FO: FX Deals Created') // FX1's text even on an FX2 deal, as the join reads it
  })

  it('leaves MC fields blank when the MC is missing (LEFT OUTER JOIN)', () => {
    const d = toDeal({ ZDEAL_ID: '1', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '02', ZMC_REF: '999', ZTSF_MODEL: 'M032' }, ctx)
    strictEqual(d.zmod_id, '')
    strictEqual(d.zorigin, '')
    strictEqual(d.zreg_id, '')
  })
})
