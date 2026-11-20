/**
 * "Deal ID: Planned Trade Invoices" and "Deal ID: Planned P&L" in the layout of the SAP screens (Deal ID: MO Confirmation,
 * ZSGTSF_PDEAL_ID_ANALYS). Pure: the numbers come from the existing calculation (mo-confirm-fx-deal-id/analysisPlan.ts, run by
 * analysisConfirm.ts `planDeal`) or from the P&L stored on the Deal ID; this only lays them out. The input types are structural,
 * so PlanLine and PnlRow of that calculation fit them without this module importing a feature.
 */

/** The fields of a planned invoice line the SAP table shows (a PlanLine of analysisPlan.ts has them all). */
export type InvoiceLineLike = {
  ZTTYPE: string
  ZINV_TRM_NO: string
  ZTRD_SELL: string
  ZTRD_BUY: string
  ZMC_REF_P: string
  ZMC_REF_S: string
  ZDTYPE: string
  ZTRD_CURR: string
  ZAMT: number
  ZINV_AMT: number
  ZEX_RATE: number
}

/** One entity's P&L row (a PnlRow of analysisPlan.ts). Local = the entity's currency, foreign = USD. */
export type PnlRowLike = {
  entity: string
  saleLocal: number
  saleForeign: number
  purchaseLocal: number
  purchaseForeign: number
  plLocal: number
}

/** A saved invoice line with only the columns ZSGTSFTR_INV_REF gives back on the screens that read it. */
export type StoredInvoiceLike = { tradeRef: string; invType: string; exRate: number; amt: number; invAmt: number; curr: string }

export type PlannedInvoiceRow = {
  tradeType: string
  invTrmRefNo: string
  sell: string
  buy: string
  mcRefP: string
  mcRefSale: string
  dealType: string
  invCurr: string
  invAmt: number
  invAmount: number
  exchangeRate: number
}

export function invoiceRows(lines: readonly InvoiceLineLike[]): PlannedInvoiceRow[] {
  return lines.map((l) => ({
    tradeType: l.ZTTYPE, invTrmRefNo: l.ZINV_TRM_NO, sell: l.ZTRD_SELL, buy: l.ZTRD_BUY, mcRefP: l.ZMC_REF_P, mcRefSale: l.ZMC_REF_S,
    dealType: l.ZDTYPE, invCurr: l.ZTRD_CURR, invAmt: l.ZAMT, invAmount: l.ZINV_AMT, exchangeRate: l.ZEX_RATE,
  }))
}

/** The saved lines as the SAP table, with the columns the saved row does not carry left blank. */
export function storedInvoiceRows(rows: readonly StoredInvoiceLike[]): PlannedInvoiceRow[] {
  return rows.map((r) => ({
    tradeType: r.invType, invTrmRefNo: r.tradeRef, sell: '', buy: '', mcRefP: '', mcRefSale: '', dealType: '', invCurr: r.curr,
    invAmt: r.amt, invAmount: r.invAmt, exchangeRate: r.exRate,
  }))
}

export type PnlColumn = { key: string; label: string; entity: string; currency: string; side: 'local' | 'usd' }
export type PnlGridRow = { label: string; kind: 'amount' | 'percent'; cells: (number | null)[] }
export type PlannedPnlGrid = { columns: PnlColumn[]; rows: PnlGridRow[] }

export const PNL_ROW_LABELS = { sale: 'Sale', purchase: 'Purchase', ndf: 'NDF Fixing-Profit Adj', pl: 'P&L', origin: 'P&L Origin(%)' } as const

/**
 * The Planned P&L grid, as on the SAP screen: for each entity one column in the deal's non-USD currency (the invoice amounts,
 * ZINV_AMT) and one in USD (the base amounts, ZAMT), e.g. "OIL-INR" / "OIL-USD". Rows: Sale, Purchase (negative), NDF
 * Fixing-Profit Adj, P&L and P&L Origin(%). P&L and its percentage sit in the currency column only. The NDF adjustment is shown
 * under `ndf.entity` when the NDF's fixing amount is known (otherwise that row is blank) and is part of that entity's P&L;
 * the percentage is that P&L over the entity's sale. A deal with no non-USD currency has USD columns only.
 */
export function pnlGrid(rows: readonly PnlRowLike[], localCurrency: string, ndf?: { entity: string; amount: number } | null): PlannedPnlGrid | null {
  if (!rows.length) return null
  const local = localCurrency && localCurrency !== 'USD' ? localCurrency : ''
  const columns: PnlColumn[] = []
  for (const r of rows) {
    if (local) columns.push({ key: `${r.entity}-${local}`, label: `${r.entity}-${local}`, entity: r.entity, currency: local, side: 'local' })
    columns.push({ key: `${r.entity}-USD`, label: `${r.entity}-USD`, entity: r.entity, currency: 'USD', side: 'usd' })
  }
  const pct = (r: PnlRowLike, pl: number) => (r.saleLocal ? Math.round((pl / r.saleLocal) * 10000) / 100 : 0)
  const adj = (r: PnlRowLike) => (ndf && ndf.entity === r.entity ? ndf.amount : 0)
  const owner = (i: number) => rows.find((r) => r.entity === columns[i]!.entity)!
  const cells = (pick: (r: PnlRowLike, side: PnlColumn['side']) => number | null) => columns.map((c, i) => pick(owner(i), c.side))
  const usdOnlyLocal = (r: PnlRowLike, side: PnlColumn['side'], localValue: number, usdValue: number) => (side === 'local' ? localValue : local ? usdValue : localValue)
  return {
    columns,
    rows: [
      { label: PNL_ROW_LABELS.sale, kind: 'amount', cells: cells((r, s) => usdOnlyLocal(r, s, r.saleLocal, r.saleForeign)) },
      { label: PNL_ROW_LABELS.purchase, kind: 'amount', cells: cells((r, s) => usdOnlyLocal(r, s, r.purchaseLocal, r.purchaseForeign)) },
      { label: PNL_ROW_LABELS.ndf, kind: 'amount', cells: cells((r, s) => (s === 'local' || !local ? (adj(r) ? adj(r) : null) : null)) },
      { label: PNL_ROW_LABELS.pl, kind: 'amount', cells: cells((r, s) => (s === 'local' || !local ? Math.round((r.plLocal + adj(r)) * 100) / 100 : null)) },
      { label: PNL_ROW_LABELS.origin, kind: 'percent', cells: cells((r, s) => (s === 'local' || !local ? pct(r, r.plLocal + adj(r)) : null)) },
    ],
  }
}

/** Where the figures come from: stored on the confirmed Deal ID, or calculated now from its FX legs. */
export type PlannedSource = 'stored' | 'planned' | 'none'

/** The P&L figures stored on a confirmed Deal ID (ZPL, ZPL_LAMT, ZPL_CURR, ZPL_LCURR, ZPL_RATE). */
export type StoredPlFigures = { amount: number; currency: string; localAmount: number; localCurrency: string; rate: number }

export type PlannedData = {
  dealId: string
  source: PlannedSource
  /** One line saying where the figures come from, or why there are none. */
  note: string
  invoices: PlannedInvoiceRow[]
  pnl: PlannedPnlGrid | null
  /** The P&L stored on the Deal ID, when it has been confirmed. */
  stored: StoredPlFigures | null
  /** The rate and date the planned P&L was calculated with (TCURR type M), when it was calculated. */
  rate: { value: number; date: string } | null
}
