import { PER_100_CURRENCIES } from './data.ts'
import { isoFromDisplay } from './format.ts'
import type { Filters, NdfDeal } from './types.ts'

/** Colour of a "<TXN_STATUS> - <text>" status: 13 confirmed, 11 sent back, anything else pending. */
export function statusClass(status: string): string {
  const code = status.slice(0, 2)
  if (code === '13') return 'released'
  if (code === '11') return 'correction'
  return 'pending'
}

/**
 * The page's applyFilters: search + the three dropdown/date filters, then the id sort. The
 * Fixing Date is GET_DATA's P_DATE, compared with V_DATE; the trader with ZTRCODE (P_TRD).
 */
export function applyFilters(deals: NdfDeal[], filters: Filters, sortAsc: boolean): NdfDeal[] {
  const q = filters.search.trim().toLowerCase()
  const parsedDate = isoFromDisplay(filters.fixingDate)
  const visible = deals.filter((r) => {
    if (filters.company && r.company !== filters.company) return false
    if (filters.fixingDate && parsedDate && r.vDate !== filters.fixingDate) return false
    if (filters.trader && r.traderCode !== filters.trader) return false
    if (q) {
      const joined = Object.values(r).join(' ').toLowerCase()
      if (!joined.includes(q)) return false
    }
    return true
  })
  visible.sort((a, b) => (sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)))
  return visible
}

/** ZSGTRMFM_LEAD_CURR: CURR1 is SAP's lead currency and CURR2 the following one (FxTransaction). */
export function leadCurr(c1: string, c2: string): { lead: string; follow: string } {
  return { lead: c1, follow: c2 }
}

export type Tcurf = Readonly<Record<string, { ffact: number; tfact: number }>>

/** FORM check_rate: the fixing rate scaled by TCURF kurst MTM when the factors differ. */
export function checkRate(deal: Pick<NdfDeal, 'c1' | 'c2'>, fixRate: number, tcurf: Tcurf): number {
  const f = tcurf[`${deal.c1}>${deal.c2}`]
  if (f && f.ffact !== f.tfact) {
    if (f.ffact !== 1) return fixRate * f.ffact
    if (f.tfact !== 1) return fixRate * f.tfact
  }
  return fixRate
}

/**
 * FORM cash_settelment (screen 9001): settle the leg in the following currency at the fixing
 * rate against the other leg. IDR / VND / TWD are quoted per 100. A zero rate settles nothing,
 * as the ABAP's CATCH cx_sy_zerodivide leaves the amount initial.
 */
export function calcCashSettlement(deal: NdfDeal, fixRate: number, tcurf: Tcurf = {}): number {
  if (!fixRate || !isFinite(fixRate)) return 0
  const lr = checkRate(deal, fixRate, tcurf)
  if (!lr) return 0
  const { follow } = leadCurr(deal.c1, deal.c2)
  const per100 = (PER_100_CURRENCIES as readonly string[]).includes(follow)
  if (deal.c1 === follow) return per100 ? deal.amt2 + (deal.amt1 * 100) / lr : deal.amt2 + deal.amt1 / lr
  return per100 ? deal.amt1 + (deal.amt2 * 100) / lr : deal.amt1 + deal.amt2 / lr
}

const CSV_COLUMNS = [
  'Transaction No', 'Company Code', 'Trader', 'Buy/Sell', 'Currency Pair', 'Amount 1', 'Crcy 1',
  'Amount 2', 'Crcy 2', 'Original Spot', 'Swap', 'Forward Rate', 'Fixing Date', 'NDF Value',
  'Fixing Reference', 'Status',
]

/** The page's exportBtn handler: rows exactly as shown, quoted CSV. */
export function toCsv(rows: NdfDeal[]): string {
  const body = rows.map((r) => [
    r.id, r.company, r.trader, r.side, r.pair, r.amt1, r.c1, r.amt2, r.c2,
    r.spot.toFixed(4), r.swap, r.fwd.toFixed(4), r.date, r.ndf, r.ref, r.status,
  ])
  return [CSV_COLUMNS, ...body]
    .map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n')
}
