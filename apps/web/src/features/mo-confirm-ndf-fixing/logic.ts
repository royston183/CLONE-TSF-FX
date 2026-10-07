/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. They run on the deals read from SAP (api.ts).
 */
import { TXN } from '../../shared/fx/ndf.ts'
import { parseDMY } from './format.ts'
import type { DropdownItem, Filters, NdfDeal, Selection, SelectionErrors, Sort, SortField } from './types.ts'

// ---------------------------------------------------------------- inputs

/**
 * The NDF Value box's shorthand: "250K" is 250 thousand, "1.5M" 1.5 million and "2CR" 2 crore
 * (case-insensitive, commas ignored). null when there is nothing to read.
 */
export function parseAmountInput(input: string | null | undefined): number | null {
  if (!input) return null
  let str = input.trim().toUpperCase().replace(/,/g, '')
  let mult = 1
  if (str.endsWith('CR')) {
    mult = 10000000
    str = str.slice(0, -2)
  } else if (str.endsWith('K')) {
    mult = 1000
    str = str.slice(0, -1)
  } else if (str.endsWith('M')) {
    mult = 1000000
    str = str.slice(0, -1)
  }
  const n = parseFloat(str)
  if (Number.isNaN(n)) return null
  return n * mult
}

/** Strictly dd-mm-yyyy, and a day that exists in that month. */
export function isValidDMY(str: string): boolean {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str)
  if (!m) return false
  const dd = parseInt(m[1] ?? '', 10)
  const mm = parseInt(m[2] ?? '', 10)
  const yyyy = parseInt(m[3] ?? '', 10)
  if (mm < 1 || mm > 12) return false
  const daysInMonth = new Date(yyyy, mm, 0).getDate()
  return dd >= 1 && dd <= daysInMonth
}

/** View Deals' checks: Company Code and a valid Fixing Date are required. */
export function validateSelection(selection: Selection): SelectionErrors {
  const fd = selection.fixingDate.trim()
  return {
    companyCode: selection.companyCode.trim() ? null : 'Company Code is required.',
    fixingDate: !fd ? 'Fixing Date is required.' : !isValidDMY(fd) ? 'Enter a valid date as dd-mm-yyyy.' : null,
  }
}

/** A searchable dropdown's rows for what is typed: matches on either line, ignoring case. */
export function filterDropdownItems(items: DropdownItem[], query: string): DropdownItem[] {
  const q = query.trim().toLowerCase()
  return items.filter(
    (it) => !q || it.primary.toLowerCase().includes(q) || (!!it.secondary && it.secondary.toLowerCase().includes(q)),
  )
}

// ---------------------------------------------------------------- selection / filters / search / sort

/**
 * The Basic Selection: a Company Code range when both ends are given (compared as text),
 * otherwise that one code; the Fixing Date; an NDF Value within ±15%; and the trader.
 */
export function filterByCriteria(deals: NdfDeal[], criteria: Selection): NdfDeal[] {
  const cc = criteria.companyCode.trim().toUpperCase()
  const ccTo = criteria.companyCodeTo.trim().toUpperCase()
  const fd = criteria.fixingDate.trim()
  const v = criteria.ndfValue ? parseAmountInput(criteria.ndfValue) : null
  return deals.filter((d) => {
    if (cc && ccTo) {
      if (d.coCode < cc || d.coCode > ccTo) return false
    } else if (cc) {
      if (d.coCode.toUpperCase() !== cc) return false
    }
    if (fd && d.fixingDate !== fd) return false
    if (v !== null && Math.abs(d.ndfValue - v) > v * 0.15) return false
    if (criteria.trader && d.traderCode !== criteria.trader) return false
    return true
  })
}

export const EMPTY_FILTERS: Filters = {
  companyCode: '',
  businessArea: '',
  tsfEntity: '',
  txnType: '',
  partner: '',
  trader: '',
  currency1: '',
  currency2: '',
  status: '',
  fixingDate: '',
}

export function countActiveFilters(f: Filters): number {
  return Object.values(f).filter(Boolean).length
}

const FILTER_FIELD: Record<keyof Filters, keyof NdfDeal> = {
  companyCode: 'coCode',
  businessArea: 'businessArea',
  tsfEntity: 'tsfEntity',
  txnType: 'txnTypeDesc',
  partner: 'partnerName',
  trader: 'trader',
  currency1: 'currency1',
  currency2: 'currency2',
  status: 'txnStatus',
  fixingDate: 'fixingDate',
}

/** The filter panel's options: the distinct values of the deals read from SAP, sorted. */
export function filterPanelOptions(deals: readonly NdfDeal[]): Record<keyof Filters, string[]> {
  const out = {} as Record<keyof Filters, string[]>
  for (const k of Object.keys(FILTER_FIELD) as Array<keyof Filters>) {
    out[k] = [...new Set(deals.map((d) => String(d[FILTER_FIELD[k]])).filter(Boolean))].sort()
  }
  return out
}

/** The filter panel: every select that is not on "All" must match exactly. */
export function applyFilterPanel(deals: NdfDeal[], f: Filters): NdfDeal[] {
  const active = (Object.keys(FILTER_FIELD) as Array<keyof Filters>).filter((k) => f[k])
  return deals.filter((d) => active.every((k) => d[FILTER_FIELD[k]] === f[k]))
}

export function searchDeals(deals: NdfDeal[], search: string): NdfDeal[] {
  const q = search.trim().toLowerCase()
  if (!q) return deals
  return deals.filter((d) =>
    [
      d.transaction,
      d.dealId,
      d.coCode,
      d.businessArea,
      d.partnerName,
      d.txnTypeDesc,
      d.trader,
      d.currency1,
      d.currency2,
      d.txnStatus,
      d.mcReference,
      d.externalRef,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
}

const DATE_FIELDS: SortField[] = ['tradeDate', 'fixingDate', 'valueDate']

/** Numbers numerically, the three dates chronologically, everything else as text. */
export function sortDeals(deals: NdfDeal[], sort: Sort): NdfDeal[] {
  const field = sort.field
  if (!field) return deals
  const dir = sort.dir === 'asc' ? 1 : -1
  return deals.slice().sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    if (DATE_FIELDS.includes(field)) return (parseDMY(String(av)).getTime() - parseDMY(String(bv)).getTime()) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}

/** A header click: the same column flips direction, a new one starts ascending. */
export function nextSort(sort: Sort, field: SortField): Sort {
  return sort.field === field ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
}

/**
 * The page's applyFiltersAndRender: the Basic Selection, minus deals already actioned this
 * session, then the filter panel, the search box and the sort.
 */
export function computeResults(
  deals: NdfDeal[],
  criteria: Selection,
  processedIds: ReadonlySet<string>,
  filters: Filters,
  search: string,
  sort: Sort,
): NdfDeal[] {
  let results = filterByCriteria(deals, criteria)
  results = results.filter((d) => !processedIds.has(d.id))
  results = applyFilterPanel(results, filters)
  results = searchDeals(results, search)
  return sortDeals(results, sort)
}

// ---------------------------------------------------------------- paging

export type Paged = { rows: NdfDeal[]; page: number; totalPages: number; startIdx: number }

/** The current page's rows; a page past the end is pulled back to the last one. */
export function pageOf(rows: NdfDeal[], page: number, pageSize: number): Paged {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const p = page > totalPages ? totalPages : page
  const startIdx = (p - 1) * pageSize
  return { rows: rows.slice(startIdx, startIdx + pageSize), page: p, totalPages, startIdx }
}

/** Up to five page buttons, centred on the current page where there is room. */
export function pagerWindow(page: number, totalPages: number, maxButtons = 5): number[] {
  let start = Math.max(1, page - Math.floor(maxButtons / 2))
  const end = Math.min(totalPages, start + maxButtons - 1)
  start = Math.max(1, end - maxButtons + 1)
  const pages: number[] = []
  for (let p = start; p <= end; p++) pages.push(p)
  return pages
}

/** "Showing 21–40 of 57 deals", or "Showing 0 of 0 deals" when nothing is listed. */
export function resultsMeta(total: number, paged: Paged | null): string {
  if (!paged || total === 0) return 'Showing 0 of 0 deals'
  const last = Math.min(paged.startIdx + paged.rows.length, total)
  return `Showing ${paged.startIdx + 1}–${last} of ${total} deals`
}

// ---------------------------------------------------------------- actions

/** Colour by TXN_STATUS: 13 confirmed, 11 sent back, 12 corrected (back from FO), else pending. */
export function statusClass(statusCode: string): string {
  if (statusCode === TXN.CONFIRMED) return 'status-released'
  if (statusCode === TXN.CORRECTION_REQUIRED || statusCode === TXN.CORRECTED) return 'status-correction'
  return 'status-unmatched'
}
