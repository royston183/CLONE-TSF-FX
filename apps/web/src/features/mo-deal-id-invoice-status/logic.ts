/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { COMPANY_CODES } from './data.ts'
import { compactAmount, formatAmount, isoShift, toDisplayDate } from './format.ts'
import type { DealRow, FxRow, InvoiceRow, PlRow, Sort, Trader } from './types.ts'

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
    formatAmount(row.utiAmt),
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

// ---------------------------------------------------------------- Deal ID Analysis workspace

export function dealEntityString(row: DealRow): string {
  const p = row.dealDesc.split('/')
  return p.length > 1 ? p[1]! : 'OGA-DMCC-OSIPL'
}

export function traderForRow(row: DealRow): Trader {
  if (row.dealDesc.indexOf('Antony N') === 0) return { code: 'ANT', desc: 'Antony N' }
  if (row.dealDesc.indexOf('Vaishnavi J') === 0) return { code: 'VAI', desc: 'Vaishnavi J' }
  return { code: 'NIR', desc: 'Niranjan K' }
}

const CURRENCY_STRING_BY_MODEL: Record<string, string> = {
  M032: 'USD-USD-INR',
  M033: 'INR-INR-INR',
  M034: 'INR-INR-INR',
  M035: 'INR-INR-USD',
  M036: 'USD-INR-INR',
  M037: 'USD-USD-INR',
  M041: 'INR-INR-INR',
}
export const currencyStringForModel = (model: string): string => CURRENCY_STRING_BY_MODEL[model] ?? 'USD-INR'
export const entityCompany = (entity: string): string => COMPANY_CODES[entity] ?? 'IN11'

export function mcDescriptionFor(row: DealRow): string {
  return `${row.origin}_Multi-Commodity_${row.modelId}_${compactAmount(row.utiAmt)}`
}

export function buildFxRows(row: DealRow): FxRow[] {
  const entityParts = dealEntityString(row).split('-')
  const rfhas = [row.rfha1, row.rfha2, row.rfha3, row.rfha4, row.rfha5]
  const rows: FxRow[] = []
  rfhas.forEach((rfha, index) => {
    if (!rfha) return
    const i = index + 1
    const entity = entityParts[index % entityParts.length] || row.origin
    const amount = Math.max(100000, Math.round(row.utiAmt * (1 - index * 0.08)))
    const rate = 82.5 + index * 0.35 + (Number(row.dealId.slice(-2)) % 7) * 0.03
    rows.push({
      type: `D${i}`,
      entity,
      bukrs: entityCompany(entity),
      partner: index % 2 ? 'DBS BANK LTD' : 'STANDARD CHARTERED BANK SINGAPORE',
      rfha,
      product: row.modelId === 'M032' || row.modelId === 'M037' ? '619' : '631',
      txn: row.modelId === 'M032' || row.modelId === 'M037' ? 'Forward-TSF' : 'FX Option-TSF',
      start: toDisplayDate(row.startDate),
      end: toDisplayDate(row.endDate),
      bs1: index % 2 ? 'Sell' : 'Buy',
      curr1: 'USD',
      amt1: formatAmount(amount),
      bs2: index % 2 ? 'Buy' : 'Sell',
      curr2: 'INR',
      amt2: formatAmount(amount * rate),
      rate: rate.toFixed(6),
      status: row.dealStatus === '30' ? '30 - Cancelled' : '03 - Confirmed',
    })
  })
  return rows
}

export function buildInvoiceRows(row: DealRow): InvoiceRow[] {
  if (row.dealStatus === '30') return []
  const base = Math.max(100000, Math.round(row.utiAmt / 2))
  const rate = 83.25 + (Number(row.dealId.slice(-2)) % 5) * 0.06
  return [
    { ttype: 'T1', dtype: 'D1', sell: 'OGA', buy: 'OSIPL', curr: 'USD', amt: formatAmount(base), ex: rate.toFixed(7), inv: formatAmount(base * rate), ref: `${row.dealId}-T1` },
    { ttype: 'T2', dtype: 'D2', sell: 'OSIPL', buy: 'DMCC', curr: 'USD', amt: formatAmount(base), ex: (rate + 0.12).toFixed(7), inv: formatAmount(base * (rate + 0.12)), ref: `${row.dealId}-T2` },
  ]
}

export function buildPlRows(row: DealRow): PlRow[] {
  if (row.dealStatus === '30') return []
  const p1 = Math.round(row.utiAmt * 0.0035)
  const p2 = Math.round(row.utiAmt * 0.0012)
  const optionModel = ['M034', 'M035', 'M036', 'M041'].includes(row.modelId)
  const rows: PlRow[] = [{ type: 'FX Deal P&L', f1: formatAmount(p1), l1: formatAmount(p1 * 83.2), f2: '—', l2: '—' }]
  if (optionModel) {
    rows.push({ type: 'Option Premium Income', f1: formatAmount(p2), l1: formatAmount(p2 * 83.2), f2: '—', l2: '—' })
    rows.push({ type: 'Option Premium Expense', f1: formatAmount(p2 * 0.65), l1: formatAmount(p2 * 0.65 * 83.2), f2: '—', l2: '—' })
  }
  const total = p1 + (optionModel ? p2 * 0.35 : 0)
  rows.push({ type: 'Total P&L', f1: formatAmount(total), l1: formatAmount(total * 83.2), f2: '—', l2: '—' })
  return rows
}

export const mcDateFor = (row: DealRow): string => toDisplayDate(isoShift(row.startDate, -30))
