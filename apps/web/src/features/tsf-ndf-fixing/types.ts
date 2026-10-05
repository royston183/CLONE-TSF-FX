export type Side = 'Buy' | 'Sell'

/** One ZSGTSFV_FX row of the worklist (GET_DATA), with the screen's field names. */
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
  /** TXN_STATUS (custom TSF status: 07 waiting for fixing, 10 fixed). */
  txnStatus: string
  ref: string
  status: string
  remarks: string
  moRemarks: string
  fixRate?: number
  cashSettlement?: number
  foRemarks?: string
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
