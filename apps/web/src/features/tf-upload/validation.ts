import { TF_FIELD_MAP, datsToIso, toIsoDate } from './fields.ts'
import type { CellValue } from './xlsx.ts'

/**
 * Checks every cell of a workbook row against the columns it will be written to, before
 * anything is sent.
 *
 * The middleware validates each value too, but it stops at the first problem in a row and
 * only after the row has been sent — so a file with thirteen bad cells failed four times,
 * one reason at a time, and was fixed by trial and error. This reports every problem in the
 * preview, cell by cell, and holds those rows back.
 *
 * The limits are read from the middleware's own metadata (GET /meta/resources/:resource), not
 * kept here, so they are the ones the insert will enforce. A row is checked against both
 * tables it creates — the trade flow and its BL — except where the BL copy is cut to fit on
 * purpose (see buildBlPayload).
 */

export type ColumnLimit = {
  column: string
  codec: string
  maxLength: number | null
  precision: number | null
  scale: number | null
}

/** Column limits by app field name (ZcobXxx style), per table. */
export type UploadLimits = { tradeFlow: Map<string, ColumnLimit>; billOfLading: Map<string, ColumnLimit> }

/** BL fields the upload truncates to fit, as a SAP MOVE would — never a reason to hold a row. */
const BL_TRUNCATED = new Set(['Zbu', 'Zremark'])

export type CellIssue = { index: number; message: string }

function checkValue(raw: CellValue, limit: ColumnLimit): string | null {
  const text = String(raw).trim()
  if (text === '') return null

  if (limit.codec === 'date') {
    // An empty-date placeholder (0001-01-02) is skipped by the upload, not an error.
    const iso = toIsoDate(raw)
    if (iso) return null
    const placeholder = datsToIso(raw) ?? (/^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null)
    if (placeholder && Number(placeholder.slice(0, 4)) < 1000) return null
    return `"${text}" is not a date`
  }

  if (limit.codec === 'decimal' || limit.codec === 'int') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return `"${text}" is not a number`
    if (limit.precision !== null) {
      const scale = limit.scale ?? 0
      const [whole = '', fraction = ''] = String(Math.abs(n)).split('.')
      if (fraction.length > scale) return `${text} has more than ${scale} decimal place(s)`
      if (whole.replace(/^0+/, '').length > limit.precision - scale) return `${text} is too large for ${limit.column}`
    }
    return null
  }

  if (limit.maxLength !== null && text.length > limit.maxLength) {
    return `${text.length} characters, ${limit.column} holds ${limit.maxLength}`
  }
  return null
}

/**
 * The problem cells of one row, by column index. Index 0 and 1 (Trade Flow ID and split) are
 * the key and are handled by the upload itself.
 */
export function validateRow(row: readonly CellValue[], limits: UploadLimits): CellIssue[] {
  const issues: CellIssue[] = []
  for (let index = 2; index < TF_FIELD_MAP.length; index++) {
    const raw = row[index]
    if (raw === null || raw === undefined || raw === '') continue
    const field = TF_FIELD_MAP[index]!.field
    const tf = limits.tradeFlow.get(field)
    const bl = BL_TRUNCATED.has(field) ? undefined : limits.billOfLading.get(field)
    const message = (tf && checkValue(raw, tf)) || (bl && checkValue(raw, bl)) || null
    if (message) issues.push({ index, message })
  }
  return issues
}
