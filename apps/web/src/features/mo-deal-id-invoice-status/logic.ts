/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { formatAmount, toDisplayDate } from './format.ts'
import type { DealRow, Sort } from './types.ts'

// ---------------------------------------------------------------- filter / sort

export function filterRows(rows: readonly DealRow[], search: string, origin: string, region: string, model: string, keyIso: string): DealRow[] {
  const q = search.toLowerCase().trim()
  return rows.filter((row) => {
    if (q && !allRenderedText(row).includes(q)) return false
    if (origin && row.origin !== origin) return false
    if (region && row.region !== region) return false
    if (model && row.modelId !== model) return false
    if (keyIso && (row.startDate > keyIso || row.endDate < keyIso)) return false
    return true
  })
}

function allRenderedText(row: DealRow): string {
  return [
    row.dealId,
    row.dealDesc,
    row.mcRef,
    toDisplayDate(row.startDate),
    toDisplayDate(row.endDate),
    row.rfha1,
    row.rfha2,
    row.rfha3,
    row.rfha4,
    row.rfha5,
    row.dealStatus,
    row.dealStatusDesc,
    row.origin,
    row.modelId,
    row.region,
    row.modelDesc,
    row.utiAmt === null ? '' : formatAmount(row.utiAmt),
    row.invStatus,
    row.t1Amt === null ? '' : formatAmount(row.t1Amt),
  ]
    .join(' ')
    .toLowerCase()
}

export function sortRows(rows: readonly DealRow[], sort: Sort): DealRow[] {
  if (!sort.key) return rows.slice()
  const key = sort.key
  return rows.slice().sort((a, b) => {
    let av: unknown = a[key]
    let bv: unknown = b[key]
    if (av === null || av === undefined) av = ''
    if (bv === null || bv === undefined) bv = ''
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
    const as = String(av).toLowerCase()
    const bs = String(bv).toLowerCase()
    if (as < bs) return -1 * sort.dir
    if (as > bs) return 1 * sort.dir
    return 0
  })
}

export const nextSort = (sort: Sort, key: Sort['key']): Sort => (sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: 1 })

/** Which CSS status class a Deal Status Desc gets — mirrors the legacy statusClass(). */
export function statusClass(value: string): string {
  if (value === 'FO: FX Deals Created') return 'status-created'
  if (value === 'Settlement Initiated') return 'status-confirmed'
  if (value === 'Settlement Completed - Execution') return 'status-active'
  if (value === 'Deal ID Cancelled') return 'status-closed'
  if (value.includes('Invoice') || value.includes('BL Assigned')) return 'status-confirmed'
  return 'status-active'
}

// ---------------------------------------------------------------- CSV

const CSV_COLUMNS: Array<{ key: keyof DealRow; label: string; date?: boolean; amount?: boolean }> = [
  { key: 'dealId', label: 'Deal ID' },
  { key: 'dealDesc', label: 'Deal ID Desc' },
  { key: 'mcRef', label: 'MC Ref No' },
  { key: 'startDate', label: 'Start Date', date: true },
  { key: 'endDate', label: 'End Date', date: true },
  { key: 'rfha1', label: 'FX Deal 1' },
  { key: 'rfha2', label: 'FX Deal 2' },
  { key: 'rfha3', label: 'FX Deal 3' },
  { key: 'rfha4', label: 'FX Deal 4' },
  { key: 'rfha5', label: 'FX Deal 5' },
  { key: 'dealStatus', label: 'Deal Status' },
  { key: 'dealStatusDesc', label: 'Deal Status Desc' },
  { key: 'origin', label: 'Origin Entity' },
  { key: 'modelId', label: 'FX Model' },
  { key: 'region', label: 'Region' },
  { key: 'modelDesc', label: 'FX Model Desc' },
  { key: 'utiAmt', label: 'D1(USD)', amount: true },
  { key: 'invStatus', label: 'Inv Status' },
  { key: 't1Amt', label: 'T1(USD)', amount: true },
]

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

export function buildCsv(rows: readonly DealRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.label)).join(',')]
  for (const row of rows) {
    lines.push(
      CSV_COLUMNS.map((c) => {
        let v: unknown = row[c.key]
        if (c.date) v = toDisplayDate(String(v ?? ''))
        else if (c.amount && v !== null && v !== '') v = Number(v).toFixed(2)
        return csvCell(v === null || v === undefined ? '' : (v as string | number))
      }).join(','),
    )
  }
  return lines.join('\r\n')
}

