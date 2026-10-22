/**
 * The page's business rules, lifted out of the legacy script as pure functions so the
 * component only holds state.
 */
import { fmtAmount, formatDate, parseAmountInput, parseDate } from './format.ts'
import { SPOT_PRODUCT_TYPE, calculateSpotAmounts, isEligible, type SpotContext } from './spotCreate.ts'
import type { CodeLabel, CreateFormErrors, CreateFormValues, Filters, Side, Sort, SortKey, SpotRow } from './types.ts'

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
export const canCreate = (r: SpotRow | null | undefined): boolean => !!r && isEligible(r)

/** A code is kept only while SAP's drop-down offers it ('' otherwise). */
export const offered = (options: readonly CodeLabel[], code: string): string => (options.some((o) => o.key === code) ? code : '')

/** The popup opens with the legacy default Trade Date (original Value Date - 2 days) and no rate or partner. */
export const blankCreateForm = (ctx: Pick<SpotContext, 'defaultTradeDate'>): CreateFormValues => ({
  partner: '',
  tradeDate: formatDate(ctx.defaultTradeDate),
  rate: '',
})

/** The Currency Amounts panel: buy and sell currency/amount for the entered rate (blank amounts until it is valid). */
export function amountsView(
  r: Pick<SpotRow, 'diffAmt' | 'currency'>,
  ctx: Pick<SpotContext, 'direction' | 'otherCurrency'>,
  rate: number,
): { buyCurr: string; sellCurr: string; buyAmt: string; sellAmt: string } {
  const amounts = calculateSpotAmounts({ diffAmt: r.diffAmt, diffCurrency: r.currency, direction: ctx.direction, otherCurrency: ctx.otherCurrency, rate })
  if (amounts) {
    return { buyCurr: amounts.buyCurrency, sellCurr: amounts.sellCurrency, buyAmt: fmtAmount(amounts.buyAmount), sellAmt: fmtAmount(amounts.sellAmount) }
  }
  const [buyCurr, sellCurr] = ctx.direction === 'Buy' ? [r.currency, ctx.otherCurrency] : [ctx.otherCurrency, r.currency]
  const base = fmtAmount(Math.abs(r.diffAmt))
  return { buyCurr, sellCurr, buyAmt: ctx.direction === 'Buy' ? base : '', sellAmt: ctx.direction === 'Sell' ? base : '' }
}

export function validateCreateForm(values: CreateFormValues): { valid: boolean; errors: CreateFormErrors } {
  const errors: CreateFormErrors = {}
  if (!values.partner) errors.partner = 'Required'
  if (!parseDate(values.tradeDate)) errors.tradeDate = 'Enter dd-mm-yyyy'
  const rate = parseAmountInput(values.rate)
  if (!(rate > 0)) errors.rate = 'Enter a valid rate'
  return { valid: Object.keys(errors).length === 0, errors }
}

/** Once the partners arrive: keep the pick if offered, else the row's own partner if offered, else none. */
export const partnerAfterLoad = (current: string, rowPartner: string, partners: readonly CodeLabel[]): string =>
  offered(partners, current) || offered(partners, rowPartner)

/** The row as Create Spot leaves it: a fresh spot number booked in the spot's own company code. The original deal's fields stay. */
export function applyCreate(r: SpotRow, spotTxn: string, spotCompanyCode: string, createdBy: string, createdDate: string): SpotRow {
  return { ...r, spotTxn, spotProductType: SPOT_PRODUCT_TYPE, spotCompanyCode, createdBy, createdDate }
}

// ---------------------------------------------------------------- transaction detail

export function detailItems(r: SpotRow, kind: 'original' | 'spot'): Array<[string, string]> {
  const txn = kind === 'spot' ? r.spotTxn : r.originalTxn
  const status = kind === 'spot' ? 'Created Spot Transaction' : 'Original FX Transaction'
  const amount = kind === 'spot' ? Math.abs(r.diffAmt) : r.fxDealAmt
  return [
    ['Transaction', txn],
    ['View', status],
    ['Company Code', kind === 'spot' ? (r.spotCompanyCode ?? r.companyCode) : r.companyCode],
    ['Deal ID', r.dealId],
    ['Product Type', kind === 'spot' ? (r.spotProductType ?? '') : r.dealType],
    ['Trade Type', r.tradeType],
    ['Trade Date', r.tradeDate],
    ['Value Date', r.valueDate],
    ['Business Partner', `${r.partner} — ${r.partnerName}`],
    ['Currency', r.currency],
    ['Amount', fmtAmount(amount)],
    ['TSF Entity', r.tsfEntity],
    ...(kind === 'original' ? ndfDetailItems(r) : []),
  ]
}

/** The original deal's NDF fields, listed only when the view served any of them. */
function ndfDetailItems(r: SpotRow): Array<[string, string]> {
  if (!r.ndfDate && !r.ndfRef && r.ndfRate == null && r.cashAmt == null && !r.cashCurr) return []
  return [
    ['NDF Fixing Date', r.ndfDate ?? ''],
    ['NDF Ref', r.ndfRef ?? ''],
    ['NDF Settlement Rate', r.ndfRate != null ? r.ndfRate.toFixed(4) : ''],
    ['Cash Settlement Amount', r.cashAmt != null ? fmtAmount(r.cashAmt) : ''],
    ['Cash Currency', r.cashCurr ?? ''],
  ]
}

// ---------------------------------------------------------------- CSV export

const CSV_COLUMNS: Array<{ header: string; key: keyof SpotRow; amount?: boolean; rate?: boolean }> = [
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
  { header: 'NDF Fixing Date', key: 'ndfDate' },
  { header: 'NDF Ref', key: 'ndfRef' },
  { header: 'NDF Settlement Rate', key: 'ndfRate', rate: true },
  { header: 'Cash Settlement Amount', key: 'cashAmt', amount: true },
  { header: 'Cash Currency', key: 'cashCurr' },
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
    lines.push(
      CSV_COLUMNS.map((c) => {
        const v = r[c.key]
        // The NDF numbers are blank, not 0.00, while the view does not serve them.
        if (c.key === 'ndfRate' || c.key === 'cashAmt') return csvCell(v == null ? '' : Number(v).toFixed(c.rate ? 4 : 2))
        return csvCell(c.amount ? (Number(v) || 0).toFixed(2) : ((v ?? '') as string | number))
      }).join(','),
    )
  }
  return lines.join('\r\n')
}

export const sideClass = (side: Side): string => (side === 'Buy' ? 'side-buy' : 'side-sell')
