/**
 * ZSGTSFTR_TRD_POS (Trade Invoice Posting Details) columns, from SLC_SAP_METADATA_V2_1.json. The
 * names are SAP's, which is also what the API speaks (ZDEAL_ID, ZSET_CHECK, ...), so a row has the
 * same shape as a middleware row. CLIENT is not listed: the gateway always writes TRD_POS_CLIENT.
 * This list is the only source of column names that ever reach SQL — request fields are checked
 * against it, never interpolated.
 */
export type TrdPosColumn = { name: string; kind: 'text' | 'number'; max: number; key?: true }

export const TRD_POS_CLIENT = '100'

export const TRD_POS_COLUMNS: readonly TrdPosColumn[] = [
  { name: 'ZDEAL_ID', kind: 'text', max: 15, key: true },
  { name: 'ZSEQ', kind: 'text', max: 2, key: true },
  { name: 'ZBUKRS', kind: 'text', max: 4 },
  { name: 'ZT_TYPE', kind: 'text', max: 4 },
  { name: 'ZRP', kind: 'text', max: 50 },
  { name: 'ZSELL', kind: 'text', max: 10 },
  { name: 'ZBUY', kind: 'text', max: 10 },
  { name: 'ZAMT', kind: 'number', max: 17 },
  { name: 'ZCURR', kind: 'text', max: 5 },
  { name: 'ZDUE_DATE', kind: 'text', max: 8 },
  { name: 'ZP_DATE', kind: 'text', max: 8 },
  { name: 'ZD_MAP', kind: 'text', max: 5 },
  { name: 'ZTRF_TYPE', kind: 'text', max: 2 },
  { name: 'ZSET_TYPE', kind: 'text', max: 50 },
  { name: 'ZSET_DESC', kind: 'text', max: 120 },
  { name: 'ZSET_CHECK', kind: 'text', max: 1 },
  { name: 'ZPOST_CHECK', kind: 'text', max: 1 },
  { name: 'ZFI_TYPE', kind: 'text', max: 2 },
  { name: 'ZPOST_DESC', kind: 'text', max: 40 },
  { name: 'ZPAY_AMT', kind: 'number', max: 17 },
  { name: 'ZSET_CURR', kind: 'text', max: 5 },
  { name: 'ZAHLVID', kind: 'text', max: 10 },
  { name: 'ZHBKID', kind: 'text', max: 5 },
  { name: 'ZHKTID', kind: 'text', max: 5 },
  { name: 'ZBELNR', kind: 'text', max: 10 },
  { name: 'ZREC_HBKID', kind: 'text', max: 5 },
  { name: 'ZREC_HKTID', kind: 'text', max: 5 },
  { name: 'ZDOC_TYPE', kind: 'text', max: 2 },
  { name: 'ZDR_PK', kind: 'text', max: 2 },
  { name: 'ZDR_ACCNT', kind: 'text', max: 10 },
  { name: 'ZDR_ACC', kind: 'text', max: 2 },
  { name: 'ZDR_CV', kind: 'text', max: 10 },
  { name: 'ZDR_PRCTR', kind: 'text', max: 10 },
  { name: 'ZDR_RBUSA', kind: 'text', max: 4 },
  { name: 'ZDR_GL', kind: 'text', max: 10 },
  { name: 'ZCR_PK', kind: 'text', max: 2 },
  { name: 'ZCR_ACCNT', kind: 'text', max: 10 },
  { name: 'ZCR_ACC', kind: 'text', max: 2 },
  { name: 'ZCR_CV', kind: 'text', max: 10 },
  { name: 'ZCR_PRCTR', kind: 'text', max: 10 },
  { name: 'ZCR_RBUSA', kind: 'text', max: 4 },
  { name: 'ZCR_GL', kind: 'text', max: 10 },
  { name: 'ZMSG', kind: 'text', max: 80 },
  { name: 'ZEXE_CO', kind: 'text', max: 1 },
  { name: 'ZACC_CO', kind: 'text', max: 1 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
