/*
 * Pure business logic of the BO Deal Rejection page: no DOM, no React. Ported from the original
 * script (fetchDeals / rejectDeals / getVisibleDeals / pruneMarks / the Upto Blotter Date entry
 * rules / the calendar maths).
 */
import { FX_FIELD_DEFS, MONTH_NAMES, OP_FIELD_DEFS, TABLE_COLUMNS } from './data.ts'
import { formatAmount, formatDMY, formatRate, formatSwap, parseDMY } from './format.ts'
import type {
  CalendarCell,
  CalendarView,
  Deal,
  FieldDef,
  FieldDefs,
  Flags,
  MarkedItem,
  SortState,
  TxnType,
} from './types.ts'

export const DEFAULT_SORT: SortState = { field: 'blotter_date', dir: 'desc' }

/** A field of a deal as text (blank when absent). */
export function str(d: Deal, key: string): string {
  const v = d[key]
  return v === undefined || v === null ? '' : String(v)
}

/**
 * Identity of a deal across the two result sets and company codes. ZSGTSFV_FX has no unique deal
 * key (the REFON join gives some forwards several rows, keyed BUKRS+RFHA+REFNR), so REFNR is added
 * when the row carries one.
 */
export function dealKey(type: TxnType, d: Deal): string {
  const refnr = str(d, 'refnr')
  return `${type}:${str(d, 'bukrs')}:${str(d, 'rfha')}${refnr ? `:${refnr}` : ''}`
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

/** "Rate" fields that actually hold swap points (shown to 6 dp, not the 4 dp of rates). */
const SWAP_KEYS = new Set(['swap', 'oswap'])

/** Display text for a cell (also what search matches against). */
export function cellText(d: Deal, def: FieldDef, type: TxnType, remarks: Record<string, string>): string {
  if (def.key === 'bo_rem') return remarks[dealKey(type, d)] ?? ''
  const v = d[def.key]
  if (v === undefined || v === null || v === '') return ''
  if (def.type === 'amt') return Number(v) === 0 ? '' : formatAmount(v)
  if (def.type === 'rate') return Number(v) === 0 ? '' : SWAP_KEYS.has(def.key) ? formatSwap(v) : formatRate(v)
  return String(v)
}

// ------------------------------------------------------------------ GET_DATA status selection

/**
 * The status / activity selection of GET_DATA.
 *  FX:      txn_status IN (gv_txn_status1, gv_txn_status2, gv_txn_status3) AND rfhazul >= gv_actvt,
 *           all four derived from ZGTCATR_PARAM (see statusSelection in api.ts).
 *  Options: txn_status IN ('07', '13') AND rfhazul >= '03' (constants c_07, c_13, c_3).
 * `found` is false when ZGTCATR_PARAM had no MAPID 'A' row: SAP then selects with the initial
 * (blank) statuses, which matches no deal.
 */
export type StatusSelection = { fx: string[]; actvt: number; found: boolean }

export const OP_STATUSES = ['07', '13'] as const
export const OP_MIN_ACTIVITY = 3

export function selectedStatuses(type: TxnType, sel: StatusSelection): string[] {
  if (type === 'OP') return [...OP_STATUSES]
  const out: string[] = []
  for (const s of sel.found ? sel.fx : []) if (s && !out.includes(s)) out.push(s)
  return out
}

export function minActivity(type: TxnType, sel: StatusSelection): number {
  return type === 'OP' ? OP_MIN_ACTIVITY : sel.actvt
}

/**
 * Status transition on rejection (USER_COMMAND, REVERSE -> ls_trm-txn_status):
 *  FX:      gv_txn_status2 / gv_txn_status1 -> 08, 13 -> 11
 *  Options: 07 -> 08, 13 -> 11
 * Any other status: the ABAP leaves ls_trm unchanged (it is not cleared per row), so no target is
 * defined; '' is returned and shown as unchanged.
 */
export function targetStatusFor(type: TxnType, status: string, sel: StatusSelection): string {
  if (type === 'FX') {
    if (sel.found && status !== '' && (status === sel.fx[1] || status === sel.fx[0])) return '08'
    if (status === '13') return '11'
    return ''
  }
  if (status === '07') return '08'
  if (status === '13') return '11'
  return ''
}

export type FetchParams = {
  /** The company codes of S_BUKRS (one picked code, or every T001 code). */
  companyCodes: string[]
  /** dd-mm-yyyy; '' or malformed lists nothing. */
  uptoDate: string
  sel: StatusSelection
}

/**
 * GET_DATA's WHERE: bukrs IN s_bukrs AND blotter_date <= p_date AND txn_status IN (...) AND
 * rfhazul >= (...). The middleware read already applies it; this repeats it on the rows so the
 * list never shows a row the ABAP would not select.
 */
export function fetchDeals(deals: readonly Deal[], type: TxnType, params: FetchParams): Deal[] {
  const upto = parseDMY(params.uptoDate)
  if (!upto) return []
  const statuses = selectedStatuses(type, params.sel)
  const minAct = minActivity(type, params.sel)
  return deals.filter((d) => {
    if (!params.companyCodes.includes(str(d, 'bukrs'))) return false
    const blotter = parseDMY(str(d, 'blotter_date'))
    if (!blotter || blotter.getTime() > upto.getTime()) return false
    if (!statuses.includes(str(d, 'txn_status'))) return false
    if ((parseInt(str(d, 'rfhazul'), 10) || 0) < minAct) return false
    return true
  })
}

/** The Txn Status filter: the statuses GET_DATA selects, labelled with the view's EXT_STAT_DESC. */
export function statusOptions(type: TxnType, sel: StatusSelection, deals: readonly Deal[]): { value: string; label: string }[] {
  return selectedStatuses(type, sel).map((code) => {
    const ext = deals.find((d) => str(d, 'txn_status') === code && str(d, 'ext_stat_desc'))
    return { value: code, label: ext ? `${code} - ${str(ext, 'ext_stat_desc')}` : code }
  })
}

/** The BAPIs / FMs USER_COMMAND 'REVERSE' runs per marked deal. */
export const REJECT_CALLS: Record<TxnType, string[]> = {
  FX: ['ZSGTRMFM_VTBFHA_EXPORT', 'BAPI_FTR_FXT_CHANGE', 'BAPI_FTR_FXT_REVERSE (reason 04)', 'BAPI_TRANSACTION_COMMIT / BAPI_TRANSACTION_ROLLBACK'],
  OP: ['ZSGTRMFM_VTBFHA_EXPORT', 'BAPI_FTR_CHANGE_FXOPTIONS', 'BAPI_FTR_REVERSE_FXOPTIONS', 'BAPI_TRANSACTION_COMMIT / BAPI_TRANSACTION_ROLLBACK'],
}

/** What Reject shows instead of posting: the rejection is BAPI work with no API yet. */
export function rejectWaitingText(count: number, type: TxnType): string {
  const what = `BO rejection of ${count} ${type === 'FX' ? 'FX' : 'Options'} deal${count === 1 ? '' : 's'} (TXN_STATUS 08/11 + BO remark, change and reverse)`
  return `WAITING FOR ACTION API — ${what} (${REJECT_CALLS[type].join(', ')}) has no API yet. Nothing was posted to SAP.`
}

export type ViewQuery = {
  type: TxnType
  companyCodes: string[]
  uptoDate: string
  /** False when the typed date is invalid: the list is then empty. */
  uptoDateValid: boolean
  sel: StatusSelection
  statusFilter: string
  search: string
  sort: SortState
}

/** The rows the table lists: selection, status filter, search, then sort. */
export function visibleDeals(deals: readonly Deal[], remarks: Record<string, string>, q: ViewQuery): Deal[] {
  let list = fetchDeals(deals, q.type, {
    companyCodes: q.companyCodes,
    uptoDate: q.uptoDateValid ? q.uptoDate : '',
    sel: q.sel,
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

/** The empty-state text; `notice` (loading / WAITING FOR API / read failure) takes precedence. */
export function emptyText(uptoDateValid: boolean, notice = ''): string {
  if (!uptoDateValid) return 'Enter a valid Upto Blotter Date to list deals.'
  return notice || 'No deals found for the selection.'
}

export function rejectNote(count: number, type: TxnType): string {
  const typeLabel = type === 'FX' ? 'FX' : 'Options'
  const one = count === 1
  return `Reject ${count} ${typeLabel} deal${one ? '' : 's'} and return ${one ? 'it' : 'them'} to Front Office for correction? The transaction${one ? ' is' : 's are'} reversed and no longer appear${one ? 's' : ''} in this list.`
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
