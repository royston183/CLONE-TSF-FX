import { FX_COLUMNS, OP_COLUMNS } from './data.ts'
import { parseDMY } from './format.ts'
import type { ColFilters, Column, Deal, DealType, Selection, SortState } from './types.ts'

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

export function resultsTitle(dealType: DealType): string {
  return dealType === 'FX' ? 'External FX Deals' : 'External Option Deals'
}

// ------------------------------------------------------------------ CSV

function csvCell(value: unknown): string {
  const v = String(value === undefined || value === null ? '' : value).replace(/"/g, '""')
  return /[,"\n]/.test(v) ? '"' + v + '"' : v
}

/** A rate column's value to four decimals, ungrouped; swap points and everything else stay raw. */
function csvValue(c: Column, value: unknown): unknown {
  return c.type === 'rate' && c.key !== 'SWAP' && typeof value === 'number' ? value.toFixed(4) : value
}

/** Header of column labels, then the raw (unformatted) values of each row; rates to four decimals. */
export function buildCsv(cols: readonly Column[], rows: readonly Deal[]): string {
  const lines = [cols.map((c) => c.label).join(',')]
  for (const r of rows) lines.push(cols.map((c) => csvCell(csvValue(c, r[c.key]))).join(','))
  return lines.join('\n')
}

export function csvFileName(dealType: DealType, keyDateIso: string): string {
  return 'external_deals_' + dealType + '_' + (keyDateIso || 'export') + '.csv'
}
