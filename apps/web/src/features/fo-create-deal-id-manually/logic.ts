import { daysBetween, dealStatusLabel, parseDMY } from './format.ts'
import type { Deal, FxRow, InvoiceRow, MasterContract, PnlRow, PoolTxn, SortState } from './types.ts'

function allText(row: Record<string, unknown>): string {
  return Object.values(row)
    .map((v) => String(v ?? ''))
    .join(' ')
    .toLowerCase()
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

export function dealPickerText(d: Deal): string {
  return [d.id, d.ref, d.description, d.mcRef, d.mcDesc, d.fxModel, d.entityString, d.currencyString, d.trader, d.traderCode, d.origin, dealStatusLabel(d.status)]
    .join(' ')
    .toLowerCase()
}

export function filterFxRows(rows: FxRow[], search: string, entity: string, type: string): FxRow[] {
  return rows.filter((r) => {
    const okSearch = !search || allText(r).indexOf(search) >= 0
    const okEntity = !entity || r.entity === entity
    const okType = !type || r.dealType === type
    return okSearch && okEntity && okType
  })
}

export function sortFxRows(rows: FxRow[], sort: SortState<string>): FxRow[] {
  const copy = rows.slice()
  copy.sort((a, b) => compareValues(a[sort.key as keyof FxRow], b[sort.key as keyof FxRow]) * sort.dir)
  return copy
}

export function filterInvoiceRows(rows: InvoiceRow[], search: string, trade: string): InvoiceRow[] {
  return rows.filter((r) => (!search || allText(r).indexOf(search) >= 0) && (!trade || r.tradeType === trade))
}

export function sortInvoiceRows(rows: InvoiceRow[], sort: SortState<string>): InvoiceRow[] {
  const copy = rows.slice()
  copy.sort((a, b) => compareValues(a[sort.key as keyof InvoiceRow], b[sort.key as keyof InvoiceRow]) * sort.dir)
  return copy
}

export function derivePnlRows(invoices: InvoiceRow[]): PnlRow[] {
  const sale: PnlRow = { type: 'Sale', famt1: 0, lamt1: 0, famt2: 0, lamt2: 0, famt3: 0, lamt3: 0 }
  const purchase: PnlRow = { type: 'Purchase', famt1: 0, lamt1: 0, famt2: 0, lamt2: 0, famt3: 0, lamt3: 0 }
  for (const r of invoices) {
    const n = Number(r.tradeType.substring(1))
    if (!n || n > 3) continue
    const fKey = `famt${n}` as 'famt1' | 'famt2' | 'famt3'
    const lKey = `lamt${n}` as 'lamt1' | 'lamt2' | 'lamt3'
    sale[fKey] += r.amount
    sale[lKey] += r.invAmount
    purchase[fKey] += r.amount * 0.997
    purchase[lKey] += r.invAmount * 0.994
  }
  const ndf: PnlRow = { type: 'NDF Fixing-Profit Adj', famt1: 0, lamt1: 125000, famt2: 0, lamt2: 80000, famt3: 0, lamt3: 35000 }
  const pnl: PnlRow = { type: 'P&L', famt1: 0, lamt1: 0, famt2: 0, lamt2: 0, famt3: 0, lamt3: 0 }
  for (let n = 1; n <= 3; n++) {
    const fKey = `famt${n}` as 'famt1' | 'famt2' | 'famt3'
    const lKey = `lamt${n}` as 'lamt1' | 'lamt2' | 'lamt3'
    pnl[fKey] = sale[fKey] - purchase[fKey]
    pnl[lKey] = sale[lKey] - purchase[lKey] + ndf[lKey]
  }
  const margin: PnlRow = { type: 'P&L Orign(%)', famt1: 0, lamt1: 0, famt2: 0, lamt2: 0, famt3: 0, lamt3: 0 }
  for (let n = 1; n <= 3; n++) {
    const fKey = `famt${n}` as 'famt1' | 'famt2' | 'famt3'
    const lKey = `lamt${n}` as 'lamt1' | 'lamt2' | 'lamt3'
    margin[fKey] = sale[fKey] ? (pnl[fKey] / sale[fKey]) * 100 : 0
    margin[lKey] = sale[lKey] ? (pnl[lKey] / sale[lKey]) * 100 : 0
  }
  return [sale, purchase, ndf, pnl, margin]
}

export function filterPnlRows(rows: PnlRow[], search: string): PnlRow[] {
  return rows.filter((r) => !search || allText(r).indexOf(search) >= 0)
}

export function sortPnlRows(rows: PnlRow[], sort: SortState<string>): PnlRow[] {
  const copy = rows.slice()
  copy.sort((a, b) => compareValues(a[sort.key as keyof PnlRow], b[sort.key as keyof PnlRow]) * sort.dir)
  return copy
}

export function paginate<T>(rows: T[], page: number, size: number): { rows: T[]; total: number; pages: number; start: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const clampedPage = Math.min(page, pages)
  const start = (clampedPage - 1) * size
  return { rows: rows.slice(start, start + size), total: rows.length, pages, start, page: clampedPage }
}

export function getCompatibleTxns(row: FxRow, pool: PoolTxn[]): PoolTxn[] {
  return pool.filter(
    (t) => t.bukrs === row.bukrs && t.rfha !== row.rfha && t.sfhaart === row.sfhaart && t.end === row.end && t.side1 === row.side1 && t.curr1 === row.curr1 && Math.abs(t.amt1 - row.amt1) < 0.01,
  )
}

export function findMc(masterContracts: MasterContract[], ref: string): MasterContract | null {
  return masterContracts.find((m) => m.ref === ref) ?? null
}

export function txnByRfha(pool: PoolTxn[], rfha: string): PoolTxn | null {
  return pool.find((t) => t.rfha === rfha) ?? null
}

export function hasUsdLeg(t: PoolTxn | null): boolean {
  return !!t && (t.curr1 === 'USD' || t.curr2 === 'USD')
}

export function compatibleCreatePool(mc: MasterContract, pool: PoolTxn[]): PoolTxn[] {
  return pool.filter((t) => (mc.currency.indexOf(t.curr1) >= 0 || mc.currency.indexOf(t.curr2) >= 0) && (t.curr1 === 'USD' || t.curr2 === 'USD'))
}

export function validateCreateDeal(mc: MasterContract | null, a: PoolTxn | null, b: PoolTxn | null): string {
  if (!mc || !a || !b) return 'Select a master contract and two transactions.'
  if (a.rfha === b.rfha) return 'Deal 1 and Deal 2 must be different transactions.'
  if (!hasUsdLeg(a) || !hasUsdLeg(b)) return 'Both transactions must contain a USD leg.'
  if (daysBetween(a.end, b.end) > 3) return 'The transaction end dates must be within ±3 days.'
  const start = parseDMY(a.start)
  const mcStart = parseDMY(mc.mcDate)
  const mcEnd = parseDMY(mc.shipEnd)
  if (!start || !mcStart || !mcEnd || start < mcStart || start > mcEnd) return 'Deal start date must fall between MC Date and Ship End.'
  return ''
}

export function nextSort(sort: SortState<string>, key: string): SortState<string> {
  if (sort.key === key) return { key, dir: sort.dir === 1 ? -1 : 1 }
  return { key, dir: 1 }
}
