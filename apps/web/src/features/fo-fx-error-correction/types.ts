export type CompanyCode = { code: string; name: string; entity: string }
export type BusinessArea = { code: string; name: string; profitCenter: string; profitCenterDesc: string }
export type Partner = { code: string; name: string }
export type ProductType = { code: string; desc: string }
export type TransactionType = { code: string; desc: string; prodType: string }
export type AccountCat = { code: string; desc: string }
export type Trader = { code: string; name: string }

export type StatusKey = 'ERRCORR' | 'RESUB' | 'REVERSED' | 'OPEN'
/** The ABAP status text, code first ("04-MO->FO: Correction Required"), as SAP holds it. */
export type StatusValue = '04-MO->FO: Correction Required' | '02-Released to MO' | '15-Reversed' | 'Open (status not in SAP)'

/** One row of the legacy page's TXN_SEED block, before the derived columns are filled in. */
export type TxnSeed = {
  rfha: string
  dealId: string
  mc: string
  coCode: string
  prodType: string
  txnType: string
  partner: string
  ccy1: string
  amt1: number
  ccy2: string
  spot: number
  swap: number
  allIn: number
  /** DD.MM.YYYY, as the SAP export writes it. */
  tradeDate: string
  valueDateOff: number
  blotterOff: number
  busArea: string
  trader: string
  acctCat: string
  mot: string
  status: StatusKey
  /** Days after the trade date the row was last changed; only rows already worked carry one. */
  changedOffset?: number
  moRemark: string
}

/** One FX financial transaction (rfha) in the Front Office queue. */
export type Txn = {
  rfha: string
  dealId: string
  dealIdDesc: string
  mc: string
  coCode: string
  companyName: string
  tsfEntity: string
  prodType: string
  prodTypeDesc: string
  txnType: string
  txnTypeDesc: string
  partnerCode: string
  partnerName: string
  buySell1: string
  ccy1: string
  amt1: number
  buySell2: string
  ccy2: string
  amt2: number
  spotRate: number
  swapRate: number
  allInRate: number
  tradeDate: Date
  valueDate: Date
  /** APP_STR's recorded blotter date; null when the transaction has no application date. */
  blotterDate: Date | null
  busArea: string
  busAreaDesc: string
  profitCenter: string
  profitCenterDesc: string
  traderCode: string
  traderName: string
  modeOfTrade: string
  acctCat: string
  status: StatusValue
  moRemark: string
  /** NDF_RATE / ZCASH_AMT / CASH_CURR; null / '' (shown blank) while FxTransaction does not serve them or the deal is not an NDF. */
  ndfRate?: number | null
  cashAmount?: number | null
  cashCurrency?: string
  changedBy: string
  changedOn: Date | null
  /** True for a row read from SAP; its fields SAP has no home for are blank and read-only. */
  live: boolean
  /** Whether Amount 1 is the amount bought (the one SAP takes on a change). */
  buysLead: boolean
}

/** The status filter: every status, or just one. */
export type StatusFilter = 'ALL' | StatusKey

/** Everything but status; 'ALL' means the dropdown is on its "All ..." option. */
export type Filters = {
  /** The search box as typed; matching trims it and ignores case. */
  q: string
  coCode: string
  trader: string
  /** DD-MM-YYYY, as shown in the Upto Blotter Date pickers. */
  dateFrom: string
  dateTo: string
}

export type SortKey = 'rfha' | 'dealId' | 'tradeDate'
/** 1 ascending, -1 descending — the legacy sortDir. */
export type Sort = { key: SortKey; dir: 1 | -1 }

/** The FX Error Correction popup's New Details, as the inputs hold them. */
export type CorrectionForm = {
  partner: string
  allInRate: string
  swapRate: string
  spotRate: string
  amount1: string
  /** Derived for buy-led transactions; editable bought amount for a live sell-led transaction. */
  amount2: string
  valueDate: string
  busArea: string
  /** Derived from the Business Area. */
  profitCenter: string
  acctCat: string
  modeOfTrade: string
  mc: string
  dealId: string
  tradeDate: string
  blotterDate: string
}

/** 'bulk' reverses the current selection; a string is one rfha; an array the dragged rows. */
export type ReverseScope = 'bulk' | string | string[]

export type DropAction = 'correction' | 'reverse'

/** Which of the page's custom date pickers is open. */
export type PickerId = 'f-date-from' | 'f-date-to' | 'new-valuedate' | 'new-tradedate' | 'new-blotterdate'

export type ToastKind = '' | 'success' | 'error'
export type Toast = { message: string; kind: ToastKind; show: boolean }
