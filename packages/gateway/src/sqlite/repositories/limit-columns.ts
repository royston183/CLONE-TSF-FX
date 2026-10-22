import type { DdicColumn } from './ddic-table.ts'

export const LIMIT_CLIENT = '100'

/**
 * ZSGTSFTR_LIM_MAN columns, SAP's names (which is also what the API speaks). CLIENT is not listed: the gateway always writes
 * LIMIT_CLIENT. The DDIC export of this table was empty, so lengths / key are inferred — see migration 012.
 */
export const LIM_MAN_COLUMNS: readonly DdicColumn[] = [
  { name: 'ZYEAR', kind: 'text', max: 4, key: true },
  { name: 'ZCURR_PAIR', kind: 'text', max: 7, key: true },
  { name: 'ZLIMIT_STARTDT', kind: 'text', max: 8, key: true },
  { name: 'ZLIMIT_MATDT', kind: 'text', max: 8, key: true },
  { name: 'ZCURR', kind: 'text', max: 5 },
  { name: 'ZINI_AAMT', kind: 'number', max: 17 },
  { name: 'ZAD_AAMT', kind: 'number', max: 17 },
  { name: 'ZUNAPROV_AMT', kind: 'number', max: 17 },
  { name: 'ZUTL_AMT', kind: 'number', max: 17 },
  { name: 'ZLIM_SET', kind: 'text', max: 1 },
  { name: 'ZLIM_APP', kind: 'text', max: 1 },
  { name: 'ZLIM_REJ', kind: 'text', max: 1 },
  { name: 'ZLIM_ADDLIM', kind: 'text', max: 1 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]

/** ZSGTRMTR_CURPAIR (Define currency pair for trading), from SLC_SAP_METADATA_V2_1_CURPAIR.json. Its client column is MANDT. */
export const CURPAIR_CLIENT = '100'
export const CURPAIR_COLUMNS: readonly DdicColumn[] = [
  { name: 'F_CURR', kind: 'text', max: 5, key: true },
  { name: 'T_CURR', kind: 'text', max: 5, key: true },
  { name: 'BUKRS', kind: 'text', max: 4 },
  { name: 'PAIR', kind: 'text', max: 7 },
  { name: 'CREATED_BY', kind: 'text', max: 12 },
  { name: 'CREATED_DATE', kind: 'text', max: 8 },
  { name: 'CREATED_TIME', kind: 'text', max: 6 },
  { name: 'UPUSER', kind: 'text', max: 12 },
  { name: 'DUPDAT', kind: 'text', max: 8 },
  { name: 'TUPTIM', kind: 'text', max: 6 },
  { name: 'DIV_RATIO', kind: 'number', max: 9 },
]

/** ZSGTRMTR_FIELDS (Field names), from SLC_SAP_METADATA_V2_1_trmtr_fields.json. */
export const FIELDS_CLIENT = '100'
export const FIELDS_COLUMNS: readonly DdicColumn[] = [
  { name: 'ZFIELD', kind: 'text', max: 30, key: true },
  { name: 'ZNAME', kind: 'text', max: 30 },
  { name: 'CREATED_BY', kind: 'text', max: 12 },
  { name: 'CREATED_DATE', kind: 'text', max: 8 },
  { name: 'CREATED_TIME', kind: 'text', max: 6 },
  { name: 'CHANGED_BY', kind: 'text', max: 12 },
  { name: 'CHANGED_DATE', kind: 'text', max: 8 },
  { name: 'CHANGED_TIME', kind: 'text', max: 6 },
]
