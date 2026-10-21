/** One transaction (leg) of a deal, with the original's SAP-style field names. */
export type Leg = {
  rfha: string
  bukrs: string
  butxt: string
  /** FTR transaction type; the screen reads 605 Spot, 607 Cash, 608 Tom, 619 Fwd and 631 NDF. */
  sfhaart: string
  /** The transaction type's text (ZSGTSFCDS_FX-XTEXT). */
  xtext: string
  /** Trade date, ISO yyyy-mm-dd. */
  dblfz: string
  /** Value date, ISO yyyy-mm-dd. */
  delfz: string
  cpair: string
  bs1: string
  curr1: string
  amt1: number
  bs2: string
  curr2: string
  amt2: number
  otot_rate: number
  kontrh: string
  bpName: string
  /** VTBFHA TXN_STATUS (03, 07, 49, 61 …); txnDesc is its text. */
  txnStatus: string
  txnDesc: string
  dealType: string
  /** Trader group (VTBFHA-ZGRP); restricts the Bank BP drop-downs to ZSGTRMTR_BP_GRP. */
  zgrp: string
  zuonr: string
  zroll: string
  ztsf_pre_mature: boolean
  ztsf_unwind: boolean
  /** NDF_RATE / ZCASH_AMT / CASH_CURR from FxTransaction; null / '' (shown blank) while the service does not serve them. */
  ndf_rate?: number | null
  zcash_amt?: number | null
  cash_curr?: string
}

export type SortField = 'rfha' | 'bukrs' | 'bpName' | 'sfhaart' | 'dblfz' | 'delfz' | 'cpair' | 'otot_rate' | 'txnDesc'
export type SortDir = 'asc' | 'desc'
export type Sort = { field: SortField; dir: SortDir }

export type Filters = { type: string; status: string }

export type ToastKind = 'error' | 'warn' | undefined
export type Toast = { msg: string; kind: ToastKind }

export type DdOption = { value: string; primary: string; secondary?: string | undefined }

/** One side (New Booking or Cancellation) of an Early Delivery / Rollover. */
export type BookingForm = {
  /** The amount the user typed last; a rate change recomputes the other one from it. */
  anchor?: 'buy' | 'sell'
  type: string
  /** ISO dates; null when not picked. */
  tdate: string | null
  vdate: string | null
  bp: string
  rate: string
  buyAmt: string
  sellAmt: string
}

/** Early Delivery (screen 9001) and Rollover (screen 9003) share this shape. */
export type PairForm = { remark: string; newTxn: BookingForm; cancel: BookingForm }

/** Unwinding (screen 9002). */
export type UnwindForm = {
  anchor?: 'buy' | 'sell'
  remark: string
  tdate: string | null
  vdate: string | null
  bp: string
  rate: string
  buyAmt: string
  sellAmt: string
}

export type Kpis = { total: number; eligible: number; pm: number; unw: number }

/**
 * A value help or list read from SAP data. `waiting` means the API the original reads from
 * does not exist (or holds no rows) yet; `reason` names exactly what is missing.
 */
export type Avail<T> =
  | { state: 'loading' }
  | { state: 'ok'; value: T }
  | { state: 'waiting'; reason: string }
  | { state: 'error'; reason: string }
