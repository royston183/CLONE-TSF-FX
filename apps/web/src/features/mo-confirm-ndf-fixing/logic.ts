/**
 * The page's business rules as pure functions so the component only holds state: the Basic
 * Selection applied to the transactions read from SAP (api.ts), the filter panel, search, sort
 * and paging. Nothing here changes a deal: Match & Release is a SAP call and the list is
 * re-read from SAP afterwards.
 */
import { STATUS } from './data.ts'
import { parseDMY } from './format.ts'
import type { DropdownItem, Filters, NdfDeal, NdfStatus, Selection, SelectionErrors, Sort, SortField } from './types.ts'

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
 * otherwise that one code; and the Fixing Date. The old program compared the Fixing Date with
 * V_DATE, which is the transaction's value date, so that is what is compared here.
 *
 * Trader and NDF Value are not applied: the FxTransaction service has neither the trader of a
 * transaction nor an NDF value, and filtering on a blank would hide every deal. See
 * unappliedCriteria, which View Deals reports to the user.
 */
export function filterByCriteria(deals: NdfDeal[], criteria: Selection): NdfDeal[] {
  const cc = criteria.companyCode.trim().toUpperCase()
  const ccTo = criteria.companyCodeTo.trim().toUpperCase()
  const fd = criteria.fixingDate.trim()
  return deals.filter((d) => {
    if (cc && ccTo) {
      if (d.coCode < cc || d.coCode > ccTo) return false
    } else if (cc) {
      if (d.coCode.toUpperCase() !== cc) return false
    }
    if (fd && d.valueDate !== fd) return false
    return true
  })
}

/** The Basic Selection entries the SAP service cannot apply, by the label the screen shows. */
export function unappliedCriteria(criteria: Selection): string[] {
  const out: string[] = []
  if (criteria.trader) out.push('Trader Name')
  if (criteria.ndfValue.trim()) out.push('NDF Value')
  return out
}

/** Match & Release settles an open deal only: one already matched & released is settled in SAP. */
export function canMatchRelease(deal: NdfDeal | null): boolean {
  return !!deal && deal.txnStatus !== STATUS.RELEASED
}

/** The distinct non-blank values of a field, sorted: what a filter select offers. */
export function distinctOptions(deals: readonly NdfDeal[], field: keyof NdfDeal): string[] {
  return [...new Set(deals.map((d) => String(d[field] ?? '')).filter(Boolean))].sort()
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

/** A dd-mm-yyyy date as a sortable number; blank sorts first. */
const dayOf = (dmy: string): number => (dmy ? parseDMY(dmy).getTime() : 0)

const DATE_FIELDS: SortField[] = ['tradeDate', 'fixingDate', 'valueDate']

/** Numbers numerically, the three dates chronologically, everything else as text. */
export function sortDeals(deals: NdfDeal[], sort: Sort): NdfDeal[] {
  const field = sort.field
  if (!field) return deals
  const dir = sort.dir === 'asc' ? 1 : -1
  return deals.slice().sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    // A value SAP does not provide (null / blank) sorts before any real one.
    if (typeof av === 'number' || typeof bv === 'number' || av === null || bv === null)
      return ((typeof av === 'number' ? av : Number.NEGATIVE_INFINITY) - (typeof bv === 'number' ? bv : Number.NEGATIVE_INFINITY) || 0) * dir
    if (DATE_FIELDS.includes(field)) return (dayOf(String(av)) - dayOf(String(bv))) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}

/** A header click: the same column flips direction, a new one starts ascending. */
export function nextSort(sort: Sort, field: SortField): Sort {
  return sort.field === field ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }
}

/**
 * The page's applyFiltersAndRender: the Basic Selection, then the filter panel, the search box
 * and the sort.
 */
export function computeResults(
  deals: NdfDeal[],
  criteria: Selection,
  filters: Filters,
  search: string,
  sort: Sort,
): NdfDeal[] {
  let results = filterByCriteria(deals, criteria)
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

export function statusClass(status: NdfStatus): string {
  if (status === STATUS.RELEASED) return 'status-released'
  if (status === STATUS.CORRECTION) return 'status-correction'
  return 'status-unmatched'
}
