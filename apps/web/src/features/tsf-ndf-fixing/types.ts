export type Side = 'Buy' | 'Sell'

/** One NDF deal of the worklist (GET_DATA), with the screen's field names; see api.ts dealFromRecord. */
export type NdfDeal = {
  /** RFHA, as SAP holds it (leading zeros kept). */
  id: string
  company: string
  /** TRD_NAME; the filter compares traderCode (ZTRCODE) with P_TRD. */
  trader: string
  traderCode: string
  side: Side
  pair: string
  amt1: number
  c1: string
  amt2: number
  c2: string
  spot: number
  swap: number
  fwd: number
  /** NDF_DATE, DD-MM-YYYY: the fixing date shown in the grid and the 9001 popup. */
  date: string
  /** V_DATE, DD-MM-YYYY: what the selection's Fixing Date (P_DATE) is compared with. */
  vDate: string
  /** ZCASH_AMT */
  ndf: number
  /** CASH_CURR */
  cashCurr: string
  /** CPAIR, e.g. USD:INR — the RBI default rate applies to USD:INR only. */
  cpair: string
  /** TXN_STATUS (ZSGTSFTR_TXNSTAT: 07 released for fixing, 10 fixed and pending MO confirmation). */
  txnStatus: string
  ref: string
  /** "<TXN_STATUS> - <ZSGTSFTR_TXNSTAT text>" (EXT_STAT_DESC). */
  status: string
  /** BP_NAME */
  partner: string
  /** DELFZ, DD-MM-YYYY */
  valueDate: string
  /** NDF_FO_REM, from the TSF append. */
  foRemarks: string
  /** TrmFxApp's ETag: Save Fixing sends it back as If-Match. */
  etag: string
}

export type Filters = {
  search: string
  company: string
  trader: string
  fixingDate: string
}

export type ToastVariant = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  variant: ToastVariant
  message: string
}
