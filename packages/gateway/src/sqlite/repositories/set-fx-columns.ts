import type { DdicColumn } from './ddic-table.ts'

/** ZSGTSFTR_SET_FX from the supplied SET_FX.json. CLIENT is supplied by the repository. */
export const SET_FX_CLIENT = '100'
export const SET_FX_COLUMNS: readonly DdicColumn[] = [
  { name: 'ZMOD_ID', kind: 'text', max: 10, key: true },
  { name: 'ZD_MAP', kind: 'text', max: 5, key: true },
  { name: 'ZBS', kind: 'text', max: 1, key: true },
  { name: 'ZT_TYPE', kind: 'text', max: 4 },
  { name: 'ZMOD_DESC', kind: 'text', max: 40 },
  { name: 'ZBUKRS', kind: 'text', max: 4 },
  { name: 'ZDSS_DEAL', kind: 'text', max: 10 },
  { name: 'ZCURR', kind: 'text', max: 5 },
  { name: 'ZRBUKRS', kind: 'text', max: 4 },
  { name: 'ZBANK_ID', kind: 'text', max: 4 },
  { name: 'ZPAY_ID', kind: 'text', max: 10 },
  { name: 'ZACC', kind: 'text', max: 2 },
  { name: 'ZSEQ', kind: 'text', max: 2 },
  { name: 'ZTRF_TYPE', kind: 'text', max: 2 },
  { name: 'ZLET_CODE', kind: 'text', max: 4 },
  { name: 'ZLET_NAME', kind: 'text', max: 30 },
  { name: 'ZSET_TYPE', kind: 'text', max: 50 },
  { name: 'ZSET_DESC', kind: 'text', max: 120 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
