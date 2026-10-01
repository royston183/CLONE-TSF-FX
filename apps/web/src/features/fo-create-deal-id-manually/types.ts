export type DealStatus = '01' | '02' | 'X'

export type FxRow = {
  dealType: string
  bukrs: string
  rfha: string
  sfhaart: string
  start: string
  end: string
  text: string
  entity: string
  side1: string
  curr1: string
  amt1: number
  side2: string
  curr2: string
  amt2: number | ''
  spot: number | ''
  swap: number | ''
  allIn: number | ''
  mcRef: string
  txnStatus: string
}

export type InvoiceRow = {
  tradeType: string
  dealType: string
  sell: string
  buy: string
  currency: string
  amount: number
  exchangeRate: number
  invAmount: number
  invTrmNo: string
  mcPurchase: string
  mcSale: string
}

export type Premium = {
  dealValue: number
  dealCurr: string
  localNet: number
  localCurr: string
  rbi: number
  rbiDate: string
  foreignNet: number
  foreignCurr: string
  perUsd: number
  strike: number
  invoiceRate: number
}

export type Deal = {
  id: string
  ref: string
  description: string
  startDate: string
  endDate: string
  status: DealStatus
  mcRef: string
  mcDesc: string
  mcDate: string
  shipEnd: string
  fxModel: string
  entityString: string
  currencyString: string
  trader: string
  traderCode: string
  origin: string
  fxOp: string
  fxRows: FxRow[]
  invoices: InvoiceRow[]
  premium: Premium
}

export type MasterContract = {
  ref: string
  origin: string
  model: string
  mcDate: string
  shipEnd: string
  amount: number
  balance: number
  desc: string
  entity: string
  currency: string
  /** ZCURR_ID: the id of the currency string, written to the Deal ID row. */
  currencyId?: string
}

export type PoolTxn = {
  rfha: string
  bukrs: string
  sfhaart: string
  entity: string
  start: string
  end: string
  side1: string
  curr1: string
  amt1: number
  side2: string
  curr2: string
  amt2: number
  trader: string
}

export type PnlRow = {
  type: string
  famt1: number
  lamt1: number
  famt2: number
  lamt2: number
  famt3: number
  lamt3: number
}

export type FxSortKey = keyof Omit<FxRow, never>
export type InvSortKey = keyof InvoiceRow
export type PnlSortKey = keyof PnlRow

export type SortState<K extends string> = { key: K; dir: 1 | -1 }

export type Toast = { id: number; message: string; kind: 'success' | 'error' | 'info' }
