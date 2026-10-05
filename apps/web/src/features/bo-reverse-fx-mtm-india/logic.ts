import { COLUMNS } from './columns.ts'
import {
  formatDate,
  formatNumber,
  isMonthEnd,
  monthYear,
  parseDisplayDate,
  parseIso,
  toIso,
} from './format.ts'
import type {
  Column,
  ColumnField,
  ColumnType,
  Counters,
  DocField,
  Filters,
  PostLog,
  RawRow,
  Row,
  SelectOption,
  Sort,
} from './types.ts'

export const POSTED_MESSAGE = 'Document Posted Sucessfully'
export const ALL = 'ALL'
export const DEFAULT_SORT: Sort = { field: 'rfha', dir: -1 }
export const DEFAULT_FILTERS: Filters = {
  search: '',
  company: ALL,
  transaction: ALL,
  partner: ALL,
  currency: ALL,
  dealType: 'ALL',
}
export const CSV_FILENAME = 'Reverse_FX_MTM_India.csv'
export const POST_DISABLED_TITLE = 'Select an eligible India transaction with no primary MTM document and non-zero valuation G/L'
export const POST_ENABLED_TITLE = 'Post selected transaction'
export const REFRESH_MESSAGE = 'Initial workbench data restored.'

// ------------------------------------------------------------------ derivation

/** Whole months from the key date to the value date, never below 1. */
export function expiryMonthBucket(valueDate: string, keyDate: string): number {
  const v = parseIso(valueDate)
  const k = parseIso(keyDate)
  if (!v || !k) return 0
  return Math.max(1, (v.getFullYear() - k.getFullYear()) * 12 + (v.getMonth() - k.getMonth()))
}

/**
 * ABAP India logic: take the USD leg, multiply by the contract and valuation INR rates, then sign
 * the gain/loss by USD buy/sell direction. Complete payments carry no G/L; partial payments scale
 * it by the uninvoiced share.
 */
export function deriveRow(raw: RawRow, keyDate: string): Row {
  const fAmt = Math.abs(raw.curr1 === 'USD' ? raw.amt1 : raw.amt2)
  const ccAmt = fAmt * raw.cRate
  const vRate = raw.vSpot + raw.vSwap
  const vAmt = fAmt * vRate
  const rawGl = Math.abs(vAmt - ccAmt)
  let vGl: number | null
  if (raw.buySell === 'Buy') vGl = raw.cRate >= vRate ? rawGl * -1 : rawGl
  else vGl = raw.cRate >= vRate ? rawGl : rawGl * -1

  let uinvAmt = 0
  let uinvPer = 0
  if (raw.pc === 'C') {
    vGl = null
  } else if (raw.pc === 'P') {
    uinvAmt = fAmt - Math.abs(raw.t1Amt)
    uinvPer = fAmt ? (Math.abs(uinvAmt) / fAmt) * 100 : 0
    vGl = vGl * (uinvPer / 100)
  }

  return {
    ...raw,
    fAmt,
    fCurr: 'USD',
    ccAmt,
    vRate,
    vAmt,
    vGl,
    invStat: raw.ztsfDealId ? (raw.t1Amt > 0 ? 'Yes' : 'No') : '',
    // The valuation MER only exists for a deal that has no T1 amount yet.
    valMer: raw.ztsfDealId && !raw.t1Amt ? raw.vSpot : null,
    uinvAmt,
    uinvPer,
    totGl: vGl,
    month: monthYear(raw.valueDate),
    monat: expiryMonthBucket(raw.valueDate, keyDate),
  }
}

/** The same rows with the expiry-month bucket measured from another key date. */
export function withMonat(rows: Row[], keyDate: string): Row[] {
  return rows.map((r) => ({ ...r, monat: expiryMonthBucket(r.valueDate, keyDate) }))
}

/** The key date as a Date when it is a real date and a month end; null otherwise. */
export function validKeyDate(text: string): Date | null {
  const d = parseDisplayDate(text)
  return d && isMonthEnd(d) ? d : null
}

// ------------------------------------------------------------------ lookups

export function uniqueValues(rows: Row[], field: ColumnField): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[field]
    if (v !== '' && v !== null && v !== undefined) seen.add(String(v))
  }
  return [...seen].sort()
}

export function companyOptions(rows: Row[], names: Record<string, string>): SelectOption[] {
  return uniqueValues(rows, 'bukrs').map((v) => ({ value: v, label: `${v} — ${names[v] ?? ''}` }))
}

export function partnerOptions(rows: Row[]): SelectOption[] {
  return uniqueValues(rows, 'kontrh').map((v) => ({
    value: v,
    label: `${v} — ${rows.find((r) => r.kontrh === v)?.bpName ?? ''}`,
  }))
}

export function plainOptions(rows: Row[], field: ColumnField): SelectOption[] {
  return uniqueValues(rows, field).map((v) => ({ value: v, label: v }))
}

// ------------------------------------------------------------------ filter / sort

export function rowSearchText(r: Row): string {
  let s = ''
  for (const c of COLUMNS.slice(1)) {
    let v: unknown = r[c.field as ColumnField]
    if (c.type === 'date') v = formatDate(String(v))
    s += ` ${String(v === null || v === undefined ? '' : v).toLowerCase()}`
  }
  return s
}

export function compareRows(a: Row, b: Row, sort: Sort): number {
  let av: unknown = a[sort.field]
  let bv: unknown = b[sort.field]
  if (av === null || av === undefined) av = ''
  if (bv === null || bv === undefined) bv = ''
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
  const as = String(av).toLowerCase()
  const bs = String(bv).toLowerCase()
  if (as < bs) return -1 * sort.dir
  if (as > bs) return sort.dir
  return 0
}

export function sortRows(rows: Row[], sort: Sort): Row[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort))
}

/** Clicking the sorted column flips direction; a new column starts ascending. */
export function nextSort(cur: Sort, field: ColumnField): Sort {
  return cur.field === field ? { field, dir: cur.dir === 1 ? -1 : 1 } : { field, dir: 1 }
}

/**
 * Rows live on the key date (traded on or before it, valued after it) that match the toolbar.
 * An invalid or non-month-end key date lists nothing.
 */
export function filterRows(rows: Row[], f: Filters, keyDateText: string, sort: Sort): Row[] {
  const kd = validKeyDate(keyDateText)
  if (!kd) return []
  const iso = toIso(kd)
  const q = f.search.trim().toLowerCase()
  const out = rows.filter((r) => {
    if (f.company !== ALL && r.bukrs !== f.company) return false
    if (f.transaction !== ALL && r.rfha !== f.transaction) return false
    if (f.partner !== ALL && r.kontrh !== f.partner) return false
    if (f.currency !== ALL && r.cpair !== f.currency) return false
    if (f.dealType === 'WITH' && !r.ztsfDealId) return false
    if (f.dealType === 'WITHOUT' && r.ztsfDealId) return false
    if (!(r.tradeDate <= iso && r.valueDate > iso)) return false
    if (q && !rowSearchText(r).includes(q)) return false
    return true
  })
  return sortRows(out, sort)
}

// ------------------------------------------------------------------ paging

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(total, size))
}

/** Up to five page numbers around the current one. */
export function pagerWindow(page: number, pages: number): number[] {
  const to = Math.min(pages, Math.max(1, page - 2) + 4)
  const from = Math.max(1, to - 4)
  const out: number[] = []
  for (let n = from; n <= to; n++) out.push(n)
  return out
}

export function pageSlice<T>(rows: T[], page: number, size: number): { rows: T[]; start: number; end: number } {
  const start = (page - 1) * size
  const end = Math.min(start + size, rows.length)
  return { rows: rows.slice(start, end), start, end }
}

export function showingText(total: number, start: number, end: number): string {
  return total ? `Showing ${start + 1}–${end} of ${total}` : 'Showing 0 of 0'
}

// ------------------------------------------------------------------ posting

/** A transaction can be posted when it has no primary MTM document and a non-zero valuation G/L. */
export function isEligible(r: Row | null | undefined): boolean {
  return !!(r && !r.mtmDoc && r.vGl !== null && r.vGl !== 0)
}

/**
 * Posts one transaction: two MTM documents and their two reversals, numbered from the counters,
 * with a message-log row for each. Pure; the caller keeps the returned counters.
 */
export function simulatePosting(r: Row, counters: Counters): { row: Row; counters: Counters; logs: PostLog[] } {
  const doc1 = counters.doc + 1
  const rev1 = counters.rev + 1
  const doc2 = counters.doc + 2
  const rev2 = counters.rev + 2
  const row: Row = {
    ...r,
    mtmDoc: String(doc1),
    revDoc: String(rev1),
    mtmDoc2: String(doc2),
    revDoc2: String(rev2),
    msg: POSTED_MESSAGE,
  }
  const log = (doc: string, kind: PostLog['kind']): PostLog => ({
    ok: true,
    rfha: r.rfha,
    doc,
    diff: r.vGl,
    message: POSTED_MESSAGE,
    rate: r.cRate,
    kind,
  })
  return {
    row,
    counters: { doc: doc2, rev: rev2 },
    logs: [
      log(row.mtmDoc, 'MTM Ledger 1'),
      log(row.revDoc, 'Reversal Ledger 1'),
      log(row.mtmDoc2, 'MTM Ledger 2'),
      log(row.revDoc2, 'Reversal Ledger 2'),
    ],
  }
}

/** Which ledger (1 or 2) and whether it is the reversal, for an FI document column. */
export function docInfo(field: DocField): { isRev: boolean; ledger: '1' | '2' } {
  return { isRev: field === 'revDoc' || field === 'revDoc2', ledger: field === 'mtmDoc2' || field === 'revDoc2' ? '2' : '1' }
}

// ------------------------------------------------------------------ cells and CSV

export function isNumericType(t: ColumnType): boolean {
  return t === 'amount' || t === 'rate' || t === 'percent' || t === 'number'
}

/** Display text for a table cell; null means "no value" (the table shows a dash). */
export function cellText(v: string | number | null | undefined, type: ColumnType): string | null {
  if (v === null || v === undefined || v === '') return null
  if (type === 'date') return formatDate(String(v))
  if (type === 'amount') return formatNumber(v, 2)
  if (type === 'rate') return formatNumber(v, 4)
  if (type === 'percent') return `${formatNumber(v, 2)}%`
  return String(v)
}

export function csvQuote(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

function csvValue(r: Row, c: Column): string | number {
  let v: string | number | null = r[c.field as ColumnField]
  if (c.type === 'date') v = formatDate(String(v))
  else if (c.type === 'amount') v = v === null ? '' : formatNumber(v, 2)
  else if (c.type === 'rate') v = formatNumber(v, 4)
  else if (c.type === 'percent') v = `${formatNumber(v, 2)}%`
  return v === null ? '' : v
}

/** The filtered rows as CSV text (every column except the checkbox), CRLF separated. */
export function buildCsv(rows: Row[]): string {
  const cols = COLUMNS.slice(1)
  const lines = [cols.map((c) => csvQuote(c.label)).join(',')]
  for (const r of rows) lines.push(cols.map((c) => csvQuote(csvValue(r, c))).join(','))
  return lines.join('\r\n')
}
