import type { BusinessUnit } from './fields.ts'
import type { CellValue } from './xlsx.ts'

export type RowEligibility = { eligible: boolean; reason?: string }

function words(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function containsName(value: string, name: string): boolean {
  return Boolean(name && ` ${value} `.includes(` ${name} `))
}

/**
 * The workbook's Business Unit Name is the primary check. BU Commodity is also checked against
 * the loaded business-unit names, so a Cocoa commodity cannot slip through a Rice-labelled row.
 * Unknown rows are held back: the upload must never silently assign the selected BU to them.
 */
export function checkRowBusinessUnit(
  row: readonly CellValue[],
  selectedCode: string,
  units: readonly BusinessUnit[],
): RowEligibility {
  const selected = units.find((unit) => unit.code === selectedCode)
  if (!selected) return { eligible: false, reason: 'Business Unit is unavailable; select it again.' }

  const selectedName = words(selected.name)
  const workbookUnit = words(row[3])
  const commodity = words(row[6])
  if (!selectedName) return { eligible: false, reason: 'Selected Business Unit has no name.' }
  if (!commodity) return { eligible: false, reason: 'BU Commodity is blank.' }

  const otherUnit = units.find((unit) =>
    unit.code !== selectedCode &&
    words(unit.name) !== selectedName &&
    containsName(commodity, words(unit.name)),
  )
  if (otherUnit) {
    return { eligible: false, reason: `BU Commodity belongs to ${otherUnit.name}, not ${selected.name}.` }
  }

  if (workbookUnit && workbookUnit !== selectedName) {
    return { eligible: false, reason: `Workbook Business Unit is ${String(row[3]).trim()}, not ${selected.name}.` }
  }

  if (containsName(commodity, selectedName) || workbookUnit === selectedName) return { eligible: true }
  return { eligible: false, reason: `BU Commodity cannot be verified for ${selected.name}.` }
}
