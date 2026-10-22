import type { NdfExtras } from '../../shared/fx/ndf-columns.ts'

/** The Deal ID status codes the page colours (STATUS_META's keys); SAP's own texts replace the descriptions. */
export type StatusCode = '01' | '02' | '03' | '07' | '30'

export type StatusMeta = { desc: string; cls: string }

/** One FX transaction (RFHA) assigned to the Deal ID — a row of the FX Deals table. */
export type Leg = {
  rfha: string
  /** Company code (BUKRS); with RFHA it is the transaction's key. */
  bukrs: string
  /** The Deal ID slot the transaction sits in: D1 D2 D3 D4 DS1 DS2 DSS1 DSS2. */
  dealType: string
  bpName: string
  bpCode: string
  dealDate: string
  valueDate: string
  desc: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  /** null: SAP has no all-in rate for this leg (an option, or one the FX service does not return). */
  rateVal: number | null
  rateLabel: string
  /** ZSGTSFTR_APP_STR.TXN_STATUS — the transaction's lifecycle, not the Deal ID's status. Blank when APP_STR has none. */
  txnStatus: string
  /** null: the NDF fixing profit is not in the FX service. */
  fxPl: number | null
  /** The NDF columns standard SAP shows (NDF_DATE, NDF_REF, NDF_RATE, ZCASH_AMT, CASH_CURR); blank when not served. */
  ndf?: NdfExtras
}

/** The P&L stored on the Deal ID when it was confirmed (ZPL, ZPL_LAMT, ZPL_CURR, ZPL_LCURR, ZPL_RATE). */
export type StoredPl = {
  amount: number
  currency: string
  localAmount: number
  localCurrency: string
  rate: number
}

export type Deal = {
  dealId: string
  dealDesc: string
  trader: string
  traderName: string
  startDate: string
  endDate: string
  fxModel: string
  modelDesc: string
  entityString: string
  currString: string
  mcRef: string
  mcDesc: string
  mcDate: string
  shipStart: string
  shipEnd: string
  bukrs: string
  status: string
  /** FX1 forwards, FX2 options (ZSGTSFTR_RULE_BT-ZSUB_TYPE). */
  subType: string
  /** Model configured without an invoice plan (ZNO_INV): the invoice and P&L cards say so instead of showing a plan. */
  noInv: boolean
  /** Short-straddle model (ZSS): shows "Confirm & Save SS Deal ID". */
  ssDeal: boolean
  /** ZCONFIRM = 'X': the deal has been confirmed once. */
  confirmed: boolean
  /** Null until the deal has been confirmed. */
  storedPl: StoredPl | null
  legs: readonly Leg[]
  invoices: readonly Invoice[]
}

/** A saved invoice-plan line (ZSGTSFTR_INV_REF). */
export type Invoice = {
  tradeRef: string
  invType: string
  exRate: number
  amt: number
  invAmt: number
  curr: string
}

/** The FX Deals table's data-key columns. `mcRef` and `txnStatusDesc` are not leg fields. */
export type SortKey =
  | 'rfha'
  | 'dealType'
  | 'bpName'
  | 'dealDate'
  | 'valueDate'
  | 'bs1'
  | 'amt1'
  | 'bs2'
  | 'amt2'
  | 'rateVal'
  | 'mcRef'
  | 'txnStatusDesc'
  | 'fxPl'
  | 'ndfDate'
  | 'ndfRef'
  | 'ndfRate'
  | 'cashAmount'
  | 'cashCurrency'

export type Sort = { key: SortKey | null; dir: 1 | -1 }

export type ActionVisibility = {
  upd: boolean
  can: boolean
  dealEdit: boolean
  rev: boolean
  pre: boolean
  ref: boolean
  dms: boolean
  ssDeal: boolean
}

export type PlRow = { type: string; value: string }

export type ToastType = 'success' | 'error' | 'info'
export type Toast = { id: number; msg: string; type: ToastType }

export type ModalId = 'cancelDeal' | 'reverse' | 'editPair' | 'confirm' | 'dms'
