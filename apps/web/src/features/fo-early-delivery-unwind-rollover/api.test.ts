import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CDS_REQUIRED_COLUMNS, assignRollTypes, bankPartnerOptions, legFromCds, missingColumns, txnTypeOptions } from './api.ts'
import type { Leg } from './types.ts'

describe('ZSGTSFCDS_FX columns', () => {
  it('names the VTBFHA fields ZSGTSFV_FX does not serve (middleware tsfvFx as registered on 2026-10-01)', () => {
    // prettier-ignore
    const served = ['MANDT','BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP','SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','NDF_DATE','NDF_REF','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2','ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM']
    deepStrictEqual(missingColumns(served, CDS_REQUIRED_COLUMNS), [
      'ZTSF_DEAL_ID',
      'CPAIR',
      'TXN_STATUS',
      'EXT_STAT_DESC',
      'ZTSF_DEAL_TYPE',
      'ZGRP',
      'ZTSF_PRE_MATURE',
      'ZTSF_UNWIND',
    ])
    deepStrictEqual(missingColumns([...served, ...CDS_REQUIRED_COLUMNS].map((c) => c.toLowerCase()), CDS_REQUIRED_COLUMNS), [])
  })
})

describe('legFromCds', () => {
  it('maps a CDS row field for field, defaulting ZUONR to RFHA', () => {
    const l = legFromCds({
      BUKRS: 'SG03', RFHA: '1000000123', BUTXT: 'Olam Intl', SFHAART: '619', XTEXT: 'FWD', DBLFZ: '2026-08-01',
      DELFZ: '2027-02-01', CPAIR: 'USD/INR', BS_1: 'Buy', CURR1: 'USD', AMT1: '1000000.00', BS_2: 'Sell', CURR2: 'INR',
      AMT2: '-89650000.00', OTOT_RATE: '89.650000000', KONTRH: '0220136244', BP_NAME: 'MUFG BANK LTD', TXN_STATUS: '03',
      EXT_STAT_DESC: 'Released', ZTSF_DEAL_TYPE: 'D1', ZGRP: 'G02', ZUONR: null, ZTSF_PRE_MATURE: 'X', ZTSF_UNWIND: '',
    })
    deepStrictEqual(l, {
      rfha: '1000000123', bukrs: 'SG03', butxt: 'Olam Intl', sfhaart: '619', xtext: 'FWD', dblfz: '2026-08-01',
      delfz: '2027-02-01', cpair: 'USD/INR', bs1: 'Buy', curr1: 'USD', amt1: 1000000, bs2: 'Sell', curr2: 'INR',
      amt2: -89650000, otot_rate: 89.65, kontrh: '0220136244', bpName: 'MUFG BANK LTD', txnStatus: '03',
      txnDesc: 'Released', dealType: 'D1', zgrp: 'G02', zuonr: '1000000123', zroll: '', ztsf_pre_mature: true,
      ztsf_unwind: false,
    })
  })
})

describe('assignRollTypes (deal_details, scope 4000029736)', () => {
  const at = (rfha: string, dealType: string, txnStatus: string, buyUsd: boolean): Leg =>
    legFromCds({
      RFHA: rfha, ZTSF_DEAL_TYPE: dealType, TXN_STATUS: txnStatus,
      BS_1: buyUsd ? 'Buy' : 'Sell', CURR1: 'USD', BS_2: buyUsd ? 'Sell' : 'Buy', CURR2: 'INR',
    })
  const roll = (legs: Leg[]) => Object.fromEntries(assignRollTypes(legs).map((l) => [l.rfha, l.zroll]))

  it('numbers rolled originals (61) and cancellations per side against the first D1 leg', () => {
    deepStrictEqual(
      roll([
        at('100', 'D1', '03', true), // the reference leg: Buy-USD / Sell-INR
        at('101', 'D2', '03', false),
        at('205', '00', '61', true), // R on D1: shares Buy-USD
        at('203', '00', '61', true), // sorted before 205
        at('210', '01', '61', false), // R on D2
        at('300', '00', '03', false), // C on D1: no Sell-INR side
        at('301', '00', '49', true), // C on D2: Sell-INR side
        at('302', '00', '03', false), // second C on D1
        at('303', '00', '03', true), // second C on D2, but there is no R2-D2 to pair it with
      ]),
      { 100: '', 101: '', 205: 'R2-D1', 203: 'R1-D1', 210: 'R1-D2', 300: 'C1-D1', 301: 'C1-D2', 302: 'C2-D1', 303: '' },
    )
  })

  it('leaves every leg untagged when the deal has no D1 leg', () => {
    deepStrictEqual(roll([at('1', 'D2', '03', true), at('2', '00', '61', true)]), { 1: '', 2: '' })
  })
})

describe('value helps', () => {
  it('Txn Type: TVARVC LOW split as low+0(3) / low+4, sorted by key', () => {
    deepStrictEqual(txnTypeOptions([{ LOW: '619 FWD' }, { LOW: '605 SPOT' }, { LOW: '607' }, { LOW: '' }]), [
      { value: '605', primary: '605', secondary: 'SPOT' },
      { value: '607', primary: '607', secondary: undefined },
      { value: '619', primary: '619', secondary: 'FWD' },
    ])
  })

  it("Bank BP: only banks in BP_GRP for the leg's trader group that also exist in BPEXT", () => {
    const groups = [
      { BP: '0660012171', ZGRP: 'G02' },
      { BP: '0220136244', ZGRP: 'G02' },
      { BP: '0660000680', ZGRP: 'G11' },
      { BP: '0999999999', ZGRP: 'G02' }, // not in BPEXT: the inner join drops it
    ]
    const banks = [
      { BP: '0660012171', SHORT_NAME: 'ANZ_SG' },
      { BP: '0660000680', SHORT_NAME: 'KBANK_TH' },
      { BP: '0220136244', SHORT_NAME: 'MUFG_IN' },
    ]
    deepStrictEqual(bankPartnerOptions(groups, banks, 'G02'), [
      { value: '0220136244', primary: '0220136244', secondary: 'MUFG_IN' },
      { value: '0660012171', primary: '0660012171', secondary: 'ANZ_SG' },
    ])
    strictEqual(bankPartnerOptions(groups, banks, 'G99').length, 0)
  })
})
