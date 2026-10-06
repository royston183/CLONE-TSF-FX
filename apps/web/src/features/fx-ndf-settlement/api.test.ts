import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { VIEW_REQUIRED_COLUMNS, companyOptions, dealFromView, letterFormName, missingColumns, viewFilter } from './api.ts'

describe('S_BUKRS value help', () => {
  it('T001 keys as SAP holds them (leading zeros), by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE ' },
        { CompanyCodeName: 'no key' },
      ]),
      [
        { code: '0001', name: 'SAP SE' },
        { code: 'SG03', name: 'OLAM GlobalAgri Pte. Ltd' },
      ],
    )
  })
})

describe('GET_DATA on ZSGTSFV_FX', () => {
  it('names the fields the middleware view does not serve (as registered on 2026-10-05)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, VIEW_REQUIRED_COLUMNS), [
      'BLOTTER_DATE', 'PRCTR', 'PC_NAME', 'TXN_STATUS', 'FO_REMARK', 'MO_REMARK', 'ZTSF_DEAL_ID', 'ZTSF_MC_REF_NO',
      'NDF_FO_REM', 'NDF_MO_REM', 'SPOT', 'SWAP', 'TOT_RATE', 'NDF_RATE', 'CPAIR', 'CASH_CURR', 'ZCASH_AMT',
    ])
  })

  it('pushes the WHERE clause the middleware can apply', () => {
    deepStrictEqual(viewFilter({ bukrs: ['IN11', 'SG03'], dateFrom: '2026-10-01', dateTo: '2026-10-31' }), {
      'BUKRS[in]': 'IN11,SG03',
      SGSART: '12D',
      'SAKTIV[ne]': '3',
      'DELFZ[gte]': '2026-10-01',
      'DELFZ[lte]': '2026-10-31',
    })
    deepStrictEqual(viewFilter({ bukrs: ['IN11'], dateFrom: '2026-10-01', dateTo: '' })['DELFZ'], '2026-10-01')
  })

  it('maps a view row (as served live), keeping RFHA and KONTRH leading zeros', () => {
    const d = dealFromView({
      BUKRS: 'IN11', RFHA: '2000000000000', REFNR: null, SAKTIV: '0', SGSART: '12D', BUTXT: 'IN11 - OLAM Agri Inida Pvt Ltd',
      KONTRH: '0400000002', BP_NAME: '0400000002 - FMC Corporation', DELFZ: '2026-11-03', NDF_DATE: null, BS_1: 'Buy',
      AMT1: '1000.00', AMT2: '-83000.00', OTOT_RATE: '83.000000000', TXN_STATUS: '13', ZCASH_AMT: '12.50', NDF_RATE: '84.1',
    })
    deepStrictEqual(
      [d.rfha, d.refnr, d.kontrh, d.delfz, d.ndf_date, d.amt2, d.otot_rate, d.zcash_amt, d.ndf_rate, d.fi_doc],
      ['2000000000000', '', '0400000002', '2026-11-03', '', -83000, 83, 12.5, 84.1, ''],
    )
  })
})

describe('FORM pdf form name', () => {
  it("SELECT SINGLE zform_name WHERE zlet_code = 'L003'", () => {
    strictEqual(letterFormName([{ ZLET_CODE: 'L001', ZFORM_NAME: 'X' }, { ZLET_CODE: 'L003', ZFORM_NAME: 'ZSGTSFAF_NDF_BANK' }]), 'ZSGTSFAF_NDF_BANK')
    strictEqual(letterFormName([]), '')
  })
})
