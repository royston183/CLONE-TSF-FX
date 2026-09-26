import { COMPANIES, CURR_STRINGS, ENTITY_STRINGS, EP_ALT_TXNS, FX_MODELS, MARKUP_PCT, PARTNER_BANK, STATUS_DESC, rawDeals } from './data.ts'
import type { AltTxn, Deal, DealStatus, Filters, FxLeg, InvLeg, RawDeal } from './types.ts'

export const DEFAULT_FILTERS: Filters = { search: '', status: '', model: '', origin: '' }
export const PAGE_SIZES = [8, 15, 25, 50]
export const DEFAULT_PAGE_SIZE = 15
const DAY_MS = 86400000

// ------------------------------------------------------------------ reference lookups

export function entStr(id: string): string {
  return (ENTITY_STRINGS[id] ?? ['-', '-', '-']).join(' → ')
}

export function currStr(id: string): string {
  return (CURR_STRINGS[id] ?? ['-', '-', '-']).join('-')
}

export function statusText(status: DealStatus): string {
  return `${status} - ${STATUS_DESC[status]}`
}

export function companyName(code: string): string {
  return COMPANIES[code]?.name ?? ''
}

// ------------------------------------------------------------------ deal derivation

/**
 * One working Deal ID from its raw row: the D1/D2 FX legs, T1/T2/T3 invoice legs and their
 * invoice amounts, all derived from the model's Entity and Currency Strings — the page's port
 * of FORM DEAL_ID_ALV / FORM INVOICE_PLAN / FORM ALV_DATA_3 in the ABAP source.
 */
export function buildDeal(r: RawDeal): Deal {
  const model = FX_MODELS[r.model]
  if (!model) throw new Error(`Unknown FX Model ${r.model}`)
  const entChain = ENTITY_STRINGS[model.entityId] ?? []
  const currChain = CURR_STRINGS[model.currId] ?? []
  const [e1 = '', e2 = '', e3 = ''] = entChain
  const co = (code: string) => COMPANIES[code]?.co ?? ''

  // Amount 1 is always the USD side: swap when the deal is quoted the other way round.
  let amt1 = r.notional
  let amt2 = r.notional / r.allInRate
  if (r.curr1 !== 'USD') [amt1, amt2] = [amt2, amt1]

  // D1 is booked in the first entity's company code, D2 (the offsetting leg) in the third's.
  const common = { tradeDate: r.dealStart, curr1: r.curr1, amt1, curr2: r.curr2, amt2, rate: r.allInRate, valueDate: r.dealEnd, partner: PARTNER_BANK }
  const fxLegs: FxLeg[] = [
    { ...common, leg: 'D1', coCode: co(e1), buy1: 'Buy', buy2: 'Sell', txnType: '619 – Forward-TSF' },
    { ...common, leg: 'D2', coCode: co(e3), buy1: 'Sell', buy2: 'Buy', txnType: model.subType === 'FX2' ? '649 – Option - TSF' : '619 – Forward-TSF' },
  ]

  // The trade markup is baked in on the DMCC legs, a small share of the local (INR-side) amount.
  const localAmt = Math.abs(r.curr1 === 'USD' ? amt2 : amt1)
  const curr = r.curr2 === 'INR' ? 'INR' : r.curr1
  const inv = (type: InvLeg['type'], dealType: InvLeg['dealType'], sell: string, buy: string, amt: number): InvLeg => ({
    ref: `${r.dealId}-${type}`,
    type,
    dealType,
    sell,
    buy,
    mcSell: `${sell}-${buy}-S`,
    mcBuy: `${buy}-${sell}-P`,
    amt,
    rate: r.allInRate,
    invAmt: amt * r.allInRate,
    curr,
  })
  const invLegs = [
    inv('T1', 'D1', e1, e2, localAmt),
    inv('T2', 'D2', e2, e3, localAmt * (1 + MARKUP_PCT)),
    inv('T3', 'D2', e3, e1, localAmt * (1 + MARKUP_PCT)),
  ]

  return {
    dealId: r.dealId,
    mcRef: r.mcRef,
    model: r.model,
    modelDesc: model.desc,
    subType: model.subType,
    entityId: model.entityId,
    entChain,
    currId: model.currId,
    currChain,
    trader: r.trader,
    status: r.status,
    dealStart: r.dealStart,
    dealEnd: r.dealEnd,
    shipStart: r.shipStart,
    shipEnd: r.shipEnd,
    origin: r.origin,
    fxLegs,
    invLegs,
    premiumRate: null,
    editHistory: [],
  }
}

export function buildDeals(today: Date): Deal[] {
  return rawDeals(today).map(buildDeal)
}

// ------------------------------------------------------------------ list screen

export function modelOptions(): Array<{ value: string; label: string }> {
  return Object.keys(FX_MODELS)
    .sort()
    .map((m) => ({ value: m, label: `${m} – ${FX_MODELS[m]?.desc ?? ''}` }))
}

export function originOptions(deals: Deal[]): Array<{ value: string; label: string }> {
  return Array.from(new Set(deals.map((d) => d.origin)))
    .sort()
    .map((o) => ({ value: o, label: `${o} – ${COMPANIES[o]?.name ?? o}` }))
}

export function filterDeals(deals: Deal[], f: Filters): Deal[] {
  const q = f.search.trim().toLowerCase()
  return deals.filter((d) => {
    if (f.status && d.status !== f.status) return false
    if (f.model && d.model !== f.model) return false
    if (f.origin && d.origin !== f.origin) return false
    if (q) {
      const hay = [d.dealId, d.mcRef, d.model, d.modelDesc, d.trader, entStr(d.entityId), currStr(d.currId), d.origin].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** The page drawn for `page`, clamped into range as drawDealPage did. */
export function pageOf<T>(rows: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, totalPages)
  const start = (current - 1) * size
  return { rows: rows.slice(start, start + size), page: current, totalPages, start, end: Math.min(start + size, rows.length) }
}

/**
 * Page buttons to draw. Past 7 pages only the first, the last and two either side of the
 * current page are numbered; one ellipsis stands in for each skipped run.
 */
export function pagerWindow(page: number, totalPages: number): Array<number | 'gap'> {
  const out: Array<number | 'gap'> = []
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) {
      if (p === 2 || p === totalPages - 1) out.push('gap')
      continue
    }
    out.push(p)
  }
  return out
}

// ------------------------------------------------------------------ detail screen

export type GapNote = { kind: 'waiting'; days: number } | { kind: 'ready' } | null

/** The amber note under the info grid, shown only while a Deal ID is still Not Confirmed. */
export function gapNote(d: Deal, today: Date): GapNote {
  if (d.status !== '01') return null
  const days = Math.round((d.shipStart.getTime() - today.getTime()) / DAY_MS)
  return days > 0 ? { kind: 'waiting', days } : { kind: 'ready' }
}

/** Colour of the Deal ID Status value in the info grid. */
export function statusValClass(status: DealStatus): string {
  if (status === '30') return ''
  return status === '01' ? 'muted' : 'green'
}

export const isCancelled = (d: Deal) => d.status === '30'
export const canReverse = (d: Deal) => d.status === '02' || d.status === '03'
/** Exchange rates can be edited only before MO confirmation. */
export const ratesEditable = (d: Deal) => d.status === '01'

/**
 * A new exchange rate typed into invoice row `idx`, or null when it is not a positive number.
 * As on the page the invoice amount is not touched: Calculate refreshes it.
 */
export function setInvRate(d: Deal, idx: number, text: string): Deal | null {
  const v = parseFloat(text.replace(/,/g, ''))
  if (Number.isNaN(v) || v <= 0) return null
  return { ...d, invLegs: d.invLegs.map((l, i) => (i === idx ? { ...l, rate: v } : l)) }
}

/** Calculate: every invoice amount from its leg amount and exchange rate. */
export function recalcInvoices(d: Deal): Deal {
  return { ...d, invLegs: d.invLegs.map((l) => ({ ...l, invAmt: l.amt * l.rate })) }
}

export type PlTable = {
  /** "SELL→BUY" per invoice leg. */
  labels: string[]
  sale: Array<{ famt: number; lamt: number }>
  purchase: Array<{ famt: number; lamt: number }>
  /** Trade markup: each later leg's invoice amount over T1's, summed. Shown under the last leg. */
  totalMarkup: number
}

export function plTable(d: Deal): PlTable {
  const first = d.invLegs[0]
  let totalMarkup = 0
  d.invLegs.forEach((l, i) => {
    if (i > 0 && first) totalMarkup += l.invAmt - first.invAmt
  })
  return {
    labels: d.invLegs.map((l) => `${l.sell}→${l.buy}`),
    sale: d.invLegs.map((l) => ({ famt: l.amt, lamt: l.invAmt })),
    purchase: d.invLegs.map((l) => ({ famt: -l.amt, lamt: -l.invAmt })),
    totalMarkup,
  }
}

// ------------------------------------------------------------------ actions

/** Change / Confirm: 01 → 02. Null when the Deal ID is not awaiting confirmation. */
export function confirmDeal(d: Deal): Deal | null {
  return d.status === '01' ? { ...d, status: '02' } : null
}

/**
 * Premium Adjustment: the adjusted rate re-prices the D2 (T2) invoice leg only. Null when the
 * rate is not a positive number.
 */
export function applyPremium(d: Deal, text: string): Deal | null {
  const v = parseFloat(text)
  if (Number.isNaN(v) || v <= 0) return null
  const invLegs = d.invLegs.map((l, i) => (i === 1 ? { ...l, rate: v, invAmt: l.amt * v } : l))
  return { ...d, premiumRate: v, invLegs }
}

export function cancelDeal(d: Deal): Deal {
  return { ...d, status: '30' }
}

/** Reverse Confirmation: back to 01 and the premium adjustment forgotten. */
export function reverseConfirm(d: Deal): Deal {
  return { ...d, status: '01', premiumRate: null }
}

export function editPairCandidates(leg: FxLeg | undefined): AltTxn[] {
  return leg ? EP_ALT_TXNS[leg.leg] : []
}

/** Edit Deal Pair: records the re-pointing; the legs themselves are left as booked. */
export function applyEditPair(d: Deal, legIdx: number, rfha: string, at: Date): Deal | null {
  const leg = d.fxLegs[legIdx]
  if (!rfha || !leg) return null
  return { ...d, editHistory: [...d.editHistory, { leg: leg.leg, newRfha: rfha, at }] }
}
