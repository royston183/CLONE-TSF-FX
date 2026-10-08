/**
 * ZSGTSFTR_TRD_ACC (Trade Invoice posting configuration) columns, from SLC_SAP_METADATA_V2_1_TRD_ACC.json. SAP's
 * names, which is also what the API speaks. CLIENT is not listed: the gateway always writes TRD_ACC_CLIENT. This list
 * is the only source of column names that ever reach SQL.
 */
export const TRD_ACC_CLIENT = '100'

export const TRD_ACC_COLUMNS: readonly { name: string; kind: 'text' | 'number'; max: number; key?: true }[] = [
  { name: 'ZFI_TYPE', kind: 'text', max: 2, key: true },
  { name: 'ZPOST_DESC', kind: 'text', max: 40 },
  { name: 'ZDOC_TYPE', kind: 'text', max: 2 },
  { name: 'ZXBLNR1', kind: 'text', max: 16 },
  { name: 'ZBKTXT', kind: 'text', max: 25 },
  { name: 'ZDEBIT', kind: 'text', max: 2 },
  { name: 'ZDR_ENT', kind: 'text', max: 2 },
  { name: 'ZDR_ACC', kind: 'text', max: 2 },
  { name: 'ZDR_TEXT', kind: 'text', max: 60 },
  { name: 'ZCREDIT', kind: 'text', max: 2 },
  { name: 'ZCR_ENT', kind: 'text', max: 2 },
  { name: 'ZCR_ACC', kind: 'text', max: 2 },
  { name: 'ZCR_TEXT', kind: 'text', max: 60 },
  { name: 'ZREF1', kind: 'text', max: 20 },
  { name: 'ZREF2', kind: 'text', max: 20 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
