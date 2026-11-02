/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. The original never called an API: corrections and reversals
 * change the in-memory rows for the session only.
 */
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO, FO_REVIEWER, STATUS, STATUS_KEY, STATUS_SHORT, acctCatDesc, baOf, partnerOf } from './data.ts'
import { fmtDate, fmtNum, fmtRate, parseAmountShorthand, parseRate, safeParseDate } from './format.ts'
import type { CorrectionForm, DropAction, Filters, ReverseScope, Sort, SortKey, StatusFilter, Txn } from './types.ts'

/**
 * Only rows that can still be worked can be selected, dragged, corrected or reversed: Correction Required (the sample
 * rows) and Open (a live SAP transaction, whose Correction Required status SAP does not hold). Reversed and Released
 * rows are read-only.
 */
export const isActionable = (t: Txn) => t.status === STATUS.ERRCORR || t.status === STATUS.OPEN

// ---------------------------------------------------------------- filtering / sorting

export const DEFAULT_FILTERS: Filters = {
  q: '',
  coCode: 'ALL',
  trader: 'ALL',
  dateFrom: DEFAULT_DATE_FROM,
  dateTo: DEFAULT_DATE_TO,
}

/**
 * Every value rendered anywhere in a row's table cells, in one place, so the search box
 * matches against every column (plus the Account Cat description the popup shows).
 */
export function rowSearchValues(t: Txn): string[] {
  return [
    STATUS_SHORT[t.status],
    t.rfha,
    t.dealId,
    t.dealIdDesc,
    t.mc,
    t.coCode,
    t.companyName,
    t.tsfEntity,
    t.prodType,
    t.prodTypeDesc,
    t.txnType,
    t.txnTypeDesc,
    t.partnerCode,
    t.partnerName,
    t.buySell1,
    t.ccy1,
    fmtNum(t.amt1),
    t.buySell2,
    t.ccy2,
    fmtNum(t.amt2),
    fmtRate(t.spotRate),
    fmtRate(t.swapRate),
    fmtRate(t.allInRate),
    fmtDate(t.tradeDate),
    fmtDate(t.valueDate),
    t.blotterDate ? fmtDate(t.blotterDate) : '',
    t.busArea,
    t.busAreaDesc,
    t.profitCenter,
    t.profitCenterDesc,
    t.traderCode,
    t.traderName,
    t.modeOfTrade,
    t.acctCat,
    acctCatDesc(t.acctCat) ?? '',
    t.moRemark,
    t.changedBy,
    t.changedOn ? fmtDate(t.changedOn) : '',
  ]
}

export function matchesFilters(t: Txn, f: Filters, status: StatusFilter): boolean {
  const from = safeParseDate(f.dateFrom) ?? new Date(1900, 0, 1)
  const to = safeParseDate(f.dateTo) ?? new Date(2999, 0, 1)
  // Older transactions without an APP_STR date remain visible until a date has been recorded.
  if (t.blotterDate && (t.blotterDate < from || t.blotterDate > to)) return false
  if (f.coCode !== 'ALL' && t.coCode !== f.coCode) return false
  if (f.trader !== 'ALL' && t.traderCode !== f.trader) return false
  if (status !== 'ALL' && STATUS_KEY[t.status] !== status) return false
  const q = f.q.trim().toLowerCase()
  if (q && !rowSearchValues(t).join(' ').toLowerCase().includes(q)) return false
  return true
}

function sortValue(t: Txn, key: SortKey): number | string {
  const v = t[key]
  if (v instanceof Date) return v.getTime()
  return v.toLowerCase()
}

/**
 * The legacy sort, which ran in place on the already-displayed list. `prior` is that list's
 * order: ties keep it, so sorting by Deal ID after Trade Date leaves a deal's two legs in
 * Trade Date order, exactly as the stable in-place sort did. Without it ties keep list order.
 */
export function sortTxns(list: Txn[], sort: Sort, prior?: readonly string[] | null): Txn[] {
  let base = list.slice()
  if (prior) {
    const rank = new Map(prior.map((r, i) => [r, i]))
    base = base.sort((a, b) => (rank.get(a.rfha) ?? Infinity) - (rank.get(b.rfha) ?? Infinity))
  }
  return base.sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av < bv) return -1 * sort.dir
    if (av > bv) return 1 * sort.dir
    return 0
  })
}

/** A header click: the same column flips direction, a new one starts ascending. */
export const nextSort = (sort: Sort, key: SortKey): Sort =>
  sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 }

/** The page's applyFilters: the queue narrowed by every filter, then sorted for the table. */
export function filterTxns(
  list: Txn[],
  filters: Filters,
  status: StatusFilter,
  sort: Sort,
  prior?: readonly string[] | null,
): Txn[] {
  return sortTxns(
    list.filter((t) => matchesFilters(t, filters, status)),
    sort,
    prior,
  )
}

// ---------------------------------------------------------------- paging

export function pageOf<T>(list: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
  const current = Math.min(page, totalPages)
  const startIdx = (current - 1) * pageSize
  return {
    rows: list.slice(startIdx, startIdx + pageSize),
    totalPages,
    page: current,
    /** 1-based first and last row shown, 0 when empty — for "Showing a-b of n". */
    first: list.length ? startIdx + 1 : 0,
    last: Math.min(list.length, current * pageSize),
  }
}

/** Up to two page buttons either side of the current page. */
export function pagerWindow(page: number, totalPages: number): number[] {
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

// ---------------------------------------------------------------- selection

/**
 * The selected transactions in the order they were ticked — the order the page's checked-set
 * object enumerated its (non-index) keys in. Selection survives filtering: a ticked row that
 * is filtered out of view stays selected. One no longer Correction Required is dropped.
 */
export function checkedTxns(list: Txn[], checked: readonly string[]): Txn[] {
  return checked.map((r) => list.find((t) => t.rfha === r)).filter((t): t is Txn => !!t && isActionable(t))
}

/** Ticks or clears one row; anything not Correction Required is never selectable. */
export function toggleChecked(checked: readonly string[], t: Txn, on: boolean): string[] {
  const without = checked.filter((r) => r !== t.rfha)
  if (!isActionable(t)) return without
  return on ? (checked.includes(t.rfha) ? checked.slice() : [...checked, t.rfha]) : without
}

/** The header checkbox: ticks or clears every Correction Required row on the current page only. */
export function setPageChecked(checked: readonly string[], pageRows: Txn[], on: boolean): string[] {
  let next = checked.slice()
  for (const t of pageRows) if (isActionable(t)) next = toggleChecked(next, t, on)
  return next
}

/** The header checkbox's state for the page shown. */
export function selectAllState(pageRows: Txn[], checked: readonly string[]): { checked: boolean; disabled: boolean } {
  const eligible = pageRows.filter(isActionable)
  return {
    checked: eligible.length > 0 && eligible.every((t) => checked.includes(t.rfha)),
    disabled: eligible.length === 0,
  }
}

/** The "FX Error Correction" action button: exactly one selected transaction, or why not. */
export function correctionTarget(selected: Txn[]): { rfha: string } | { error: string } {
  const [first] = selected
  if (!first) return { error: 'Select one Correction Required transaction first.' }
  if (selected.length !== 1) return { error: 'FX Error Correction can be opened for one transaction at a time.' }
  return { rfha: first.rfha }
}

// ---------------------------------------------------------------- drag and drop

/**
 * What a drag starting on this row carries: the full current selection when the row is part
 * of it, just that row otherwise; nothing for a row that is not Correction Required.
 */
export function dragPayload(t: Txn, checked: readonly string[], selected: Txn[]): string[] {
  if (!isActionable(t)) return []
  return checked.includes(t.rfha) ? selected.map((s) => s.rfha) : [t.rfha]
}

export type DropOutcome =
  | { kind: 'none' }
  | { kind: 'correct'; rfha: string }
  | { kind: 'reverse'; rfhas: string[] }
  | { kind: 'error'; message: string }

/**
 * Dropped on "FX Error Correction" the drag opens the correction popup (one transaction only);
 * dropped on "Reverse" it opens the Reverse confirmation for every transaction dragged.
 */
export function dropOutcome(action: DropAction, dragged: readonly string[]): DropOutcome {
  const [first] = dragged
  if (!first) return { kind: 'none' }
  if (action === 'reverse') return { kind: 'reverse', rfhas: dragged.slice() }
  if (dragged.length === 1) return { kind: 'correct', rfha: first }
  return {
    kind: 'error',
    message: `Drag exactly one transaction onto FX Error Correction - ${dragged.length} were selected.`,
  }
}

// ---------------------------------------------------------------- FX Error Correction

/** New Details pre-filled with the transaction's current values. */
export function formFromTxn(t: Txn): CorrectionForm {
  return {
    partner: t.partnerCode,
    allInRate: fmtRate(t.allInRate),
    swapRate: fmtRate(t.swapRate),
    spotRate: fmtRate(t.spotRate),
    amount1: fmtNum(t.amt1),
    amount2: fmtNum(t.amt2),
    valueDate: fmtDate(t.valueDate),
    busArea: t.busArea,
    profitCenter: t.profitCenterDesc,
    acctCat: t.acctCat,
    modeOfTrade: t.modeOfTrade,
    mc: t.mc,
    dealId: t.dealId,
    tradeDate: fmtDate(t.tradeDate),
    blotterDate: t.blotterDate ? fmtDate(t.blotterDate) : '',
  }
}

/** A rate input on blur: four places, or 0.0000 when it is not a number. */
export function normaliseRate(value: string): string {
  const v = parseRate(value)
  return Number.isNaN(v) ? '0.0000' : v.toFixed(4)
}

/** The derived Amount 2: Amount 1 (shorthand allowed) × Spot Rate. */
export const deriveAmount2 = (amount1: string, spotRate: string) =>
  fmtNum(parseAmountShorthand(amount1) * (parseRate(spotRate) || 0))

/** The derived Profit Center shown for a Business Area; blank for an unknown one. */
export const deriveProfitCenter = (busArea: string) => baOf(busArea)?.profitCenterDesc ?? ''

/**
 * The page's submitCorrection: the New Details written back and the transaction released to
 * MO. As there, an All-in or Spot Rate that reads as 0 or blank keeps the old rate, a Swap Rate
 * falls to 0, Amount 2 is recomputed from the saved Amount 1 × Spot Rate, and an unreadable
 * date keeps the old one.
 */
export function applyCorrection(t: Txn, form: CorrectionForm, now: Date): Txn {
  const ba = baOf(form.busArea)
  const spotRate = parseRate(form.spotRate) || t.spotRate
  const amt1 = parseAmountShorthand(form.amount1)
  return {
    ...t,
    partnerCode: form.partner,
    partnerName: partnerOf(form.partner)?.name ?? t.partnerName,
    allInRate: parseRate(form.allInRate) || t.allInRate,
    swapRate: parseRate(form.swapRate) || 0,
    spotRate,
    amt1,
    amt2: amt1 * spotRate,
    valueDate: safeParseDate(form.valueDate) ?? t.valueDate,
    ...(ba
      ? { busArea: ba.code, busAreaDesc: ba.name, profitCenter: ba.profitCenter, profitCenterDesc: ba.profitCenterDesc }
      : {}),
    acctCat: form.acctCat,
    modeOfTrade: form.modeOfTrade,
    mc: form.mc,
    dealId: form.dealId,
    tradeDate: safeParseDate(form.tradeDate) ?? t.tradeDate,
    blotterDate: safeParseDate(form.blotterDate) ?? t.blotterDate,
    status: STATUS.RESUB,
    changedBy: FO_REVIEWER,
    changedOn: now,
  }
}

// ---------------------------------------------------------------- reverse

/** The transactions a Reverse scope stands for, resolved against the current rows. */
export function resolveReverseScope(list: Txn[], scope: ReverseScope, checked: readonly string[]): Txn[] {
  if (scope === 'bulk') return checkedTxns(list, checked)
  if (Array.isArray(scope)) return scope.map((r) => list.find((t) => t.rfha === r)).filter((t): t is Txn => !!t)
  return list.filter((t) => t.rfha === scope)
}

/** The Reverse popup's heading line. */
export const reverseSubtitle = (ts: Txn[]) => {
  const [first] = ts
  return ts.length === 1 && first ? `Transaction ${first.rfha} – Deal ${first.dealId}` : `${ts.length} transactions selected`
}

/**
 * BAPI_FTR_FXT_REVERSE in the demo: the transactions are Reversed, an optional remark is
 * appended to the MO Remark for the audit trail, and Changed By/On are stamped.
 */
export function reverseTxns(list: Txn[], rfhas: readonly string[], reason: string, now: Date): Txn[] {
  const targets = new Set(rfhas)
  const note = reason.trim()
  return list.map((t) =>
    targets.has(t.rfha)
      ? {
          ...t,
          status: STATUS.REVERSED,
          moRemark: note ? `${t.moRemark} [FO: ${note}]` : t.moRemark,
          changedBy: FO_REVIEWER,
          changedOn: now,
        }
      : t,
  )
}

export const reverseToast = (ts: Txn[]) => {
  const [first] = ts
  return `${ts.length === 1 && first ? `Transaction ${first.rfha}` : `${ts.length} transactions`} reversed.`
}

// ---------------------------------------------------------------- CSV export

const CSV_COLS = [
  'rfha', 'dealId', 'dealIdDesc', 'mc', 'coCode', 'companyName', 'tsfEntity', 'prodType', 'prodTypeDesc',
  'txnType', 'txnTypeDesc', 'partnerCode', 'partnerName', 'ccy1', 'amt1', 'ccy2', 'amt2', 'spotRate', 'swapRate', 'allInRate',
  'busArea', 'busAreaDesc', 'profitCenterDesc', 'traderCode', 'traderName', 'modeOfTrade', 'acctCat', 'moRemark',
] as const satisfies ReadonlyArray<keyof Txn>

const CSV_HEADER = [
  'Transaction', 'Deal ID', 'Deal ID Description', 'Master Contract', 'CoCode', 'Company Name', 'TSF Entity',
  'Product ty', 'Product Type Desc', 'Transactio', 'Transaction Type Description', 'Partner', 'Partner Name', 'Currency 1',
  'Amount 1', 'Currency 2', 'Amount 2', 'Spot Rate', 'Swap Rate', 'All in Rate', 'Bus. Area', 'Bus. Area Desc', 'Profit Center',
  'Trader Cod', 'Trader Name', 'Mode Of Trade', 'Account Cat', 'MO Remark', 'Txn Status Desc', 'Trade Date', 'Value Date', 'Blotter Date',
  'NDF Settlement Rate', 'Cash Settlement Amount', 'Cash Currency',
]

export const CSV_FILENAME = 'fx-error-correction-export.csv'

export function csvEsc(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_RATE_COLS: ReadonlySet<string> = new Set(['spotRate', 'swapRate', 'allInRate'])

/** The rows as the page exported them: raw numbers (rates to four places), then status and the three dates. */
export function buildCsv(rows: Txn[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const t of rows) {
    const row = CSV_COLS.map((c) => csvEsc(CSV_RATE_COLS.has(c) ? fmtRate(t[c] as number) : t[c]))
    row.push(csvEsc(STATUS_SHORT[t.status]), csvEsc(fmtDate(t.tradeDate)), csvEsc(fmtDate(t.valueDate)), csvEsc(t.blotterDate ? fmtDate(t.blotterDate) : ''))
    row.push(csvEsc(t.ndfRate != null ? fmtRate(t.ndfRate) : ''), csvEsc(t.cashAmount != null ? t.cashAmount : ''), csvEsc(t.cashCurrency ?? ''))
    lines.push(row.join(','))
  }
  return lines.join('\n')
}
