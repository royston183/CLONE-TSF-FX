/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { money, oldRateText, parseDMY } from './format.ts'
import type { NdfRow, Sort } from './types.ts'

function searchableString(r: NdfRow): string {
  return [r.rfha, r.bukrs, r.company, r.product, r.pair, r.side, r.amt1, r.curr1, r.amt2, r.curr2, r.fixDate, r.fixRef, r.fixRefName, r.oldRate, r.trader, r.partner, r.status, r.statusText]
    .join(' ')
    .toLowerCase()
}

/** Only status 11 (Pending NDF Fixing) rows are ever shown — the legacy filteredRows(). */
export function filterRows(rows: readonly NdfRow[], search: string, company: string, fixDate: string): NdfRow[] {
  const q = search.trim().toLowerCase()
  const dt = fixDate.trim()
  return rows.filter((r) => {
    if (r.status !== '11') return false
    if (q && !searchableString(r).includes(q)) return false
    if (company && r.bukrs !== company) return false
    if (dt && r.fixDate !== dt) return false
    return true
  })
}

export function sortRows(rows: readonly NdfRow[], sort: Sort): NdfRow[] {
  return rows.slice().sort((a, b) => {
    let va: unknown = a[sort.key]
    let vb: unknown = b[sort.key]
    if (va === null) va = -Infinity
    if (vb === null) vb = -Infinity
    if (sort.key === 'fixDate') {
      va = parseDMY(String(va))?.getTime() ?? 0
      vb = parseDMY(String(vb))?.getTime() ?? 0
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    const as = String(va).toLowerCase()
    const bs = String(vb).toLowerCase()
    return (as < bs ? -1 : as > bs ? 1 : 0) * sort.dir
  })
}

export const nextSort = (sort: Sort, key: Sort['key']): Sort => (sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: 1 })

/** IDR/VND/TWD fixings are quoted per 100 units — the legacy specialFactor(). */
function specialFactor(curr: string): number {
  return curr === 'IDR' || curr === 'VND' || curr === 'TWD' ? 100 : 1
}

/** The settlement amount a new fixing rate implies, or null while the rate isn't a usable number. */
export function calcSettlement(r: NdfRow, newRate: number): number | null {
  const factor = specialFactor(r.settleCurr)
  if (!Number.isFinite(newRate) || newRate === 0) return null
  return r.foreignFirst ? r.amt2 + (r.amt1 * factor) / newRate : r.amt1 + (r.amt2 * factor) / newRate
}

export function settlementDisplay(r: NdfRow, newRateInput: string): string {
  const v = calcSettlement(r, parseFloat(newRateInput))
  return v === null ? '' : money(v)
}

// ---------------------------------------------------------------- CSV

const CSV_HEADERS = ['Transaction', 'Company Code', 'Company Name', 'Product Type', 'Currency Pair', 'Buy/Sell', 'Amount 1', 'Currency 1', 'Amount 2', 'Currency 2', 'Fixing Date', 'Fixing Ref', 'Old Fixing Rate', 'Trader', 'Business Partner', 'Status']

function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

export function buildCsv(rows: readonly NdfRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([r.rfha, r.bukrs, r.company, r.product, r.pair, r.side, r.amt1, r.curr1, r.amt2, r.curr2, r.fixDate, r.fixRef, oldRateText(r.oldRate), r.trader, r.partner, `${r.status} ${r.statusText}`].map(csvCell).join(','))
  }
  return lines.join('\r\n')
}
