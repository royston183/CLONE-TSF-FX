/** Deal ID status (ZSGTSF deal header). 01 is the only editable one. */
export type DealStatus = '01' | '02' | '03' | '30' | '50'

/** FX transaction status of one leg; 07 means settlement-ready. */
export type TxnStatus = '03' | '07'

export type BadgeMeta = { text: string; badge: string }

export type Leg = {
  rfha: string
  dealType: string
  bpName: string
  instrument: string
  tradeDate: string
  valueDate: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  allInRate: number
  strike: number
  mcRef: string
  txnStatus: TxnStatus
  fxPl: number
  setPl: number
  /** fxPl + setPl, computed once by the data's leg() helper, as the original did. */
  totPl: number
  premAmt: number
  premCurr: string
  pInr: number
}

export type LegInput = Omit<Leg, 'totPl'>

export type Invoice = {
  ttype: string
  dtype: string
  buy: string
  sell: string
  currency: string
  exRate: number
  invAmt: number
  invAmtUsd: number
  trmRef: string
  mcRef: string
}

export type Deal = {
  dealId: string
  dealRef: string
  startDate: string
  endDate: string
  mcRefNo: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  fxModel: string
  fxModelDesc: string
  entityString: string
  fxInvModel: string
  traderCode: string
  traderDesc: string
  currString: string
  status: DealStatus
  noInvoiceModel: boolean
  isSS: boolean
  reversalAuthorized: boolean
  legs: Leg[]
  invoices: Invoice[]
}

export type DealDb = Record<string, Deal>

export type ReplacementTxn = { rfha: string; label: string }

export type PremiumAdjustment = {
  damt: number
  lnet: number
  rbi: number
  fnet: number
  pnet: number
  srate: number
  irate: number
}

export type PlRow = { type: string; amtLocal: number; amtUsd: number; total?: true }

export type DmsDoc = { name: string; cat: string; by: string; date: string }

export type ToolbarCode = 'UPD' | 'PRE' | 'DEAL_EDIT' | 'CAN' | 'SS_DEALLOC' | 'SS_DEAL' | 'REV' | 'DMS' | 'REF'

export type ToastKind = 'info' | 'success' | 'error'

export type Toast = { id: number; kind: ToastKind; message: string; fading: boolean }
