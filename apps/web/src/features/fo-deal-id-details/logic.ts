import { COLUMNS } from './columns.ts'
import type { ReportRow } from './api.ts'
export type Filters = { search: string; keyDate: string; region: string; origin: string; model: string; status: string; co: string }
export const todayIso = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') }
const dates = new Set(['start', 'end', 'mcDate', 'shipStart', 'shipEnd', 'createdDate', 'changedDate'])
export function daysToExpiry(row: ReportRow, keyDate: string): number | null {
  if (!row.end || !keyDate) return null
  const value = Math.round((Date.parse(row.end + 'T00:00:00Z') - Date.parse(keyDate + 'T00:00:00Z')) / 86400000)
  return Number.isFinite(value) ? value : null
}
export function cellValue(row: ReportRow, key: string, keyDate: string): string {
  if (key === 'days') return String(daysToExpiry(row, keyDate) ?? '\u2014')
  const value = row[key]
  if (value == null || value === '') return '\u2014'
  if (dates.has(key)) return value.split('-').reverse().join('-')
  if (COLUMNS.find(c => c.key === key)?.numeric) return Number(value).toLocaleString('en-US', { minimumFractionDigits: key === 'plRate' ? 4 : 2, maximumFractionDigits: key === 'plRate' ? 4 : 2 })
  return value
}
export function filterRows(rows: ReportRow[], f: Filters, sort: string, descending: boolean) {
  const result = rows.filter(r => {
    if (f.keyDate && r.end && r.end < f.keyDate) return false
    for (const key of ['region', 'origin', 'model', 'status', 'co'] as const) if (f[key] && r[key] !== f[key]) return false
    return !f.search || COLUMNS.some(c => cellValue(r, c.key, f.keyDate).toLowerCase().includes(f.search.toLowerCase()))
  })
  const numeric = COLUMNS.find(c => c.key === sort)?.numeric || sort === 'days'
  return result.sort((a, b) => {
    const av = sort === 'days' ? daysToExpiry(a, f.keyDate) : a[sort]
    const bv = sort === 'days' ? daysToExpiry(b, f.keyDate) : b[sort]
    const cmp = numeric ? Number(av ?? 0) - Number(bv ?? 0) : String(av ?? '').localeCompare(String(bv ?? ''))
    return descending ? -cmp : cmp
  })
}
