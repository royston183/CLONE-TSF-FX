export type Side = 'Buy' | 'Sell'

/** One row of the legacy page's makeData(): an FX deal's remaining spot booking candidate. */
export type SpotRow = {
  id: string
  modelId: string
  dealId: string
  dealType: string
  dssType: string
  companyCode: string
  companyName: string
  originalTxn: string
  tradeType: string
  finalAmt: number
  fxDealAmt: number
  currency: string
  /** The other leg of the pair — INR/AED/SGD against a USD deal, or USD against EUR/GBP. */
  otherCurrency: string
  diffAmt: number
  /** The spot transaction number once created, '' while the row is still "New Spot". */
  spotTxn: string
  /** The FTR product type the spot was booked with, once created. */
  spotProductType?: string
  tradeDate: string
  valueDate: string
  partner: string
  partnerName: string
  group: string
  side: Side
  tsfEntity: string
  createdBy: string
  createdDate: string
  defaultTxnType: string
}

export type CodeLabel = { key: string; text: string }

/** A Create Spot transaction type: the code is unique, and it carries the product type it books under. */
export type TxnTypeOption = CodeLabel & { productType: string }

/** A Create Spot drop-down read from SAP (valueHelps.ts). */
export type ValueHelp<T extends CodeLabel> = { state: 'loading' } | { state: 'ok'; options: T[] } | { state: 'error'; message: string }

export type SortKey =
  | 'dealId'
  | 'modelId'
  | 'dealType'
  | 'dssType'
  | 'companyCode'
  | 'originalTxn'
  | 'tradeType'
  | 'finalAmt'
  | 'fxDealAmt'
  | 'currency'
  | 'diffAmt'
  | 'spotTxn'
  | 'tradeDate'
  | 'valueDate'
  | 'partner'
  | 'group'
  | 'companyName'
  | 'side'
  | 'tsfEntity'
  | 'createdBy'
  | 'createdDate'

export type Sort = { key: SortKey; dir: 1 | -1 }

/** The status-filter checkboxes: New Spot (no spotTxn yet) and Spot Created. */
export type Filters = {
  q: string
  dealFilter: string
  showNew: boolean
  showCreated: boolean
}

export type CreateFormErrors = Partial<Record<'company' | 'txnType' | 'partner' | 'tradeDate' | 'valueDate' | 'rate', string>>

export type CreateFormValues = {
  companyCode: string
  txnType: string
  partner: string
  tradeDate: string
  valueDate: string
  rate: string
}

export type ToastKind = '' | 'info' | 'error'
export type Toast = { id: number; message: string; kind: ToastKind }

export type DetailKind = 'original' | 'spot'
