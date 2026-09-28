import { COLUMNS } from './data.ts'
import { fmtAmount, fmtDate, fmtRate } from './format.ts'
import type { Column, ColumnKey, ColumnType, Deal, Filters, Layout, QuickFilters, Sort, ViewState } from './types.ts'

export const CSV_FILENAME = 'deal_id_list_confirmation.csv'
export const PAGE_SIZES = [8, 15, 20, 50] as const
export const DEFAULT_PAGE_SIZE = 15
export const DEFAULT_SORT: Sort = { key: 'zdeal_id', dir: 'asc' }
export const EMPTY_FILTERS: Filters = { region: [], entity: [], model: [], status: '' }
export const EMPTY_QUICK_FILTERS: QuickFilters = { confirmedOnly: false, straddleOnly: false, revisedOnly: false }

/*
 * Business rule ported from FORM SUB_GET_DATA:
 *  - zs_date <= key date
 *  - status in (01,02)
 *  - if ZSS blank: exclude when ze_date < key date
 *  - if ZSS set:   exclude when zship_end < key date
 */
export function isActiveAsOfKeyDate(deal: Deal, keyDate: Date): boolean {
  const k = keyDate.getTime()
  if (deal.zs_date.getTime() > k) return false
  if (!deal.zss) {
    if (deal.ze_date.getTime() < k) return false
  } else if (deal.zship_end.getTime() < k) return false
  return true
}

/** Ported from FORM DATA_FILTER. */
export function applySelectionFilters(list: readonly Deal[], f: Filters): Deal[] {
  return list.filter((d) => {
    if (f.status && d.zdeal_stat !== f.status) return false
    if (f.region.length && !f.region.includes(d.zreg_id)) return false
    if (f.model.length && !f.model.includes(d.zmod_id)) return false
    if (f.entity.length && !f.entity.includes(d.zorigin)) return false
    return true
  })
}

export function applyQuickFilters(list: readonly Deal[], q: QuickFilters): Deal[] {
  return list.filter((d) => {
    if (q.confirmedOnly && d.zconfirm !== 'X') return false
    if (q.straddleOnly && d.zss !== 'X') return false
    if (q.revisedOnly && !d.zrev_dedate) return false
    return true
  })
}

export function anyQuickFilter(q: QuickFilters): boolean {
  return q.confirmedOnly || q.straddleOnly || q.revisedOnly
}

export function visibleColumns(layout: Layout): Column[] {
  return COLUMNS.filter((c) => (layout === 'all' ? true : c.essential))
}

export function isNumericColumn(type: ColumnType): boolean {
  return type === 'currency-blue' || type === 'currency-green' || type === 'pl' || type === 'rate'
}

/** A cell's plain text — what the table shows, the search matches and the CSV carries. */
export function formatCell(d: Deal, col: Column): string {
  const v = d[col.key]
  switch (col.type) {
    case 'date':
      return v instanceof Date ? fmtDate(v) : '–'
    case 'currency-blue':
    case 'currency-green':
    case 'pl':
      return fmtAmount(typeof v === 'number' ? v : null)
    case 'rate':
      return fmtRate(typeof v === 'number' ? v : null)
    case 'flag':
      return v === 'X' ? 'Yes' : 'No'
    case 'status':
      return d.zdeal_sdesc
    default:
      return v === undefined || v === null || v === '' ? '–' : String(v)
  }
}

/** Case-insensitive substring match over the formatted text of the visible columns only. */
export function applySearch(list: readonly Deal[], search: string, cols: readonly Column[]): Deal[] {
  const term = search.trim().toLowerCase()
  if (!term) return list.slice()
  return list.filter((d) => cols.some((c) => formatCell(d, c).toLowerCase().includes(term)))
}

function sortValue(v: Deal[ColumnKey], dateLike: boolean, numberLike: boolean): number | string {
  if (dateLike) return v instanceof Date ? v.getTime() : -Infinity
  if (numberLike) return typeof v === 'number' ? v || 0 : 0
  return (v || '').toString().toLowerCase()
}

/** Dates by time (a missing one first), numbers numerically, anything else as lower-case text. */
export function applySort(list: readonly Deal[], sort: Sort): Deal[] {
  const { key, dir } = sort
  return list.slice().sort((a, b) => {
    const ar = a[key]
    const br = b[key]
    const dateLike = ar instanceof Date || br instanceof Date
    const numberLike = !dateLike && (typeof ar === 'number' || typeof br === 'number')
    const av = sortValue(ar, dateLike, numberLike)
    const bv = sortValue(br, dateLike, numberLike)
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

/** The original's getFilteredData: key date, Basic Selection, quick filters, search, sort. */
export function getFilteredData(all: readonly Deal[], v: ViewState): Deal[] {
  let base = all.filter((d) => isActiveAsOfKeyDate(d, v.keyDate))
  base = applySelectionFilters(base, v.filters)
  base = applyQuickFilters(base, v.quickFilters)
  base = applySearch(base, v.search, visibleColumns(v.layout))
  return applySort(base, v.sort)
}

/** Clicking a header: the same column flips direction, another one starts ascending. */
export function nextSort(sort: Sort, key: ColumnKey): Sort {
  if (sort.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'asc' }
}

export function totalPagesOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** At most five page buttons, centred on the current page where there is room. */
export function pageWindow(page: number, totalPages: number, maxButtons = 5): number[] {
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2))
  const endPage = Math.min(totalPages, startPage + maxButtons - 1)
  startPage = Math.max(1, endPage - maxButtons + 1)
  return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
}

export function pageInfo(page: number, pageSize: number, total: number): string {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return `Showing ${start}–${end} of ${total}`
}

export function recordCount(n: number): string {
  return n + (n === 1 ? ' record' : ' records')
}

/** Header labels quoted as-is, cells quoted with doubled quotes, CRLF rows — as the original. */
export function buildCsv(cols: readonly Column[], data: readonly Deal[]): string {
  const rows = [cols.map((c) => `"${c.label}"`).join(',')]
  for (const d of data) rows.push(cols.map((c) => `"${formatCell(d, c).replace(/"/g, '""')}"`).join(','))
  return rows.join('\r\n')
}

export function exportToast(n: number): string {
  return n + (n === 1 ? ' record exported to CSV.' : ' records exported to CSV.')
}

/** The multiselect's option search: id or label, case-insensitive. */
export function filterOptions<T extends { id: string; label: string }>(options: readonly T[], term: string): T[] {
  const t = term.toLowerCase()
  return options.filter((o) => !t || o.id.toLowerCase().includes(t) || o.label.toLowerCase().includes(t))
}

export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
