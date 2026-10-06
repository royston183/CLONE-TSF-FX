import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACTION_WAITING,
  LEG_VIEW_COLUMNS,
  abapRound,
  applyProfitMargin,
  canUnwind,
  legsWaitingReason,
  mcHelp,
  missingColumns,
  modelOf,
  planInvoices,
  statusListBox,
  toDeal,
  toInvoice,
  toPick,
  type InvRow,
} from './api.ts'

// ZSGTSFTR_DEAL_ST as served on 2026-10-05 (a subset).
const STATUSES = [
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30', ZDEAL_SDESC: 'Deal ID Cancelled' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '14', ZDEAL_SDESC: 'Options Exercised / Expired' },
  { ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '', ZDEAL_SDESC: 'blank' },
]

// Deal 7000000006 and its MC 2000000005, as served on 2026-10-05.
const DEAL = {
  ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL',
  ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZMC_REF: '2000000005', ZTRD_CODE: 'C', ZTSF_MODEL: 'M032',
  ZDEAL_STAT: '01', ZDEAL_CURR_ID: 'C002', ZDEAL_CURR_DESC: 'USD-USD-INR',
}
const MC = {
  ZMC_REF_NO: '2000000005', ZMC_DESC: 'DUMMY CORN M032', ZMC_DATE: '2026-08-22', ZSHIP_START: '2026-08-22',
  ZSHIP_END: '2026-10-15', ZORIGIN: 'OSIPL', ZENT_ID: 'E015', ZENT_DESC: 'OGA-DMCC-OSIPL', ZMOD_ID: 'M032',
  ZMOD_DESC: 'INR Long Forward', ZMC_STAT: '04',
}
const M032 = { ZMOD_ID: 'M032', ZLINK_MODEL: '', ZSUB_TYPE: 'FX1', ZNO_INV: '', ZSS: '', ZD1_INV_LINK: '02', ZD1_INV_LINK2: '01', ZD2_INV_LINK: '03', ZD2_INV_LINK2: '', ZMOD_DESC: 'INR Long Forward' }
const M035 = [
  { ZMOD_ID: 'M035', ZLINK_MODEL: '01', ZSUB_TYPE: 'FX2', ZSS: 'X', ZNO_INV: '', ZD1_INV_LINK: '03', ZMOD_DESC: 'INR-INR-Put & Call Option' },
  { ZMOD_ID: 'M035', ZLINK_MODEL: '02', ZSUB_TYPE: 'FX2', ZSS: 'X', ZNO_INV: '', ZD1_INV_LINK: '03', ZMOD_DESC: 'INR-INR-Put & Call Option' },
]
const ENT = { ZENT_ID: 'E015', ZENT1: 'OGA', ZENT2: 'DMCC', ZENT3: 'OSIPL' }
const CUR = { ZCURR_ID: 'C002', ZCURR1: 'USD', ZCURR2: 'USD', ZCURR3: 'INR' }
const stored = (t: string, rate: string, amt: string, inv: string) => ({ ZDEAL_ID: '7000000006', ZTTYPE: t, ZEX_RATE: rate, ZAMT: amt, ZINV_AMT: inv })

describe('Deal ID list and header', () => {
  it('a quick pick carries the DEAL_ST text of its own sub type', () => {
    deepStrictEqual(toPick({ ZDEAL_ID: '7000000018', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '30' }, STATUSES), {
      dealId: '7000000018', status: '30', statusText: 'Deal ID Cancelled',
    })
  })

  it('FORM drop_down: M034/35/36 drop FX1, any other model drops FX2; blank keys out; one per key, sorted', () => {
    deepStrictEqual(statusListBox(STATUSES, 'M032'), [
      { key: '01', text: 'FO: FX Deals Created' },
      { key: '30', text: 'Deal ID Cancelled' },
    ])
    deepStrictEqual(statusListBox(STATUSES, 'M035'), [
      { key: '01', text: 'FO: Option Deals Created' },
      { key: '14', text: 'Options Exercised / Expired' },
    ])
  })

  it('screen_desc_fields: header from DEALID + MAS_CON + TRADER, model flags from RULE_BT', () => {
    const d = toDeal({ deal: DEAL, mc: MC, models: [M032], trader: { ZTCODE: 'C', ZTRADER: 'Nidhi S' }, statuses: STATUSES, unwind: false })
    deepStrictEqual(
      [d.dealId, d.trader, d.traderName, d.startDate, d.endDate, d.mcRef, d.mcDate, d.shipEnd, d.fxModel, d.modelDesc, d.entityString, d.currString],
      ['7000000006', 'C', 'Nidhi S', '30-09-2026', '30-10-2026', '2000000005', '22-08-2026', '15-10-2026', 'M032', 'INR Long Forward', 'OGA-DMCC-OSIPL', 'USD-USD-INR'],
    )
    strictEqual(d.statusText, 'FO: FX Deals Created')
    deepStrictEqual([d.noInv, d.ssDeal, d.legs.length, d.bukrs], [false, false, 0, ''])
  })

  it('status 30 or RULE_BT-ZNO_INV hide the invoice / P&L containers; ZSS marks a short straddle', () => {
    strictEqual(toDeal({ deal: { ...DEAL, ZDEAL_STAT: '30' }, mc: MC, models: [M032], trader: undefined, statuses: STATUSES, unwind: false }).noInv, true)
    strictEqual(toDeal({ deal: DEAL, mc: MC, models: [{ ...M032, ZNO_INV: 'X' }], trader: undefined, statuses: STATUSES, unwind: false }).noInv, true)
    const ss = toDeal({ deal: { ...DEAL, ZTSF_MODEL: 'M035' }, mc: { ...MC, ZMOD_ID: 'M035' }, models: M035, trader: undefined, statuses: STATUSES, unwind: false })
    strictEqual(ss.ssDeal, true)
  })

  it('gv_mod: the MC model; without one, ZTSF_MODEL only when RULE_BT has it — and then no ZNO_INV / ZSS flags', () => {
    deepStrictEqual(modelOf(DEAL, MC, [M032]), { id: 'M032', desc: 'INR Long Forward', flagModel: 'M032' })
    deepStrictEqual(modelOf(DEAL, undefined, [M032]), { id: 'M032', desc: 'INR Long Forward', flagModel: '' })
    deepStrictEqual(modelOf({ ...DEAL, ZTSF_MODEL: 'M999' }, undefined, [M032]), { id: '', desc: '', flagModel: '' })
  })

  it('REV needs the user in TVARVC ZSGTSF_UNWIND / I / EQ', () => {
    const rows = [{ NAME: 'ZSGTSF_UNWIND', SIGN: 'I', OPTI: 'EQ', LOW: 'ADRIEL' }]
    strictEqual(canUnwind(rows, 'ADRIEL'), true)
    strictEqual(canUnwind(rows, 'DEMO'), false)
    strictEqual(canUnwind([{ ...rows[0]!, SIGN: 'E' }], 'ADRIEL'), false)
    strictEqual(canUnwind(rows, ''), false)
  })

  it('MODULE f4_help: MCs of the model at 03 / 04 whose origin is in ZSGTSFTR_COMP, once each', () => {
    const comp = [{ ZCOM_ID: 'OSIPL' }, { ZCOM_ID: 'OSIPL' }]
    const mcs = [
      MC,
      { ...MC, ZMC_REF_NO: '2000000099', ZMC_STAT: '02' },
      { ...MC, ZMC_REF_NO: '2000000098', ZMOD_ID: 'M033' },
      { ...MC, ZMC_REF_NO: '2000000097', ZORIGIN: 'NOPE' },
      MC,
    ]
    deepStrictEqual(mcHelp(comp, mcs, 'M032'), [{ ref: '2000000005', desc: 'DUMMY CORN M032' }])
  })
})

describe('FX legs gate', () => {
  it('names the ZSGTSFCDS_FX columns "tsfvFx" does not serve (as registered on 2026-10-05) and the missing option view', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, LEG_VIEW_COLUMNS), ['F_CURR1', 'T_CURR1', 'ZTSF_MC_REF_NO', 'TXN_STATUS', 'ZCASH_AMT', 'ZTSF_DEAL_TYPE', 'ZTSF_DEAL_ID'])
    const reason = legsWaitingReason(served)
    ok(reason.startsWith('WAITING FOR API — ZSGTSFCDS_FX (middleware "tsfvFx") does not serve F_CURR1'))
    ok(reason.includes('ZSGTSFCDS_OPTION'))
    // Even a complete FX view leaves the option legs missing.
    ok(legsWaitingReason([...LEG_VIEW_COLUMNS]).includes('ZSGTSFCDS_OPTION'))
  })

  it('every BAPI / FM action says WAITING FOR ACTION API and that nothing was posted', () => {
    for (const msg of Object.values(ACTION_WAITING)) {
      ok(msg.startsWith('WAITING FOR ACTION API — '))
      ok(msg.endsWith('Nothing was posted to SAP.'))
    }
    ok(ACTION_WAITING.confirm.includes('BAPI_FTR_FXT_CHANGE'))
    ok(ACTION_WAITING.editPair.includes('BAPI_FTR_CHANGE_FXOPTIONS'))
  })
})

describe('FORM invoice_plan', () => {
  const base = { dealId: '7000000006', omc: '2000000005', rules: [M032], entStr: ENT, curStr: CUR, ss: false, legsReason: 'WAITING FOR API — legs.' }

  it('builds T1-T3 along the entity / currency strings, links them to D1 / D2 and takes the stored values', () => {
    const plan = planInvoices({
      ...base,
      stored: [stored('T1', '1.0000000', '1000.00', '1000.00'), stored('T2', '1.0000000', '1000.00', '1000.00'), stored('T3', '88.5000000', '1000.00', '88500.00')],
    })
    if (plan.state !== 'ok') throw new Error(plan.reason)
    deepStrictEqual(
      plan.rows.map((r) => [r.zinv_trm_no, r.zdtype, r.ztrd_sell, r.ztrd_buy, r.zmc_ref_p, r.zmc_ref_s, r.ztrd_curr, r.zex_rate, r.zinv_amt]),
      [
        ['7000000006-T1', 'D1', 'OGA', 'DMCC', 'DMCC-OGA-P', 'OGA-DMCC-S', 'USD', 1, 1000],
        ['7000000006-T2', 'D1', 'DMCC', 'OSIPL', 'OSIPL-DMCC-P', 'DMCC-OSIPL-S', 'USD', 1, 1000],
        ['7000000006-T3', 'D2', 'OSIPL', 'OGA', 'OGA-OSIPL-P', 'OSIPL-OGA-S', 'INR', 88.5, 88500],
      ],
    )
  })

  it('no MC gives no tickets', () => {
    deepStrictEqual(planInvoices({ ...base, omc: '', stored: [] }), { state: 'ok', rows: [] })
  })

  it('waits for the legs when a ticket is not stored, for a Short Straddle model, or for a two-link model', () => {
    const missing = planInvoices({ ...base, stored: [stored('T1', '1', '1', '1')] })
    strictEqual(missing.state, 'waiting')
    ok(missing.state === 'waiting' && missing.reason.includes('T2, T3'))
    strictEqual(planInvoices({ ...base, ss: true, stored: [] }).state, 'waiting')
    strictEqual(planInvoices({ ...base, rules: M035, stored: [] }).state, 'waiting')
  })
})

describe('FORM profit_margin_check', () => {
  const row = (t: string, d: string, rate: number, amt: number): InvRow => ({
    zinv_trm_no: `X-${t}`, zttype: t, zdtype: d, ztrd_sell: '', ztrd_buy: '', zmc_ref_p: '', zmc_ref_s: '',
    ztrd_curr: 'USD', zamt: amt, zinv_amt: amt * rate, zex_rate: rate,
  })
  const rows = [row('T1', 'D1', 88, 1000), row('T2', 'D2', 1, 500), row('T3', '', 1, 10)]

  it('M001 marks the D2 tickets up from the D1 rate; M002 marks T1 down; others untouched', () => {
    const m1 = applyProfitMargin(rows, 'M001', 0.3)
    deepStrictEqual([m1[1]!.zex_rate, m1[1]!.zinv_amt], [88.264, 44132])
    deepStrictEqual(m1[0], rows[0])
    const m2 = applyProfitMargin(rows, 'M002', 0.3)
    deepStrictEqual([m2[0]!.zex_rate, m2[0]!.zinv_amt], [87.736, 87736])
    deepStrictEqual(applyProfitMargin(rows, 'M032', 0.3), rows)
  })

  it('no margin maintained changes nothing', () => {
    deepStrictEqual(applyProfitMargin(rows, 'M001', 0), rows)
  })

  it('rounds like a packed assignment and maps to the table row', () => {
    strictEqual(abapRound(1.23456785, 7), 1.2345679)
    strictEqual(abapRound(-2.005, 2), -2.01)
    deepStrictEqual(toInvoice(rows[0]!), { tradeRef: 'X-T1', invType: 'T1 / D1', exRate: 88, amt: 1000, invAmt: 88000, curr: 'USD', due: '' })
    strictEqual(toInvoice(rows[2]!).invType, 'T3')
  })
})
