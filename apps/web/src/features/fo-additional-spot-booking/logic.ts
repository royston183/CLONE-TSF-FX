/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { fmtAmount, parseAmountInput, parseDate } from './format.ts'
import type { CreateFormErrors, CreateFormValues, Filters, Side, Sort, SortKey, SpotRow } from './types.ts'

// ---------------------------------------------------------------- filtering / sorting

const SEARCH_KEYS: (keyof SpotRow)[] = [
  'dealId',
  'modelId',
  'dealType',
  'dssType',
  'companyCode',
  'companyName',
  'originalTxn',
  'tradeType',
  'finalAmt',
  'fxDealAmt',
  'currency',
  'diffAmt',
  'spotTxn',
  'tradeDate',
  'valueDate',
  'partner',
  'partnerName',
  'group',
  'side',
  'tsfEntity',
  'createdBy',
  'createdDate',
]

function rowSearchText(r: SpotRow): string {
  return SEARCH_KEYS.map((k) => r[k])
    .join(' ')
    .toLowerCase()
}

/** A single deal ID, a substring match, or "low-high" — both ends inclusive, either order. */
export function dealRangeMatch(id: string, raw: string): boolean {
  const value = String(raw || '').replace(/\s/g, '')
  if (!value) return true
  if (value.indexOf('-') > 0) {
    const parts = value.split('-')
    if (parts.length === 2 && /^\d+$/.test(parts[0]!) && /^\d+$/.test(parts[1]!)) {
      let low = Number(parts[0])
      let high = Number(parts[1])
      if (low > high) [low, high] = [high, low]
      const n = Number(id)
      return n >= low && n <= high
    }
  }
  return String(id).toLowerCase().includes(value.toLowerCase())
}

/** New Spot (no spotTxn yet) and/or Spot Created, whichever the toolbar checkboxes show. */
function statusMatch(r: SpotRow, filters: Filters): boolean {
  return (!r.spotTxn && filters.showNew) || (!!r.spotTxn && filters.showCreated)
}

export function filterSortRows(rows: readonly SpotRow[], filters: Filters, sort: Sort): SpotRow[] {
  const q = filters.q.trim().toLowerCase()
  const list = rows.filter((r) => statusMatch(r, filters) && (!q || rowSearchText(r).includes(q)) && dealRangeMatch(r.dealId, filters.dealFilter))

  list.sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    const [x, y] = typeof av === 'number' || typeof bv === 'number' ? [Number(av) || 0, Number(bv) || 0] : [String(av ?? '').toLowerCase(), String(bv ?? '').toLowerCase()]
    if (x < y) return -1 * sort.dir
    if (x > y) return 1 * sort.dir
    return 0
  })
  return list
}

export const nextSort = (sort: Sort, key: SortKey): Sort => (sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: 1 })

// ---------------------------------------------------------------- create spot

/** A row is eligible for Create Spot Txn once it has no spot yet and a non-zero difference. */
export function canCreate(r: SpotRow | null | undefined): boolean {
  return !!r && !r.spotTxn && Number(r.diffAmt) !== 0
}

export function blankCreateForm(r: SpotRow): CreateFormValues {
  return { companyCode: r.companyCode, txnType: r.defaultTxnType, partner: r.partner, tradeDate: r.tradeDate, valueDate: r.valueDate, rate: '' }
}

/**
 * Buy/sell currency and amount for the modal's Currency Amounts panel: the difference amount
 * split at the entered spot rate, in whichever leg the row's side puts on which side.
 * `base * rate` when the deal currency is USD, `base / rate` otherwise — the legacy recalcAmounts.
 */
export function recalcAmounts(
  r: SpotRow,
  rate: number,
): { buyCurr: string; sellCurr: string; buyAmt: string; sellAmt: string } {
  const base = Math.abs(Number(r.diffAmt))
  const other = rate > 0 ? (r.currency === 'USD' ? base * rate : base / rate) : 0
  const [buyCurr, sellCurr, buyAmt, sellAmt]: [string, string, number, number] =
    r.side === 'Buy' ? [r.currency, r.otherCurrency, base, other] : [r.otherCurrency, r.currency, other, base]
  return { buyCurr, sellCurr, buyAmt: fmtAmount(buyAmt), sellAmt: fmtAmount(sellAmt) }
}

export function validateCreateForm(values: CreateFormValues): { valid: boolean; errors: CreateFormErrors } {
  const errors: CreateFormErrors = {}
  if (!values.companyCode) errors.company = 'Required'
  if (!values.txnType) errors.txnType = 'Required'
  if (!values.partner) errors.partner = 'Required'
  if (!parseDate(values.tradeDate)) errors.tradeDate = 'Enter dd-mm-yyyy'
  if (!parseDate(values.valueDate)) errors.valueDate = 'Enter dd-mm-yyyy'
  const rate = parseAmountInput(values.rate)
  if (!(rate > 0)) errors.rate = 'Enter a valid rate'
  return { valid: Object.keys(errors).length === 0, errors }
}

/** The row as Create Spot leaves it: the picked company/partner/dates, and a fresh spot number. */
export function applyCreate(r: SpotRow, values: CreateFormValues, spotTxn: string, createdBy: string, createdDate: string, companyName: string): SpotRow {
  return {
    ...r,
    companyCode: values.companyCode,
    companyName,
    partner: values.partner,
    tradeDate: values.tradeDate,
    valueDate: values.valueDate,
    spotTxn,
    createdBy,
    createdDate,
  }
}

// ---------------------------------------------------------------- transaction detail

export function detailItems(r: SpotRow, kind: 'original' | 'spot'): Array<[string, string]> {
  const txn = kind === 'spot' ? r.spotTxn : r.originalTxn
  const status = kind === 'spot' ? 'Created Spot Transaction' : 'Original FX Transaction'
  const amount = kind === 'spot' ? Math.abs(r.diffAmt) : r.fxDealAmt
  return [
    ['Transaction', txn],
    ['View', status],
    ['Company Code', r.companyCode],
    ['Deal ID', r.dealId],
    ['Product Type', kind === 'spot' ? '12A' : r.dealType],
    ['Trade Type', r.tradeType],
    ['Trade Date', r.tradeDate],
    ['Value Date', r.valueDate],
    ['Business Partner', `${r.partner} — ${r.partnerName}`],
    ['Currency', r.currency],
    ['Amount', fmtAmount(amount)],
    ['TSF Entity', r.tsfEntity],
  ]
}

// ---------------------------------------------------------------- CSV export

const CSV_COLUMNS: Array<{ header: string; key: keyof SpotRow; amount?: boolean }> = [
  { header: 'Deal ID', key: 'dealId' },
  { header: 'Model', key: 'modelId' },
  { header: 'FX Deal', key: 'dealType' },
  { header: 'DSS Deal', key: 'dssType' },
  { header: 'Company Code', key: 'companyCode' },
  { header: 'Original Txn', key: 'originalTxn' },
  { header: 'Trade Type', key: 'tradeType' },
  { header: 'Final Amt', key: 'finalAmt', amount: true },
  { header: 'FX Deal Amt', key: 'fxDealAmt', amount: true },
  { header: 'Currency', key: 'currency' },
  { header: 'Diff Inv Amt', key: 'diffAmt', amount: true },
  { header: 'Spot Txn', key: 'spotTxn' },
  { header: 'Trade Date', key: 'tradeDate' },
  { header: 'Value Date', key: 'valueDate' },
  { header: 'Business Partner', key: 'partner' },
  { header: 'Group', key: 'group' },
  { header: 'Company Name', key: 'companyName' },
  { header: 'Side', key: 'side' },
  { header: 'TSF Entity', key: 'tsfEntity' },
  { header: 'Created By', key: 'createdBy' },
  { header: 'Created Date', key: 'createdDate' },
]

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

/** The download's rows, header first — a plain string so the caller only has to hand it to a Blob. */
export function buildCsv(rows: readonly SpotRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(',')]
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.amount ? (Number(r[c.key]) || 0).toFixed(2) : (r[c.key] as string | number))).join(','))
  }
  return lines.join('\r\n')
}

export const sideClass = (side: Side): string => (side === 'Buy' ? 'side-buy' : 'side-sell')
