/*
 * Pure business rules of the Premature Settlement screen, lifted from the legacy script so
 * they can be unit-tested and later wired to a backend. No React, no DOM.
 */
import { BP_MASTER, DEAL_DIRECTORY, TXN_TYPE_LABEL, TXN_TYPE_MASTER, genDealLegs } from './data.ts'
import { fmtAmt } from './format.ts'
import type { BookingForm, DdOption, Filters, Kpis, Leg, PairForm, Sort, SortField, UnwindForm } from './types.ts'

export const FORWARD = '619'
export const DEFAULT_SORT: Sort = { field: 'rfha', dir: 'asc' }
export const DEFAULT_FILTERS: Filters = { type: '', status: '' }
export const PAGE_SIZES = [5, 10, 25] as const
export const DEFAULT_PAGE_SIZE = 10
export const STATUS_OPTIONS = ['Active', 'Confirmed', 'Pre-Matured', 'Rolled Over', 'Unwound'] as const
/** Same key order the legacy page appended the options in (Object.keys of the label map). */
export const TYPE_FILTER_OPTIONS: readonly { value: string; label: string }[] = Object.keys(TXN_TYPE_LABEL).map((code) => ({
  value: code,
  label: TXN_TYPE_LABEL[code] ?? code,
}))

export const BP_OPTIONS: readonly DdOption[] = BP_MASTER.map((b) => ({ value: b.bp, primary: b.bp, secondary: b.shortName }))
export const TYPE_OPTIONS: readonly DdOption[] = TXN_TYPE_MASTER.map((t) => ({ value: t.code, primary: t.text }))

export const EMPTY_STATE_NO_DEAL = 'Enter a Deal ID in Basic Selection and click Load Deal to see its transactions.'
export const EMPTY_STATE_NO_MATCH = 'No transactions match your search or filters.'
export const ROW_TITLE = 'Click to select · double-click to view transaction · drag onto an action button'

export const MSG = {
  enterDealId: 'Please enter a Deal ID.',
  alreadyPm: 'Premature Settlement Already Done..',
  notForward: 'Please select the FX txn to do a Early Delivery.',
  alreadyUnwound: 'Unwinding Already Done..',
  newTradeAfterValue: 'Trade date is greater than the Value date for New Booking.',
  cancelTradeAfterValue: 'Trade date is greater than the Value date for Cancellation.',
  earlyCancelBeforeNew: 'Cancellation Value Date cannot be earlier than the New Booking Value Date.',
  rollCancelAfterNew: 'Cancellation Value Date cannot be later than the New Booking Value Date.',
  mandatory: 'Please fill all mandatory fields.',
  unwindTradeAfterValue: 'Trade date is greater than the Value date.',
  earlyDone: 'Premature Settlement Created Successfully',
  unwindDone: 'Unwinding Succesfully Done..',
  rollDone: 'Rollover transaction created successfully.',
} as const

/* ---------------- Load deal ---------------- */

export type LoadResult = { ok: true; dealId: string; legs: Leg[] } | { ok: false; message: string }

/** Known deals come from the directory; anything else is generated deterministically. Always copies. */
export function loadDeal(raw: string): LoadResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, message: MSG.enterDealId }
  const dealId = trimmed.toUpperCase()
  const legs = (DEAL_DIRECTORY[dealId] ?? genDealLegs(dealId)).map((l) => ({ ...l }))
  return { ok: true, dealId, legs }
}

export const loadToast = (count: number, dealId: string) => `${count} transaction(s) loaded for Deal ${dealId}.`
export const txnCount = (n: number) => `${n}${n === 1 ? ' transaction' : ' transactions'}`

/* ---------------- KPIs ---------------- */

export function kpis(legs: readonly Leg[]): Kpis {
  return {
    total: legs.length,
    eligible: legs.filter((l) => l.sfhaart === FORWARD && !l.ztsf_pre_mature && !l.ztsf_unwind).length,
    pm: legs.filter((l) => l.ztsf_pre_mature).length,
    unw: legs.filter((l) => l.ztsf_unwind).length,
  }
}

/* ---------------- Table ---------------- */

export function statusTextClass(txnDesc: string): string {
  if (txnDesc === 'Active') return 'status-text-active'
  if (txnDesc === 'Confirmed') return 'status-text-confirmed'
  if (txnDesc === 'Pre-Matured') return 'status-text-prematured'
  if (txnDesc === 'Rolled Over') return 'status-text-rolled'
  if (txnDesc === 'Unwound') return 'status-text-unwound'
  return 'status-text-confirmed'
}

export const typeLabel = (code: string) => TXN_TYPE_LABEL[code] ?? code

export function filterSort(legs: readonly Leg[], search: string, filters: Filters, sort: Sort): Leg[] {
  let list = legs.slice()
  const q = search.trim().toLowerCase()
  if (q) list = list.filter((l) => `${l.rfha} ${l.bpName} ${l.cpair} ${l.bukrs} ${l.zuonr}`.toLowerCase().includes(q))
  if (filters.type) list = list.filter((l) => l.sfhaart === filters.type)
  if (filters.status) list = list.filter((l) => l.txnDesc === filters.status)

  const { field, dir } = sort
  const key = (l: Leg): string | number => {
    const v = l[field]
    return typeof v === 'string' ? v.toLowerCase() : v
  }
  list.sort((a, b) => {
    const av = key(a)
    const bv = key(b)
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
  return list
}

/** Clicking the sorted column flips direction; another column sorts ascending. */
export function nextSort(sort: Sort, field: SortField): Sort {
  if (sort.field === field) return { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field, dir: 'asc' }
}

export function sortIndicator(sort: Sort, field: SortField): string {
  return sort.field === field ? (sort.dir === 'asc' ? '▲' : '▼') : ''
}

export type PageView<T> = { page: number; pageCount: number; rows: T[] }

/** The legacy clamps the current page down to the last page on every render. */
export function paginate<T>(list: readonly T[], page: number, pageSize: number): PageView<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const p = page > pageCount ? pageCount : page
  const start = (p - 1) * pageSize
  return { page: p, pageCount, rows: list.slice(start, start + pageSize) }
}

/** Clicking the selected row again clears the selection. */
export const toggleSelection = (current: string | null, rfha: string) => (current === rfha ? null : rfha)

/* ---------------- Action gating (mirrors ABAP) ---------------- */

/** EARLY needs a Forward leg that is not pre-matured. Returns the warning, or null to open. */
export function gateEarly(l: Leg): string | null {
  if (l.ztsf_pre_mature) return MSG.alreadyPm
  if (l.sfhaart !== FORWARD) return MSG.notForward
  return null
}

/** UNWIN works on any leg not already unwound. */
export function gateUnwind(l: Leg): string | null {
  if (l.ztsf_unwind) return MSG.alreadyUnwound
  return null
}

/** ROLLOVER has the same gate (and message) as EARLY in the original. */
export function gateRollover(l: Leg): string | null {
  return gateEarly(l)
}

/* ---------------- Modal prefill ---------------- */

const emptyBooking = (): BookingForm => ({ type: '', tdate: null, vdate: null, bp: '', rate: '', buyAmt: '', sellAmt: '' })

/**
 * Early Delivery and Rollover open the same way: New Booking blank except Bank BP; the
 * Cancellation side mirrors the original leg (dates, rate, amounts with buy/sell swapped).
 */
export function pairFormFor(l: Leg): PairForm {
  return {
    remark: '',
    newTxn: { ...emptyBooking(), bp: l.kontrh },
    cancel: {
      type: '',
      tdate: l.dblfz,
      vdate: l.delfz,
      bp: l.kontrh,
      rate: l.otot_rate.toFixed(4),
      buyAmt: fmtAmt(l.amt2),
      sellAmt: fmtAmt(l.amt1),
    },
  }
}

export const emptyPairForm = (): PairForm => ({ remark: '', newTxn: emptyBooking(), cancel: emptyBooking() })

export function unwindFormFor(l: Leg): UnwindForm {
  return {
    remark: '',
    tdate: l.dblfz,
    vdate: l.delfz,
    bp: l.kontrh,
    rate: l.otot_rate.toFixed(4),
    buyAmt: fmtAmt(l.amt2),
    sellAmt: fmtAmt(l.amt1),
  }
}

export const emptyUnwindForm = (): UnwindForm => ({ remark: '', tdate: null, vdate: null, bp: '', rate: '', buyAmt: '', sellAmt: '' })

/** Read-only currency boxes of the pair modals: [new buy, new sell, cancel buy, cancel sell]. */
export function pairCurrencies(l: Leg | null): { newBuy: string; newSell: string; cancelBuy: string; cancelSell: string } {
  if (!l) return { newBuy: '', newSell: '', cancelBuy: '', cancelSell: '' }
  const side1 = `${l.bs1} ${l.curr1}`
  const side2 = `${l.bs2} ${l.curr2}`
  return { newBuy: side1, newSell: side2, cancelBuy: side2, cancelSell: side1 }
}

/* ---------------- Submit validation ---------------- */

type DateCheck = 'cancelNotBeforeNew' | 'cancelNotAfterNew'

function validatePair(f: PairForm, rule: DateCheck): string | null {
  const nt = f.newTxn
  const ct = f.cancel
  const ntRate = nt.rate.trim()
  const ctRate = ct.rate.trim()
  if (nt.tdate && nt.vdate && nt.tdate > nt.vdate) return MSG.newTradeAfterValue
  if (ct.tdate && ct.vdate && ct.tdate > ct.vdate) return MSG.cancelTradeAfterValue
  if (rule === 'cancelNotBeforeNew' && ct.vdate && nt.vdate && ct.vdate < nt.vdate) return MSG.earlyCancelBeforeNew
  if (rule === 'cancelNotAfterNew' && ct.vdate && nt.vdate && ct.vdate > nt.vdate) return MSG.rollCancelAfterNew
  if (!nt.type || !nt.tdate || !nt.vdate || !ntRate || !ct.type || !ct.tdate || !ct.vdate || !ctRate) return MSG.mandatory
  return null
}

/** Early Delivery: the cancellation value date may not be EARLIER than the new booking's. */
export const validateEarly = (f: PairForm) => validatePair(f, 'cancelNotBeforeNew')
/** Rollover: the cancellation value date may not be LATER than the new booking's. */
export const validateRollover = (f: PairForm) => validatePair(f, 'cancelNotAfterNew')

/** Unwinding checks mandatory fields first, then the date order. */
export function validateUnwind(f: UnwindForm): string | null {
  if (!f.tdate || !f.vdate || !f.bp || !f.rate.trim()) return MSG.mandatory
  if (f.tdate > f.vdate) return MSG.unwindTradeAfterValue
  return null
}

/* ---------------- SAP events ---------------- */

const enc = (v: string | null) => encodeURIComponent(String(v))
const query = (pairs: readonly (readonly [string, string | null])[]) => pairs.map(([k, v]) => `${k}=${enc(v)}`).join('&')

/** The href the legacy assigned to window.location; the SPA logs it instead of navigating. */
export const sapeventUrl = (event: string) => `sapevent:${event}`

export const viewTxnEvent = (l: Leg) => `view_txn?${query([['bukrs', l.bukrs], ['rfha', l.rfha]])}`

function pairEvent(name: string, l: Leg, f: PairForm): string {
  const nt = f.newTxn
  const ct = f.cancel
  return `${name}?${query([
    ['bukrs', l.bukrs],
    ['rfha', l.rfha],
    ['newTxnType', nt.type],
    ['newTradeDate', nt.tdate],
    ['newValueDate', nt.vdate],
    ['newBp', nt.bp],
    ['newRate', nt.rate.trim()],
    ['newBuyAmt', nt.buyAmt],
    ['newSellAmt', nt.sellAmt],
    ['cancelTxnType', ct.type],
    ['cancelTradeDate', ct.tdate],
    ['cancelValueDate', ct.vdate],
    ['cancelBp', ct.bp],
    ['cancelRate', ct.rate.trim()],
    ['remarks', f.remark],
  ])}`
}

export const earlyEvent = (l: Leg, f: PairForm) => pairEvent('create_early_delivery', l, f)
export const rolloverEvent = (l: Leg, f: PairForm) => pairEvent('create_rollover', l, f)

export function unwindEvent(l: Leg, f: UnwindForm): string {
  return `create_unwinding?${query([
    ['bukrs', l.bukrs],
    ['rfha', l.rfha],
    ['tradeDate', f.tdate],
    ['valueDate', f.vdate],
    ['bp', f.bp],
    ['rate', f.rate.trim()],
    ['buyAmt', f.buyAmt],
    ['sellAmt', f.sellAmt],
    ['remarks', f.remark],
  ])}`
}

/* ---------------- State after submit ---------------- */

const patch = (legs: readonly Leg[], rfha: string, change: Partial<Leg>) =>
  legs.map((l) => (l.rfha === rfha ? { ...l, ...change } : l))

export const applyEarly = (legs: readonly Leg[], rfha: string) =>
  patch(legs, rfha, { ztsf_pre_mature: true, txnDesc: 'Pre-Matured' })
export const applyUnwind = (legs: readonly Leg[], rfha: string) => patch(legs, rfha, { ztsf_unwind: true, txnDesc: 'Unwound' })
export const applyRollover = (legs: readonly Leg[], rfha: string) => patch(legs, rfha, { zroll: 'R1-D1', txnDesc: 'Rolled Over' })

/** Text of the draggable ghost. */
export const dragGhostText = (l: Leg) => `${l.rfha} — ${l.bpName}`
