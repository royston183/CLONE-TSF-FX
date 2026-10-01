/*
 * Pure business rules of the Premature Settlement screen, lifted from the legacy script so
 * they can be unit-tested and later wired to a backend. No React, no DOM.
 */
import { fmtAmt } from './format.ts'
import type { BookingForm, Filters, Kpis, Leg, PairForm, Sort, SortField, UnwindForm } from './types.ts'

/** c_619: the only type Early Delivery and Rollover accept. */
export const FORWARD = '619'
export const DEFAULT_SORT: Sort = { field: 'rfha', dir: 'asc' }
export const DEFAULT_FILTERS: Filters = { type: '', status: '' }
export const PAGE_SIZES = [5, 10, 25] as const
export const DEFAULT_PAGE_SIZE = 10

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Txn Type filter: the types on the loaded deal, by code, labelled with their SAP text. */
export function typeFilterOptions(legs: readonly Leg[]): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const l of legs) if (l.sfhaart && !seen.has(l.sfhaart)) seen.set(l.sfhaart, typeLabel(l))
  return [...seen.keys()].sort(byText).map((value) => ({ value, label: seen.get(value) ?? value }))
}

/** Status filter: the status texts on the loaded deal. */
export function statusOptions(legs: readonly Leg[]): string[] {
  return [...new Set(legs.map((l) => l.txnDesc).filter(Boolean))].sort(byText)
}

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

/**
 * The three creates have no API yet: each is a chain of BAPI_FTR_FXT_GETDETAIL, two or one
 * BAPI_FTR_FXT_CREATE and a BAPI_FTR_FXT_CHANGE of the original, every step carrying VTBFHA
 * extension fields through ZSGTRMFM_VTBFHA_EXPORT in the same session. FxTransaction's
 * single-deal create cannot carry those, so nothing is posted and nothing is marked done.
 */
export const ACTION_WAITING = {
  early: 'WAITING FOR API — Create Early Delivery (FORM create_txn) has no backend action yet. Nothing was posted to SAP.',
  unwind: 'WAITING FOR API — Create Unwinding Txn (FORM create_unwind) has no backend action yet. Nothing was posted to SAP.',
  roll: 'WAITING FOR API — Rollover (FORM create_roll_txn) has no backend action yet. Nothing was posted to SAP.',
} as const

/* ---------------- Load deal ---------------- */

/** GV_DEAL: trimmed and upper-cased, as the dynpro field holds it. */
export function normalizeDealId(raw: string): { ok: true; dealId: string } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, message: MSG.enterDealId }
  return { ok: true, dealId: trimmed.toUpperCase() }
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

/** The leg's own SAP text for its transaction type; the code when the text is blank. */
export const typeLabel = (l: Leg) => l.xtext || l.sfhaart

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
