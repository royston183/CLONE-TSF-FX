/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { TODAY, addDays, dateDiff, formatAmount, parseDate } from './format.ts'
import type { AdjustedInvoiceRow, BlRow, DealRow, FxRow, InvoiceRow, PlannedPlRow, SettlementRow, Sort, ViewDealData } from './types.ts'

// ---------------------------------------------------------------- derived columns

/**
 * The loop after the SELECT: ZEAR_START = ze_date - 270, DAYS_SHIP / DAYS_END / DAYS_STR =
 * ship start / deal end / deal start - sy-datum. Status text and model text are set by api.ts.
 */
export function enrichRow(row: Omit<DealRow, 'status' | 'statusDesc' | 'modelDesc' | 'manualMarked' | 'earliestStart' | 'daysShip' | 'daysEnd' | 'daysStart'>): DealRow {
  return {
    ...row,
    status: '02',
    statusDesc: '',
    modelDesc: '',
    manualMarked: false,
    earliestStart: addDays(row.dealEnd, -270),
    daysShip: dateDiff(row.shipStart, TODAY),
    daysEnd: dateDiff(row.dealEnd, TODAY),
    daysStart: dateDiff(row.dealStart, TODAY),
  }
}

// ---------------------------------------------------------------- filter / sort

const DATE_KEYS = new Set(['dealStart', 'dealEnd', 'earliestStart', 'shipStart', 'shipEnd'])
const NUM_KEYS = new Set(['amount', 'daysShip', 'daysEnd', 'daysStart'])

/**
 * The screen's live filters. `useDateRange` is P_MARK's `zship_start >= low AND zship_end >= high`; the
 * automatic mode passes false, since its date rule (ship start <= today) was applied when it loaded.
 */
export function filterRows(rows: readonly DealRow[], search: string, dateFrom: Date | null, dateTo: Date | null, origin: string, region: string, model: string, useDateRange = true): DealRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (row.status !== '02') return false
    if (origin && row.origin !== origin) return false
    if (region && row.region !== region) return false
    if (model && row.model !== model) return false
    if (useDateRange) {
      const shipStart = parseDate(row.shipStart)
      const shipEnd = parseDate(row.shipEnd)
      if (!shipStart || !shipEnd) return false
      if (dateFrom && shipStart.getTime() < dateFrom.getTime()) return false
      if (dateTo && shipEnd.getTime() < dateTo.getTime()) return false
    }
    if (q && !searchableText(row).includes(q)) return false
    return true
  })
}

function searchableText(row: DealRow): string {
  return [row.dealId, row.dealDesc, row.mcRef, row.commodity, row.dealStart, row.dealEnd, row.earliestStart, row.status, row.statusDesc, row.origin, row.model, row.region, row.modelDesc, row.amount === null ? '' : formatAmount(row.amount), row.shipStart, row.shipEnd, String(row.daysShip), String(row.daysEnd), String(row.daysStart)]
    .join(' ')
    .toLowerCase()
}

export function sortRows(rows: readonly DealRow[], sort: Sort): DealRow[] {
  return rows.slice().sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    let cmp: number
    if (NUM_KEYS.has(sort.key)) {
      cmp = (Number(av) || 0) - (Number(bv) || 0)
    } else if (DATE_KEYS.has(sort.key)) {
      cmp = (parseDate(String(av))?.getTime() ?? 0) - (parseDate(String(bv))?.getTime() ?? 0)
    } else {
      const as = String(av ?? '').toLowerCase()
      const bs = String(bv ?? '').toLowerCase()
      cmp = as === bs ? 0 : as < bs ? -1 : 1
    }
    return cmp * sort.dir
  })
}

// ---------------------------------------------------------------- CSV

const CSV_COLUMNS: Array<{ key: keyof DealRow; label: string; date?: boolean; amount?: boolean }> = [
  { key: 'dealId', label: 'Deal ID' },
  { key: 'dealDesc', label: 'Deal ID Description' },
  { key: 'mcRef', label: 'MC Ref No' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'dealStart', label: 'Deal Start Date' },
  { key: 'dealEnd', label: 'Deal End Date' },
  { key: 'earliestStart', label: 'Earliest Shipment Start' },
  { key: 'status', label: 'Deal Status' },
  { key: 'statusDesc', label: 'Deal Status Description' },
  { key: 'origin', label: 'Origin Entity' },
  { key: 'model', label: 'FX Model' },
  { key: 'region', label: 'Region' },
  { key: 'modelDesc', label: 'FX Model Description' },
  { key: 'amount', label: 'Deal Amt (USD)', amount: true },
  { key: 'shipStart', label: 'MC Shipment Start' },
  { key: 'shipEnd', label: 'MC Shipment End' },
  { key: 'daysShip', label: 'Days-Ship Start' },
  { key: 'daysEnd', label: 'Days (Deal End)' },
  { key: 'daysStart', label: 'Days (Deal Start)' },
]

function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

export function buildCsv(rows: readonly DealRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.label)).join(',')]
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.amount ? (row[c.key] === null ? '' : formatAmount(row[c.key] as number)) : row[c.key])).join(','))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------- View Deal ID (ZSGTSF_RVIEW_DEAL)

/**
 * The Deal ID hotspot SUBMITs ZSGTSF_RVIEW_DEAL, which is not in this export. Its header shows
 * what the Deal ID and its MC already hold; its FX legs come from TrmFxApp + FxTransaction
 * (dealLegs.ts, forward / swap only); its planned / adjusted invoices, BLs,
 * settlement lines and planned P&L are that program's own reads (VTBFHA, ZSGTSFCDS_FX,
 * ZSGTSFTR_INV_REF, ZSGTSFTR_BIL_ADJ, ZSGTSFTR_BL ...) and stay empty: WAITING FOR API.
 */
export const WAITING_VIEW_DEAL = 'WAITING FOR API — View Deal ID (ZSGTSF_RVIEW_DEAL) is not in this export; its invoice, BL, settlement and P&L reads have no API yet'

/** Its actions (confirm, save, re-calculate, settle, amend end date) are the same program's. */
export const waitingAction = (what: string): string => `WAITING FOR ACTION API — ${what} (ZSGTSF_RVIEW_DEAL, not in this export) has no API yet. Nothing was posted to SAP.`

export function buildViewDealData(row: DealRow): ViewDealData {
  return {
    companyCode: '',
    dealRef: row.dealDesc,
    mcDate: row.mcDate,
    mcDesc: row.mcDesc,
    entityString: row.entityString,
    currencyString: row.currencyString,
    traderCode: row.trader,
    traderDesc: '',
    statusText: row.statusDesc ? `${row.status} - ${row.statusDesc}` : row.status,
    fxRows: [],
    invoiceRows: [],
  }
}

export function buildFxRows(_row: DealRow, _companyCode: string): FxRow[] {
  return []
}

export function buildInvoiceRows(_row: DealRow): InvoiceRow[] {
  return []
}

export function buildPlannedPnlRows(_row: DealRow): { localCurr: string; rows: PlannedPlRow[] } {
  return { localCurr: '', rows: [] }
}

export function buildAdjustedInvoiceRows(_row: DealRow): AdjustedInvoiceRow[] {
  return []
}

export function buildBlRows(_row: DealRow): BlRow[] {
  return []
}

export function buildSettlementInvoiceRows(_row: DealRow): SettlementRow[] {
  return []
}
