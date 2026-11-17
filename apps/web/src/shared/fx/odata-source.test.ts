import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { SPECS, columnOf, toFilter, toOrderBy, toRow } from './odata-source.ts'

test('properties are renamed back to the SAP columns the screens use', () => {
  const deal = SPECS['tsfDealId']!
  deepStrictEqual(
    ['ZdealID', 'ZsubType', 'ZfxInvModel', 'ZregionID', 'Zbukrs3', 'ZplLamt', 'ZmcCurrID', 'ZoverUtl'].map((p) => columnOf(deal, p)),
    ['ZDEAL_ID', 'ZSUB_TYPE', 'ZFX_INV_MODEL', 'ZREGION_ID', 'ZBUKRS3', 'ZPL_LAMT', 'ZMC_CURR_ID', 'ZOVER_UTL'],
  )
  const fx = SPECS['tsfvFx']!
  deepStrictEqual(
    ['CompanyCode', 'FinancialTransaction', 'TRate', 'ZtsfDealID', 'ZtsfBhbkID', 'CurrSt1', 'ZamtSt1', 'BsO', 'ZtsfPreMature', 'OtotRate', 'Bs1'].map((p) => columnOf(fx, p)),
    ['BUKRS', 'RFHA', 'T_RATE', 'ZTSF_DEAL_ID', 'ZTSF_BHBK_ID', 'CURR_ST1', 'ZAMT_ST1', 'BS_O', 'ZTSF_PRE_MATURE', 'OTOT_RATE', 'BS_1'],
  )
})

test('an entity becomes a middleware row: booleans X or blank, decimals strings, nulls kept', () => {
  deepStrictEqual(
    toRow('tsfDealId', { ZdealID: '7000000006', Zss: false, Zconfirm: true, ZdealAmt: 23924000, ZrevDedate: null, ZsDate: '2026-09-30', '@odata.etag': 'x' }),
    { ZDEAL_ID: '7000000006', ZSS: '', ZCONFIRM: 'X', ZDEAL_AMT: '23924000', ZREV_DEDATE: null, ZS_DATE: '2026-09-30' },
  )
})

test('middleware filters become a $filter', () => {
  strictEqual(toFilter('tsfDealId', { ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX' }), "ZdealID eq '7000000006' and ZdealType eq 'FX'")
  strictEqual(toFilter('tsfDealId', { 'ZMC_REF[in]': '2000000001,2000000002' }), "(ZmcRef eq '2000000001' or ZmcRef eq '2000000002')")
  strictEqual(toFilter('tsfDealId', { 'ZDEAL_STAT[lte]': '03' }), "ZdealStat le '03'")
  strictEqual(toFilter('tsfDealId', { 'ZS_DATE[between]': '2026-01-01,2026-12-31' }), '(ZsDate ge 2026-01-01 and ZsDate le 2026-12-31)')
  strictEqual(toFilter('tsfvFx', { BUKRS: 'AE13', 'RFHA[in]': '0000005000000,0000005000001' }), "CompanyCode eq 'AE13' and (FinancialTransaction eq '0000005000000' or FinancialTransaction eq '0000005000001')")
  strictEqual(toFilter('tsfDealId', { ZSS: 'X' }), 'Zss eq true')
  strictEqual(toFilter('tsfDealId', { ZREV_DEDATE: '' }), 'ZrevDedate eq null')
  strictEqual(toFilter('tsfDealId', { 'ZDEAL_DESC[like]': '%OSIPL%' }), "contains(ZdealDesc,'OSIPL')")
  strictEqual(toFilter('tsfDealId', { 'ZDEAL_DESC[isNotNull]': '' }), 'ZdealDesc ne null')
  strictEqual(toFilter('tsfDealId', { ZDEAL_DESC: "O'Neil" }), "ZdealDesc eq 'O''Neil'")
})

test('a column or value the service cannot take is refused, so the read falls back to the middleware', () => {
  throws(() => toFilter('tsfDealId', { MANDT: '100' }), /no column MANDT/)
  throws(() => toFilter('tsfDealId', { 'ZS_DATE[gte]': '30.09.2026' }), /not a date/)
  throws(() => toFilter('tsfDealId', { 'ZMC_REF[in]': '' }), /no values/)
})

test('sorts become an $orderby', () => {
  strictEqual(toOrderBy('tsfDealId', '-ZDEAL_ID'), 'ZdealID desc')
  strictEqual(toOrderBy('tsfvFx', 'BUKRS,-RFHA'), 'CompanyCode asc,FinancialTransaction desc')
})
