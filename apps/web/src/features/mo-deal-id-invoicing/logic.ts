/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state. Every "mutating" action here (amend, confirm/reverse invoice
 * generation, recalc) returns a new Deal rather than editing in place.
 */
import { ENTITIES, FX_MODELS, STATUS_META, entStr } from './data.ts'
import { fmtAmt, formatDate, parseDMY, todayStr } from './format.ts'
import type { Deal, DealStatus, Filters, InvoiceLeg, Sort, SortKey } from './types.ts'

// ---------------------------------------------------------------- derived amounts

/** Total Invoiced Amt: the report's ZTOT_AMT_INV (T1 BIL_ADJ ZAMT_USD) when loaded; the legs' value otherwise. */
export function totalInvoiced(deal: Deal): number {
  if (deal.totInvUsd !== undefined) return deal.totInvUsd
  return deal.inv.reduce((t, r) => (r.invoiced ? t + r.qty * r.usdPrice : t), 0)
}

const d1Leg = (deal: Deal) => deal.fx.find((f) => f.type === 'D1')

/**
 * Whether UTI_AMT can be given: the D1 leg was read and one of its sides is USD. Without it (no leg, an
 * option leg, no USD side) utilization and balance stay blank rather than showing a made-up 0.
 */
export const utilizationKnown = (deal: Deal): boolean => {
  const d1 = d1Leg(deal)
  return !!d1 && (d1.curr1 === 'USD' || d1.curr2 === 'USD')
}

/** The D1 leg's absolute USD amount (AMT1 when CURR1 is USD plus AMT2 when CURR2 is USD) — what the FX Deal utilized of the Master Contract. */
export function fxUtilAmt(deal: Deal): number {
  const d1 = d1Leg(deal)
  if (!d1) return 0
  return Math.abs((d1.curr1 === 'USD' ? d1.amt1 : 0) + (d1.curr2 === 'USD' ? d1.amt2 : 0))
}

/** The MC's origin when the deal came from MySQL; the seed deals read it off the entity string. */
export const originEntityOf = (deal: Deal): string => deal.origin || FX_MODELS[deal.model]?.entities[0] || ''

// ---------------------------------------------------------------- filtering / sorting

function dealSearchText(d: Deal): string {
  const originEntity = originEntityOf(d)
  const util = fxUtilAmt(d)
  const totInv = totalInvoiced(d)
  const bal = util - totInv
  const legText = d.inv.map((r) => `${r.ttype} ${r.invoiced ? 'invoiced confirmed complete' : 'pending'}`).join(' ')
  return [
    d.dealId,
    d.dealDesc,
    STATUS_META[d.dealStat]?.label ?? '',
    d.dealStat,
    d.mcRef,
    originEntity,
    ENTITIES[originEntity]?.name ?? '',
    d.model,
    FX_MODELS[d.model]?.desc ?? '',
    d.commodity,
    d.dealStart,
    d.dealEnd,
    fmtAmt(d.mcAmtUsd),
    String(d.mcAmtUsd),
    fmtAmt(util),
    String(util),
    fmtAmt(totInv),
    String(totInv),
    fmtAmt(bal),
    String(bal),
    legText,
  ]
    .join(' ')
    .toLowerCase()
}

export function filterDeals(deals: readonly Deal[], filters: Filters): Deal[] {
  const q = filters.q.trim().toLowerCase()
  const dFrom = parseDMY(filters.dateFrom)
  const dTo = parseDMY(filters.dateTo)

  return deals.filter((d) => {
    const originEntity = originEntityOf(d)
    const region = d.region ?? FX_MODELS[d.model]?.region ?? ''
    const dEnd = parseDMY(d.dealEnd)
    // a~ze_date IN p_date: low only = EQ, low + high = BT; a deal without an end date never matches.
    if ((dFrom || dTo) && !dEnd) return false
    if (dFrom && !dTo && dEnd && dEnd.getTime() !== dFrom.getTime()) return false
    if (dFrom && dTo && dEnd && dEnd < dFrom) return false
    if (dTo && dEnd && dEnd > dTo) return false
    if (filters.region !== 'ALL' && region !== filters.region) return false
    if (filters.origin !== 'ALL' && originEntity !== filters.origin) return false
    if (filters.model !== 'ALL' && d.model !== filters.model) return false
    if (filters.status !== 'ALL' && d.dealStat !== filters.status) return false
    if (q && !dealSearchText(d).includes(q)) return false
    return true
  })
}

export function sortDeals(deals: readonly Deal[], sort: Sort): Deal[] {
  if (!sort.key) return deals.slice()
  const key = sort.key
  const dir = sort.dir
  const value = (d: Deal): number | string => {
    if (key === 'dealStart' || key === 'dealEnd') return parseDMY(d[key])?.getTime() ?? 0
    if (key === 'mcAmtUsd') return d.mcAmtUsd
    return d[key]
  }
  return deals.slice().sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
}

export const nextSort = (sort: Sort, key: SortKey): Sort => (sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: 1 })

export const DEFAULT_FILTERS: Filters = { q: '', dateFrom: '01-01-2026', dateTo: '31-12-2026', region: 'ALL', origin: 'ALL', model: 'ALL', status: 'ALL' }

// ---------------------------------------------------------------- CSV export

const CSV_COLUMNS = ['Deal ID', 'Deal Description', 'Status', 'MC Ref No', 'Origin Entity', 'Model', 'Commodity', 'Deal Start', 'Deal End', 'MC Amount (USD)', 'FX Utilization Amt', 'Total Invoiced Amt', 'Current Balance']

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

export function buildCsv(deals: readonly Deal[]): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')]
  for (const d of deals) {
    const originEntity = originEntityOf(d)
    const util = fxUtilAmt(d)
    const totInv = totalInvoiced(d)
    const bal = util - totInv
    lines.push(
      [d.dealId, d.dealDesc, STATUS_META[d.dealStat]!.label, d.mcRef, originEntity, d.model, d.commodity, d.dealStart, d.dealEnd, d.mcAmtUsd.toFixed(2), utilizationKnown(d) ? util.toFixed(2) : '', totInv.toFixed(2), utilizationKnown(d) ? bal.toFixed(2) : '']
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------- rbill blotter actions

export const canAmendDeal = (d: Deal): boolean => d.dealStat === '05' || d.dealStat === '07'
export const canReverse = (d: Deal): boolean => d.dealStat === '04' || d.dealStat === '05' || d.dealStat === '07'
export const canLetters = (d: Deal): boolean => d.dealStat > '04'
export const uninvoicedExists = (d: Deal): boolean => d.inv.some((r) => !r.invoiced)

/** Amend Deal Status: 05 (Fully Invoiced) reopens to 07 (Partial), anything else to 04 (Booked). */
export function amendDealStatusNext(dealStat: DealStatus): DealStatus {
  return dealStat === '05' ? '07' : '04'
}

/** What Amend Deal Status writes: the new status, and legs reset when reopening to 04. */
export function applyAmendDealStatus(deal: Deal): Deal {
  const next = amendDealStatusNext(deal.dealStat)
  return {
    ...deal,
    dealStat: next,
    inv: deal.inv.map((r) => (next === '04' ? { ...r, invoiced: false, marked: false, invNo: '', invDate: '' } : r)),
  }
}

export function editPrice(deal: Deal, idx: number, rawValue: string): Deal {
  const n = parseFloat(rawValue.replace(/,/g, ''))
  if (Number.isNaN(n) || n <= 0) return deal
  return { ...deal, inv: deal.inv.map((r, i) => (i === idx ? { ...r, usdPrice: n } : r)) }
}

export function editInvDate(deal: Deal, idx: number, value: string): Deal {
  return { ...deal, inv: deal.inv.map((r, i) => (i === idx ? { ...r, invDate: value } : r)) }
}

export function toggleMark(deal: Deal, idx: number, checked: boolean): Deal {
  return { ...deal, inv: deal.inv.map((r, i) => (i === idx ? { ...r, marked: checked } : r)) }
}

/** Confirm Invoice Generation's tolerance check: marked lines' amount vs the FX Deal's D1 value. */
export function invoiceGenerationCheck(deal: Deal): { marked: InvoiceLeg[]; invAmt: number; dealAmt: number; diffPct: number; withinTolerance: boolean } {
  const TOLERANCE_PCT = 2.0
  const marked = deal.inv.filter((r) => r.marked && !r.invoiced)
  const invAmt = marked.reduce((t, r) => t + r.qty * r.usdPrice, 0)
  const dealAmt = fxUtilAmt(deal)
  const diffPct = dealAmt ? (Math.abs(invAmt - dealAmt) / dealAmt) * 100 : 0
  return { marked, invAmt, dealAmt, diffPct, withinTolerance: diffPct <= TOLERANCE_PCT }
}

/** Finalise Invoice Generation: stamps marked legs invoiced, assigns invoice numbers from `nextSeq`. */
export function finaliseInvoiceGeneration(deal: Deal, fullMatch: boolean, nextSeq: number): { deal: Deal; nextSeq: number } {
  let seq = nextSeq
  const inv = deal.inv.map((r) => {
    if (!r.marked || r.invoiced) return r
    seq++
    return { ...r, invoiced: true, invNo: `IF-${100000 + seq}`, invDate: todayStr() }
  })
  const allInvoiced = inv.every((r) => r.invoiced)
  return { deal: { ...deal, inv, dealStat: allInvoiced && fullMatch ? '05' : '07' }, nextSeq: seq }
}

/** Reverse Confirm Invoice Generation: deletes every invoice record and resets to Booked. */
export function reverseInvoiceGeneration(deal: Deal): Deal {
  return {
    ...deal,
    dealStat: '04',
    inv: deal.inv.map((r) => ({ ...r, invoiced: false, marked: false, invNo: '', invDate: '' })),
  }
}

/** Re-calculate and Update: due dates follow the deal end date, as the legacy recalcUpdate did. */
export function recalcDeal(deal: Deal): Deal {
  return { ...deal, inv: deal.inv.map((r) => ({ ...r, dueDate: deal.dealEnd })) }
}

export function saveHouseBank(deal: Deal, legIdx: number, hb: string, acct: string, ptnr: string): Deal {
  return {
    ...deal,
    inv: deal.inv.map((r, i) => (i === legIdx ? { ...r, hb: hb.trim().toUpperCase(), acct: acct.trim().toUpperCase(), ptnr: ptnr.trim().toUpperCase() } : r)),
  }
}

export function deAssignBl(deal: Deal, blIdx: number): Deal {
  return { ...deal, bls: deal.bls.filter((_, i) => i !== blIdx) }
}

/** Invoice Difference: planned amount split evenly across legs vs what each leg actually invoiced. */
export function invoiceDiffRows(deal: Deal): Array<{ leg: string; planned: number; actual: number; diff: number; pct: number }> {
  const planPerLeg = fxUtilAmt(deal) / deal.inv.length
  return deal.inv.map((r) => {
    const actual = r.invoiced ? r.qty * r.usdPrice : 0
    const diff = actual - planPerLeg
    const pct = planPerLeg ? (diff / planPerLeg) * 100 : 0
    return { leg: r.ttype, planned: planPerLeg, actual, diff, pct }
  })
}

export function mcDetailItems(deal: Deal): Array<[string, string]> {
  const originEntity = originEntityOf(deal)
  return [
    ['MC Ref No', deal.mcRef],
    ['MC Date', deal.mcDate],
    ['Origin Entity', `${originEntity} - ${ENTITIES[originEntity]!.name}`],
    ['Commodity', deal.commodity],
    ['Ship Start Date', deal.shipStart],
    ['Ship End Date', deal.shipEnd],
    ['FX Model', `${deal.model} - ${FX_MODELS[deal.model]!.desc}`],
    ['Entity String', entStr(deal.model)],
    ['Currency String', FX_MODELS[deal.model]!.curr.join('-')],
    ['MC Amount (USD)', fmtAmt(deal.mcAmtUsd)],
    ['Linked Deal ID', deal.dealId],
    ['Deal Status', STATUS_META[deal.dealStat]!.label],
  ]
}

export { formatDate }
