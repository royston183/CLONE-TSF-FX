import type { NdfExtras } from '../../shared/fx/ndf-columns.ts'

/** Deal ID status code (ZSGTSFTR_DEALID-ZDEAL_STAT). 01 is the only editable one. */
export type DealStatus = string

/** FX transaction status of one leg (ZSGTSFCDS_FX-TXN_STATUS); 07 means settlement-ready. */
export type TxnStatus = string

export type BadgeMeta = { text: string; badge: string }

/** One row of the "FX Deals" grid (gt_top: ZSGTSFCDS_FX + ZSGTSFCDS_OPTION). */
export type Leg = {
  bukrs: string
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
  /** fxPl + setPl, computed once by the leg() helper. */
  totPl: number
  premAmt: number
  premCurr: string
  pInr: number
  /** NDF_DATE / NDF_REF / NDF_RATE / ZCASH_AMT / CASH_CURR as ZSGTSFCDS_FX shows them; blank when not served. */
  ndf?: NdfExtras
}

export type LegInput = Omit<Leg, 'totPl'>

/** One row of "Planned Trade Invoices" (gt_inv: FORM invoice_plan over ZSGTSFTR_INV_REF). */
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

/** ZSGTSFTR_DEALID's key (the client is added by the middleware). */
export type DealKey = { ZDEAL_ID: string; ZDEAL_TYPE: string; ZSUB_TYPE: string }

export type Deal = {
  key: DealKey
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
  /** The status list box's text for the code ("01 - FO: FX Deals Created"). */
  statusText: string
  noInvoiceModel: boolean
  isSS: boolean
  reversalAuthorized: boolean
  legs: Leg[]
  /** Why the legs are not shown ('' once they are read). */
  legsWaiting: string
  invoices: Invoice[]
  /** Why the invoice plan cannot be shown ('' when it is). */
  invoicesWaiting: string
}

export type DealDb = Record<string, Deal>

export type ReplacementTxn = { rfha: string; label: string }

export type DmsDoc = { name: string; cat: string; by: string; date: string }

export type ToolbarCode = 'UPD' | 'PRE' | 'DEAL_EDIT' | 'CAN' | 'SS_DEALLOC' | 'SS_DEAL' | 'REV' | 'DMS' | 'REF'

export type ToastKind = 'info' | 'success' | 'error'

export type Toast = { id: number; kind: ToastKind; message: string; fading: boolean }
