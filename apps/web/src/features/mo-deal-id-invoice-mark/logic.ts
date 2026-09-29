/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { modelName } from './data.ts'
import { TODAY, addDays, dateDiff, formatAmount, parseDate } from './format.ts'
import type { AdjustedInvoiceRow, BlRow, DealRow, FxRow, InvoiceRow, PlannedPlRow, SettlementRow, Sort, ViewDealData } from './types.ts'

// ---------------------------------------------------------------- seeding

/** Fills the columns the legacy enrichRow() derives: earliest shipment start and day-counts vs today. */
export function enrichRow(row: Omit<DealRow, 'status' | 'statusDesc' | 'modelDesc' | 'manualMarked' | 'earliestStart' | 'daysShip' | 'daysEnd' | 'daysStart'>): DealRow {
  return {
    ...row,
    status: '02',
    statusDesc: 'Ready for Invoicing',
    modelDesc: modelName(row.model),
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

export function filterRows(rows: readonly DealRow[], search: string, dateFrom: Date | null, dateTo: Date | null, origin: string, region: string, model: string): DealRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (row.status !== '02') return false
    if (origin && row.origin !== origin) return false
    if (region && row.region !== region) return false
    if (model && row.model !== model) return false
    const shipStart = parseDate(row.shipStart)
    const shipEnd = parseDate(row.shipEnd)
    if (!shipStart || !shipEnd) return false
    if (dateFrom && shipStart.getTime() < dateFrom.getTime()) return false
    if (dateTo && shipEnd.getTime() < dateTo.getTime()) return false
    if (q && !searchableText(row).includes(q)) return false
    return true
  })
}

function searchableText(row: DealRow): string {
  return [row.dealId, row.dealDesc, row.mcRef, row.commodity, row.dealStart, row.dealEnd, row.earliestStart, row.status, row.statusDesc, row.origin, row.model, row.region, row.modelDesc, formatAmount(row.amount), row.shipStart, row.shipEnd, String(row.daysShip), String(row.daysEnd), String(row.daysStart)]
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
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.amount ? formatAmount(row[c.key] as number) : row[c.key])).join(','))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------- Deal ID Analysis (View Deal ID)

const CODE_MAP: Record<string, string> = { OGA: 'AE13', DMCC: 'AE13', OSIPL: 'IN11', SEDA: 'ES12', PAN: 'IN11' }
const ENTITY_MAP: Record<string, string> = { OGA: 'OGA-DMCC-PAN', DMCC: 'DMCC-OGA-PAN', OSIPL: 'OSIPL-OGA-PAN', SEDA: 'SEDA-DMCC-OGA', PAN: 'PAN-OGA-DMCC' }
const CURRENCY_MAP: Record<string, string> = { APAC: 'USD-INR', MEA: 'USD-AED', EUR: 'USD-EUR' }

export function regionRate(region: string): number {
  return region === 'MEA' ? 3.6725 : region === 'EUR' ? 0.9345 : 83.12
}
export function regionCurrency(region: string): string {
  return region === 'MEA' ? 'AED' : region === 'EUR' ? 'EUR' : 'INR'
}

export function buildViewDealData(row: DealRow): ViewDealData {
  const traderCode = Number(row.dealId.slice(-1)) % 2 === 0 ? 'OGA' : 'OTL'
  const traderDesc = traderCode === 'OGA' ? 'Olam Global Agri' : 'Olam Treasury Limited'
  const companyCode = CODE_MAP[row.origin] ?? 'AE13'
  return {
    companyCode,
    dealRef: row.dealDesc,
    mcDate: addDays(row.shipStart, -20),
    mcDesc: `${row.commodity} Master Contract`,
    entityString: ENTITY_MAP[row.origin] ?? `${row.origin}-OGA-PAN`,
    currencyString: CURRENCY_MAP[row.region] ?? 'USD-INR',
    traderCode,
    traderDesc,
    statusText: `${row.status} - ${row.statusDesc}`,
    fxRows: buildFxRows(row, companyCode),
    invoiceRows: buildInvoiceRows(row),
  }
}

export function buildFxRows(row: DealRow, companyCode: string): FxRow[] {
  const rate = regionRate(row.region)
  const targetCurr = regionCurrency(row.region)
  const rfha = `20${row.dealId.slice(-5)}`
  const rows: FxRow[] = [
    {
      bukrs: companyCode,
      dealType: 'FX Forward',
      rfha,
      start: row.dealStart,
      end: row.dealEnd,
      text: `${row.commodity} hedge`,
      entity: row.origin,
      side1: 'Buy',
      curr1: 'USD',
      amt1: row.amount,
      side2: 'Sell',
      curr2: targetCurr,
      amt2: row.amount * rate,
      spot: rate,
      swap: 0.0125,
      allIn: rate + 0.0125,
      strike: '',
      mcRef: row.mcRef,
      txnStatus: 'Active',
      premium: '',
      premiumCurr: '',
    },
  ]
  if (row.model === 'MIXED') {
    rows.push({
      bukrs: companyCode,
      dealType: 'FX Option',
      rfha: String(Number(rfha) + 1),
      start: row.dealStart,
      end: row.dealEnd,
      text: `${row.commodity} option leg`,
      entity: row.origin,
      side1: 'Buy',
      curr1: 'USD',
      amt1: row.amount * 0.35,
      side2: 'Sell',
      curr2: targetCurr,
      amt2: row.amount * 0.35 * rate,
      spot: '',
      swap: '',
      allIn: '',
      strike: rate + 0.11,
      mcRef: row.mcRef,
      txnStatus: 'Active',
      premium: row.amount * 0.0015,
      premiumCurr: 'USD',
    })
  }
  return rows
}

export function buildInvoiceRows(row: DealRow): InvoiceRow[] {
  const localCurr = regionCurrency(row.region)
  const rate = regionRate(row.region)
  const shares = [0.4, 0.35, 0.25]
  return shares.map((share, i) => {
    const amount = row.amount * share
    return {
      ref: `INV${row.dealId.slice(-5)}-${String(i + 1).padStart(2, '0')}`,
      tradeType: `T${i + 1}`,
      dealType: i === 0 ? 'Purchase' : i === 1 ? 'Sale' : 'Adjustment',
      sell: i === 1 ? row.origin : 'OGA',
      buy: i === 1 ? 'OGA' : row.origin,
      curr: localCurr,
      mcPrimary: row.mcRef,
      mcSecondary: i === 2 ? `${row.mcRef}-S` : '',
      usdAmount: amount,
      localAmount: amount * rate,
      exchangeRate: rate,
    }
  })
}

export function buildPlannedPnlRows(row: DealRow): { localCurr: string; rows: PlannedPlRow[] } {
  const rate = regionRate(row.region)
  const localCurr = regionCurrency(row.region)
  const purchase = row.amount * 0.976
  const premiumIn = row.model === 'MIXED' ? row.amount * 0.0024 : 0
  const premiumOut = row.model === 'MIXED' ? row.amount * -0.0014 : 0
  const ndfAdj = row.model === 'FWD' ? row.amount * 0.0008 : 0
  const total = row.amount - purchase + premiumIn + premiumOut + ndfAdj
  return {
    localCurr,
    rows: [
      { type: 'Sale', usd: row.amount, local: row.amount * rate },
      { type: 'Purchase', usd: -purchase, local: -purchase * rate },
      { type: 'Option Premium Income', usd: premiumIn, local: premiumIn * rate },
      { type: 'Option Premium Expense', usd: premiumOut, local: premiumOut * rate },
      { type: 'NDF Fixing-Profit Adj', usd: ndfAdj, local: ndfAdj * rate },
      { type: 'Total P&L', usd: total, local: total * rate, total: true },
    ],
  }
}

export function buildAdjustedInvoiceRows(row: DealRow): AdjustedInvoiceRow[] {
  const base = buildInvoiceRows(row)
  return base.map((b, i) => {
    const qty = 2500 + i * 750
    return {
      ...b,
      ttype: b.tradeType,
      invType: i === 2 ? 'ADJ' : 'STD',
      commodity: row.commodity,
      qty,
      usdPrice: b.usdAmount / qty,
      rate: b.exchangeRate,
      invDate: addDays(row.shipStart, i * 3),
      dueDate: addDays(row.shipStart, 30 + i * 3),
      finalInv: b.usdAmount,
      invUsd: b.usdAmount,
      planned: b.usdAmount,
      partnerBank: i === 0 ? '0001' : i === 1 ? '0003' : '0005',
    }
  })
}

export function buildBlRows(row: DealRow): BlRow[] {
  const weights = [0.34, 0.33, 0.33]
  const price = 975.25
  return weights.map((w, i) => {
    const qty = Math.round((row.amount / price) * w)
    return {
      tfNo: `TF${row.dealId.slice(-5)}`,
      tfSplit: String(i + 1),
      blNo: `BL${row.dealId.slice(-5)}${String(i + 1).padStart(2, '0')}`,
      blSplit: '01',
      blDate: addDays(row.shipStart, i * 6),
      commodity: row.commodity,
      commodityId: row.commodity.substring(0, 3).toUpperCase(),
      incoterm: i === 0 ? 'CIF' : 'FOB',
      invoiceDate: addDays(row.shipStart, 12 + i * 4),
      qty,
      unit: 'MT',
      price,
      tradeValue: qty * price,
    }
  })
}

export function buildSettlementInvoiceRows(row: DealRow): SettlementRow[] {
  const base = buildInvoiceRows(row)
  const fx = buildViewDealData(row).fxRows
  return base.map((b, i) => ({
    seq: i + 1,
    transfer: i === 0 ? 'Bank Transfer' : i === 1 ? 'Customer Receipt' : 'Adjustment',
    linked: fx[i % fx.length]!.rfha,
    receipt: i === 1 ? 'Receipt' : 'Payment',
    invAmt: b.usdAmount,
    invCurr: 'USD',
    payAmt: b.localAmount,
    payCurr: b.curr,
    fiDoc: i === 0 ? `1900${row.dealId.slice(-6)}` : '',
    docMsg: i === 0 ? 'Document ready' : 'Not posted',
    settlement: i === 0,
    posting: i === 0,
  }))
}
