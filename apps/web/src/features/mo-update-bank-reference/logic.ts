import {
  BUSINESS_AREAS,
  COMPANIES,
  FX_COLUMNS,
  FX_PAIRS,
  FX_TXN_TYPES,
  MATCH_STATUSES,
  OP_COLUMNS,
  OP_TXN_TYPES,
  PARTNERS,
  PORTFOLIOS,
  PROFIT_CENTERS,
  TRADERS,
  TXN_STATUSES,
} from './data.ts'
import { fmtDate, pad, parseDMY } from './format.ts'
import type { ColFilters, Column, Company, Deal, DealType, Selection, SortState, TxnType } from './types.ts'

// ------------------------------------------------------------------ seeded generator
// hashCode / mulberry32 / buildRow / generateDeals are the original's, call for call, so the
// same selection yields the same rows as the legacy page.

export function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T
}
function rnd(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}
function rndInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rnd(rng, min, max + 1))
}

/** Companies whose code lies in [from, to] (swapped if reversed); none without a From. */
export function companiesInRange(from: string, to: string): Company[] {
  if (!from) return []
  let lo = from
  let hi = to || from
  if (hi < lo) {
    const t = lo
    lo = hi
    hi = t
  }
  return COMPANIES.filter((c) => c.code >= lo && c.code <= hi)
}

export function buildRow(
  co: Company,
  dealType: DealType,
  keyDateStr: string,
  withRef: boolean,
  rng: () => number,
  idx: number,
): Deal {
  const isFx = dealType === 'FX'
  const pairInfo = pick(FX_PAIRS, rng)
  const txnType = pick(isFx ? FX_TXN_TYPES : OP_TXN_TYPES, rng)
  const trader = pick(TRADERS, rng)
  const partner = pick(PARTNERS, rng)
  const portfolio = pick(PORTFOLIOS, rng)
  const tradeDate = new Date(keyDateStr + 'T00:00:00')
  tradeDate.setDate(tradeDate.getDate() - rndInt(rng, 3, 45))
  const rfha = '5' + pad(hashCode(co.code + idx + keyDateStr) % 100000000, 8)
  const amt1 = Math.round(rnd(rng, 50000, 4500000) * 100) / 100
  // Property order matters: each rng() call below happens in the original's order.
  const row: Deal = {
    _id: rfha + '-' + co.code,
    RFHA: rfha,
    BUKRS: co.code,
    BUTXT: co.name,
    SFHAART: txnType.code,
    XTEXT: txnType.desc,
    CPAIR: pairInfo.pair,
    BS_1: rng() > 0.5 ? 'Buy' : 'Sell',
    CURR1: pairInfo.c1,
    AMT1: amt1,
    DBLFZ: fmtDate(tradeDate),
    DELFZ: fmtDate(new Date(keyDateStr + 'T00:00:00')),
    RDEALER: trader.code,
    BP_NAME: partner.name,
    KONTRH: partner.code,
    RBUSA: pick(BUSINESS_AREAS, rng),
    RPORTB: portfolio.code,
    PRCTR: pick(PROFIT_CENTERS, rng),
    TXN_STATUS: pick(TXN_STATUSES, rng),
    MAT_UNMAT: pick(MATCH_STATUSES, rng),
    ZTSF_DEAL_ID: 'TSF' + pad((hashCode(rfha + 'D') % 900000) + 100000, 6),
    ZMC_REF_NO: rng() > 0.35 ? 'MC' + pad((hashCode(rfha + 'M') % 9000000) + 1000000, 7) : '',
    NORDEXT: withRef ? 'EXT-' + co.code + '-' + pad((hashCode(rfha + 'X') % 9000) + 1000, 4) : '',
    ZOLAM_DEAL_NO: rng() > 0.7 ? 'OLM' + pad((hashCode(rfha + 'O') % 90000) + 10000, 5) : '',
    _checked: false,
  }
  if (isFx) {
    row.BS_2 = row.BS_1 === 'Buy' ? 'Sell' : 'Buy'
    row.CURR2 = pairInfo.c2
    row.AMT2 = Math.round(amt1 * pairInfo.spot * 100) / 100
    row.SPOT = pairInfo.spot
    row.SWAP = Math.round(rnd(rng, -0.85, 0.85) * 10000) / 10000
    row.TOT_RATE = Math.round((row.SPOT + row.SWAP) * 10000) / 10000
  } else {
    row.OPTION_TYPE = txnType.desc
    row.STRIKE_RATE = Math.round(pairInfo.spot * rnd(rng, 0.97, 1.03) * 10000) / 10000
    row.PREMIUM_AMT = Math.round(rnd(rng, 500, 45000) * 100) / 100
    row.PREMIUM_CURR = pairInfo.c1
    const exp = new Date(keyDateStr + 'T00:00:00')
    exp.setMonth(exp.getMonth() + rndInt(rng, 1, 9))
    row.EXPIRY_DATE = fmtDate(exp)
  }
  return row
}

/** 2-5 deals per company in range, seeded by the whole selection. keyDateStr is YYYY-MM-DD. */
export function generateDeals(dealType: DealType, coFrom: string, coTo: string, keyDateStr: string, withRef: boolean): Deal[] {
  const companies = companiesInRange(coFrom, coTo)
  if (companies.length === 0 || !keyDateStr) return []
  const seed = hashCode([dealType, coFrom, coTo, keyDateStr, withRef].join('|'))
  const rng = mulberry32(seed)
  const rows: Deal[] = []
  companies.forEach((co, ci) => {
    const n = rndInt(rng, 2, 5)
    for (let i = 0; i < n; i++) rows.push(buildRow(co, dealType, keyDateStr, withRef, rng, ci * 100 + i))
  })
  return rows
}

// ------------------------------------------------------------------ selection

export const EMPTY_SELECTION: Selection = { coFrom: '', coTo: '', keyDate: '', dealType: 'FX', withRef: true, layout: '' }

export type SelectionErrors = { coFrom: boolean; keyDate: boolean }

export const ERROR_MESSAGES = {
  coFrom: 'Company Code is a required entry.',
  keyDate: 'Key Date is a required entry.',
} as const

/** Company Code (From) and a valid Key Date are required. */
export function validateSelection(sel: Selection): SelectionErrors {
  return { coFrom: !sel.coFrom, keyDate: !parseDMY(sel.keyDate) }
}

export function isValid(errors: SelectionErrors): boolean {
  return !errors.coFrom && !errors.keyDate
}

// ------------------------------------------------------------------ table

export function columnsFor(dealType: DealType): readonly Column[] {
  return dealType === 'FX' ? FX_COLUMNS : OP_COLUMNS
}

export function txnTypesFor(dealType: DealType): readonly TxnType[] {
  return dealType === 'FX' ? FX_TXN_TYPES : OP_TXN_TYPES
}

export const EMPTY_COL_FILTERS: ColFilters = { type: '', status: '', trader: '' }
export const DEFAULT_SORT: SortState = { field: null, dir: 'asc' }

/** Case-insensitive substring match against any of the visible columns. */
export function rowMatchesSearch(r: Deal, term: string, cols: readonly Column[]): boolean {
  if (!term) return true
  const t = term.toLowerCase()
  return cols.some((c) => {
    const v = r[c.key]
    return v !== undefined && v !== null && String(v).toLowerCase().includes(t)
  })
}

export function filterSortRows(
  rows: readonly Deal[],
  cols: readonly Column[],
  search: string,
  colFilters: ColFilters,
  sort: SortState,
): Deal[] {
  const out = rows.filter((r) => {
    if (!rowMatchesSearch(r, search, cols)) return false
    if (colFilters.type && r.SFHAART !== colFilters.type) return false
    if (colFilters.status && r.TXN_STATUS !== colFilters.status) return false
    if (colFilters.trader && r.RDEALER !== colFilters.trader) return false
    return true
  })
  const key = sort.field
  if (!key) return out
  const dir = sort.dir === 'asc' ? 1 : -1
  return out.slice().sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va || '').localeCompare(String(vb || '')) * dir
  })
}

/** Clicking a header: same column flips direction, a new column sorts ascending. */
export function nextSort(sort: SortState, key: SortState['field']): SortState {
  if (sort.field === key) return { field: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { field: key, dir: 'asc' }
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function recordCountText(total: number): string {
  return total + (total === 1 ? ' record' : ' records')
}

// ------------------------------------------------------------------ actions

export function updateToastText(count: number): string {
  return 'External Reference Updated Successfully (' + count + ' transaction' + (count > 1 ? 's' : '') + ')'
}

export function resultsTitle(dealType: DealType): string {
  return dealType === 'FX' ? 'External FX Deals' : 'External Option Deals'
}

// ------------------------------------------------------------------ CSV

function csvCell(value: unknown): string {
  const v = String(value === undefined || value === null ? '' : value).replace(/"/g, '""')
  return /[,"\n]/.test(v) ? '"' + v + '"' : v
}

/** Header of column labels, then the raw (unformatted) values of each row. */
export function buildCsv(cols: readonly Column[], rows: readonly Deal[]): string {
  const lines = [cols.map((c) => c.label).join(',')]
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c.key])).join(','))
  return lines.join('\n')
}

export function csvFileName(dealType: DealType, keyDateIso: string): string {
  return 'external_deals_' + dealType + '_' + (keyDateIso || 'export') + '.csv'
}
