import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FX_REQUIRED_COLUMNS,
  amendDealWrites,
  amendedStatus,
  amendmentRecords,
  blFromRow,
  dealBls,
  dealListRow,
  fxWaitingReason,
  headerJoin,
  initialRecords,
  missingColumns,
  recalcWrites,
  toWire,
} from './api.ts'
import { SAMPLE_DEAL, fxRow, invRow } from './fixtures.ts'
import { emptyAdj } from './invoice.ts'

describe('FORM deal_detals source', () => {
  it('names the ZSGTSFCDS_FX fields the middleware view does not serve (as registered on 2026-10-05)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    const missing = missingColumns(served, FX_REQUIRED_COLUMNS)
    deepStrictEqual(missing, ['ZTSF_MC_REF_NO', 'TXN_STATUS', 'ZTSF_DEAL_TYPE', 'ZTSF_DEAL_ID'])
    ok(fxWaitingReason(missing).startsWith('WAITING FOR API — ZSGTSFCDS_FX (middleware "tsfvFx") does not serve ZTSF_MC_REF_NO'))
  })
})

describe('FORM screen_desc_fields', () => {
  const deal = { ZDEAL_ID: '7000000009', ZMC_REF: '2000000028', ZTRD_CODE: 'C' }
  const mcs = [{ ZMC_REF_NO: '2000000028', ZMOD_ID: 'M033' }]
  const rules = [{ ZMOD_ID: 'M033' }]
  const traders = [{ ZTCODE: 'C', ZTRADER: 'Nidhi S' }]

  it('needs every INNER JOIN partner: MC, its RULE_BT model and the trader', () => {
    ok(headerJoin(deal, mcs, rules, traders))
    strictEqual(headerJoin(deal, [], rules, traders), undefined)
    strictEqual(headerJoin(deal, mcs, [], traders), undefined)
    strictEqual(headerJoin({ ...deal, ZTRD_CODE: '' }, mcs, rules, traders), undefined)
  })

  it('lists a Deal ID with its MC model (currency-suffixed), entity string and DEAL_ST label', () => {
    const statuses = [{ ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' }]
    const row = dealListRow(
      { ZDEAL_ID: '7000000020', ZDEAL_REF: '', ZDEAL_STAT: '01', ZTSF_MODEL: 'M034', ZDEAL_CURR_ID: 'C001', ZMC_REF: '2000000005', ZTRD_CODE: '' },
      { ZMOD_ID: 'M034', ZENT_DESC: 'OGA-DMCC-OSIPL' },
      [...statuses, { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' }],
    )
    deepStrictEqual([row.modelId, row.entityString, row.statusLabel], ['M03401', 'OGA-DMCC-OSIPL', '01 - FO: Option Deals Created'])
  })
})

describe('screen 9001 BLs', () => {
  it('reads ZSGTSFTR_BL plus only unconfirmed ZSGTSFTR_BL_RUSE rows', () => {
    const rows = dealBls([{ ZBL_NO: 'A' }], [{ ZBL_NO: 'B', ZREUSE_CONF: '' }, { ZBL_NO: 'C', ZREUSE_CONF: 'X' }])
    deepStrictEqual(rows.map((r) => r.ZBL_NO), ['A', 'B'])
  })

  it('locks the Check box once the BL carries an invoice type (FORM enable_disable_bl)', () => {
    const bl = blFromRow({ ZTF_NO: '3000000022', ZTF_SPLIT: '01', ZBL_NO: '4000000008', ZBL_SPLIT: '01', ZBL_REUSE: '', ZBL_DATE: '2024-11-25', ZBL_STAT_ID: '05', ZBL_STAT: '', ZINV_TYPE: 'I01', ZQUANTITY: '25.000', ZCMMD: 'RICE' })
    deepStrictEqual([bl.blDate, bl.status, bl.locked, bl.qty, bl.commodity], ['25-11-2024', '05', true, 25, 'RICE'])
    strictEqual(blFromRow({ ZINV_TYPE: '' }).locked, false)
  })
})

describe('writes', () => {
  it('SAVE: unconfirmed rows only, with deal ID, USD price and the created stamp', () => {
    const rows = [invRow({ ttype: 'T1', invType: 'I01', usdPrice: 100, qty: 10, invDate: '02-10-2026', rec: { ...emptyAdj(), ZINV_REF: 'X-T1', ZINV_TYPE: 'I01' } }), invRow({ locked: true })]
    const recs = initialRecords(rows, '7000000009', { ZCREATED_BY: 'DEMO' })
    strictEqual(recs.length, 1)
    deepStrictEqual([recs[0]!['ZDEAL_ID'], recs[0]!['ZUSD_PRICE'], recs[0]!['ZINV_DATE'], recs[0]!['ZCREATED_BY']], ['7000000009', 100, '2026-10-02', 'DEMO'])
  })

  it('writes DECIMALs at the column scale and blank dates as null', () => {
    const w = toWire({ ZQTY: 1.23456, ZRATE: 83.75051234, ZAMT: 10, ZINV_DATE: '', ZCOUNT: 2, ZSELL: 'OGA' })
    deepStrictEqual(w, { ZQTY: '1.235', ZRATE: '83.7505123', ZAMT: '10.00', ZINV_DATE: null, ZCOUNT: 2, ZSELL: 'OGA' })
  })

  it('AMDC: keeps the saved ZINV_NO / ZPC / created stamp, flags ZAMDT_CHECK; a new row needs NUMBER_GET_NEXT', () => {
    const row = invRow({ invType: 'I01', rec: { ...emptyAdj(), ZINV_REF: 'D-T1', ZINV_TYPE: 'I01' } })
    const saved = [{ ZDEAL_ID: 'D', ZINV_REF: 'D-T1', ZINV_TYPE: 'I01', ZINV_NO: '6000000001', ZPC: 'C', ZCREATED_BY: 'U1', ZCREATED_DATE: '2026-10-01', ZCREATED_TIME: '10:00:00' }]
    const ok1 = amendmentRecords([row], 'D', saved, { ZCHANGED_BY: 'DEMO' })
    strictEqual(ok1.needsNumber, false)
    deepStrictEqual([ok1.recs[0]!['ZINV_NO'], ok1.recs[0]!['ZPC'], ok1.recs[0]!['ZCREATED_BY'], ok1.recs[0]!['ZCHANGED_BY'], ok1.recs[0]!['ZAMDT_CHECK']], ['6000000001', 'C', 'U1', 'DEMO', 'X'])
    strictEqual(amendmentRecords([row], 'D', [], {}).needsNumber, true)
  })

  it('C_UPD: rate / due date / planned rate from the linked FX deal; INV_REF amounts by currency side', () => {
    const deal = {
      ...SAMPLE_DEAL,
      dealId: 'D',
      fx: [fxRow({ dealType: 'D2', curr1: 'USD', amt1: -10000, curr2: 'INR', amt2: 840000, allIn: 84, end: '31-10-2026' })],
      inv: [invRow({ invType: 'I01', curr: 'INR', dealType: 'D2', rec: { ZINV_REF: 'D-T2' } })],
    }
    const ctx = {
      dealRows: [],
      rule: undefined,
      bilAdj: [{ ZDEAL_ID: 'D', ZINV_REF: 'D-T2', ZINV_TYPE: 'I01', ZPRE_T_REF: '' }],
      invRef: [{ ZDEAL_ID: 'D', ZINV_TRM_NO: 'D-T2', ZDTYPE: 'D2' }, { ZDEAL_ID: 'D', ZINV_TRM_NO: 'D-T2X', ZDTYPE: 'D2' }],
    }
    deepStrictEqual(recalcWrites(deal, ctx), [
      { table: 'billAdjustment', key: { ZDEAL_ID: 'D', ZINV_REF: 'D-T2', ZINV_TYPE: 'I01', ZPRE_T_REF: '' }, changes: { ZRATE: '84.0000000', ZDUE_DATE: '2026-10-31', ZPRATE: '84.0000000' } },
      { table: 'invRef', key: { ZDEAL_ID: 'D', ZINV_TRM_NO: 'D-T2' }, changes: { ZAMT: '10000.00', ZINV_AMT: '840000.00', ZEX_RATE: '84.0000000' } },
    ])
  })

  it('AMD_DEAL: 05 <-> 07 only; ZPC C / P and the fields the ABAP leaves initial', () => {
    deepStrictEqual([amendedStatus('05'), amendedStatus('07'), amendedStatus('04')], ['07', '05', null])
    const w = amendDealWrites('07', [
      { ZDEAL_ID: 'D', ZINV_REF: 'D-T1', ZINV_TYPE: 'I01', ZPRE_T_REF: '' },
      { ZDEAL_ID: 'D', ZINV_REF: 'D-T1', ZINV_TYPE: 'I01', ZPRE_T_REF: 'P1' },
    ])
    strictEqual(w.length, 1)
    deepStrictEqual([w[0]!.changes['ZPC'], w[0]!.changes['ZINV_DATE'], w[0]!.changes['ZCREATED_BY']], ['P', null, ''])
    strictEqual(amendDealWrites('05', [{ ZPRE_T_REF: '' }])[0]!.changes['ZPC'], 'C')
  })
})
