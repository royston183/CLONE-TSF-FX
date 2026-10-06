import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACTION_WAITING,
  INVOICE_WAITING,
  LEG_VIEW_COLUMNS,
  legsWaitingReason,
  missingColumns,
  statusList,
  toDeal,
  toPick,
} from './api.ts'

// ZSGTSFTR_DEAL_ST as served on 2026-10-05 (a subset).
const STATUSES = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '20', ZDEAL_SDESC: 'Settlement Initiated' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'duplicate' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '14', ZDEAL_SDESC: 'Options Exercised / Expired' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '', ZDEAL_SDESC: 'blank' },
]

// Deal 7000000006, its MC 2000000005, model M032 and trader C, as served on 2026-10-05.
const DEAL = {
  ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL',
  ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZREV_DEDATE: null, ZMC_REF: '2000000005', ZTRD_CODE: 'C',
  ZFX_INV_MODEL: '', ZTSF_MODEL: 'M032', ZDEAL_STAT: '01', ZDEAL_CURR_DESC: 'USD-USD-INR',
}
const MC = {
  ZMC_REF_NO: '2000000005', ZMC_DESC: 'DUMMY CORN M032', ZMC_DATE: '2026-08-22', ZSHIP_END: '2026-10-15',
  ZENT_DESC: 'OGA-DMCC-OSIPL', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward',
}
const M032 = { ZMOD_ID: 'M032', ZNO_INV: '' }
const TRADER = { ZTCODE: 'C', ZNAME: 'Nidhi Singh', ZTRADER: 'Nidhi S' }

describe('header by key', () => {
  it('maps ZSGTSFTR_DEALID + MAS_CON + RULE_BT + trader to the header', () => {
    deepStrictEqual(toDeal({ deal: DEAL, mc: MC, model: M032, trader: TRADER }), {
      dealId: '7000000006',
      dealStartDate: '30-09-2026',
      dealEndDate: '30-10-2026',
      revisedEndDate: '',
      mcRefNo: '2000000005',
      mcDesc: 'DUMMY CORN M032',
      mcDate: '22-08-2026',
      shipEndDate: '15-10-2026',
      fxModelId: 'M032',
      fxModelDesc: 'INR Long Forward',
      entityString: 'OGA-DMCC-OSIPL',
      fxInvModel: '',
      trader: 'C',
      traderDesc: 'Nidhi S',
      currencyString: 'USD-USD-INR',
      dealStatus: '01',
      noInvoiceFlag: false,
    })
  })

  it('takes the no-invoice flag from the model and leaves MC fields blank without an MC', () => {
    const d = toDeal({ deal: DEAL, mc: undefined, model: { ZMOD_ID: 'M099', ZNO_INV: 'X' }, trader: undefined })
    strictEqual(d.noInvoiceFlag, true)
    strictEqual(d.mcDesc, '')
    strictEqual(d.fxModelId, '')
    strictEqual(d.traderDesc, '')
    strictEqual(d.mcRefNo, '2000000005')
  })
})

describe('status list box', () => {
  it("keeps the deal's type + sub type, drops blanks, sorts and dedupes", () => {
    deepStrictEqual(statusList(STATUSES, 'FX', 'FX1'), [
      { code: '01', text: 'FO: FX Deals Created', cls: 'pill-early' },
      { code: '20', text: 'Settlement Initiated', cls: 'pill-init' },
    ])
    deepStrictEqual(statusList(STATUSES, 'FX', 'FX2').map((s) => s.code), ['01', '14'])
  })

  it('labels a Deal ID pick with its sub type status text', () => {
    deepStrictEqual(toPick(DEAL, STATUSES), { dealId: '7000000006', statusText: 'FO: FX Deals Created' })
  })
})

describe('gates', () => {
  it('names the ZSGTSFCDS_FX columns tsfvFx lacks, and always the missing option view', () => {
    // tsfvFx's columns as served on 2026-10-05 (the ones the note names).
    const served = ['BUKRS', 'RFHA', 'RFHAZUL', 'DBLFZ', 'DELFZ', 'XTEXT', 'SGSART', 'SFHAART', 'RBUSA', 'KONTRH', 'BP_NAME', 'ZCOM_ID', 'BS_1', 'BS_2', 'CURR1', 'CURR2', 'AMT1', 'AMT2', 'OSPOT', 'OSWAP', 'OTOT_RATE', 'SAKTIV']
    deepStrictEqual(missingColumns(served, LEG_VIEW_COLUMNS), [
      'PRCTR', 'ZTSF_EXE_CO', 'ZTSF_MC_REF_NO', 'ZTSF_DEAL_TYPE', 'TXN_STATUS', 'ZTSF_DEAL_SQ', 'EXT_STAT_DESC', 'ZTSF_DEAL_ID',
    ])
    const reason = legsWaitingReason(served)
    ok(reason.startsWith('WAITING FOR API — ZSGTSFCDS_FX (middleware "tsfvFx") does not serve PRCTR'))
    ok(reason.endsWith('ZSGTSFCDS_OPTION (option legs) has no middleware resource.'))
    ok(legsWaitingReason(null).includes('could not be read'))
    strictEqual(legsWaitingReason([...LEG_VIEW_COLUMNS]), 'WAITING FOR API — ZSGTSFCDS_OPTION (option legs) has no middleware resource.')
  })

  it('says why the trade invoice legs wait, and that no action posts', () => {
    ok(INVOICE_WAITING.includes('ZSGTSFTR_TRD_POS has no middleware resource'))
    for (const text of Object.values(ACTION_WAITING)) {
      ok(text.startsWith('WAITING FOR ACTION API — '))
      ok(text.endsWith('Nothing was posted to SAP.'))
    }
    ok(ACTION_WAITING.fxUpdate.includes('BAPI_FTR_FXT_CHANGE'))
  })
})
