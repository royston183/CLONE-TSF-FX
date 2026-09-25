/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. Nothing here talks to the middleware: api.ts writes a correction
 * or reversal to ZSGTSFTR_MAS_CON first, and these functions then change the row on screen.
 */
import { COLUMN_DEFS, findBizRegion, findEntity, findPaymentTerm, findRegion } from './data.ts'
import { formatAmount, formatDMY, formatRate, parseDMY, parseLooseAmount } from './format.ts'
import type { CodeLabel, ColumnKey, CorrectionForm, ErrorRow, FieldErrors, Filters, McStatus, Picks, Sort } from './types.ts'

// ---------------------------------------------------------------- filters

/** Default MC Date filter range — always the current calendar year, never hard-coded. */
export function currentYearRange(now: Date = new Date()): Pick<Filters, 'dateFrom' | 'dateTo'> {
  const y = now.getFullYear()
  return { dateFrom: `01-01-${y}`, dateTo: `31-12-${y}` }
}

export function defaultFilters(now: Date = new Date()): Filters {
  return { origin: '', region: '', fxModel: '', ...currentYearRange(now) }
}

// ---------------------------------------------------------------- cells

export const STATUS_LABEL: Record<McStatus, string> = {
  correction: 'Error Correction',
  resubmitted: 'Release to MO',
  reversed: 'Reversed',
}

export const STATUS_TEXT_CLASS: Record<McStatus, string> = {
  correction: 'status-text-correction',
  resubmitted: 'status-text-resubmitted',
  reversed: 'status-text-reversed',
}

/**
 * The final port description a port group turns into, which ZSGTSF_MC_ERROR_CORR writes to
 * ZPOS / ZPOD: ZSGTSFTR_PORTGRP.ZPORT_GRP_DESC, or — for a dummy group, which has none — the
 * legacy page's own wording.
 */
export const portDescription = (group: CodeLabel): string =>
  group.desc || `Any Port(s) in ${group.label} or any other port(s)`

/** A port cell: the group's description, else the stored ZPOS / ZPOD text no group matched. */
export function portText(regionCode: string, stored?: string): string {
  const r = findRegion(regionCode)
  return r ? portDescription(r) : stored || '—'
}

/**
 * What a cell shows, as text. The status and MC Reference cells are drawn as styled spans
 * and an empty FO Remarks as a faint "—", but their text is the same, which matters because
 * the search box matches against exactly this.
 */
export function cellText(row: ErrorRow, key: ColumnKey): string {
  switch (key) {
    case 'status':
      return STATUS_LABEL[row.status]
    case 'mcRef':
      return String(row.mcRef)
    case 'mcBalAmt':
      return formatAmount(row.mcBalAmt)
    case 'regionId':
      return row.regionId ? `${row.regionId} - ${findBizRegion(row.regionId)?.label ?? ''}` : ''
    case 'mcAmt':
      return formatAmount(row.mcAmt)
    case 'exRate':
      return formatRate(row.exRate)
    case 'commodityText':
      return row.specificCommodity ? row.commodityText : ''
    case 'portShipment':
      return portText(row.shipRegionCode, row.shipPortText)
    case 'portDestination':
      return portText(row.destRegionCode, row.destPortText)
    case 'utilization':
      return formatAmount(row.utilization)
    case 'moRemarks':
      return row.moRemarks.split(' — ')[0] ?? ''
    case 'foRemarks':
      return row.foRemarks || '—'
    case 'select':
      return ''
    default:
      return String(row[key])
  }
}

/** One lowercase string per row from every column's shown value: search matches anything visible. */
export function rowSearchText(row: ErrorRow): string {
  return COLUMN_DEFS.filter((c) => c.key !== 'select')
    .map((c) => cellText(row, c.key))
    .join(' ')
    .toLowerCase()
}

// ---------------------------------------------------------------- list

const DATE_FIELDS = new Set(['mcDate', 'shipStart', 'shipEnd', 'paymentDate'])

function sortValue(row: ErrorRow, field: Sort['field']): string | number {
  const v = row[field]
  if (DATE_FIELDS.has(field)) return parseDMY(String(v))?.getTime() ?? 0
  return typeof v === 'string' ? v.toLowerCase() : v
}

/**
 * MC Date range (rows with an unreadable date always pass), origin, region and FX model
 * filters, then the all-columns search, then the column sort.
 *
 * The FX model filter compares the row's model id, not its code, exactly as the original:
 * picking "M034" (id M034a) therefore does not match the M034b rows.
 */
export function filterSortRows(rows: readonly ErrorRow[], search: string, filters: Filters, sort: Sort): ErrorRow[] {
  const from = parseDMY(filters.dateFrom)
  const to = parseDMY(filters.dateTo)
  let list = rows.filter((r) => {
    const d = parseDMY(r.mcDate)
    if (from && d && d < from) return false
    if (to && d && d > to) return false
    if (filters.origin && r.origin !== filters.origin) return false
    if (filters.region && r.regionId !== filters.region) return false
    if (filters.fxModel && r.fxId !== filters.fxModel) return false
    return true
  })
  const q = search.trim().toLowerCase()
  if (q) list = list.filter((r) => rowSearchText(r).includes(q))

  const { field, dir } = sort
  return [...list].sort((a, b) => {
    const av = sortValue(a, field)
    const bv = sortValue(b, field)
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

/** Error Correction and Reverse only act on a row still waiting for correction. */
export const canAct = (row: ErrorRow | undefined): row is ErrorRow => !!row && row.status === 'correction'

/** Why a row cannot be opened for correction, or null when it can. */
export function correctionBlockedMessage(row: ErrorRow): string | null {
  if (row.status === 'correction') return null
  return `This Master Contract has already been ${row.status === 'reversed' ? 'reversed' : 'resubmitted'}.`
}

// ---------------------------------------------------------------- correction form

/** The modal's fields as the original fills them when it opens on a row. */
export function formFromRow(row: ErrorRow, today: Date = new Date()): CorrectionForm {
  return {
    amendedDate: row.mcAmendedDate || formatDMY(today),
    amountUsd: formatAmount(row.mcAmt),
    exRate: formatRate(row.exRate),
    amountOrigin: `${formatAmount(row.mcAmountOrigin)} ${findEntity(row.origin)?.currency ?? ''}`,
    shipStart: row.shipStart,
    shipEnd: row.shipEnd,
    paymentTerms: row.paymentTermsCode,
    portShipment: row.shipRegionCode,
    portDestination: row.destRegionCode,
    foRemarks: row.foRemarks || '',
  }
}

export const picksFromRow = (row: ErrorRow): Picks => ({
  paymentTerms: row.paymentTermsCode,
  portShipment: row.shipRegionCode,
  portDestination: row.destRegionCode,
})

/**
 * MC Amount (Origin) as it is recalculated while typing: USD × rate, or blank until both
 * are positive numbers. The rate is read without dropping commas, as in the original.
 */
export function calcOrigin(amountUsd: string, exRate: string): string {
  const usd = parseLooseAmount(amountUsd)
  const rate = parseFloat(exRate)
  return !Number.isNaN(usd) && !Number.isNaN(rate) && usd > 0 && rate > 0 ? formatAmount(usd * rate) : ''
}

/** The same calendar day one month earlier, clamped to that month's last day (31-03 → 28/29-02). */
export function oneMonthBefore(date: Date): Date {
  let y = date.getFullYear()
  let prevMonth = date.getMonth() - 1
  if (prevMonth < 0) {
    prevMonth = 11
    y--
  }
  const lastDay = new Date(y, prevMonth + 1, 0).getDate()
  return new Date(y, prevMonth, Math.min(date.getDate(), lastDay))
}

/**
 * ABAP parity (OIL_GET_PREV_MONTH-style cutoff): MC Amended Date must be a real date and,
 * unless the ABAP status is '21', no older than one month before today. There is
 * deliberately no future-date maximum, matching the supplied ABAP logic.
 */
export function isAmendedDateValid(value: string, abapStatus: string | undefined, today: Date = new Date()): boolean {
  const amended = parseDMY(value)
  if (!amended) return false
  if (String(abapStatus || '11') === '21') return true
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return amended >= oneMonthBefore(midnight)
}

export function validateCorrection(
  form: CorrectionForm,
  abapStatus: string | undefined,
  today: Date = new Date(),
): { valid: boolean; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!isAmendedDateValid(form.amendedDate, abapStatus, today)) errors.amendedDate = true

  const usd = parseLooseAmount(form.amountUsd)
  if (!(!Number.isNaN(usd) && usd > 0)) errors.amountUsd = true

  const rate = parseFloat(form.exRate)
  if (!(!Number.isNaN(rate) && rate > 0)) errors.exRate = true

  const start = parseDMY(form.shipStart)
  const end = parseDMY(form.shipEnd)
  if (!start) errors.shipStart = true
  if (!(end && (!start || end >= start))) errors.shipEnd = true

  if (form.foRemarks.trim().length === 0) errors.foRemarks = true

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Update & Resubmit to MO: writes the corrected values back and releases the row to
 * Mid-Office. A dropdown the user cleared by typing falls back to its last pick.
 */
export function applyCorrection(row: ErrorRow, form: CorrectionForm, picks: Picks): ErrorRow {
  // The row on screen only: api.ts's correctionColumns turns the result into the MAS_CON write.
  const mcAmt = parseLooseAmount(form.amountUsd)
  const exRate = parseFloat(form.exRate)
  const paymentTermsCode = picks.paymentTerms || row.paymentTermsCode
  return {
    ...row,
    mcAmendedDate: form.amendedDate,
    mcAmt,
    mcBalAmt: mcAmt,
    exRate,
    mcAmountOrigin: Math.round(mcAmt * exRate * 100) / 100,
    shipStart: form.shipStart,
    shipEnd: form.shipEnd,
    paymentTermsCode,
    ownExplanation: findPaymentTerm(paymentTermsCode)?.label || row.ownExplanation,
    shipRegionCode: picks.portShipment || row.shipRegionCode,
    destRegionCode: picks.portDestination || row.destRegionCode,
    foRemarks: form.foRemarks.trim(),
    status: 'resubmitted',
  }
}

/** Reverse: the row leaves the active correction queue for good. */
export const reverseRow = (row: ErrorRow): ErrorRow => ({ ...row, status: 'reversed' })

export const reverseConfirmText = (row: ErrorRow) =>
  `Master Contract ${row.mcRef} will be marked as reversed and removed from the active correction queue. This action cannot be undone.`
