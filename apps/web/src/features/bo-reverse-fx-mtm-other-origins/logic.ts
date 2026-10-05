import { COLUMNS, INITIAL_KEY_DATE, POSTED_MESSAGE } from './data.ts'
import {
  addDays,
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
  CalendarView,
  Column,
  Counters,
  Detail,
  DocField,
  Filters,
  LogEntry,
  RawRow,
  Row,
  RowField,
  Sort,
} from './types.ts'

// ------------------------------------------------------------------ derivation

/** The demo quotes every row as USD/local, so the local amount is simply amount x rate. */
export function convertForeignToLocal(amount: number, rate: number): number {
  return rate ? amount * rate : 0
}

/** Months between the key date and the value date, never below 1. */
export function expiryMonthBucket(valueDate: string, keyDate: string): number {
  const v = parseIso(valueDate)
  const k = parseIso(keyDate)
  if (!v || !k) return 0
  return Math.max(1, (v.getFullYear() - k.getFullYear()) * 12 + (v.getMonth() - k.getMonth()))
}

/** Local G/L carries a sign: a Buy loses when the contract rate is at or above the valuation rate, a Sell gains. */
export function localGainLoss(buySell: string, cRate: number, vRate: number, vAmt: number, ccAmt: number): number {
  const rawGl = Math.abs(vAmt - ccAmt)
  const contractAbove = cRate >= vRate
  if (buySell === 'Buy') return contractAbove ? -rawGl : rawGl
  return contractAbove ? rawGl : -rawGl
}

export function deriveRow(r: RawRow, keyDate: string = INITIAL_KEY_DATE): Row {
  // The foreign leg is whichever one is not in the company's local currency.
  const firstIsLocal = r.curr1 === r.zWaers
  const fAmt = Math.abs(firstIsLocal ? r.amt2 : r.amt1)
  const fCurr = firstIsLocal ? r.curr2 : r.curr1
  const ccAmt = convertForeignToLocal(fAmt, r.cRate)
  const vRate = r.vSpot + r.vSwap
  const vAmt = convertForeignToLocal(fAmt, vRate)
  const vCgl = localGainLoss(r.buySell, r.cRate, vRate, vAmt, ccAmt)
  const valMer = r.vSpot
  const baseGl = valMer ? vCgl / valMer : 0

  let vGl: number | null = baseGl
  let uinvAmt = 0
  let uinvPer = 0
  let locUninv = 0
  if (r.pc === 'C') {
    vGl = null
  } else if (r.pc === 'P') {
    const usdLeg = r.curr1 === 'USD' ? Math.abs(r.amt1) : Math.abs(r.amt2)
    uinvAmt = usdLeg - Math.abs(r.t1Amt)
    uinvPer = usdLeg ? (Math.abs(uinvAmt) / usdLeg) * 100 : 0
    vGl = baseGl * (uinvPer / 100)
    locUninv = vCgl * (uinvPer / 100)
  }

  return {
    ...r,
    msg: r.mtmDoc ? POSTED_MESSAGE : '',
    fAmt,
    fCurr,
    ccAmt,
    vRate,
    vAmt,
    vCgl,
    valMer,
    vGl,
    invStat: r.ztsfDealId ? (r.t1Amt > 0 ? 'Yes' : 'No') : '',
    uinvAmt,
    uinvPer,
    locUninv,
    totGl: baseGl,
    month: monthYear(r.valueDate),
    monat: expiryMonthBucket(r.valueDate, keyDate),
  }
}

export function deriveRows(source: readonly RawRow[], keyDate: string = INITIAL_KEY_DATE): Row[] {
  return source.map((r) => deriveRow(r, keyDate))
}

/** Re-buckets the expiry month of every row against a newly applied key date. */
export function withKeyDate(rows: readonly Row[], keyDate: string): Row[] {
  return rows.map((r) => ({ ...r, monat: expiryMonthBucket(r.valueDate, keyDate) }))
}

// --------------------------------------------------------------------- key date

/** The key date typed in, or null unless it is a real DD-MM-YYYY month end. */
export function validKeyDate(text: string): Date | null {
  const d = parseDisplayDate(text)
  return d && isMonthEnd(d) ? d : null
}

// -------------------------------------------------------------------- filtering

export const DEFAULT_SORT: Sort = { field: 'rfha', dir: -1 }

export function defaultFilters(): Filters {
  return { search: '', company: 'ALL', transaction: 'ALL', partner: 'ALL', currency: 'ALL', deal: 'ALL' }
}

export function uniqueValues(rows: readonly Row[], field: RowField): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[field]
    if (v !== '' && v !== null) seen.add(String(v))
  }
  return [...seen].sort()
}

export type Option = { value: string; label: string }

export function filterOptions(rows: readonly Row[], names: Readonly<Record<string, string>>) {
  const nameOfPartner = (code: string) => rows.find((r) => r.kontrh === code)?.bpName ?? ''
  return {
    companies: uniqueValues(rows, 'bukrs').map((v): Option => ({ value: v, label: `${v} — ${names[v] ?? ''}` })),
    transactions: uniqueValues(rows, 'rfha').map((v): Option => ({ value: v, label: v })),
    partners: uniqueValues(rows, 'kontrh').map((v): Option => ({ value: v, label: `${v} — ${nameOfPartner(v)}` })),
    currencies: uniqueValues(rows, 'cpair').map((v): Option => ({ value: v, label: v })),
  }
}

function searchText(r: Row): string {
  let s = ''
  COLUMNS.forEach((c, i) => {
    if (i === 0 || c.field === 'select') return
    let v: unknown = r[c.field]
    if (c.type === 'date') v = formatDate(v as string)
    s += ` ${String(v === null || v === undefined ? '' : v).toLowerCase()}`
  })
  return s
}

/**
 * Applies the toolbar and the key date window (traded on or before the key date, still open after it).
 * An invalid key date shows nothing, as the original did.
 */
export function filterRows(rows: readonly Row[], f: Filters, keyDate: Date | null): Row[] {
  if (!keyDate) return []
  const kd = toIso(keyDate)
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.company !== 'ALL' && r.bukrs !== f.company) return false
    if (f.transaction !== 'ALL' && r.rfha !== f.transaction) return false
    if (f.partner !== 'ALL' && r.kontrh !== f.partner) return false
    if (f.currency !== 'ALL' && r.cpair !== f.currency) return false
    if (f.deal === 'WITH' && !r.ztsfDealId) return false
    if (f.deal === 'WITHOUT' && r.ztsfDealId) return false
    if (!(r.tradeDate <= kd && r.valueDate > kd)) return false
    if (q && !searchText(r).includes(q)) return false
    return true
  })
}

export function compareRows(a: Row, b: Row, sort: Sort): number {
  const av = a[sort.field] ?? ''
  const bv = b[sort.field] ?? ''
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
  const as = String(av).toLowerCase()
  const bs = String(bv).toLowerCase()
  if (as < bs) return -sort.dir
  if (as > bs) return sort.dir
  return 0
}

export function sortRows(rows: readonly Row[], sort: Sort): Row[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort))
}

/** Clicking the sorted column flips it; a new column starts ascending. */
export function nextSort(sort: Sort, field: RowField): Sort {
  return sort.field === field ? { field, dir: sort.dir === 1 ? -1 : 1 } : { field, dir: 1 }
}

export function sortMark(sort: Sort, field: string): string {
  if (sort.field !== field) return ''
  return sort.dir === 1 ? '▲' : '▼'
}

// ----------------------------------------------------------------------- paging

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(total, size))
}

/** Up to five page numbers around the current one. */
export function pagerWindow(current: number, pages: number): number[] {
  let from = Math.max(1, current - 2)
  const to = Math.min(pages, from + 4)
  from = Math.max(1, to - 4)
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}

export function pageSlice<T>(rows: readonly T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size)
}

export function showingText(page: number, size: number, total: number): string {
  if (!total) return 'Showing 0 of 0'
  const start = (page - 1) * size
  return `Showing ${start + 1}–${Math.min(start + size, total)} of ${total}`
}

// ---------------------------------------------------------------------- posting

export function isEligible(r: Row | null | undefined): r is Row {
  return !!r && !r.mtmDoc && r.vGl !== null && r.vGl !== 0
}

export function postButtonTitle(r: Row | null | undefined): string {
  return isEligible(r)
    ? 'Post selected transaction'
    : 'Select an eligible transaction with no MTM document and non-zero valuation G/L'
}

/** Posts one row: takes the next MTM and reversal document numbers from the injected counters. */
export function simulatePosting(r: Row, counters: Counters): { row: Row; counters: Counters; logs: LogEntry[] } {
  const next: Counters = { doc: counters.doc + 1, rev: counters.rev + 1 }
  const row: Row = { ...r, mtmDoc: String(next.doc), revDoc: String(next.rev), msg: POSTED_MESSAGE }
  const entry = (doc: string, kind: LogEntry['kind']): LogEntry => ({
    ok: true,
    rfha: r.rfha,
    doc,
    diff: r.vGl,
    message: POSTED_MESSAGE,
    rate: r.cRate,
    kind,
  })
  return { row, counters: next, logs: [entry(row.mtmDoc, 'MTM'), entry(row.revDoc, 'Reversal')] }
}

// ------------------------------------------------------------------- formatting

/** The text a cell shows, or null for the muted dash. */
export function cellText(v: unknown, type: Column['type']): string | null {
  if (v === null || v === undefined || v === '') return null
  if (type === 'date') return formatDate(String(v))
  if (type === 'amount') return formatNumber(v as number, 2)
  if (type === 'rate') return formatNumber(v as number, 4)
  if (type === 'percent') return `${formatNumber(v as number, 2)}%`
  return String(v)
}

export function isNumericType(type: Column['type']): boolean {
  return type === 'amount' || type === 'rate' || type === 'percent' || type === 'number'
}

export function csvCell(v: unknown): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

export function buildCsv(rows: readonly Row[]): string {
  const cols = COLUMNS.slice(1)
  const out = [cols.map((c) => csvCell(c.label)).join(',')]
  for (const r of rows) {
    out.push(
      cols
        .map((c) => {
          let v: unknown = c.field === 'select' ? '' : r[c.field]
          if (c.type === 'date') v = formatDate(v as string)
          else if (c.type === 'amount') v = v === null ? '' : formatNumber(v as number, 2)
          else if (c.type === 'rate') v = formatNumber(v as number, 4)
          else if (c.type === 'percent') v = `${formatNumber(v as number, 2)}%`
          return csvCell(v === null ? '' : v)
        })
        .join(','),
    )
  }
  return out.join('\r\n')
}

// ---------------------------------------------------------------------- details

export function transactionHeaderDetails(r: Row): Detail[] {
  return [
    { k: 'Transaction', v: r.rfha },
    { k: 'Company Code', v: r.bukrs },
    { k: 'Company Name', v: r.butxt },
    { k: 'Local Currency', v: r.zWaers },
    { k: 'Product Type', v: r.sgsart },
    { k: 'Transaction Type', v: r.xtext },
    { k: 'Business Partner', v: r.kontrh },
    { k: 'Partner Name', v: r.bpName },
    { k: 'Currency Pair', v: r.cpair },
    { k: 'Trade Date', v: formatDate(r.tradeDate) },
    { k: 'Value Date', v: formatDate(r.valueDate) },
    { k: 'Buy/Sell', v: r.buySell },
    { k: 'External Reference', v: r.externalRef },
  ]
}

export function transactionValuationDetails(r: Row): Detail[] {
  return [
    { k: 'Foreign Amount', v: `${formatNumber(r.fAmt, 2)} ${r.fCurr}` },
    { k: 'Contract Rate', v: formatNumber(r.cRate, 4) },
    { k: 'Company Code Amount', v: `${formatNumber(r.ccAmt, 2)} ${r.zWaers}` },
    { k: 'Valuation Spot', v: formatNumber(r.vSpot, 4) },
    { k: 'Valuation Swap', v: formatNumber(r.vSwap, 4) },
    { k: 'Valuation Rate', v: formatNumber(r.vRate, 4) },
    { k: 'Valuation Amount', v: `${formatNumber(r.vAmt, 2)} ${r.zWaers}` },
    { k: 'Local Valuation G/L', v: `${formatNumber(r.vCgl, 2)} ${r.zWaers}` },
    { k: 'Valuation MER', v: formatNumber(r.valMer, 4) },
    { k: 'Valuation G/L (USD)', v: r.vGl === null ? '—' : formatNumber(r.vGl, 2) },
    { k: 'Local Curr Uninv', v: formatNumber(r.locUninv, 2) },
    { k: 'MTM Document', v: r.mtmDoc || '—' },
  ]
}

/** Fields of the FI document popup; the reversal is dated the day after the key date. */
export function documentDetails(r: Row, field: DocField): Detail[] {
  return [
    { k: 'Document Number', v: r[field] },
    { k: 'Company Code', v: r.bukrs },
    { k: 'Fiscal Year', v: INITIAL_KEY_DATE.slice(0, 4) },
    { k: 'Transaction', v: r.rfha },
    { k: 'Document Type', v: 'TR' },
    { k: 'Posting Date', v: formatDate(field === 'revDoc' ? addDays(INITIAL_KEY_DATE, 1) : INITIAL_KEY_DATE) },
    { k: 'Reference', v: r.rfha },
    { k: 'Currency', v: 'USD' },
  ]
}

export function documentTitle(field: DocField): string {
  return field === 'revDoc' ? 'Reversal FI Document' : 'MTM FI Document'
}

// --------------------------------------------------------------------- calendar

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
export const CALENDAR_FIRST_YEAR = 2020
export const CALENDAR_LAST_YEAR = 2035

export function shiftMonth(v: CalendarView, delta: number): CalendarView {
  let { y, m } = v
  m += delta
  if (m < 0) {
    m = 11
    y--
  }
  if (m > 11) {
    m = 0
    y++
  }
  return { y, m }
}

/** Always six weeks, Sunday first, padded with the neighbouring months' days. */
export function calendarCells(v: CalendarView): CalendarCell[] {
  const start = new Date(v.y, v.m, 1).getDay()
  const days = new Date(v.y, v.m + 1, 0).getDate()
  const prevDays = new Date(v.y, v.m, 0).getDate()
  const cells: CalendarCell[] = []
  for (let cell = 0; cell < 42; cell++) {
    let day: number
    let date: Date
    let out = true
    if (cell < start) {
      day = prevDays - start + cell + 1
      date = new Date(v.y, v.m - 1, day)
    } else if (cell >= start + days) {
      day = cell - start - days + 1
      date = new Date(v.y, v.m + 1, day)
    } else {
      day = cell - start + 1
      date = new Date(v.y, v.m, day)
      out = false
    }
    const dow = date.getDay()
    cells.push({ date, day, out, weekend: dow === 0 || dow === 6 })
  }
  return cells
}
