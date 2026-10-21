export type Status = 'PENDING' | 'OVERDUE' | 'SETTLED' | 'ERRCORR'
export type Product = 'Spot' | 'Forward'
export type BuySell = 'BUY' | 'SELL'

/** One FX deal due for settlement (ZSGTSFV_FX). Dates are DD-MM-YYYY text, as the page shows them. */
export type Deal = {
  /** Transaction number (RFHA). The row key. */
  rfha: string
  dealId: string
  mcRef: string
  bukrs: string
  entity: string
  product: Product
  tradeDate: string
  valueDate: string
  bs1: BuySell
  curr1: string
  amt1: number
  bs2: BuySell
  curr2: string
  amt2: number
  cpair: string
  spot: number
  swap: number
  allIn: number
  kontrh: string
  trader: string
  doc1: string
  doc2: string
  trf1: string
  trf2: string
  cruser: string
  status: Status
  /** NDF fields (NDF_DATE DD-MM-YYYY, NDF_REF, NDF_RATE, ZCASH_AMT, CASH_CURR). Absent/null when SAP does not serve them: shown blank. */
  ndfDate?: string
  ndfRef?: string
  ndfRate?: number | null
  cashAmt?: number | null
  cashCurr?: string
}

/** Lookup tables for descriptions (company, business partner, transfer type). */
export type Names = {
  transfer: Record<string, string>
  partner: Record<string, string>
  company: Record<string, string>
}

export type StatusSelect = Status | 'ALL'

export type Filters = {
  /** Raw search text; trimmed and lower-cased when matching. */
  search: string
  bukrs: string
  /** The Status dropdown. A KPI card filter, when set, overrides it. */
  status: StatusSelect
  product: Product | 'ALL'
  /** DD-MM-YYYY or '' for open-ended. */
  dateFrom: string
  dateTo: string
}

export type SortKey = 'rfha' | 'dealId' | 'valueDateSort'
export type Sort = { key: SortKey; dir: 1 | -1 }

export type KpiKey = Status | null
export type Kpis = { total: number } & Record<Status, number>

export type DetailCell = { label: string; value: string; accent?: boolean }
export type FiDocWhich = 'doc1' | 'doc2'
export type ActionKind = 'test' | 'post'
export type IsdKind = 'print' | 'pdf'
