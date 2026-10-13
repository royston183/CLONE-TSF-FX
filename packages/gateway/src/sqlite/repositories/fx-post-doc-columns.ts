/**
 * TSF_FX_POST_DOC (the FI documents PostFlows returned for an FX deal leg) columns. CLIENT is not listed: the gateway
 * always writes FX_POST_DOC_CLIENT. This list is the only source of column names that ever reach SQL.
 */
export const FX_POST_DOC_CLIENT = '100'

export const FX_POST_DOC_COLUMNS: readonly { name: string; kind: 'text' | 'number'; max: number; key?: true }[] = [
  { name: 'ZBUKRS', kind: 'text', max: 4, key: true },
  { name: 'ZRFHA', kind: 'text', max: 13, key: true },
  { name: 'ZDOC1', kind: 'text', max: 10 },
  { name: 'ZGJAHR1', kind: 'text', max: 4 },
  { name: 'ZDOC2', kind: 'text', max: 10 },
  { name: 'ZGJAHR2', kind: 'text', max: 4 },
  { name: 'ZMSG', kind: 'text', max: 255 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
