/**
 * ZSGTSFTR_DEALDMS (SLC - DMS Data: a Deal ID's attached documents) columns, from DEAL_DMS.json. SAP's names, which is
 * also what the API speaks. CLIENT is not listed: the gateway always writes DEALDMS_CLIENT. This list is the only
 * source of column names that ever reach SQL.
 */
export const DEALDMS_CLIENT = '100'

export const DEALDMS_COLUMNS: readonly { name: string; kind: 'text' | 'number'; max: number; key?: true }[] = [
  { name: 'ZDMS_CAT', kind: 'text', max: 2, key: true },
  { name: 'ZDMS_TYPE', kind: 'text', max: 3, key: true },
  { name: 'ZDEAL_ID', kind: 'text', max: 10, key: true },
  { name: 'ZDDATE', kind: 'text', max: 8 },
  { name: 'ZDMS_CODE', kind: 'text', max: 10 },
  { name: 'ZSTND_DMS', kind: 'text', max: 25 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]

/** DATS columns: stored YYYYMMDD, spoken YYYY-MM-DD (as the SLC middleware speaks them). */
export const DEALDMS_DATES = ['ZDDATE', 'ZCREATED_DATE', 'ZCHANGED_DATE'] as const
/** TIMS columns: stored HHMMSS, spoken HH:MM:SS. */
export const DEALDMS_TIMES = ['ZCREATED_TIME', 'ZCHANGED_TIME'] as const
