import type { CellValue } from './xlsx.ts'
import { datsToIso } from './fields.ts'
import type { FieldType } from './fields.ts'

export type TemplateColumn = { index: number; name: string; type: FieldType }

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** "2026-04-15" -> "15-04-2026". Anything else is returned untouched. */
export function isoToDisplay(value: unknown): string {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text
}

/** Excel's day serial, rendered the same way. Shares the 1899-12-30 epoch with toIsoDate. */
export function excelSerialToDisplay(serial: unknown): string {
  const num = Number(serial)
  if (!Number.isFinite(num)) return String(serial ?? '')
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(num * 86400000))
  return `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
}

export function isDateColumn(columns: readonly TemplateColumn[], index: number): boolean {
  return columns[index]?.type === 'date'
}

export function isNumberColumn(columns: readonly TemplateColumn[], index: number): boolean {
  return columns[index]?.type === 'number'
}

/**
 * How a cell is shown in the preview. Dates become DD-MM-YYYY whether the workbook stored a
 * serial, SAP DATS (20241218) or ISO text; numbers get en-IN grouping, which is what the original used.
 */
export function displayCell(
  value: CellValue | null | undefined,
  index: number,
  columns: readonly TemplateColumn[],
): string {
  if (value === null || value === undefined || value === '') return ''
  if (isDateColumn(columns, index)) {
    const dats = datsToIso(value)
    if (dats) return isoToDisplay(dats)
    return typeof value === 'number' ? excelSerialToDisplay(value) : isoToDisplay(value)
  }
  if (isNumberColumn(columns, index) && typeof value === 'number') {
    return value.toLocaleString('en-IN', { maximumFractionDigits: 4 })
  }
  return String(value)
}

/**
 * Search normalisation: lowercased with spaces and separators removed, so "15-04-2026",
 * "15/04/2026" and "15042026" all match each other.
 */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s,/.:-]+/g, '')
}

/**
 * Page size follows the viewport, as the original did — the preview table is the whole screen,
 * so a fixed page size either wastes space or overflows it.
 */
export function responsivePageSize(width: number, height: number): number {
  if (width <= 680) return Math.max(7, Math.min(10, Math.floor((height - 300) / 34)))
  if (width <= 900) return Math.max(8, Math.min(12, Math.floor((height - 390) / 34)))
  return Math.max(10, Math.min(18, Math.floor((height - 300) / 34)))
}
