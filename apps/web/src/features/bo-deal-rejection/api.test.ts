import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FX_SELECT_COLUMNS, companyOptions, dealFromRow, fxFilter, missingColumns, statusSelection } from './api.ts'
import { FX_FIELD_DEFS } from './data.ts'

describe('selection screen', () => {
  it('Company Code: T001 "<code> - <name>", leading zeros kept, by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
        { CompanyCode: '', CompanyCodeName: 'blank' },
      ]).map((o) => o.label),
      ['0001 - SAP SE', 'SG03 - OLAM GlobalAgri Pte. Ltd'],
    )
  })
})

describe('GET_DATA status selection (ZGTCATR_PARAM)', () => {
  // As served on 2026-10-05: ZSGTSF_RDEAL_TRD_INV / SG03 / MAPID A, PARAM1 'M040', PARAM3 '9918307'.
  const live = { PROGNAM: 'ZSGTSF_RDEAL_TRD_INV', BUKRS: 'SG03', WERKS: '', MAPID: 'A', SNO: '001', PARAM1: 'M040', PARAM3: '9918307' }

  it('derives status1 = 40+18+1, status2 = "07", status3 = 9+7-3, actvt = 1+1', () => {
    deepStrictEqual(statusSelection([live], ['SG03']), { fx: ['59', '07', '13'], actvt: 2, found: true })
  })
  it('only rows of the selected company codes and MAPID A count', () => {
    deepStrictEqual(statusSelection([live], ['IN11']), { fx: ['', '', ''], actvt: 0, found: false })
    deepStrictEqual(statusSelection([{ ...live, MAPID: 'B' }], ['SG03'])?.found, false)
  })
  it('non-numeric offsets would dump in SAP', () => {
    strictEqual(statusSelection([{ ...live, PARAM3: '99X8307' }], ['SG03']), null)
  })
})

describe('ZSGTSFV_FX', () => {
  it('names the fields the middleware view does not serve (as registered on 2026-10-05)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    // prettier-ignore
    deepStrictEqual(missingColumns(served, FX_SELECT_COLUMNS), ['BLOTTER_DATE','PRCTR','PC_NAME','TXN_STATUS','ZTRCODE','TRD_NAME','ZGRP','GRP_DESC','TSF_CODE','BLO_DESC','MERKM','V_DATE','EXT_STAT_DESC','ZSUBJECT','MAT_UNMAT','FO_REMARK','MO_REMARK','ZTSF_DEAL_DESC','ZTSF_DEAL_ID','ZTSF_MC_REF_NO','ZTSF_DEAL_TYPE','ZOLAM_DEAL_NO','ZTSF_TRFTYPE','ZTSF_TRFTYPE2','ZPL','ZPL_CURR','ZPL_RATE','ZPL_LAMT','ZPL_LCURR','ZTSF_EXE_CO','NDF_FO_REM','NDF_MO_REM','SPOT','SWAP','TOT_RATE','NDF_RATE','CPAIR','ZSETT_PAIR','F_CURR1','T_CURR1','CASH_CURR','ZCASH_AMT','EMAIL_CODE'])
  })
  it('builds the WHERE: blotter_date <= p_date, txn_status IN, rfhazul >= actvt, bukrs IN when picked', () => {
    const sel = { fx: ['59', '07', '13'], actvt: 2, found: true }
    deepStrictEqual(fxFilter(['SG03'], false, '2026-10-05', sel), {
      'BLOTTER_DATE[lte]': '2026-10-05',
      'TXN_STATUS[in]': '59,07,13',
      'RFHAZUL[gte]': '00002',
      'BUKRS[in]': 'SG03',
    })
    strictEqual('BUKRS[in]' in fxFilter(['SG03', 'IN11'], true, '2026-10-05', sel), false)
  })
  it('maps a view row by the field catalogue (dates dd-mm-yyyy, amounts/rates numeric, RFHA zeros kept)', () => {
    const d = dealFromRow(
      { BUKRS: 'SG03', RFHA: '3000000000005', RFHAZUL: '00002', DBLFZ: '2026-09-30', AMT2: '-83000.00', T_RATE: '83.000000000', TCRTIM: '23:21:23', REFNR: null },
      FX_FIELD_DEFS,
    )
    deepStrictEqual([d.rfha, d.rfhazul, d.dblfz, d.amt2, d.t_rate, d.tcrtim, d.refnr, d.blotter_date], ['3000000000005', '00002', '30-09-2026', -83000, 83, '23:21:23', '', ''])
  })
})
