import { isoFromDisplay } from './format.ts'
import type { Filters, NdfDeal } from './types.ts'

export function statusClass(status: string): string {
  if (status === 'Released' || status === 'Rate Fixed') return 'released'
  if (status === 'Correction Required') return 'correction'
  return 'pending'
}

/** The page's applyFilters: search + the three dropdown/date filters, then the id sort. */
export function applyFilters(deals: NdfDeal[], filters: Filters, sortAsc: boolean): NdfDeal[] {
  const q = filters.search.trim().toLowerCase()
  const parsedDate = isoFromDisplay(filters.fixingDate)
  const visible = deals.filter((r) => {
    if (filters.company && r.company !== filters.company) return false
    if (filters.fixingDate && parsedDate && r.date !== filters.fixingDate) return false
    if (filters.trader && r.trader !== filters.trader) return false
    if (q) {
      const joined = Object.values(r).join(' ').toLowerCase()
      if (!joined.includes(q)) return false
    }
    return true
  })
  visible.sort((a, b) => (sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)))
  return visible
}

/**
 * Demo approximation of the SAP NDF cash-settlement logic: compare the contracted forward
 * rate to the fixing rate on Amount 1.
 */
export function calcCashSettlement(deal: NdfDeal, fixRate: number): number {
  if (!fixRate || !isFinite(fixRate)) return 0
  return (deal.fwd - fixRate) * deal.amt1
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
    r.spot, r.swap, r.fwd, r.date, r.ndf, r.ref, r.status,
  ])
  return [CSV_COLUMNS, ...body]
    .map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n')
}
