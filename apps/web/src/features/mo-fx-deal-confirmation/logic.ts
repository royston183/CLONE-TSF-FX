/**
 * The page's business rules as pure functions so the component only holds state. The queue is
 * rebuilt from the backend on every load (APP_STR + FxTransaction); the in-memory list only mirrors
 * what the backend has just accepted.
 */
import { FX_TXN_STATUS } from '../../shared/fx/txn-status.ts'
import { COMPANY_CODES, dealStatusOf, COMPANY_INFO, PARTNERS, STATUS, STATUSES, TRADERS, TXN_TYPES } from './data.ts'
import { parseDDMMYYYY } from './format.ts'
import type { MoDone } from './workflow.ts'
import type {
  AppliedSelection,
  CalendarCell,
  ComboOption,
  Deal,
  DealStatus,
  DealSummary,
  DragMode,
  Filters,
  SelectOption,
  SelectionForm,
  Sort,
  SortKey,
} from './types.ts'

// ---------------------------------------------------------------- selection screen

export const EMPTY_SELECTION: SelectionForm = {
  companyCodeText: '',
  companyCode: '',
  companyCodeToText: '',
  companyCodeTo: '',
  blotterDate: '',
  traderText: '',
  trader: '',
  layout: '',
  displayType: 'FX',
}

/** View Deals only runs with an Upto Blotter Date the page can read. */
export const isBlotterDateValid = (s: string) => !!s && parseDDMMYYYY(s) !== null

export const applySelection = (form: SelectionForm): AppliedSelection => ({
  upTo: parseDDMMYYYY(form.blotterDate),
  companyCode: form.companyCode,
  companyCodeTo: form.companyCodeTo,
  trader: form.trader,
  displayType: form.displayType,
})

export const COMPANY_OPTIONS: ComboOption[] = COMPANY_CODES.map((c) => {
  const name = COMPANY_INFO[c]?.companyName ?? ''
  return { code: c, display: c, searchText: `${c} ${name}`, sub: name }
})

export const TRADER_OPTIONS: ComboOption[] = TRADERS.map((t) => ({
  code: t.code,
  display: `${t.code} - ${t.name}`,
  searchText: `${t.code} ${t.name}`,
  sub: '',
}))

/** The combobox list for what is typed: a case-insensitive substring of the option's text. */
export function filterComboOptions(options: readonly ComboOption[], text: string): ComboOption[] {
  const ft = text.toLowerCase()
  return options.filter((o) => o.searchText.toLowerCase().includes(ft))
}

/**
 * Company codes in the From..To range, compared as strings over the code list (so the range
 * follows code order, not list order). From after To selects nothing, as on the page.
 */
export const companyCodesInRange = (from: string, to: string) => COMPANY_CODES.filter((c) => c >= from && c <= to)

/** The company codes a selection reads from SAP: the range, the one code, or every code of the screen. */
export function selectedCompanyCodes(s: Pick<AppliedSelection, 'companyCode' | 'companyCodeTo'>): string[] {
  if (!s.companyCode) return [...COMPANY_CODES]
  return s.companyCodeTo ? companyCodesInRange(s.companyCode, s.companyCodeTo) : [s.companyCode]
}

// ---------------------------------------------------------------- filter panel

export const EMPTY_FILTERS: Filters = { coCode: '', txnType: '', partner: '', trader: '', ccy1: '', ccy2: '', status: '' }

/** Each filter dropdown's options (after its "All"), as the page's populateFilterOptions built them. */
export function filterOptions(deals: readonly Deal[]): Record<keyof Filters, SelectOption[]> {
  const ccys = new Set<string>()
  for (const d of deals) {
    ccys.add(d.currency1)
    ccys.add(d.currency2)
  }
  const ccyList = [...ccys].sort().map((c) => ({ value: c, label: c }))
  return {
    coCode: COMPANY_CODES.map((c) => ({ value: c, label: c })),
    txnType: TXN_TYPES.map((t) => ({ value: t.code, label: `${t.code} - ${t.desc}` })),
    partner: PARTNERS.map((p) => ({ value: p.code, label: `${p.code} - ${p.name}` })),
    trader: TRADERS.map((t) => ({ value: t.code, label: `${t.code} - ${t.name}` })),
    ccy1: ccyList,
    ccy2: ccyList,
    status: STATUSES.filter((s) => s !== STATUS.MATCHED).map((s) => ({ value: s, label: s })),
  }
}

// ---------------------------------------------------------------- filter / search / sort

/** The text the search box matches against, case-insensitively and untrimmed. */
export const searchHaystack = (d: Deal) =>
  `${d.dealId} ${d.id} ${d.transaction} ${d.partnerName} ${d.traderName} ${d.status} ${d.coCode} ${d.txnTypeDesc}`.toLowerCase()

function sortValue(d: Deal, key: SortKey): number | string {
  const v = d[key]
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') return v.toLowerCase()
  return v
}

export function sortDeals(list: readonly Deal[], sort: Sort): Deal[] {
  const { key } = sort
  if (!key) return list.slice()
  const dir = sort.dir === 'asc' ? 1 : -1
  return list.slice().sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
}

/** A header click: the same column flips direction, a new one starts ascending. */
export const nextSort = (sort: Sort, key: SortKey): Sort =>
  sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }

/**
 * The page's getFilteredDeals. Only the chosen Display Type, and never a Matched & Released
 * deal: once released it is complete and leaves the MO action queue, so it can no longer take
 * a further Match & Release / Correction Required. Then the selection criteria, the filter
 * panel, the search box and the sort, in that order.
 */
export function filterDeals(
  deals: readonly Deal[],
  selection: AppliedSelection,
  filters: Filters,
  search: string,
  sort: Sort,
): Deal[] {
  let list = deals.filter((d) => d.dealType === selection.displayType && d.status !== STATUS.MATCHED)

  if (selection.companyCode) {
    if (selection.companyCodeTo) {
      const codes = companyCodesInRange(selection.companyCode, selection.companyCodeTo)
      list = list.filter((d) => codes.includes(d.coCode))
    } else {
      list = list.filter((d) => d.coCode === selection.companyCode)
    }
  }
  // A SAP deal whose APP_STR record carries no trader cannot be told apart by trader, so it stays listed
  // rather than vanishing; a deal with a trader, and every sample Options row, is narrowed.
  if (selection.trader) list = list.filter((d) => d.traderCode === selection.trader || (d.live && !d.traderCode))

  const f = filters
  if (f.coCode) list = list.filter((d) => d.coCode === f.coCode)
  if (f.txnType) list = list.filter((d) => d.txnTypeCode === f.txnType)
  if (f.partner) list = list.filter((d) => d.partnerCode === f.partner)
  if (f.trader) list = list.filter((d) => d.traderCode === f.trader)
  if (f.ccy1) list = list.filter((d) => d.currency1 === f.ccy1)
  if (f.ccy2) list = list.filter((d) => d.currency2 === f.ccy2)
  if (f.status) list = list.filter((d) => d.status === f.status)

  if (search) {
    const q = search.toLowerCase()
    list = list.filter((d) => searchHaystack(d).includes(q))
  }

  return sortDeals(list, sort)
}

export const dealCountLabel = (total: number) => `${total}${total === 1 ? ' deal' : ' deals'}`

export function statusClass(status: DealStatus): string {
  if (status === STATUS.CORRECTION) return 'status-correction'
  if (status === STATUS.MATCHED) return 'status-matched'
  if (status === STATUS.CORRECTED) return 'status-corrected'
  return 'status-unmatched'
}

// ---------------------------------------------------------------- paging

/** The page's slice of the list; a page past the end (rows just left the queue) clamps back. */
export function pageOf<T>(list: readonly T[], page: number, pageSize: number) {
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, totalPages)
  const startIdx = (current - 1) * pageSize
  const rows = list.slice(startIdx, startIdx + pageSize)
  return { rows, total, totalPages, page: current, startIdx }
}

export function paginationInfo(total: number, startIdx: number, shown: number): string {
  if (total === 0) return 'Showing 0-0 of 0 deals'
  return `Showing ${startIdx + 1}-${startIdx + shown} of ${total} deals`
}

/** Up to five page buttons, centred on the current page where there is room. */
export function pagerWindow(page: number, totalPages: number): number[] {
  const maxButtons = 5
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + maxButtons - 1)
  start = Math.max(1, end - maxButtons + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

// ---------------------------------------------------------------- row selection

/**
 * A click on the row outside the checkbox column: the selection becomes just this row, or is
 * cleared if this was already the only row selected.
 */
export function rowClickSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  if (selected.size === 1 && selected.has(id)) return new Set()
  return new Set([id])
}

/** A checkbox-column drag started on a selected row clears; on an unselected one, it selects. */
export const dragModeFor = (selected: ReadonlySet<string>, id: string): DragMode => (selected.has(id) ? 'deselect' : 'select')

/**
 * The drag sweep from the anchor row to the row under the pointer, on the current page. Like
 * the page it only ever adds (or only removes) rows — sweeping back toward the anchor leaves
 * what was already swept — and a plain click is the one-row range, a single toggle.
 */
export function applyDragRange(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
  fromIndex: number,
  toIndex: number,
  mode: DragMode,
): Set<string> {
  const next = new Set(selected)
  const lo = Math.min(fromIndex, toIndex)
  const hi = Math.max(fromIndex, toIndex)
  for (let i = lo; i <= hi; i++) {
    const id = pageIds[i]
    if (id === undefined) continue
    if (mode === 'select') next.add(id)
    else next.delete(id)
  }
  return next
}

/**
 * The selected deals, in list order. The selection is kept across filter, search and page
 * changes, so this can include deals the table is not currently showing.
 */
/** How a deal is named in messages: its Deal ID, or its transaction number when it is on none. */
export const dealLabel = (d: Deal): string => d.dealId || d.transaction

export const selectedDeals = (deals: readonly Deal[], selected: ReadonlySet<string>) => deals.filter((d) => selected.has(d.id))

// ---------------------------------------------------------------- deals from SAP

/**
 * The queue after (re)reading the FX deals from the backend: they replace every FX row, the Options rows (dummy
 * data) are kept. The status is whatever APP_STR holds; nothing is carried over from the session.
 */
export function mergeLiveDeals(current: readonly Deal[], live: readonly Deal[]): Deal[] {
  return [...live, ...current.filter((d) => d.dealType !== 'FX')]
}

/** The Options rows alone: the starting queue before the FX deals have been read from SAP. */
export const withoutFxDeals = (deals: readonly Deal[]): Deal[] => deals.filter((d) => d.dealType !== 'FX')

// ---------------------------------------------------------------- match & release / correction

/** The modals' info strip and Cover No for one deal, or a summary for several. */
export function dealSummary(deals: readonly Deal[]): DealSummary {
  const [first] = deals
  const over = deals.filter((d) => d.overUtilised)
  const warning = over.length
    ? `Limit management: Deal ID ${[...new Set(over.map((d) => d.dealId))].join(', ')} is over its utilisation limit. This is a warning only; you can still continue.`
    : undefined
  const base: DealSummary =
    deals.length === 1 && first
      ? { dealId: first.dealId || '–', partner: first.partnerName, coverNo: first.transaction }
      : { dealId: `${deals.length} deals selected`, partner: deals.map(dealLabel).join(', '), coverNo: `${deals.length} deals selected` }
  return warning ? { ...base, warning } : base
}

/**
 * Mirrors what the backend accepted into the queue: each finished deal takes its new status and remark. A deal now
 * Matched & Released (07 / 59) is filtered out of the queue by filterDeals; one sent to FO (04) stays, as Correction Required.
 */
export function applyDone(deals: readonly Deal[], done: readonly MoDone[]): Deal[] {
  const byId = new Map(done.map((d) => [d.id, d]))
  return deals.map((d) => {
    const r = byId.get(d.id)
    if (!r) return d
    return { ...d, txnStatus: r.txnStatus, status: dealStatusOf(r.txnStatus), moRemark: r.moRemark || d.moRemark }
  })
}

/** The sample Options rows have no backend: their Match & Release only changes the in-memory list. */
export function matchReleaseDeals(deals: readonly Deal[], ids: ReadonlySet<string>, remarks: string): Deal[] {
  return deals.map((d) => (ids.has(d.id) ? { ...d, status: STATUS.MATCHED, txnStatus: FX_TXN_STATUS.MO_MATCH_RELEASE, moRemark: remarks || '' } : d))
}

/** A correction must give a reason: it becomes the MO remark FO sees. */
export const isCorrectionValid = (remarks: string) => remarks.trim() !== ''

/** The sample Options rows' Correction Required, in memory only. */
export function markCorrectionRequired(deals: readonly Deal[], ids: ReadonlySet<string>, remarks: string): Deal[] {
  return deals.map((d) =>
    ids.has(d.id) ? { ...d, status: STATUS.CORRECTION, txnStatus: FX_TXN_STATUS.MO_TO_FO_CORRECTION, moRemark: remarks.trim() } : d,
  )
}

export function matchReleaseMessage(deals: readonly Deal[]): string {
  const [first] = deals
  return deals.length === 1 && first
    ? `Deal ${dealLabel(first)} matched and released successfully.`
    : `${deals.length} deals matched and released successfully.`
}

export function correctionMessage(deals: readonly Deal[]): string {
  const [first] = deals
  return deals.length === 1 && first
    ? `Deal ${dealLabel(first)} was sent back to FO for correction.`
    : `${deals.length} deals were sent back to FO for correction.`
}

// ---------------------------------------------------------------- calendar

/** Moves the calendar by whole months, wrapping the year. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/**
 * The Upto Blotter Date calendar grid: the previous month's tail (muted), this month's days,
 * then the next month's head (muted) to fill the last week. Only this month's days are
 * clickable, and a day can be both today and selected.
 */
export function calendarCells(year: number, month: number, selected: Date | null, today: Date): CalendarCell[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const same = (a: Date | null, day: number) =>
    !!a && a.getFullYear() === year && a.getMonth() === month && a.getDate() === day

  const cells: CalendarCell[] = []
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: prevDays - firstDay + i + 1, muted: true, today: false, selected: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false, today: same(today, d), selected: same(selected, d) })
  }
  const trailing = (7 - ((firstDay + daysInMonth) % 7)) % 7
  for (let t = 1; t <= trailing; t++) cells.push({ day: t, muted: true, today: false, selected: false })
  return cells
}
