import { parseDate } from './format.ts'
import type { Deal, Filters, KpiFilter, Kpis, PagerItem, Sort, SortKey } from './types.ts'

/* ---------- reference lookups ---------- */

/**
 * The region's name. No region master is named for ZSGTSFR106 (source not exported), so the
 * code is shown as it is.
 */
export const regionName = (id: string): string => id

/** Status 21 (Ready for Settlement) and 22 (Settled) are the settled-side statuses. */
export const statusIsSettled = (code: string): boolean => code === '21' || code === '22'

export const dealsForMc = (deals: readonly Deal[], mcRef: string): Deal[] => deals.filter((d) => d.mcRef === mcRef)

/* ---------- KPI cards ---------- */

export function computeKpis(list: readonly Deal[]): Kpis {
  let pending = 0
  let settled = 0
  let utiTotal = 0
  for (const d of list) {
    if (statusIsSettled(d.status)) settled++
    else pending++
    utiTotal += d.utiAmt
  }
  return { total: list.length, pending, settled, utiTotal }
}

/** Clicking the active KPI card clears it; any other card selects it. */
export const nextKpiFilter = (current: KpiFilter, clicked: KpiFilter): KpiFilter => (current === clicked ? 'ALL' : clicked)

/* ---------- filtering / sorting ---------- */

export const DEFAULT_FILTERS: Filters = {
  search: '',
  deal: '',
  status: 'ALL',
  region: 'ALL',
  entity: 'ALL',
  // The CO Area list had a hard-coded default (1000); with no master there is no default.
  co: '',
  dateFrom: '',
  dateTo: '',
  layout: 'DEFAULT',
  kpi: 'ALL',
  contextMc: null,
}

export const DEFAULT_SORT: Sort = { key: 'valueDate', dir: 1 }

export function matchesFilters(d: Deal, f: Filters): boolean {
  const q = f.search.trim().toLowerCase()
  if (q) {
    const hay = `${d.dealId} ${d.mcRef} ${d.partner} ${d.dealDesc}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  const dealText = f.deal.trim().toLowerCase()
  if (dealText && !d.dealId.toLowerCase().includes(dealText)) return false

  if (f.status !== 'ALL' && d.status !== f.status) return false

  if (f.kpi === 'OPEN' && statusIsSettled(d.status)) return false
  if (f.kpi === 'DONE' && !statusIsSettled(d.status)) return false

  if (f.region !== 'ALL' && d.region !== f.region) return false
  if (f.entity !== 'ALL' && d.origin !== f.entity) return false
  if (f.co && d.coArea !== f.co) return false

  if (f.dateFrom && d.valueDate < parseDate(f.dateFrom)) return false
  if (f.dateTo && d.valueDate > parseDate(f.dateTo)) return false

  if (f.contextMc && d.mcRef !== f.contextMc) return false
  return true
}

const sortValue = (d: Deal, key: SortKey): string | number => {
  const v = d[key]
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return v.toLowerCase()
  return v
}

/** A sorted copy; stable, strings compared case-insensitively, dates by time. */
export function sortDeals(list: readonly Deal[], sort: Sort): Deal[] {
  return [...list].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return 1 * sort.dir
    return 0
  })
}

export const visibleDeals = (deals: readonly Deal[], f: Filters, sort: Sort): Deal[] =>
  sortDeals(
    deals.filter((d) => matchesFilters(d, f)),
    sort,
  )

/** Clicking the sorted column flips direction; a new column starts ascending. */
export const toggleSort = (sort: Sort, key: SortKey): Sort =>
  sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 }

export const sortArrow = (sort: Sort, key: SortKey): string => (sort.key !== key ? '' : sort.dir === 1 ? '▲' : '▼')

/* ---------- paging ---------- */

export const totalPages = (count: number, pageSize: number): number => Math.max(1, Math.ceil(count / pageSize))

export const pageRows = <T>(list: readonly T[], page: number, pageSize: number): T[] =>
  list.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)

/** Page buttons: with more than 7 pages only first, last and the current page's neighbours show. */
export function pageWindow(pages: number, current: number): PagerItem[] {
  const items: PagerItem[] = []
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && p !== 1 && p !== pages && Math.abs(p - current) > 1) {
      if (p === 2 || p === pages - 1) items.push({ kind: 'gap', key: `gap${p}` })
      continue
    }
    items.push({ kind: 'page', page: p })
  }
  return items
}

export function pagerRange(count: number, page: number, pageSize: number): { start: number; end: number } {
  return { start: count ? (page - 1) * pageSize + 1 : 0, end: Math.min(count, page * pageSize) }
}

/* ---------- labels ---------- */

export const resultCountLabel = (count: number): string => `${count} deal ID${count === 1 ? '' : 's'}`

/** The "Key Date" note under the table; null when neither date is set. */
export function keyDateNote(from: string, to: string): string | null {
  if (!from && !to) return null
  return `${from || '…'}${to ? ` - ${to}` : ''}`
}

export const loadedMessage = (count: number, prefix: 'Ready' | 'Refreshed'): string => `${prefix}. ${count} Deal ID(s) loaded.`
export const layoutMessage = (label: string): string =>
  `Layout variant “${label}” applied (display only in this prototype).`
export const mcFilterMessage = (mcRef: string): string => `List filtered to Master Contract ${mcRef}.`

/* ---------- date picker ---------- */

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta
  let y = year
  if (m < 0) {
    m = 11
    y--
  }
  if (m > 11) {
    m = 0
    y++
  }
  return { year: y, month: m }
}

export const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()
/** Blank cells before the 1st (the grid starts on Sunday). */
export const leadingBlanks = (year: number, month: number): number => new Date(year, month, 1).getDay()
