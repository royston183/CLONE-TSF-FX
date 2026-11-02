import { fmtAmt, fmtRate, parseDMY } from './format.ts'
import type {
  ActionKind,
  Deal,
  DetailCell,
  FiDocWhich,
  Filters,
  KpiKey,
  Kpis,
  Names,
  Sort,
  SortKey,
  Status,
  StatusSelect,
} from './types.ts'

export const DEFAULT_PAGE_SIZE = 8
export const PAGE_SIZES = [8, 15, 25, 50] as const
export const STATUSES: readonly Status[] = ['PENDING', 'OVERDUE', 'SETTLED', 'ERRCORR']
/** The legacy page opens (and Reset leaves) the list sorted by Value Date, descending. */
export const DEFAULT_SORT: Sort = { key: 'valueDateSort', dir: -1 }

export function defaultFilters(dateFrom: string, dateTo: string): Filters {
  return { search: '', bukrs: 'ALL', status: 'ALL', product: 'ALL', dateFrom, dateTo }
}

// ------------------------------------------------------------------ filtering

/** The status that actually filters: an active KPI card wins over the dropdown. */
export function effectiveStatus(kpi: KpiKey, select: StatusSelect): StatusSelect {
  return kpi ?? select
}

export function matchesDeal(d: Deal, f: Filters, kpi: KpiKey, names: Names): boolean {
  if (f.bukrs !== 'ALL' && d.bukrs !== f.bukrs) return false
  const status = effectiveStatus(kpi, f.status)
  if (status !== 'ALL' && d.status !== status) return false
  if (f.product !== 'ALL' && d.product !== f.product) return false
  const value = parseDMY(d.valueDate).getTime()
  if (f.dateFrom && value < parseDMY(f.dateFrom).getTime()) return false
  if (f.dateTo && value > parseDMY(f.dateTo).getTime()) return false
  const q = f.search.trim().toLowerCase()
  if (q) {
    const hay = [d.rfha, d.dealId, d.mcRef, d.bukrs, d.entity, d.kontrh, names.partner[d.kontrh] ?? '', d.trader, d.cpair]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function filterDeals(deals: readonly Deal[], f: Filters, kpi: KpiKey, names: Names): Deal[] {
  return deals.filter((d) => matchesDeal(d, f, kpi, names))
}

// -------------------------------------------------------------------- sorting

export function sortValue(d: Deal, key: SortKey): string | number {
  return key === 'valueDateSort' ? parseDMY(d.valueDate).getTime() : d[key]
}

/** Stable sort into a new array. */
export function sortDeals(rows: readonly Deal[], sort: Sort): Deal[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return sort.dir
    return 0
  })
}

/** Clicking the active column flips the direction; a new column starts ascending. */
export function nextSort(cur: Sort, key: SortKey): Sort {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }
}

export function sortArrow(sort: Sort, key: SortKey): string {
  if (sort.key !== key) return ''
  return sort.dir === 1 ? '▲' : '▼'
}

// ------------------------------------------------------------------------ KPIs

/** Counts run over every deal, not just the filtered ones. */
export function computeKpis(deals: readonly Deal[]): Kpis {
  const k: Kpis = { total: deals.length, PENDING: 0, OVERDUE: 0, SETTLED: 0, ERRCORR: 0 }
  for (const d of deals) k[d.status]++
  return k
}

/** Clicking the active card clears it; the Status dropdown follows the card. */
export function toggleKpi(current: KpiKey, key: KpiKey): { kpi: KpiKey; select: StatusSelect } {
  const kpi = current === key ? null : key
  return { kpi, select: kpi ?? 'ALL' }
}

// ------------------------------------------------------------------- paging

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize))
}

export function clampPage(page: number, count: number, pageSize: number): number {
  return Math.min(Math.max(1, page), totalPages(count, pageSize))
}

export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

/** The (up to) five page buttons around the current page. */
export function pageWindow(page: number, pages: number): number[] {
  let start = Math.max(1, page - 2)
  const end = Math.min(pages, start + 4)
  start = Math.max(1, end - 4)
  const out: number[] = []
  for (let p = start; p <= end; p++) out.push(p)
  return out
}

export function pageRange(page: number, pageSize: number, count: number): { from: number; to: number } {
  return { from: count ? (page - 1) * pageSize + 1 : 0, to: Math.min(count, page * pageSize) }
}

export function dealCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'deal' : 'deals'}`
}

// ---------------------------------------------------------------- selection

export function toggleSelected(selected: ReadonlySet<string>, rfha: string): Set<string> {
  const next = new Set(selected)
  if (next.has(rfha)) next.delete(rfha)
  else next.add(rfha)
  return next
}

/** The header checkbox: sets or clears every row on the visible page, leaving other pages alone. */
export function setPageSelected(selected: ReadonlySet<string>, pageRows: readonly Deal[], on: boolean): Set<string> {
  const next = new Set(selected)
  for (const d of pageRows) {
    if (on) next.add(d.rfha)
    else next.delete(d.rfha)
  }
  return next
}

export function allPageSelected(selected: ReadonlySet<string>, pageRows: readonly Deal[]): boolean {
  return pageRows.length > 0 && pageRows.every((d) => selected.has(d.rfha))
}

/** Selected deals, in the dataset's order. Selection spans filters and pages. */
export function selectedDeals(deals: readonly Deal[], selected: ReadonlySet<string>): Deal[] {
  return deals.filter((d) => selected.has(d.rfha))
}

export type ActionState = { label: string; preview: boolean; isd: boolean; test: boolean; post: boolean }

/** Preview and India Settlement Documents need exactly one deal; Test and Post need at least one. */
export function actionState(count: number): ActionState {
  return { label: `${count} selected`, preview: count === 1, isd: count === 1, test: count > 0, post: count > 0 }
}

// -------------------------------------------------------- Test run / Post

export function readyMessage(count: number): string {
  return `Ready. ${count} deal(s) loaded for the selected company codes and value date range.`
}

export const REFRESHED_MESSAGE = 'Data refreshed.'

export function actionTitles(kind: ActionKind): { title: string; subtitle: string; confirm: string } {
  return kind === 'test'
    ? { title: 'TBB1 Test Run', subtitle: 'RFTBBB00 · Test Run (no documents created)', confirm: 'Run Test' }
    : { title: 'TBB1 Post', subtitle: 'RFTBBB00 · Real posting', confirm: 'Post' }
}

// ----------------------------------------------------------- modal content

const DASH = '–'

export function dealDetailCells(d: Deal, names: Names, statusLabel: string): DetailCell[] {
  return [
    { label: 'Transaction', value: d.rfha },
    { label: 'Status', value: statusLabel },
    { label: 'Deal ID', value: d.dealId, accent: true },
    { label: 'MC Ref No', value: d.mcRef, accent: true },
    { label: 'Company Code', value: `${d.bukrs} · ${names.company[d.bukrs] ?? ''}` },
    { label: 'TSF Entity', value: d.entity },
    { label: 'Product', value: d.product },
    { label: 'Currency Pair', value: d.cpair },
    { label: 'Trade Date', value: d.tradeDate },
    { label: 'Value Date', value: d.valueDate },
    { label: 'Leg 1', value: `${d.bs1} ${d.curr1} ${fmtAmt(d.amt1)}` },
    { label: 'Leg 2', value: `${d.bs2} ${d.curr2} ${fmtAmt(d.amt2)}` },
    { label: 'Spot Rate', value: fmtRate(d.spot) },
    { label: 'Swap Rate', value: d.swap ? fmtRate(d.swap) : DASH },
    { label: 'All-in Rate', value: fmtRate(d.allIn) },
    { label: 'Business Partner', value: `${d.kontrh} · ${names.partner[d.kontrh] ?? ''}` },
    { label: 'Trader', value: d.trader },
    { label: 'FI Doc 1', value: d.doc1 || DASH },
    { label: 'FI Doc 2', value: d.doc2 || DASH },
    { label: 'NDF Fixing Date', value: d.ndfDate || DASH },
    { label: 'NDF Ref', value: d.ndfRef || DASH },
    { label: 'NDF Settlement Rate', value: d.ndfRate ? fmtRate(d.ndfRate) : DASH },
    { label: 'Cash Settlement Amount', value: d.cashAmt ? fmtAmt(d.cashAmt) : DASH },
    { label: 'Cash Currency', value: d.cashCurr || DASH },
  ]
}

/** FB03 view of one of the deal's two documents; null when that document does not exist yet. */
export function fiDocCells(d: Deal, which: FiDocWhich): DetailCell[] | null {
  const docNo = which === 'doc1' ? d.doc1 : d.doc2
  if (!docNo) return null
  return [
    { label: 'Document No.', value: docNo },
    { label: 'Company Code', value: d.bukrs },
    { label: 'Fiscal Year', value: String(parseDMY(d.valueDate).getFullYear()) },
    { label: 'Document Type', value: 'TR' },
    { label: 'Currency', value: which === 'doc1' ? d.curr1 : d.curr2 },
    { label: 'Amount', value: fmtAmt(which === 'doc1' ? d.amt1 : d.amt2) },
    { label: 'Posting Date', value: d.valueDate },
    { label: 'Reference', value: d.rfha },
  ]
}

// ------------------------------------------------------------ date picker

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export type CalendarView = { y: number; m: number }

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

/** Blank cells before day 1 (Sunday first) and the day count. */
export function monthGrid(view: CalendarView): { blanks: number; days: number } {
  return { blanks: new Date(view.y, view.m, 1).getDay(), days: daysInMonth(view.y, view.m) }
}

export function navMonth(view: CalendarView, delta: number): CalendarView {
  let { y, m } = view
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

export function viewOf(dmy: string, fallback: CalendarView): CalendarView {
  if (!dmy) return fallback
  const d = parseDMY(dmy)
  return { y: d.getFullYear(), m: d.getMonth() }
}
