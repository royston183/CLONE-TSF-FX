/**
 * ZSGTSFTR_DAYLOCK (TRM Day Wise Locking) columns, from the DDIC fields of the ZSGTSF_PFX_BLOTTER export. SAP's names,
 * which is also what the API speaks. CLIENT is not listed: the gateway always writes DAYLOCK_CLIENT. This list is the
 * only source of column names that ever reach SQL.
 */
export const DAYLOCK_CLIENT = '100'

/** The blotter's own ZB_TYPE ("Deal Source") and the controlling area the program writes (TEXT-003 and c_ol10). */
export const DAYLOCK_BLOTTER = 'DE6'
export const DAYLOCK_CO_AREA = 'OL10'

export const DAYLOCK_COLUMNS: readonly { name: string; kind: 'text' | 'number'; max: number; key?: true }[] = [
  { name: 'ZB_TYPE', kind: 'text', max: 30, key: true },
  { name: 'ZCO_AREA', kind: 'text', max: 4, key: true },
  { name: 'ZGRP', kind: 'text', max: 3, key: true },
  { name: 'ZMONTH', kind: 'text', max: 3, key: true },
  { name: 'ZPDATE', kind: 'text', max: 8, key: true },
  { name: 'ZTYPE', kind: 'text', max: 10, key: true },
  { name: 'ZYEAR', kind: 'text', max: 4, key: true },
  { name: 'ZLOCKED', kind: 'text', max: 1 },
  { name: 'ZCREATED_BY', kind: 'text', max: 12 },
  { name: 'ZCREATED_DATE', kind: 'text', max: 8 },
  { name: 'ZCREATED_TIME', kind: 'text', max: 6 },
  { name: 'ZCHANGED_BY', kind: 'text', max: 12 },
  { name: 'ZCHANGED_DATE', kind: 'text', max: 8 },
  { name: 'ZCHANGED_TIME', kind: 'text', max: 6 },
]
