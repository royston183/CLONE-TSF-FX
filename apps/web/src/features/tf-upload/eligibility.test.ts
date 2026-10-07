import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { checkRowBusinessUnit } from './eligibility.ts'
import type { BusinessUnit } from './fields.ts'
import type { CellValue } from './xlsx.ts'

const units: BusinessUnit[] = [
  { code: 'B02', name: 'RICE' },
  { code: 'B04', name: 'COCOA' },
  { code: 'B07', name: 'CASHEW' },
]

function row(unit: string, commodity: string): CellValue[] {
  return ['', '01', '', unit, '', '', commodity]
}

describe('TF upload Business Unit eligibility', () => {
  it('uploads only rows for the selected Business Unit', () => {
    const rows = [
      row('Rice', 'THAI WHITE RICE 5% BROKEN'),
      row('Rice', 'INDIAN PARBOILED RICE'),
      row('Rice', 'RICE 100 PCT BROKEN'),
      row('Cocoa', 'COCOA BEANS'),
      row('Cocoa', 'COCOA BUTTER'),
    ]
    strictEqual(rows.filter((item) => checkRowBusinessUnit(item, 'B02', units).eligible).length, 3)
    strictEqual(rows.filter((item) => checkRowBusinessUnit(item, 'B04', units).eligible).length, 2)
  })

  it('rejects a wrong commodity even when the workbook unit says Rice', () => {
    strictEqual(checkRowBusinessUnit(row('Rice', 'COCOA BEANS'), 'B02', units).eligible, false)
  })

  it('holds back blank or unverifiable commodities', () => {
    strictEqual(checkRowBusinessUnit(row('Rice', ''), 'B02', units).eligible, false)
    strictEqual(checkRowBusinessUnit(row('', 'UNKNOWN PRODUCT'), 'B02', units).eligible, false)
  })

  it('accepts a known selected unit when the workbook unit is blank', () => {
    strictEqual(checkRowBusinessUnit(row('', 'CASHEW NUTS'), 'B07', units).eligible, true)
  })
})
