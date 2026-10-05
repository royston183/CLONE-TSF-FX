import { CALENDAR_YEARS, COLUMNS, COMPANY_NAMES, INITIAL_KEY_DATE, MONTH_NAMES } from './data.ts'
import {
  addDays,
  csvCell,
  formatDate,
  formatNumber,
  isMonthEnd,
  monthYear,
  parseDisplayDate,
  parseIso,
  toIso,
} from './format.ts'
import type {
  CalendarCell,
  ColumnDef,
  DetailCell,
  DocCounters,
  DocField,
  Filters,
  LogEntry,
  RawRow,
  Row,
  Sort,
  SortField,
} from './types.ts'

export { MONTH_NAMES }

export const DEFAULT_FILTERS: Filters = {
  search: '',
  company: 'ALL',
  transaction: 'ALL',
  partner: 'ALL',
  currency: 'ALL',
  deal: 'ALL',
}
export const DEFAULT_SORT: Sort = { field: 'rfha', dir: -1 }

export const NO_ROWS_MESSAGE = 'No transactions match the current selection.'
export const KEY_DATE_ERROR = 'Key Date should be Month End Date only.'
export const REFRESHED_MESSAGE = 'Initial workbench data restored.'
export const POSTED_MESSAGE = 'Document Posted Sucessfully'
export const POST_HINT_OFF = 'Select an eligible transaction with no MTM document and non-zero valuation G/L'
export const POST_HINT_ON = 'Post selected transaction'

// ------------------------------------------------------------------ row derivation

export function safeDiv(a: number, b: number): number {
  return b ? a / b : 0
}

/** Months from the key date to the value date, never below 1. 0 when either date is unreadable. */
export function expiryMonthBucket(valueDate: string, keyDate: string): number {
  const v = parseIso(valueDate)
  const k = parseIso(keyDate)
  if (!v || !k) return 0
  return Math.max(1, (v.getFullYear() - k.getFullYear()) * 12 + (v.getMonth() - k.getMonth()))
}

/**
 * Fills in every derived column of one transaction.
 *
 * Foreign amount is the non-USD leg; USD amount converts it at the contract rate and valuation
 * amount at the valuation rate (spot + swap). The G/L is the absolute difference, signed by side
 * and by whether the contract rate sits at or below the valuation rate. A complete ('C') payment
 * has no G/L; a partial ('P') one is scaled by the uninvoiced share of the USD leg.
 */
export function deriveRow(r: RawRow, keyDate: string = INITIAL_KEY_DATE): Row {
  const curr1IsUsd = r.curr1 === 'USD'
  const fAmt = Math.abs(curr1IsUsd ? r.amt2 : r.amt1)
  const fCurr = curr1IsUsd ? r.curr2 : r.curr1
  const usdAmt = curr1IsUsd ? safeDiv(fAmt, r.cRate) : fAmt * r.cRate
  const vRate = r.vSpot + r.vSwap
  const vAmt = curr1IsUsd ? safeDiv(fAmt, vRate) : fAmt * vRate
  const rawGl = Math.abs(vAmt - usdAmt)
  let vGl: number
  if (r.buySell === 'Buy') vGl = r.cRate <= vRate ? rawGl * -1 : rawGl
  else vGl = r.cRate <= vRate ? rawGl : rawGl * -1

  const invStat: Row['invStat'] = r.ztsfDealId ? (r.t1Amt > 0 ? 'Yes' : 'No') : ''
  let uinvAmt = 0
  let uinvPer = 0
  let finalGl: number | null = vGl
  if (r.pc === 'C') {
    finalGl = null
  } else if (r.pc === 'P') {
    const usdLegAmt = r.curr1 === 'USD' ? Math.abs(r.amt1) : Math.abs(r.amt2)
    uinvAmt = usdLegAmt - Math.abs(r.t1Amt)
    uinvPer = usdLegAmt ? (Math.abs(uinvAmt) / usdLegAmt) * 100 : 0
    finalGl = vGl * (uinvPer / 100)
  }

  return {
    ...r,
    butxt: COMPANY_NAMES[r.bukrs] ?? '',
    msg: r.mtmDoc ? POSTED_MESSAGE : '',
    fAmt,
    fCurr,
    usdAmt,
    vRate,
    vAmt,
    vGl: finalGl,
    invStat,
    uinvAmt,
    uinvPer,
    totGl: finalGl,
    month: monthYear(r.valueDate),
    monat: expiryMonthBucket(r.valueDate, keyDate),
  }
}

export function buildRows(raws: readonly RawRow[], keyDate: string = INITIAL_KEY_DATE): Row[] {
  return raws.map((r) => deriveRow(r, keyDate))
}

/** The same rows with the expiry bucket measured against another key date. */
export function applyKeyDate(rows: readonly Row[], keyDate: string): Row[] {
  return rows.map((r) => ({ ...r, monat: expiryMonthBucket(r.valueDate, keyDate) }))
}

// ------------------------------------------------------------------ key date

/** The date a Key Date text stands for, or null unless it is a real dd-mm-yyyy month-end. */
export function validKeyDate(text: string): Date | null {
  const d = parseDisplayDate(text)
  return d && isMonthEnd(d) ? d : null
}

// ------------------------------------------------------------------ filtering, sorting, paging

export function uniqueSorted(rows: readonly Row[], field: 'bukrs' | 'rfha' | 'kontrh' | 'cpair'): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[field]
    if (v !== '') seen.add(v)
  }
  return [...seen].sort()
}

export function companyLabel(code: string): string {
  return `${code} — ${COMPANY_NAMES[code] ?? ''}`
}

export function partnerLabel(rows: readonly Row[], code: string): string {
  const hit = rows.find((r) => r.kontrh === code)
  return `${code} — ${hit ? hit.bpName : ''}`
}

/** Lower-cased text of every column after the select box, dates as shown, nulls blank. */
export function rowSearchText(r: Row): string {
  let s = ''
  for (const c of COLUMNS.slice(1)) {
    let v: unknown = r[c.field as keyof Row]
    if (c.type === 'date') v = formatDate(String(v))
    s += ` ${String(v === null ? '' : v).toLowerCase()}`
  }
  return s
}

/**
 * Rows visible for the committed Key Date text: a trade date on or before the key date and a value
 * date after it, narrowed by the dropdowns and the search box. An invalid key date shows nothing.
 */
export function filterRows(rows: readonly Row[], f: Filters, keyDateText: string): Row[] {
  const kd = validKeyDate(keyDateText)
  if (!kd) return []
  const key = toIso(kd)
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.company !== 'ALL' && r.bukrs !== f.company) return false
    if (f.transaction !== 'ALL' && r.rfha !== f.transaction) return false
    if (f.partner !== 'ALL' && r.kontrh !== f.partner) return false
    if (f.currency !== 'ALL' && r.cpair !== f.currency) return false
    if (f.deal === 'WITH' && !r.ztsfDealId) return false
    if (f.deal === 'WITHOUT' && r.ztsfDealId) return false
    if (!(r.tradeDate <= key && r.valueDate > key)) return false
    if (q && !rowSearchText(r).includes(q)) return false
    return true
  })
}

function sortValue(r: Row, field: SortField): number | string {
  const v = r[field]
  return v === null || v === undefined ? '' : v
}

export function compareRows(a: Row, b: Row, sort: Sort): number {
  const av = sortValue(a, sort.field)
  const bv = sortValue(b, sort.field)
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
  const as = String(av).toLowerCase()
  const bs = String(bv).toLowerCase()
  if (as < bs) return -1 * sort.dir
  if (as > bs) return 1 * sort.dir
  return 0
}

export function sortRows(rows: readonly Row[], sort: Sort): Row[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort))
}

/** Clicking the sorted column flips it; any other column sorts ascending. */
export function nextSort(sort: Sort, field: SortField): Sort {
  return sort.field === field ? { field, dir: sort.dir === 1 ? -1 : 1 } : { field, dir: 1 }
}

export function sortMark(sort: Sort, field: string): string {
  return sort.field === field ? (sort.dir === 1 ? '▲' : '▼') : ''
}

export function totalPages(count: number, size: number): number {
  return Math.max(1, Math.ceil(count / size))
}

export function clampPage(page: number, count: number, size: number): number {
  return Math.min(Math.max(1, page), totalPages(count, size))
}

export function pageSlice<T>(rows: readonly T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, Math.min((page - 1) * size + size, rows.length))
}

/** Up to five page numbers, sliding so the window stays full near the end. */
export function pagerWindow(page: number, pages: number): number[] {
  let from = Math.max(1, page - 2)
  const to = Math.min(pages, from + 4)
  from = Math.max(1, to - 4)
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

export function showingText(page: number, size: number, count: number): string {
  if (!count) return 'Showing 0 of 0'
  const start = (page - 1) * size
  return `Showing ${start + 1}–${Math.min(start + size, count)} of ${count}`
}

export function recordCountText(count: number): string {
  return `${count} records`
}

// ------------------------------------------------------------------ cells

export function isNumericType(type: ColumnDef['type']): boolean {
  return type === 'amount' || type === 'rate' || type === 'percent' || type === 'number'
}

/** Text of a data cell, or null for the muted dash. */
export function cellText(v: unknown, type: ColumnDef['type']): string | null {
  if (v === null || v === undefined || v === '') return null
  if (type === 'date') return formatDate(String(v))
  if (type === 'amount') return formatNumber(v as number, 2)
  if (type === 'rate') return formatNumber(v as number, 4)
  if (type === 'percent') return `${formatNumber(v as number, 2)}%`
  return String(v)
}

// ------------------------------------------------------------------ posting

/** A transaction can be posted when it has no MTM document yet and a non-zero valuation G/L. */
export function isEligible(r: Row | null | undefined): boolean {
  return !!(r && !r.mtmDoc && r.vGl !== null && r.vGl !== 0)
}

/** Posts the MTM and its reversal document, taking numbers from the injected counters. */
export function simulatePosting(
  rows: readonly Row[],
  id: string,
  counters: DocCounters,
): { rows: Row[]; counters: DocCounters; logs: LogEntry[] } {
  const target = rows.find((r) => r.rfha === id)
  if (!isEligible(target) || !target) return { rows: [...rows], counters, logs: [] }
  const next = { doc: counters.doc + 1, rev: counters.rev + 1 }
  const mtmDoc = String(next.doc)
  const revDoc = String(next.rev)
  const log = (doc: string, kind: LogEntry['kind']): LogEntry => ({
    ok: true,
    rfha: target.rfha,
    doc,
    diff: target.vGl,
    message: POSTED_MESSAGE,
    rate: target.cRate,
    kind,
  })
  return {
    rows: rows.map((r) => (r.rfha === id ? { ...r, mtmDoc, revDoc, msg: POSTED_MESSAGE } : r)),
    counters: next,
    logs: [log(mtmDoc, 'MTM'), log(revDoc, 'Reversal')],
  }
}

// ------------------------------------------------------------------ details

export function transactionDetails(r: Row): { top: DetailCell[]; valuation: DetailCell[] } {
  return {
    top: [
      { label: 'Transaction', value: r.rfha },
      { label: 'Company Code', value: r.bukrs },
      { label: 'Company Name', value: r.butxt },
      { label: 'Product Type', value: r.sgsart },
      { label: 'Transaction Type', value: r.xtext },
      { label: 'Business Partner', value: r.kontrh },
      { label: 'Partner Name', value: r.bpName },
      { label: 'Currency Pair', value: r.cpair },
      { label: 'Trade Date', value: formatDate(r.tradeDate) },
      { label: 'Value Date', value: formatDate(r.valueDate) },
      { label: 'Buy/Sell', value: r.buySell },
      { label: 'External Reference', value: r.externalRef },
    ],
    valuation: [
      { label: 'Contract Rate', value: formatNumber(r.cRate, 4) },
      { label: 'Valuation Spot', value: formatNumber(r.vSpot, 4) },
      { label: 'Valuation Swap', value: formatNumber(r.vSwap, 4) },
      { label: 'Valuation Rate', value: formatNumber(r.vRate, 4) },
      { label: 'USD Amount', value: formatNumber(r.usdAmt, 2) },
      { label: 'Valuation Amount', value: formatNumber(r.vAmt, 2) },
      { label: 'Valuation G/L', value: r.vGl === null ? '—' : formatNumber(r.vGl, 2) },
      { label: 'MTM Document', value: r.mtmDoc || '—' },
    ],
  }
}

export function documentTitle(field: DocField): string {
  return field === 'revDoc' ? 'Reversal FI Document' : 'MTM FI Document'
}

export function documentDetails(r: Row, field: DocField): DetailCell[] {
  return [
    { label: 'Document Number', value: r[field] },
    { label: 'Company Code', value: r.bukrs },
    { label: 'Fiscal Year', value: INITIAL_KEY_DATE.slice(0, 4) },
    { label: 'Transaction', value: r.rfha },
    { label: 'Document Type', value: 'TR' },
    {
      label: 'Posting Date',
      value: formatDate(field === 'revDoc' ? addDays(INITIAL_KEY_DATE, 1) : INITIAL_KEY_DATE),
    },
    { label: 'Reference', value: r.rfha },
    { label: 'Currency', value: 'USD' },
  ]
}

// ------------------------------------------------------------------ CSV

/** CSV of the filtered rows, every column but the select box, CRLF line breaks. */
export function buildCsv(rows: readonly Row[]): string {
  const cols = COLUMNS.slice(1)
  const lines = [cols.map((c) => csvCell(c.label)).join(',')]
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const raw = r[c.field as keyof Row] as string | number | null
          let v: string | number
          if (c.type === 'date') v = formatDate(String(raw))
          else if (c.type === 'amount') v = raw === null ? '' : formatNumber(raw, 2)
          else if (c.type === 'rate') v = formatNumber(raw, 4)
          else if (c.type === 'percent') v = `${formatNumber(raw, 2)}%`
          else v = raw === null ? '' : raw
          return csvCell(v)
        })
        .join(','),
    )
  }
  return lines.join('\r\n')
}

// ------------------------------------------------------------------ calendar

export type CalendarView = { year: number; month: number }

export function shiftMonth(v: CalendarView, delta: number): CalendarView {
  let month = v.month + delta
  let year = v.year
  if (month < 0) {
    month = 11
    year--
  }
  if (month > 11) {
    month = 0
    year++
  }
  return { year, month }
}

export function calendarYears(): number[] {
  const out: number[] = []
  for (let y = CALENDAR_YEARS.from; y <= CALENDAR_YEARS.to; y++) out.push(y)
  return out
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** The 42 cells of a month grid, padded with the neighbouring months' days. */
export function calendarCells(v: CalendarView, selected: Date | null, today: Date): CalendarCell[] {
  const start = new Date(v.year, v.month, 1).getDay()
  const days = new Date(v.year, v.month + 1, 0).getDate()
  const prevDays = new Date(v.year, v.month, 0).getDate()
  const cells: CalendarCell[] = []
  for (let cell = 0; cell < 42; cell++) {
    let day: number
    let date: Date
    let out = true
    if (cell < start) {
      day = prevDays - start + cell + 1
      date = new Date(v.year, v.month - 1, day)
    } else if (cell >= start + days) {
      day = cell - start - days + 1
      date = new Date(v.year, v.month + 1, day)
    } else {
      day = cell - start + 1
      date = new Date(v.year, v.month, day)
      out = false
    }
    cells.push({
      date,
      day,
      out,
      weekend: date.getDay() === 0 || date.getDay() === 6,
      today: sameDay(date, today),
      selected: !!selected && sameDay(date, selected),
    })
  }
  return cells
}
