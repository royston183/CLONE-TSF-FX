/*
 * Pure business logic of the BO Deal Rejection page: no DOM, no React. Ported from the original
 * script (fetchDeals / rejectDeals / getVisibleDeals / pruneMarks / the Upto Blotter Date entry
 * rules / the calendar maths).
 */
import {
  AUTHORIZED_COMPANY_CODES,
  FX_FIELD_DEFS,
  MONTH_NAMES,
  OP_FIELD_DEFS,
  TABLE_COLUMNS,
  TXN_STATUS_META,
} from './data.ts'
import { formatAmount, formatDMY, formatRate, parseDMY } from './format.ts'
import type {
  CalendarCell,
  CalendarView,
  Deal,
  Deals,
  FieldDef,
  FieldDefs,
  Flags,
  MarkedItem,
  RejectResult,
  SortState,
  TxnType,
} from './types.ts'

export const DEFAULT_SORT: SortState = { field: 'blotter_date', dir: 'desc' }

/** A field of a deal as text (blank when absent). */
export function str(d: Deal, key: string): string {
  const v = d[key]
  return v === undefined || v === null ? '' : String(v)
}

/** Identity of a deal across the two result sets and company codes. */
export function dealKey(type: TxnType, d: Deal): string {
  return `${type}:${str(d, 'bukrs')}:${str(d, 'rfha')}`
}

/** The transaction number part of a deal key. */
export function keyDealNo(key: string): string {
  return key.split(':')[2] ?? ''
}

export function defsFor(type: TxnType): FieldDefs {
  return type === 'FX' ? FX_FIELD_DEFS : OP_FIELD_DEFS
}

/** A list column: the synthetic Remarks column, or one of the type's field definitions. */
export function columnDef(type: TxnType, key: string): FieldDef | undefined {
  if (key === 'bo_rem') return { key: 'bo_rem', label: 'Remarks', type: 'text', group: '' }
  return defsFor(type).byKey[key]
}

export function columnsFor(type: TxnType): FieldDef[] {
  return TABLE_COLUMNS[type].map((k) => columnDef(type, k)).filter((c): c is FieldDef => c !== undefined)
}

export function isNumeric(def: FieldDef): boolean {
  return def.type === 'amt' || def.type === 'rate'
}

/** Display text for a cell (also what search matches against). */
export function cellText(d: Deal, def: FieldDef, type: TxnType, remarks: Record<string, string>): string {
  if (def.key === 'bo_rem') return remarks[dealKey(type, d)] ?? ''
  const v = d[def.key]
  if (v === undefined || v === null || v === '') return ''
  if (def.type === 'amt') return Number(v) === 0 ? '' : formatAmount(v)
  if (def.type === 'rate') return Number(v) === 0 ? '' : formatRate(v)
  return String(v)
}

/** Status transition on rejection: 07 -> 08, 13 -> 11 (ABAP USER_COMMAND, REVERSE). */
export function targetStatusFor(status: string): string {
  return TXN_STATUS_META[status]?.target ?? status
}

export type FetchParams = {
  /** '' = every authorised company code. */
  companyCode: string
  /** dd-mm-yyyy; '' or malformed lists nothing. */
  uptoDate: string
}

/** Mirrors ABAP GET_DATA: company code (authorised) / blotter date / status / activity selection. */
export function fetchDeals(deals: Deals, rejected: Flags, type: TxnType, params: FetchParams): Deal[] {
  const codes = params.companyCode ? [params.companyCode] : AUTHORIZED_COMPANY_CODES
  const upto = parseDMY(params.uptoDate)
  if (!upto) return []
  const minActivity = type === 'OP' ? 3 : 4
  return deals[type].filter((d) => {
    if (!codes.includes(str(d, 'bukrs'))) return false
    if (!AUTHORIZED_COMPANY_CODES.includes(str(d, 'bukrs'))) return false
    const blotter = parseDMY(str(d, 'blotter_date'))
    if (!blotter || blotter.getTime() > upto.getTime()) return false
    if (!TXN_STATUS_META[str(d, 'txn_status')]) return false
    if (parseInt(str(d, 'rfhazul'), 10) < minActivity) return false
    if (rejected[dealKey(type, d)]) return false
    return true
  })
}

/**
 * Mock of ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_*_CHANGE + BAPI_FTR_*_REVERSE + COMMIT: every item
 * moves to its target status, keeps its remark as the BO remark and is flagged as rejected.
 * Returns new objects; the inputs are left untouched.
 */
export function rejectDeals(
  deals: Deals,
  rejected: Flags,
  type: TxnType,
  items: MarkedItem[],
): { deals: Deals; rejected: Flags; results: RejectResult[] } {
  const results: RejectResult[] = []
  const nextRejected: Flags = { ...rejected }
  const byKey = new Map(items.map((it) => [it.key, it]))
  const list = deals[type].map((d) => {
    const it = byKey.get(dealKey(type, d))
    if (!it) return d
    const newStatus = targetStatusFor(str(d, 'txn_status'))
    nextRejected[it.key] = true
    results.push({ rfha: str(d, 'rfha'), bukrs: str(d, 'bukrs'), newStatus })
    return { ...d, txn_status: newStatus, bo_rem: it.remark }
  })
  return { deals: { ...deals, [type]: list }, rejected: nextRejected, results }
}

export type ViewQuery = {
  type: TxnType
  companyCode: string
  uptoDate: string
  /** False when the typed date is invalid: the list is then empty. */
  uptoDateValid: boolean
  statusFilter: string
  search: string
  sort: SortState
}

/** The rows the table lists: selection, status filter, search, then sort. */
export function visibleDeals(deals: Deals, rejected: Flags, remarks: Record<string, string>, q: ViewQuery): Deal[] {
  let list = fetchDeals(deals, rejected, q.type, {
    companyCode: q.companyCode,
    uptoDate: q.uptoDateValid ? q.uptoDate : '',
  })
  if (q.statusFilter) list = list.filter((d) => str(d, 'txn_status') === q.statusFilter)

  const needle = q.search.trim().toLowerCase()
  if (needle) {
    const cols = columnsFor(q.type)
    list = list.filter((d) =>
      cols
        .map((c) => cellText(d, c, q.type, remarks))
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }

  return sortDeals(list, q.type, q.sort)
}

export function sortDeals(list: Deal[], type: TxnType, sort: SortState): Deal[] {
  const def = columnDef(type, sort.field)
  const kind = def?.type ?? 'text'
  const f = sort.field
  const sign = sort.dir === 'asc' ? 1 : -1
  const val = (d: Deal): number | string => {
    const raw = d[f]
    if (kind === 'date') return raw ? (parseDMY(String(raw))?.getTime() ?? 0) : 0
    if (kind === 'amt' || kind === 'rate') return Number(raw) || 0
    return String(raw || '').toLowerCase()
  }
  return list.slice().sort((a, b) => {
    const av = val(a)
    const bv = val(b)
    if (av < bv) return -sign
    if (av > bv) return sign
    return 0
  })
}

/** Clicking a header sorts ascending first, then flips; a different column starts ascending. */
export function nextSort(sort: SortState, field: string): SortState {
  if (sort.field === field) return { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field, dir: 'asc' }
}

/** A mark on a row that is no longer in the result (filter / date / type change) is dropped. */
export function pruneMarks(marks: Flags, list: Deal[], type: TxnType): Flags {
  const present = new Set(list.map((d) => dealKey(type, d)))
  const keys = Object.keys(marks)
  if (keys.every((k) => present.has(k))) return marks
  const out: Flags = {}
  for (const k of keys) if (present.has(k)) out[k] = true
  return out
}

/** The marked deals of the result, in list order, each with the remark typed for it. */
export function markedItems(list: Deal[], marks: Flags, remarks: Record<string, string>, type: TxnType): MarkedItem[] {
  const out: MarkedItem[] = []
  for (const d of list) {
    const key = dealKey(type, d)
    if (marks[key]) out.push({ key, deal: d, remark: remarks[key] ?? '' })
  }
  return out
}

export function toggleMark(marks: Flags, key: string): Flags {
  const out: Flags = { ...marks }
  if (out[key]) delete out[key]
  else out[key] = true
  return out
}

/** Header checkbox: mark (or unmark) every row of the page. */
export function setMarks(marks: Flags, keys: string[], on: boolean): Flags {
  const out: Flags = { ...marks }
  for (const k of keys) {
    if (on) out[k] = true
    else delete out[k]
  }
  return out
}

// ------------------------------------------------------------------ paging and texts

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(page, pageCount(total, pageSize))
}

export function pageSlice<T>(list: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return list.slice(start, start + pageSize)
}

export function showingText(page: number, pageSize: number, total: number): string {
  if (total === 0) return ''
  const start = (page - 1) * pageSize
  return `Showing ${start + 1}–${Math.min(start + pageSize, total)} of ${total}`
}

export function resultCountText(total: number): string {
  return `${total}${total === 1 ? ' deal' : ' deals'}`
}

export function emptyText(uptoDateValid: boolean): string {
  return uptoDateValid ? 'No deals found for the selection.' : 'Enter a valid Upto Blotter Date to list deals.'
}

export function rejectNote(count: number, type: TxnType): string {
  const typeLabel = type === 'FX' ? 'FX' : 'Options'
  const one = count === 1
  return `Reject ${count} ${typeLabel} deal${one ? '' : 's'} and return ${one ? 'it' : 'them'} to Front Office for correction? The transaction${one ? ' is' : 's are'} reversed and no longer appear${one ? 's' : ''} in this list.`
}

export function rejectedToast(count: number): string {
  return `${count} deal${count === 1 ? '' : 's'} rejected and returned to Front Office.`
}

export function dragGhostText(count: number, key: string): string {
  return count > 1 ? `${count} deals` : `Deal ${keyDealNo(key)}`
}

export const REJECT_HINT_OFF = 'Mark one or more deals to reject'
export const REJECT_HINT_ON = 'Reject marked deals and return them to Front Office'
export const MARK_AT_LEAST_ONE = 'Mark at least one deal to reject.'
export const REFRESHED_MESSAGE = 'Screen refreshed.'
export const DATE_ERROR = 'Enter a valid date (DD-MM-YYYY).'

// ------------------------------------------------------------------ Upto Blotter Date

export type TypedDate =
  | { kind: 'valid'; text: string }
  | { kind: 'invalid' }
  /** Still typing: keep the last valid result until the entry is complete. */
  | { kind: 'pending' }

/** What typing in the Upto Blotter Date box means; `final` is true on blur / calendar pick. */
export function typedDate(raw: string, final: boolean): TypedDate {
  const trimmed = raw.trim()
  const dt = parseDMY(trimmed)
  if (dt) return { kind: 'valid', text: formatDMY(dt) }
  if (final || trimmed.length >= 10) return { kind: 'invalid' }
  return { kind: 'pending' }
}

// ------------------------------------------------------------------ calendar

export function shiftMonth(view: CalendarView, delta: number): CalendarView {
  const nd = new Date(view.year, view.month + delta, 1)
  return { year: nd.getFullYear(), month: nd.getMonth() }
}

/** The year selector offers the viewed year +/- 10. */
export function calendarYears(viewYear: number): number[] {
  const out: number[] = []
  for (let y = viewYear - 10; y <= viewYear + 10; y++) out.push(y)
  return out
}

/** Short month names for the selector. */
export function monthLabel(m: number): string {
  return (MONTH_NAMES[m] ?? '').substring(0, 3)
}

/** Leading days of the previous month, the month itself, then trailing days to fill the week. */
export function calendarCells(view: CalendarView, selected: Date | null, today: Date): CalendarCell[] {
  const first = new Date(view.year, view.month, 1)
  const offset = first.getDay()
  const dim = new Date(view.year, view.month + 1, 0).getDate()
  const prevDim = new Date(view.year, view.month, 0).getDate()
  const selTime = selected ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime() : null
  const cells: CalendarCell[] = []
  for (let i = 0; i < offset; i++) {
    cells.push({ day: prevDim - offset + 1 + i, muted: true, selected: false, today: false })
  }
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(view.year, view.month, d)
    cells.push({
      day: d,
      muted: false,
      selected: selTime !== null && dt.getTime() === selTime,
      today: dt.toDateString() === today.toDateString(),
    })
  }
  const trailing = (7 - ((offset + dim) % 7)) % 7
  for (let t = 1; t <= trailing; t++) cells.push({ day: t, muted: true, selected: false, today: false })
  return cells
}
