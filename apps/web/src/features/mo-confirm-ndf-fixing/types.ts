export type BusinessArea = { code: string; name: string }
export type Partner = { code: string; name: string }
export type Trader = { code: string; name: string }

import type { NdfRecord } from '../../shared/fx/ndf.ts'

/** "<TXN_STATUS> - <ZSGTSFTR_TXNSTAT text>", e.g. "10 - FO: NDF Fixing - pending MO confirmation". */
export type NdfStatus = string

/** One deal of the MO queue (see api.ts dealFromRecord). */
export type NdfDeal = {
  /** "<bukrs>|<rfha>" */
  id: string
  transaction: string
  coCode: string
  busArea: string
  /** DD-MM-YYYY, like every date on the screen. */
  tradeDate: string
  tsfEntity: string
  txnTypeDesc: string
  partnerName: string
  partnerCode: string
  buySell2: 'Buy' | 'Sell'
  currency2: string
  amount2: number
  currency1: string
  amount1: number
  allInRate: number
  txnStatus: NdfStatus
  /** TXN_STATUS alone: 10 fixed, 12 corrected. */
  statusCode: string
  fixingDate: string
  ndfValue: number
  valueDate: string
  dealId: string
  mcReference: string
  businessArea: string
  trader: string
  traderCode: string
  accounting: 'Posted' | 'Not Posted'
  externalRef: string
  /** Set by Match & Release; the original left it undefined until then, read back as "". */
  internalRef: string
  foRemark: string
  moRemark: string
  /** The SAP record behind the row; the actions write with its key and ETag. */
  record: NdfRecord
}

/**
 * The Basic Selection as the page's state held it (not the raw input text): company codes
 * trimmed, NDF Value as it read after blur, trader as its code.
 */
export type Selection = {
  companyCode: string
  companyCodeTo: string
  fixingDate: string
  ndfValue: string
  trader: string
}

/** The filter panel's ten selects; '' is "All". */
export type Filters = {
  companyCode: string
  businessArea: string
  tsfEntity: string
  txnType: string
  partner: string
  trader: string
  currency1: string
  currency2: string
  status: string
  fixingDate: string
}

export type SortField =
  | 'transaction'
  | 'coCode'
  | 'tradeDate'
  | 'partnerName'
  | 'amount1'
  | 'amount2'
  | 'ndfValue'
  | 'allInRate'
  | 'fixingDate'
  | 'valueDate'
  | 'dealId'
  | 'trader'
  | 'txnStatus'

/** field null is the page's unsorted initial order. */
export type Sort = { field: SortField | null; dir: 'asc' | 'desc' }

/** One row of a searchable dropdown: the text shown, plus the value it stands for. */
export type DropdownItem = { primary: string; secondary?: string; code?: string }

export type InfoVariant = 'success' | 'warn'
export type InfoMessage = { variant: InfoVariant; title: string; desc: string }

/** The Basic Selection's validation messages; null means the field is fine. */
export type SelectionErrors = { companyCode: string | null; fixingDate: string | null }
