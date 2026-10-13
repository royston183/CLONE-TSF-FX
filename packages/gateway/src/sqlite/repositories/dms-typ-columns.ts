/**
 * ZSGTSFTR_DMS_TYP (DMS Customized Data) columns, from the DS4 DDIC export. SAP's names, which is also what the API
 * speaks. CLIENT is not listed: the gateway always writes DMS_TYP_CLIENT. This list is the only source of column names
 * that ever reach SQL.
 */
export const DMS_TYP_CLIENT = '100'

export const DMS_TYP_COLUMNS: readonly { name: string; kind: 'text' | 'number'; max: number; key?: true }[] = [
  { name: 'ZDMS_CAT', kind: 'text', max: 2, key: true },
  { name: 'ZDMS_TYPE', kind: 'text', max: 3, key: true },
  { name: 'ZDMS_DESC', kind: 'text', max: 100 },
  { name: 'ZDMS_DTYPE', kind: 'text', max: 3 },
  { name: 'ZDMS_DDESC', kind: 'text', max: 20 },
  { name: 'ZSHORT_DESC', kind: 'text', max: 50 },
  { name: 'ZDMS_OBJ', kind: 'text', max: 10 },
  { name: 'ZDMS_RANGE', kind: 'text', max: 2 },
  { name: 'ZDMS_FROM', kind: 'text', max: 20 },
  { name: 'ZDMS_TO', kind: 'text', max: 20 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
