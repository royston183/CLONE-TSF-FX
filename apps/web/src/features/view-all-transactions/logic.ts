import { displayDate, validDate } from '../view-tsf-deals/logic.ts'
import type { Column, Filters, Row, Selection, Sort } from './types.ts'
export { displayDate, validDate }

export const BASIS_LABEL = { blotter: 'Blotter', trade: 'Trade', value: 'Value' } as const
export const EMPTY_FILTERS: Filters = { search: '', type: '', status: '', trader: '', traderGroup: '', businessArea: '', profitCenter: '', partner: '', deal: '', txnType: '', pair: '' }
export const COLUMNS: readonly Column[] = [
  { field: 'deal', label: 'Transaction No.' }, { field: 'company', label: 'Company Code' },
  { field: 'source', label: 'Deal Source' }, { field: 'blotter', label: 'Blotter Date', kind: 'date' },
  { field: 'trade', label: 'Trade Date', kind: 'date' }, { field: 'bs1', label: 'BS1-OCB' },
  { field: 'c1', label: 'Curr 1' }, { field: 'a1', label: 'Amount 1', kind: 'amount' },
  { field: 'bs2', label: 'BS2-OCB' }, { field: 'c2', label: 'Curr 2' }, { field: 'a2', label: 'Amount 2', kind: 'amount' },
  { field: 'rate', label: 'All-in Rate', kind: 'rate' }, { field: 'value', label: 'Value Date', kind: 'date' },
  { field: 'ndfDate', label: 'NDF Fixing Date', kind: 'date' }, { field: 'partnerName', label: 'Business Partner' },
  { field: 'bankRef', label: 'Bank Reference Number' }, { field: 'status', label: 'Txn Status Description' },
  { field: 'businessArea', label: 'Business Area' }, { field: 'profitCenter', label: 'Profit Center' },
  { field: 'txnType', label: 'Transaction Type' }, { field: 'pair', label: 'Currency Pair' },
  { field: 'spot', label: 'Spot Rate', kind: 'rate' }, { field: 'swap', label: 'Swap Rate', kind: 'rate' },
  { field: 'ndfRef', label: 'NDF Reference' }, { field: 'traderGroup', label: 'Trader Group' },
  { field: 'tradeCategory', label: 'Trade Category' }, { field: 'requestor', label: 'BU Requestor' },
  { field: 'trader', label: 'Trader Name' }, { field: 'tsf', label: 'TSF' },
  { field: 'traderCode', label: 'Trader Code' }, { field: 'partner', label: 'Business Partner Code' },
  { field: 'tradeCatCode', label: 'Trade Category Code' }, { field: 'acctCat', label: 'Accounting Category' },
  { field: 'statusCode', label: 'Txn Status Code' }, { field: 'product', label: 'Product Type' },
  { field: 'intExt', label: 'Internal / External' }, { field: 'dealId', label: 'TSF Deal ID' },
  { field: 'remark', label: 'Blotter Remark' },
]
export const DEFAULT_COLUMNS = COLUMNS.slice(0, 22).map((c) => c.field)

export function initialSelection(now = new Date()): Selection {
  const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { company: 'ALL', from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now), basis: 'blotter' }
}
export function selectionError(selection: Selection, companies: readonly string[]): string {
  if (!companies.length || !selection.company || (selection.company !== 'ALL' && !companies.includes(selection.company))) return 'Select an available company code.'
  if (!Object.hasOwn(BASIS_LABEL, selection.basis)) return 'Select a date basis.'
  if (!validDate(selection.from) || !validDate(selection.to)) return 'Enter valid From and To dates.'
  if (selection.from > selection.to) return 'From Date must be on or before To Date.'
  return ''
}
export function matchesSelection(row: Row, selection: Selection, companies: readonly string[]): boolean {
  const date = row[selection.basis]
  return companies.includes(row.company) && (selection.company === 'ALL' || row.company === selection.company)
    && validDate(date) && date >= selection.from && date <= selection.to
}
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function cellValue(row: Row, column: Column): string {
  const value = row[column.field]
  if (value === '' || value === null || value === undefined) return '—'
  if (column.kind === 'date') return displayDate(String(value))
  if (column.kind === 'amount') return money.format(Number(value))
  if (column.kind === 'rate') return Number(value).toFixed(9)
  return String(value)
}
const contains = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase())
export function filterSortRows(rows: readonly Row[], filters: Filters, sort: Sort): Row[] {
  return rows.filter((r) =>
    (!filters.search || COLUMNS.some((c) => contains(cellValue(r, c), filters.search)))
    && (!filters.type || (filters.type === 'TSF-linked' ? !!r.dealId : r.intExt === filters.type))
    && (!filters.status || r.statusCode === filters.status) && (!filters.trader || r.traderCode === filters.trader)
    && (!filters.traderGroup || r.traderGroup === filters.traderGroup)
    && contains(r.businessArea, filters.businessArea) && contains(r.profitCenter, filters.profitCenter)
    && contains(`${r.partner} ${r.partnerName}`, filters.partner) && contains(r.deal, filters.deal)
    && (!filters.txnType || r.txnType === filters.txnType) && (!filters.pair || r.pair === filters.pair))
    .sort((a, b) => {
      const x = a[sort.field], y = b[sort.field]
      if (x === null || x === '') return y === null || y === '' ? a.id.localeCompare(b.id) : 1
      if (y === null || y === '') return -1
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
      return (sort.direction === 'asc' ? result : -result) || a.id.localeCompare(b.id)
    })
}

/** Quote every CSV cell and neutralise spreadsheet formulas in text without changing numbers. */
export function csvOutput(rows: readonly Row[], columns: readonly Column[]): string {
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const safeText = (value: string) => /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value
  const data = rows.map((row) => columns.map((column) => {
    const value = row[column.field]
    return typeof value === 'number' ? quote(value) : quote(safeText(value == null ? '' : column.kind === 'date' ? displayDate(String(value)) : String(value)))
  }).join(','))
  return '\uFEFF' + [columns.map((c) => quote(c.label)).join(','), ...data].join('\r\n')
}
