import type { Column, DealReportRow, Selection, Sort } from './types.ts'

export const COLUMNS: readonly Column[] = [
  { field: 'rfha', label: 'Transaction' }, { field: 'bukrs', label: 'Company Code' },
  { field: 'dealId', label: 'Deal ID' }, { field: 'dealType', label: 'Deal Type' },
  { field: 'product', label: 'Product Type' }, { field: 'bpName', label: 'Partner Name' },
  { field: 'blotter', label: 'Blotter Date', kind: 'date' }, { field: 'tradeDate', label: 'Trade Date', kind: 'date' },
  { field: 'valueDate', label: 'Value Date', kind: 'date' },
  { field: 'bs1', label: 'Buy / Sell 1' }, { field: 'curr1', label: 'Currency 1' }, { field: 'amt1', label: 'Amount 1', kind: 'amount' },
  { field: 'bs2', label: 'Buy / Sell 2' }, { field: 'curr2', label: 'Currency 2' }, { field: 'amt2', label: 'Amount 2', kind: 'amount' },
  { field: 'spot', label: 'Spot Rate', kind: 'rate' }, { field: 'swap', label: 'Swap Rate', kind: 'rate' },
  { field: 'allRate', label: 'All-in Rate', kind: 'rate' },
  { field: 'pnl', label: 'Deal P&L', kind: 'pnl' }, { field: 'localPnl', label: 'Deal P&L (Local)', kind: 'localPnl' },
  { field: 'model', label: 'TSF Model' }, { field: 'subType', label: 'Sub-Type' },
  { field: 'trader', label: 'Trader' }, { field: 'externalRef', label: 'External Reference' },
  { field: 'internalRef', label: 'Internal Reference' }, { field: 'status', label: 'Status' },
  { field: 'mcRef', label: 'MC Ref No' }, { field: 'foRemark', label: 'FO Remark' }, { field: 'moRemark', label: 'MO Remark' },
  { field: 'ndfDate', label: 'NDF Fixing Date', kind: 'date' }, { field: 'ndfRef', label: 'NDF Ref' },
  { field: 'ndfRate', label: 'NDF Settlement Rate', kind: 'ndfRate' },
  { field: 'cashAmount', label: 'Cash Settlement Amount', kind: 'amount' }, { field: 'cashCurrency', label: 'Cash Currency' },
  { field: 'ndfFoRemark', label: 'NDF FO Remark' }, { field: 'ndfMoRemark', label: 'NDF MO Remark' },
]

/** Native date controls use ISO values. Validate the calendar day as well as its spelling. */
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function selectionError(selection: Selection, companies: readonly string[]): string {
  if (!selection.company || !companies.length || (selection.company !== 'ALL' && !companies.includes(selection.company))) return 'Select a company code.'
  if (!validDate(selection.from) || !validDate(selection.to)) return 'Enter a valid blotter date range.'
  if (selection.from > selection.to) return 'The start date must be on or before the end date.'
  return ''
}

export function initialSelection(now = new Date()): Selection {
  const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { company: 'ALL', from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now), trader: '' }
}

export function displayDate(value: string): string {
  return validDate(value) ? `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}` : value
}

const numberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function cellValue(row: DealReportRow, column: Column): string {
  const value = row[column.field]
  if (value === null || value === undefined || value === '') return '—'
  if (column.kind === 'date') return displayDate(String(value))
  if (column.kind === 'rate' || column.kind === 'ndfRate') return Number(value).toFixed(6)
  if (column.kind === 'amount') return numberFormat.format(Number(value))
  if (column.kind === 'pnl' || column.kind === 'localPnl') {
    return `${numberFormat.format(Number(value))} ${column.kind === 'pnl' ? row.pnlCurrency : row.localPnlCurrency}`.trim()
  }
  return String(value)
}

/** Selection also runs locally, so a backend ignoring a filter can never widen the report. */
export function matchesSelection(row: DealReportRow, selection: Selection, companies: readonly string[]): boolean {
  return !!row.dealId && companies.includes(row.bukrs)
    && (selection.company === 'ALL' || row.bukrs === selection.company)
    && validDate(row.blotter) && row.blotter >= selection.from && row.blotter <= selection.to
    && (!selection.trader || row.traderCode === selection.trader)
}

export function filterSortRows(rows: readonly DealReportRow[], search: string, sort: Sort): DealReportRow[] {
  const query = search.trim().toLowerCase()
  return rows.filter((row) => !query || COLUMNS.some((c) => cellValue(row, c).toLowerCase().includes(query)))
    .sort((a, b) => {
      const av = a[sort.field], bv = b[sort.field]
      let result: number
      if (av === null || av === '') return bv === null || bv === '' ? a.id.localeCompare(b.id) : 1
      if (bv === null || bv === '') return -1
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return (sort.direction === 'asc' ? result : -result) || a.id.localeCompare(b.id)
    })
}

/** Export the whole filtered result, retaining identifiers as strings and amounts as numbers. */
export function exportRecords(rows: readonly DealReportRow[]): Record<string, string | number>[] {
  return rows.map((row) => Object.fromEntries(COLUMNS.map((column) => {
    const value = row[column.field]
    return [column.label, column.kind === 'amount' || column.kind === 'rate' || column.kind === 'ndfRate' ? value ?? '' : cellValue(row, column)]
  })) as Record<string, string | number>)
}
