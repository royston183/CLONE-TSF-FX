/*
 * The three invoice currencies of a ZSGTSFTR_CUR_STR row: T1, T2 and T3.
 *
 * The original reads them from ZCURR1 / ZCURR2 / ZCURR3. In the dev system the table's columns are shifted by one: the
 * currency of T1 sits in ZCURR_DESC ("Curr String"), T2 in ZCURR1, T3 in ZCURR2, and ZCURR3 holds "IN_KA", which is not a
 * currency. The row's own id says the same: every Currency ID is <ZCURR_DESC>-<ZCURR1>-<ZCURR2>, i.e. T1-T2-T3, and the master
 * contract's currency string (ZCURR_DESC "USD-USD-INR") is read as that chain on the other screens.
 *
 * So: when ZCURR1..3 are all currencies they are used as the original does; otherwise, when ZCURR_DESC, ZCURR1 and ZCURR2
 * are all currencies, the shifted reading is used. Once the table is corrected in SAP the first rule applies again and
 * nothing here changes.
 */
import { isCurrencyCode } from './currency-decimals.ts'
import { txt } from './masters.ts'
import type { FxRow } from './mw.ts'

const upper = (v: string): string => v.trim().toUpperCase()

/** [T1, T2, T3] currencies of a currency string row; blanks for a missing row. */
export function tradeCurrencies(row: FxRow | undefined): [string, string, string] {
  if (!row) return ['', '', '']
  const plain: [string, string, string] = [txt(row, 'ZCURR1'), txt(row, 'ZCURR2'), txt(row, 'ZCURR3')]
  if (plain.every((c) => isCurrencyCode(c))) return plain
  const shifted: [string, string, string] = [txt(row, 'ZCURR_DESC'), txt(row, 'ZCURR1'), txt(row, 'ZCURR2')]
  if (shifted.every((c) => isCurrencyCode(c))) return [upper(shifted[0]), upper(shifted[1]), upper(shifted[2])]
  return plain
}

/** The currency of trade n (1 = T1, 2 = T2, 3 = T3). */
export const tradeCurrency = (row: FxRow | undefined, n: 1 | 2 | 3): string => tradeCurrencies(row)[n - 1] ?? ''
