import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OPTION_VIEW_WAITING,
  VIEW_REQUIRED_COLUMNS,
  alphaOut,
  companiesFromT001,
  companyFilter,
  dealFromView,
  distinctOptions,
  eligible,
  loadDeals,
  missingColumns,
  updateBlockedText,
} from './api.ts'

// A ZSGTSFV_FX row as the middleware served it on 2026-10-05 (BUKRS AE13, DELFZ 2026-10-05).
const VIEW_ROW = {
  MANDT: '100',
  BUKRS: 'AE13',
  RFHA: '0000005000000',
  REFNR: null,
  SAKTIV: '0',
  SGSART: '12B',
  BUTXT: 'AE13 - OlamInternaltional DMCC',
  SFHAART: '619',
  XTEXT: '619 - Forward - TSF',
  BP_NAME: '0400000002 - FMC Corporation',
  KONTRH: '0400000002',
  RBUSA: '',
  RPORTB: '',
  DBLFZ: '2026-10-01',
  DELFZ: '2026-10-05',
  RDEALER: '',
  NORDEXT: '',
  BS_1: 'Buy',
  BS_2: 'Sell',
  CURR1: 'USD',
  CURR2: 'AED',
  AMT1: '100000.00',
  AMT2: '-9511100.00',
  OSPOT: '95.111000000',
  OSWAP: '0.000000000',
  OTOT_RATE: '95.111000000',
}

describe('selection screen', () => {
  it('Company Code: T001 by code, leading zeros kept', () => {
    deepStrictEqual(
      companiesFromT001([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd ' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
        { CompanyCodeName: 'no code' },
      ]),
      [
        { code: '0001', name: 'SAP SE' },
        { code: 'SG03', name: 'OLAM GlobalAgri Pte. Ltd' },
      ],
    )
  })

  it('S_BUKRS: EQ for one code, BT for a range, reversed range swapped', () => {
    deepStrictEqual(companyFilter('AE13', ''), { BUKRS: 'AE13' })
    deepStrictEqual(companyFilter('AE13', 'AE13'), { BUKRS: 'AE13' })
    deepStrictEqual(companyFilter('AE13', 'IN11'), { 'BUKRS[gte]': 'AE13', 'BUKRS[lte]': 'IN11' })
    deepStrictEqual(companyFilter('IN11', 'AE13'), { 'BUKRS[gte]': 'AE13', 'BUKRS[lte]': 'IN11' })
  })
})

describe('GET_DATA (ZSGTSFV_FX)', () => {
  it('names the fields the middleware view does not serve (as registered on 2026-10-05)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, VIEW_REQUIRED_COLUMNS), [
      'CPAIR',
      'PRCTR',
      'TXN_STATUS',
      'MAT_UNMAT',
      'ZTSF_DEAL_ID',
      'ZMC_REF_NO',
      'ZOLAM_DEAL_NO',
    ])
    // Every column GET_DATA itself filters or sorts on is served.
    deepStrictEqual(missingColumns(served, ['BUKRS', 'DELFZ', 'SAKTIV', 'NORDEXT', 'RFHA']), [])
  })

  it('drops SAKTIV 3, keeps rows by External Reference Type, sorts by RFHA', () => {
    const rows = [
      { RFHA: '0000000000300', SAKTIV: '0', NORDEXT: 'HSBC123' },
      { RFHA: '0000000000100', SAKTIV: '0', NORDEXT: '' },
      { RFHA: '0000000000200', SAKTIV: '3', NORDEXT: 'X' },
      { RFHA: '0000000000050', SAKTIV: '1', NORDEXT: 'CITI9' },
      { RFHA: '0000000000400', SAKTIV: '3', NORDEXT: '' },
    ]
    deepStrictEqual(
      eligible(rows, true).map((r) => r['RFHA']),
      ['0000000000050', '0000000000300'],
    )
    deepStrictEqual(
      eligible(rows, false).map((r) => r['RFHA']),
      ['0000000000100'],
    )
  })

  it('maps a view row to a grid row (ALPHA output, DD-MM-YYYY, OSPOT/OSWAP/OTOT_RATE)', () => {
    const d = dealFromView(VIEW_ROW)
    strictEqual(d._id, 'AE13-0000005000000-')
    strictEqual(d.RFHA, '5000000')
    strictEqual(d.BUKRS, 'AE13')
    strictEqual(d.XTEXT, '619 - Forward - TSF')
    strictEqual(d.DBLFZ, '01-10-2026')
    strictEqual(d.DELFZ, '05-10-2026')
    strictEqual(d.AMT1, 100000)
    strictEqual(d.AMT2, -9511100)
    strictEqual(d.SPOT, 95.111)
    strictEqual(d.SWAP, 0)
    strictEqual(d.TOT_RATE, 95.111)
    strictEqual(d.NORDEXT, '')
    strictEqual(d._checked, false)
  })

  it('ALPHA output strips leading zeros of numeric keys only', () => {
    strictEqual(alphaOut('0000005000000'), '5000000')
    strictEqual(alphaOut('0000000000000'), '0')
    strictEqual(alphaOut('AB0012'), 'AB0012')
  })

  it('Option (ZSGTSFV_OP) has no middleware resource and waits without a request', async () => {
    deepStrictEqual(await loadDeals({ dealType: 'OP', coFrom: 'AE13', coTo: '', keyDateIso: '2026-10-05', withRef: true }), {
      state: 'waiting',
      reason: OPTION_VIEW_WAITING,
    })
  })
})

describe('grid', () => {
  it('column filters list the distinct values of the loaded rows', () => {
    const a = dealFromView(VIEW_ROW)
    const b = dealFromView({ ...VIEW_ROW, RFHA: '0000005000001', SFHAART: '601', XTEXT: '601 - Spot', RDEALER: 'C14' })
    const c = dealFromView({ ...VIEW_ROW, RFHA: '0000005000002' })
    deepStrictEqual(
      distinctOptions([a, b, c], (r) => r.SFHAART, (r) => r.XTEXT),
      [
        { value: '601', label: '601 - Spot' },
        { value: '619', label: '619 - Forward - TSF' },
      ],
    )
    deepStrictEqual(distinctOptions([a, b, c], (r) => r.RDEALER), [{ value: 'C14', label: 'C14' }])
  })
})

describe('UPD', () => {
  it('posts nothing: the BAPIs have no API', () => {
    const fx = updateBlockedText('FX')
    ok(fx.startsWith('WAITING FOR ACTION API'))
    ok(fx.includes('BAPI_FTR_FXT_CHANGE'))
    ok(fx.endsWith('Nothing was posted to SAP.'))
    ok(updateBlockedText('OP').includes('BAPI_FTR_CHANGE_FXOPTIONS'))
  })
})
