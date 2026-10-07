import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TF_FIELD_MAP } from './fields.ts'
import { validateRow } from './validation.ts'
import type { ColumnLimit, UploadLimits } from './validation.ts'
import type { CellValue } from './xlsx.ts'

const text = (column: string, maxLength: number): ColumnLimit => ({ column, codec: 'text', maxLength, precision: null, scale: null })
const LIMITS: UploadLimits = {
  tradeFlow: new Map([
    ['Zcob', text('ZCOB', 25)],
    ['Zlc', text('ZLC', 3)],
    ['ZpodCtry', text('ZPOD_CTRY', 15)],
    ['Zremark', text('ZREMARK', 250)],
    ['Zbu', text('ZBU', 30)],
    ['Zquantity', { column: 'ZQUANTITY', codec: 'decimal', maxLength: null, precision: 17, scale: 3 }],
    ['Zsldate', { column: 'ZSLDATE', codec: 'date', maxLength: null, precision: null, scale: null }],
  ]),
  billOfLading: new Map([
    ['Zremark', text('ZREMARK', 80)],
    ['Zbu', text('ZBU', 20)],
  ]),
}

/** A workbook row with the given cells set by field name. */
function row(cells: Record<string, CellValue>): CellValue[] {
  return TF_FIELD_MAP.map((f) => cells[f.field] ?? '')
}
const at = (field: string) => TF_FIELD_MAP.findIndex((f) => f.field === field)

describe('validateRow', () => {
  it('reports every cell that does not fit, not just the first — the cashew workbook row 1', () => {
    const issues = validateRow(
      row({ Zcob: 'OLAM FOOD INGREDIENTS MIDDLE EAST LLC', Zlc: 'LC-CAS-2026-1001', ZpodCtry: 'UNITED ARAB EMIRATES' }),
      LIMITS,
    )
    deepStrictEqual(issues.map((i) => i.index), [at('Zcob'), at('Zlc'), at('ZpodCtry')])
    strictEqual(issues.find((i) => i.index === at('Zlc'))?.message, '16 characters, ZLC holds 3')
  })

  it('passes a row whose values fit', () => {
    deepStrictEqual(validateRow(row({ Zcob: 'TO ORDER', Zlc: 'YES', ZpodCtry: 'Utd.Arab Emir.' }), LIMITS), [])
  })

  it('does not hold a row for BL columns the upload truncates on purpose', () => {
    // ZREMARK is 250 on the trade flow and 80 on the BL, where it is cut like a SAP MOVE.
    deepStrictEqual(validateRow(row({ Zremark: 'R'.repeat(120) }), LIMITS), [])
  })

  it('refuses a number with more decimals than the column keeps, since the middleware will not round', () => {
    strictEqual(validateRow(row({ Zquantity: 12.3456 }), LIMITS).length, 1)
    deepStrictEqual(validateRow(row({ Zquantity: 12.345 }), LIMITS), [])
  })

  it('refuses text that is not a date, but not the empty-date placeholder', () => {
    strictEqual(validateRow(row({ Zsldate: 'next week' }), LIMITS)[0]?.message, '"next week" is not a date')
    deepStrictEqual(validateRow(row({ Zsldate: '0001-01-02' }), LIMITS), [])
    deepStrictEqual(validateRow(row({ Zsldate: 46285 }), LIMITS), [])
  })
})
