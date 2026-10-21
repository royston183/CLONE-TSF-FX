export type BankStatus = 'NOT_ASSIGNED' | 'ASSIGNED'
export type DealStatus = 'Unmatured' | 'Matured' | 'Settled'
export type Side = 'BUY' | 'SELL'

export type HouseAccount = { id: string; curr: string; label: string }
export type HouseBank = { id: string; name: string; accounts: HouseAccount[] }
export type HouseBanks = Record<string, HouseBank[]>

export type Deal = {
  dealId: string
  dealDesc: string
  mcRef: string
  rfha: string
  bukrs: string
  counterparty: string
  trader: string
  /** ISO yyyy-mm-dd */
  valueDate: string
  blotterDate: string
  ccyPair: string
  bs1: Side
  amt1: number
  curr1: string
  bs2: Side
  amt2: number
  curr2: string
  settleCurr: string
  settleAmt: number
  overallRate: number | null
  profitCtr: string
  businessArea: string
  bankStatus: BankStatus
  hb1: string | null
  acc1: string | null
  hb2: string | null
  acc2: string | null
  fiDoc: string | null
  doc1: string | null
  doc2: string | null
  status: DealStatus
  foRemark: string
  moRemark: string
  internalRef: string
  assignment: string
  ndfDate: string | null
  ndfRef: string | null
  ndfRate: number | null
  /** ZCASH_AMT / CASH_CURR / NDF_FO_REM / NDF_MO_REM: blank when SAP does not serve them. */
  cashAmt?: number | null
  cashCurr?: string
  ndfFoRemark?: string
  ndfMoRemark?: string
}

export type BankFilter = 'ALL' | BankStatus
export type StatusFilter = 'ALL' | DealStatus

export type Filters = {
  search: string
  /** Selected company codes; ['ALL'] means no company restriction. */
  bukrs: string[]
  /** dd-mm-yyyy */
  dateFrom: string
  dateTo: string
  bank: BankFilter
  status: StatusFilter
  ccy: string
}

export type SortKey = keyof Deal
export type Sort = { key: SortKey; dir: 1 | -1 }

export type ToastKind = '' | 'info' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind; show: boolean }

export type BankForm = { hb1: string; acc1: string; hb2: string; acc2: string }
export type UpdateLogEntry = { leg: 'Incoming' | 'Outgoing'; ok: boolean; msg: string }

export type KpiCounts = { total: number; awaiting: number; ready: number; settled: number }

export type PostGuard = { ok: true } | { ok: false; message: string; kind: ToastKind }
export type DealAction = 'bank' | 'test' | 'post'
